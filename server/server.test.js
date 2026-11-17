import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { cleanItems, cleanLabelItem, parseJsonAnswer, withVersion } from './ai.js'
import { eventsFrom } from './hooks.js'
import { checkSubscription, dueReminders, localNow } from './push.js'
import { createApp } from './server.js'
import { verifySignature } from './secure.js'

const listen = (server) => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${server.address().port}`)))
const pw = () => randomBytes(12).toString('hex')
const empty = { profile: null, diary: {}, foods: [], weights: {}, water: {}, gone: [], settings: {} }
const tmp = () => mkdtemp(path.join(tmpdir(), 'openkcal-'))

async function start(t, opts = {}) {
  const dataDir = opts.dataDir || (await tmp())
  const app = await createApp({ dataDir, pushTickMs: 0, ...opts })
  const base = await listen(app)
  t.after(() => app.close())
  return { base, dataDir, client: () => client(base) }
}

// A tiny client that keeps the session cookie, like a browser would.
function client(base) {
  let cookie = ''
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers }
  }
  call.cookie = () => cookie
  return call
}

test('first account owns the server; others need an invite; names and e-mails sign in', async (t) => {
  const { client } = await start(t)
  const owner = client()
  const p1 = pw()
  assert.equal((await owner('GET', '/api/me')).body.server.signup, 'first')
  assert.equal((await owner('POST', '/api/signup', { name: 'A', password: p1 })).status, 400)
  assert.equal((await owner('POST', '/api/signup', { name: 'Asha', password: 'password123' })).status, 400) // a common one
  const up = await owner('POST', '/api/signup', { name: 'Asha  Rao', password: p1, email: 'Asha@Example.com' })
  assert.equal(up.status, 200)
  assert.deepEqual([up.body.user.name, up.body.user.owner, up.body.user.admin, up.body.user.email], ['Asha Rao', true, true, 'asha@example.com'])
  assert.match(up.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/)

  const guest = client()
  assert.equal((await guest('GET', '/api/me')).body.server.signup, 'invite')
  assert.equal((await guest('POST', '/api/signup', { name: 'Ravi', password: pw() })).status, 403)
  const inv = await owner('POST', '/api/admin/invites/new', { note: 'brother', days: 3 })
  assert.match(inv.body.code, /^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/)
  assert.equal((await guest('POST', '/api/signup', { name: 'asha rao', password: pw(), invite: inv.body.code })).status, 409) // name taken
  const p2 = pw()
  const ravi = await guest('POST', '/api/signup', { name: 'Ravi', password: p2, invite: inv.body.code.toLowerCase().replace(/-/g, ' ') })
  assert.equal(ravi.status, 200)
  assert.equal(ravi.body.user.admin, false)
  assert.equal((await client()('POST', '/api/signup', { name: 'Third', password: pw(), invite: inv.body.code })).status, 403) // used up
  assert.equal((await owner('GET', '/api/admin/invites')).body.invites[0].usedBy, 'Ravi')

  // Sign in by name (any case) or by e-mail.
  assert.equal((await client()('POST', '/api/login', { name: 'ASHA RAO', password: p1 })).status, 200)
  assert.equal((await client()('POST', '/api/login', { name: 'asha@example.com', password: p1 })).status, 200)
  assert.equal((await client()('POST', '/api/login', { name: 'nobody', password: p1 })).status, 401)
  assert.equal((await guest('GET', '/api/admin/users')).status, 403) // not an admin
})

test('wrong passwords pause the account; sessions survive a restart; sign out everywhere', async (t) => {
  const dataDir = await tmp()
  const { client } = await start(t, { dataDir })
  const me = client()
  const p = pw()
  await me('POST', '/api/signup', { name: 'asha', password: p })
  const attacker = client()
  const tries = []
  for (let i = 0; i < 7; i++) tries.push((await attacker('POST', '/api/login', { name: 'asha', password: 'wrong-' + i + p })).status)
  assert.deepEqual([tries[0], tries[5], tries[6]], [401, 401, 429])
  assert.equal((await attacker('POST', '/api/login', { name: 'asha', password: p })).status, 429) // even the right one, for now

  const again = await start(t, { dataDir })
  const res = await fetch(again.base + '/api/state', { headers: { cookie: me.cookie() } })
  assert.equal(res.status, 200)
  assert.ok(!(await readFile(path.join(dataDir, 'sessions.json'), 'utf8')).includes(me.cookie().slice(4))) // stored hashed

  await me('POST', '/api/logout/all', {})
  assert.equal((await me('GET', '/api/state')).status, 401)
})

test('migrates the first release’s users.json, state and sessions', async (t) => {
  const dataDir = await tmp()
  const p = pw()
  const { hashPassword } = await import('./accounts.js')
  await mkdir(path.join(dataDir, 'state'))
  await writeFile(path.join(dataDir, 'users.json'), JSON.stringify({ tester: await hashPassword(p) }))
  await writeFile(path.join(dataDir, 'state', 'tester.json'), JSON.stringify({ rev: 4, state: { ...empty, water: { '2026-01-01': 3 } } }))
  const { client } = await start(t, { dataDir })
  const c = client()
  const login = await c('POST', '/api/login', { name: 'Tester', password: p })
  assert.equal(login.status, 200)
  assert.equal(login.body.user.owner, true)
  assert.equal((await c('GET', '/api/state')).body.state.water['2026-01-01'], 3)
})

test('sync conflicts, reset, and changes that need the password', async (t) => {
  const { client } = await start(t)
  const phone = client()
  const p = pw()
  await phone('POST', '/api/signup', { name: 'asha', password: p })
  const laptop = client()
  await laptop('POST', '/api/login', { name: 'asha', password: p })

  assert.equal((await phone('PUT', '/api/state', { rev: 0, state: { nope: 1 } })).status, 400)
  assert.deepEqual((await phone('PUT', '/api/state', { rev: 0, state: { ...empty, water: { d: 3 } } })).body, { rev: 1 })
  const stale = await laptop('PUT', '/api/state', { rev: 0, state: empty })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.state.water.d, 3)
  const reset = await laptop('POST', '/api/state/reset', {})
  assert.deepEqual([reset.body.rev, reset.body.state.water], [2, {}])

  // A session alone can't change the password, the e-mail, or delete the account.
  assert.equal((await phone('POST', '/api/account/password', { newPassword: pw() })).status, 403)
  assert.equal((await phone('POST', '/api/account/email', { email: 'a@b.co', password: 'nope' + p })).status, 403)
  const p2 = pw()
  assert.equal((await phone('POST', '/api/account/password', { password: p, newPassword: p2 })).status, 200)
  assert.equal((await laptop('GET', '/api/state')).status, 401) // signed out elsewhere
  assert.equal((await phone('GET', '/api/state')).status, 200) // but not here
  assert.equal((await phone('POST', '/api/account/password', { password: p2, newPassword: null })).status, 400) // only way in

  // Another device by one-time code.
  const code = await phone('POST', '/api/account/device-code', { password: p2 })
  const tablet = client()
  assert.equal((await tablet('POST', '/api/login/device', { code: code.body.code })).status, 200)
  assert.equal((await client()('POST', '/api/login/device', { code: code.body.code })).status, 401) // one use

  const acts = (await phone('GET', '/api/account/activity')).body.events.map((e) => e.type)
  assert.ok(acts.includes('auth.login.device') && acts.includes('auth.password.change'))
  assert.equal((await phone('POST', '/api/account/delete', { password: p2 })).status, 200)
  assert.equal((await tablet('GET', '/api/state')).status, 401)
  assert.equal((await client()('POST', '/api/login', { name: 'asha', password: p2 })).status, 401)
})

test('admin dashboard: disable, reset code, roles, ownership, delete, activity log', async (t) => {
  const { client } = await start(t, { signup: 'open' })
  const owner = client()
  const po = pw()
  await owner('POST', '/api/signup', { name: 'owner', password: po })
  const bob = client()
  const pb = pw()
  await bob('POST', '/api/signup', { name: 'bob', password: pb })
  const carol = client()
  await carol('POST', '/api/signup', { name: 'carol', password: pw() })
  const { users } = (await owner('GET', '/api/admin/users')).body
  const id = (n) => users.find((u) => u.name === n).id

  await owner('POST', '/api/admin/user/disable', { id: id('bob'), disabled: true })
  assert.equal((await bob('GET', '/api/state')).status, 401)
  assert.equal((await client()('POST', '/api/login', { name: 'bob', password: pb })).status, 403)
  await owner('POST', '/api/admin/user/disable', { id: id('bob'), disabled: false })

  const reset = await owner('POST', '/api/admin/user/reset', { id: id('bob') })
  assert.equal((await client()('POST', '/api/login', { name: 'bob', password: pb })).status, 401) // old password gone
  const pb2 = pw()
  assert.equal((await client()('POST', '/api/login/reset', { name: 'bob', code: 'WRONG-CODE-HERE', password: pb2 })).status, 401)
  assert.equal((await bob('POST', '/api/login/reset', { name: 'Bob', code: reset.body.code, password: pb2 })).status, 200)

  await owner('POST', '/api/admin/user/role', { id: id('bob'), admin: true })
  assert.equal((await bob('POST', '/api/admin/user/role', { id: id('carol'), admin: true })).status, 403) // owner only
  assert.equal((await bob('POST', '/api/admin/user/disable', { id: id('owner'), disabled: true })).status, 403)
  assert.equal((await bob('POST', '/api/admin/user/reset', { id: id('owner') })).status, 403)
  assert.equal((await owner('POST', '/api/account/delete', { password: po })).status, 400) // hand over first
  assert.equal((await owner('POST', '/api/admin/owner', { id: id('bob') })).status, 403) // needs the password
  assert.equal((await owner('POST', '/api/admin/owner', { id: id('bob'), password: po })).status, 200)
  assert.equal((await bob('GET', '/api/me')).body.user.owner, true)

  assert.equal((await bob('POST', '/api/admin/user/delete', { id: id('carol') })).status, 200)
  assert.equal((await carol('GET', '/api/state')).status, 401)
  const types = (await bob('GET', '/api/admin/audit')).body.events.map((e) => e.type)
  for (const want of ['admin.user.disable', 'admin.password.reset', 'auth.password.reset', 'admin.owner', 'admin.user.delete', 'auth.login.fail'])
    assert.ok(types.includes(want), want)
  const cleared = await bob('POST', '/api/admin/audit/clear', {})
  assert.deepEqual(cleared.body.events.map((e) => e.type), ['admin.audit.clear'])
})

test('static files: served from dist, no path traversal', async (t) => {
  // Any real folders will do: server/ stands in for dist and for releases.
  const { base } = await start(t, { distDir: path.resolve('server'), siteDir: path.resolve('website'), releasesDir: path.resolve('server') })
  assert.match(await (await fetch(base + '/welcome')).text(), /Every (calorie|thali)/)
  assert.match(await (await fetch(base + '/download/push.js')).text(), /dueReminders/)
  assert.equal((await fetch(base + '/download/..%2fpackage.json')).status, 404) // stays in releases/
  assert.match(await (await fetch(base + '/ai.js')).text(), /createAi/)
  const escape = await fetch(base + '/..%2f..%2fpackage.json')
  assert.equal(escape.status, 404)
  // Without a JSON content type, a cross-site form post can't reach a handler.
  assert.equal((await fetch(base + '/api/logout', { method: 'POST', body: 'x' })).status, 415)
})

test('AI runs on each person’s own provider and key', async (t) => {
  // Stand-ins for Anthropic and for an OpenAI-compatible server, recording what they get.
  const seen = []
  const meal = { items: [{ name: 'Dal', grams: 99999, kcal_per_100g: 100, protein_per_100g: 5.5, carbs_per_100g: 14, sugar_per_100g: 1, fat_per_100g: -3, saturated_fat_per_100g: 1, fibre_per_100g: 3, sodium_mg_per_100g: 250 }] }
  const reply = (text) => ({ id: 'msg_t', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text }] })
  const stub = createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const b = raw ? JSON.parse(raw) : {}
    seen.push({ url: req.url, auth: req.headers['x-api-key'] || req.headers.authorization, body: b })
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'llama-local' }, { id: 'gemma-local' }] }))
    if (req.url === '/v1/chat/completions')
      return res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: b.response_format ? '```json\n' + JSON.stringify(meal) + '\n```' : 'Eat more dal.' } }] }))
    res.end(JSON.stringify(reply(b.output_config?.format ? JSON.stringify(meal) : 'Eat more dal.')))
  })
  const stubUrl = await listen(stub)
  t.after(() => stub.close())
  process.env.ANTHROPIC_BASE_URL = stubUrl

  const { client } = await start(t, { signup: 'open' })
  const owner = client()
  await owner('POST', '/api/signup', { name: 'owner', password: pw() })
  const ravi = client()
  await ravi('POST', '/api/signup', { name: 'ravi', password: pw() })

  assert.equal((await owner('POST', '/api/ai/review', { summary: {} })).status, 400) // nothing connected
  await owner('POST', '/api/ai', { provider: 'anthropic', key: 'sk-ant-owner-key' })
  assert.match((await owner('POST', '/api/ai/review', { summary: {} })).body.error, /Confirm what is sent/)
  const cfg = (await owner('POST', '/api/ai', { provider: 'anthropic', consent: true })).body
  assert.deepEqual([cfg.provider, cfg.model, cfg.hasKey.anthropic, cfg.consented], ['anthropic', 'claude-opus-5-5', true, true])
  assert.ok(!JSON.stringify(cfg).includes('sk-ant-owner-key')) // never sent back

  const photo = await owner('POST', '/api/ai/photo', { image: 'AAAA' })
  assert.equal(photo.status, 200)
  assert.deepEqual(photo.body.items[0], { name: 'Dal', grams: 2000, per100: { kcal: 100, protein: 5.5, carbs: 14, sugar: 1, fat: 0, satFat: 1, fibre: 3, sodium: 250 } })
  const sent = seen.at(-1)
  assert.match(sent.auth, /sk-ant-owner-key/) // the SDK sends it as x-api-key or a Bearer header
  assert.equal(sent.body.model, 'claude-opus-5-5')
  assert.equal(sent.body.output_config.format.type, 'json_schema')
  assert.equal((await owner('POST', '/api/ai/review', { summary: { days: [] } })).body.text, 'Eat more dal.')
  assert.equal(seen.at(-1).body.fallbacks, 'default')

  // Ravi uses an OpenAI-compatible server. As a non-admin he can't point it at this machine...
  assert.equal((await ravi('POST', '/api/ai', { provider: 'compatible', baseUrl: stubUrl })).status, 400)
  // ...the owner can (Ollama on localhost is the usual case).
  await owner('POST', '/api/ai', { provider: 'compatible', baseUrl: stubUrl, key: 'local-key' })
  assert.deepEqual((await owner('POST', '/api/ai/models', { provider: 'compatible', baseUrl: stubUrl })).body.models, ['gemma-local', 'llama-local'])
  await owner('POST', '/api/ai', { provider: 'compatible', model: 'llama-local', consent: true })
  const local = await owner('POST', '/api/ai/photo', { image: 'AAAA' })
  assert.equal(local.body.items[0].name, 'Dal')
  assert.equal(seen.at(-1).auth, 'Bearer local-key')
  assert.equal(seen.at(-1).body.model, 'llama-local')
  assert.equal(seen.at(-1).body.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,AAAA')
  // Switching providers keeps the other key.
  assert.equal((await owner('GET', '/api/ai')).body.hasKey.anthropic, true)
  assert.equal((await ravi('GET', '/api/ai')).body.provider, null) // and nobody shares it
})

test('webhooks: signed deliveries for new food, test events, private addresses refused', async (t) => {
  const got = []
  const receiver = createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    got.push({ headers: req.headers, raw })
    res.end('ok')
  })
  const url = await listen(receiver)
  t.after(() => receiver.close())
  const { client } = await start(t, { signup: 'open' })
  const owner = client()
  await owner('POST', '/api/signup', { name: 'owner', password: pw() })
  const ravi = client()
  await ravi('POST', '/api/signup', { name: 'ravi', password: pw() })
  assert.equal((await ravi('POST', '/api/hooks/new', { url: url + '/hook', events: ['food.logged'] })).status, 400)

  const made = await owner('POST', '/api/hooks/new', { url: url + '/hook', name: 'Home', events: ['food.logged', 'weighin.logged'] })
  assert.equal(made.status, 200)
  assert.match(made.body.secret, /^thwh_/)
  assert.equal(made.body.hook.url, url + '/…')
  const today = new Date().toISOString().slice(0, 10)
  const entry = { id: 'e1', meal: 'Lunch', name: 'Dal', grams: 150, kcal: 150, protein: 8, carbs: 21, fat: 4, fibre: 4 }
  await owner('PUT', '/api/state', { rev: 0, state: { ...empty, diary: { [today]: [entry] }, weights: { [today]: 72 } } })
  await owner('POST', '/api/hooks/test', { id: made.body.hook.id })
  for (let i = 0; i < 50 && got.length < 3; i++) await new Promise((r) => setTimeout(r, 50))
  const types = got.map((g) => g.headers['x-thally-event']).sort()
  assert.deepEqual(types, ['food.logged', 'food.logged', 'weighin.logged'])
  for (const g of got) assert.ok(verifySignature(made.body.secret, g.raw, g.headers['x-thally-signature']))
  const real = got.map((g) => JSON.parse(g.raw)).find((b) => b.type === 'food.logged' && !b.test)
  assert.deepEqual([real.data.entries[0].name, real.data.day.kcal], ['Dal', 150])
  let list
  for (let i = 0; i < 50; i++) {
    list = (await owner('GET', '/api/hooks')).body
    if (list?.log?.length >= 3) break
    await new Promise((r) => setTimeout(r, 50))
  }
  assert.equal(list.log.length, 3)
  assert.ok(list.hooks[0].lastOk)
  // With the Webhooks module off, new food sends nothing.
  const off = { ...empty, settings: { modules: { webhooks: false } }, diary: { [today]: [entry, { ...entry, id: 'e2' }] } }
  await owner('PUT', '/api/state', { rev: 1, state: off })
  await new Promise((r) => setTimeout(r, 300))
  assert.equal(got.length, 3)
})

test('pure pieces: events from a sync, reminders, provider helpers', () => {
  const today = '2026-03-10'
  const e = (id) => ({ id, meal: 'Lunch', name: 'x', grams: 100, kcal: 100, protein: 1, carbs: 1, fat: 1, fibre: 1 })
  const before = { diary: { [today]: [e('a')], '2026-01-01': [] }, weights: { [today]: 70 }, foods: [] }
  const after = { diary: { [today]: [e('a'), e('b')], '2026-01-01': [e('old')] }, weights: { [today]: 70, '2026-03-09': 71 }, foods: [{ id: 'd', kind: 'dish', name: 'Khichdi', per100: {} }] }
  const ev = eventsFrom(before, after, today)
  assert.deepEqual(ev.map((x) => x.type), ['food.logged', 'weighin.logged', 'dish.saved']) // the January entry is too old
  assert.deepEqual(ev[0].data.entries.map((x) => x.id), ['b'])

  assert.deepEqual(localNow('Asia/Kolkata', new Date('2026-03-10T07:30:00Z')), { date: '2026-03-10', time: '13:00' })
  const reminders = { tz: 'Asia/Kolkata', meals: [{ meal: 'Lunch', time: '13:00', on: true }, { meal: 'Dinner', time: '13:00', on: true }], nudge: { on: true, time: '13:00' } }
  const due = dueReminders({ settings: { reminders }, diary: { '2026-03-10': [{ meal: 'Lunch' }] } }, new Date('2026-03-10T07:30:00Z'))
  assert.deepEqual(due.map((d) => d.key), ['meal:Dinner:2026-03-10']) // lunch is logged; something is logged, so no nudge
  assert.deepEqual(dueReminders({ settings: { reminders, modules: { reminders: false } }, diary: {} }, new Date('2026-03-10T07:30:00Z')), [])
  assert.throws(() => checkSubscription({ endpoint: 'https://192.168.1.4/x', keys: { p256dh: 'a', auth: 'b' } }))

  assert.deepEqual(parseJsonAnswer('Sure!\n```json\n{"items":[]}\n```'), { items: [] })
  assert.equal(parseJsonAnswer('no json here'), null)
  assert.equal(withVersion('https://openrouter.ai/api/v1', '/v1', '/models'), 'https://openrouter.ai/api/v1/models')
  assert.equal(withVersion('http://ollama.lan:11434', '/v1', '/models'), 'http://ollama.lan:11434/v1/models')
  assert.equal(cleanItems([{ name: 'x'.repeat(200), grams: -5 }])[0].grams, 1)

  const parsedLabel = cleanLabelItem({
    name: 'Epigamia Greek Yogurt',
    portionName: '1 cup',
    portionGrams: 120,
    kcal_per_100g: 130,
    protein_per_100g: 10,
    carbs_per_100g: 12,
    fat_per_100g: 4,
  })
  assert.equal(parsedLabel.name, 'Epigamia Greek Yogurt')
  assert.equal(parsedLabel.portions[0].grams, 120)
  assert.equal(parsedLabel.per100.protein, 10)
})

test('created foods and recipe dishes by any user are shared and accessible to all users', async (t) => {
  const { client } = await start(t, { signup: 'open' })
  const userA = client()
  await userA('POST', '/api/signup', { name: 'Chef Asha', password: pw() })

  const userB = client()
  await userB('POST', '/api/signup', { name: 'Fitness Fan Ravi', password: pw() })

  const guest = client()

  // 1. Initially shared recipes is empty
  const initial = await guest('GET', '/api/recipes')
  assert.equal(initial.status, 200)
  assert.deepEqual(initial.body.recipes, [])

  // 2. User A creates a custom branded food AND a recipe dish via sync PUT /api/state
  const customFoodA = {
    id: 'food_yogurt_999',
    name: 'Artisan Greek Yogurt',
    kind: 'food',
    portions: [{ name: 'cup', grams: 150 }],
    per100: { kcal: 90, protein: 10, carbs: 4, fat: 3 },
  }
  const dishA = {
    id: 'dish_biryani_123',
    name: 'High Protein Chicken Biryani',
    kind: 'dish',
    servings: 4,
    per100: { kcal: 165, protein: 18, carbs: 14, fat: 4 },
    ingredients: [
      { name: 'Basmati Rice', grams: 200, per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 } },
      { name: 'Chicken Breast', grams: 400, per100: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 } },
    ],
  }
  const syncRes = await userA('PUT', '/api/state', {
    rev: 0,
    state: { ...empty, foods: [customFoodA, dishA] },
  })
  assert.equal(syncRes.status, 200)

  // Give async disk sync a moment
  await new Promise((r) => setTimeout(r, 100))

  // 3. User B and Guest can both retrieve Chef Asha's custom food and recipe dish
  const sharedAfterA = await userB('GET', '/api/recipes')
  assert.equal(sharedAfterA.status, 200)
  assert.equal(sharedAfterA.body.recipes.length, 2)
  const namesA = sharedAfterA.body.recipes.map((r) => r.name).sort()
  assert.deepEqual(namesA, ['Artisan Greek Yogurt', 'High Protein Chicken Biryani'])
  assert.equal(sharedAfterA.body.recipes[0].authorName, 'Chef Asha')

  const guestView = await guest('GET', '/api/recipes')
  assert.equal(guestView.body.recipes.length, 2)

  // 4. User B posts their own recipe dish directly via POST /api/recipes
  const dishB = {
    id: 'dish_moong_dal_456',
    name: 'Sprouted Moong Khichdi',
    kind: 'dish',
    servings: 2,
    per100: { kcal: 110, protein: 8, carbs: 18, fat: 1 },
    ingredients: [{ name: 'Sprouted Moong', grams: 150 }],
  }
  const postRes = await userB('POST', '/api/recipes', dishB)
  assert.equal(postRes.status, 200)
  assert.equal(postRes.body.ok, true)
  assert.equal(postRes.body.recipe.authorName, 'Fitness Fan Ravi')

  // 5. All 3 foods/recipes are now visible across all users
  const bothRecipes = (await userA('GET', '/api/recipes')).body.recipes
  assert.equal(bothRecipes.length, 3)

  // 6. User B (non-admin, non-author) cannot delete User A's dish
  const delForbidden = await userB('DELETE', '/api/recipes', { id: 'dish_biryani_123' })
  assert.equal(delForbidden.status, 403)

  // 7. User B can delete their own dish
  const delOk = await userB('DELETE', '/api/recipes', { id: 'dish_moong_dal_456' })
  assert.equal(delOk.status, 200)
  assert.equal((await userA('GET', '/api/recipes')).body.recipes.length, 2)

  // 8. User A (author/admin) can delete their items
  const delAOk = await userA('DELETE', '/api/recipes', { id: 'dish_biryani_123' })
  assert.equal(delAOk.status, 200)
  const delFoodOk = await userA('DELETE', '/api/recipes', { id: 'food_yogurt_999' })
  assert.equal(delFoodOk.status, 200)
  assert.equal((await guest('GET', '/api/recipes')).body.recipes.length, 0)
})

