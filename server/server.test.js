import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createApp } from './server.js'

const listen = (server) => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${server.address().port}`)))
const password = randomBytes(12).toString('hex')
const empty = { profile: null, diary: {}, foods: [], weights: {}, water: {}, gone: [] }

// A tiny client that keeps the session cookie, like a browser would.
function client(base) {
  let cookie = ''
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body && { 'Content-Type': 'application/json' }), ...(cookie && { cookie }) },
      body: body && JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers }
  }
}

test('accounts, sessions and state sync', async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'thally-'))
  const app = await createApp({ dataDir })
  const base = await listen(app)
  t.after(() => app.close())
  const phone = client(base)
  const laptop = client(base)

  assert.equal((await phone('GET', '/api/state')).status, 401)
  assert.equal((await phone('POST', '/api/signup', { username: 'A', password: 'short' })).status, 400)
  const up = await phone('POST', '/api/signup', { username: 'Asha', password })
  assert.deepEqual([up.status, up.body.user], [200, 'asha'])
  assert.match(up.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/)

  // Only the first user may sign up unless the server opts in.
  assert.equal((await laptop('POST', '/api/signup', { username: 'mallory', password })).status, 403)
  assert.equal((await laptop('POST', '/api/login', { username: 'asha', password: password + 'x' })).status, 401)
  assert.equal((await laptop('POST', '/api/login', { username: 'nobody', password })).status, 401)
  assert.equal((await laptop('POST', '/api/login', { username: 'asha', password })).status, 200)

  assert.deepEqual((await phone('GET', '/api/state')).body, { rev: 0, state: null })
  assert.equal((await phone('PUT', '/api/state', { rev: 0, state: { nope: 1 } })).status, 400)
  assert.deepEqual((await phone('PUT', '/api/state', { rev: 0, state: { ...empty, water: { '2026-01-01': 3 } } })).body, { rev: 1 })

  // The laptop still thinks rev 0 is current: it must get the server copy back, not overwrite it.
  const stale = await laptop('PUT', '/api/state', { rev: 0, state: empty })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.state.water['2026-01-01'], 3)
  assert.deepEqual((await laptop('PUT', '/api/state', { rev: 1, state: empty })).body, { rev: 2 })

  // Without a JSON content type a cross-site form post can't reach a handler.
  const form = await fetch(base + '/api/logout', { method: 'POST', body: 'x' })
  assert.equal(form.status, 415)
  // A restart keeps people signed in: sessions are on disk, stored as hashes of the tokens.
  const cookie = up.headers.get('set-cookie').split(';')[0]
  const again = await createApp({ dataDir })
  const base2 = await listen(again)
  t.after(() => again.close())
  assert.equal((await fetch(base2 + '/api/state', { headers: { cookie } })).status, 200)
  assert.ok(!(await readFile(path.join(dataDir, 'sessions.json'), 'utf8')).includes(cookie.slice(4)))

  assert.equal((await phone('POST', '/api/logout', {})).status, 200)
  assert.equal((await phone('GET', '/api/state')).status, 401)
  assert.equal((await phone('POST', '/api/ai/photo', { image: 'AAAA' })).status, 401)
})

test('login attempts are rate limited', async (t) => {
  const app = await createApp({ dataDir: await mkdtemp(path.join(tmpdir(), 'thally-')) })
  const base = await listen(app)
  t.after(() => app.close())
  const c = client(base)
  const tries = []
  for (let i = 0; i < 12; i++) tries.push((await c('POST', '/api/login', { username: 'asha', password })).status)
  assert.deepEqual([tries[0], tries.at(-1)], [401, 429])
})

test('static files: served from dist, no path traversal', async (t) => {
  const dist = path.resolve('server') // any real folder will do
  const app = await createApp({ dataDir: await mkdtemp(path.join(tmpdir(), 'thally-')), distDir: dist })
  const base = await listen(app)
  t.after(() => app.close())
  assert.match(await (await fetch(base + '/ai.js')).text(), /createAi/)
  const escape = await fetch(base + '/..%2f..%2fpackage.json')
  assert.equal(escape.status, 404)
  assert.doesNotMatch(await escape.text(), /devDependencies/)
})

test('AI endpoints call the Messages API and bound what comes back', async (t) => {
  // Stand-in for api.anthropic.com that records what the SDK sends.
  const seen = []
  const reply = (text) => ({
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn',
    stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text }],
  })
  const meal = { items: [{ name: 'Dal', grams: 99999, kcal_per_100g: 100, protein_per_100g: 5.5, carbs_per_100g: 14, fat_per_100g: -3, fibre_per_100g: 3 }] }
  const stub = createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const b = JSON.parse(raw)
    seen.push({ url: req.url, key: req.headers['x-api-key'] || req.headers.authorization, body: b })
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(reply(b.output_config?.format ? JSON.stringify(meal) : 'Eat more dal.')))
  })
  process.env.ANTHROPIC_BASE_URL = await listen(stub)
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
  const { createAi } = await import('./ai.js')
  const app = await createApp({ dataDir: await mkdtemp(path.join(tmpdir(), 'thally-')), ai: createAi() })
  const base = await listen(app)
  t.after(() => (app.close(), stub.close()))
  const c = client(base)
  await c('POST', '/api/signup', { username: 'asha', password })

  assert.equal((await c('POST', '/api/ai/photo', { image: 'not base64!' })).status, 400)
  const photo = await c('POST', '/api/ai/photo', { image: 'AAAA' })
  assert.equal(photo.status, 200)
  assert.deepEqual(photo.body.items[0], { name: 'Dal', grams: 2000, per100: { kcal: 100, protein: 5.5, carbs: 14, fat: 0, fibre: 3 } })
  const sent = seen[0].body
  assert.equal(sent.model, 'claude-opus-5-5')
  assert.equal(sent.messages[0].content[0].source.data, 'AAAA')
  assert.equal(sent.output_config.format.type, 'json_schema')
  assert.match(seen[0].key, /test-key-not-real/)

  const review = await c('POST', '/api/ai/review', { summary: { days: [] } })
  assert.deepEqual(review.body, { text: 'Eat more dal.' })
  assert.equal(seen[1].body.fallbacks, 'default')
})
