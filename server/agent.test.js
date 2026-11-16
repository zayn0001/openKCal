// The meal agent: the proposal check on its own, then the tool loop end to end against stand-ins
// for Anthropic and an OpenAI-compatible server, each of which searches first and then proposes.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { TOOLS, resolveProposal, searchResults } from '../src/lib/agent.js'
import { createApp } from './server.js'

const dal = { id: 'fndds:41305050', name: 'Dal', source: 'USDA', per100: { kcal: 145, protein: 8.6, carbs: 19.2, fat: 4.3, fibre: 7.5 }, portions: [{ name: 'cup', grams: 240 }] }
const atta = { id: 'ifct:A019', name: 'Wheat flour, atta', source: 'IFCT', per100: { kcal: 320, protein: 10.6, carbs: 64, fat: 1.5, fibre: 11 }, portions: [] }
const mine = { id: 'u1', kind: 'dish', name: 'Mum’s dal', per100: { kcal: 120, protein: 7, carbs: 15, fat: 3, fibre: 5 }, portions: [{ name: 'serving', grams: 200 }] }

test('resolveProposal keeps what is real and drops the rest', () => {
  const find = (id) => [dal, atta, mine].find((f) => f.id === id)
  const out = resolveProposal(
    {
      entries: [
        { food_id: 'u1', grams: 200, meal: 'Lunch' },
        { food_id: 'new-1', meal: 'Brunch' }, // grams from the dish, meal from the time
        { food_id: 'made-up', grams: 100, meal: 'Lunch' },
        { food_id: 'fndds:41305050', grams: 99999, meal: 'Lunch' },
      ],
      new_dishes: [
        { temp_id: 'new-1', name: 'Makki roti', ingredients: [{ food_id: 'ifct:A019', grams: 60 }, { food_id: 'nope', grams: 5 }] },
        { temp_id: 'new-2', name: 'Unused', ingredients: [{ food_id: 'ifct:A019', grams: 10 }] },
      ],
      message: 'Assumed one roti.',
    },
    find,
    { time: '20:15' },
  )
  assert.deepEqual(out.entries.map((e) => [e.food.name, e.grams, e.meal]), [['Mum’s dal', 200, 'Lunch'], ['Makki roti', 60, 'Dinner']])
  assert.deepEqual(out.dishes.map((d) => d.name), ['Makki roti']) // the unused one is not offered
  assert.equal(Math.round(out.dishes[0].per100.kcal), 320)
  assert.equal(out.dropped, 3)
  assert.equal(out.message, 'Assumed one roti.')
  assert.deepEqual(resolveProposal(null, find), { entries: [], dishes: [], message: '', dropped: 0 })
  assert.equal(searchResults([dal, mine], 'dal')[0].source, 'dish') // your own first
  assert.deepEqual(TOOLS.map((t) => t.name), ['search_foods', 'propose_meal'])
})

const listen = (server) => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${server.address().port}`)))

function client(base) {
  let cookie = ''
  return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { cookie }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: res.status, body: await res.json().catch(() => null) }
  }
}

test('the agent searches, then proposes; nothing is saved by the server', async (t) => {
  const seen = { anthropic: [], chat: [] }
  // Round 1: search for "dal". Round 2: propose the first result, plus a new dish from atta.
  const firstId = (text) => JSON.parse(text).results[0].id
  const stub = createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const b = JSON.parse(raw || '{}')
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/v1/messages') {
      seen.anthropic.push(b)
      const result = b.messages.at(-1).content?.[0]?.type === 'tool_result' ? b.messages.at(-1).content[0] : null
      const use = result
        ? { type: 'tool_use', id: 'tu_2', name: 'propose_meal', input: { entries: [{ food_id: firstId(result.content), grams: 150, meal: 'Lunch' }, { food_id: 'new-1', grams: 80, meal: 'Lunch' }], new_dishes: [{ temp_id: 'new-1', name: 'Makki roti', ingredients: [{ food_id: 'ifct:A019', grams: 80 }] }], message: 'One bowl of dal.' } }
        : { type: 'tool_use', id: 'tu_1', name: 'search_foods', input: { query: 'dal' } }
      return res.end(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: b.model, stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, content: [use] }))
    }
    if (req.url === '/v1/chat/completions') {
      seen.chat.push(b)
      const last = b.messages.at(-1)
      const call =
        last.role === 'tool'
          ? { id: 'c2', type: 'function', function: { name: 'propose_meal', arguments: JSON.stringify({ entries: [{ food_id: firstId(last.content), grams: 150, meal: 'Dinner' }] }) } }
          : { id: 'c1', type: 'function', function: { name: 'search_foods', arguments: '{"query":"dal"}' } }
      return res.end(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [call] } }] }))
    }
    res.statusCode = 404
    res.end('{}')
  })
  const stubUrl = await listen(stub)
  t.after(() => stub.close())
  process.env.ANTHROPIC_BASE_URL = stubUrl

  const app = await createApp({ dataDir: await mkdtemp(path.join(tmpdir(), 'thally-')), pushTickMs: 0 })
  const base = await listen(app)
  t.after(() => app.close())
  const me = client(base)
  await me('POST', '/api/signup', { name: 'asha', password: randomBytes(12).toString('hex') })
  await me('PUT', '/api/state', { rev: 0, state: { profile: null, diary: {}, foods: [mine], weights: {}, water: {}, gone: [], settings: {} } })

  await me('POST', '/api/ai', { provider: 'anthropic', key: 'sk-ant-test', consent: true })
  const a = await me('POST', '/api/ai/describe', { text: 'Had a bowl of dal and a makki roti for lunch', time: '13:10' })
  assert.equal(a.status, 200)
  assert.deepEqual(a.body.entries.map((e) => [e.food.name, e.grams, e.meal, e.newDish || null]), [['Mum’s dal', 150, 'Lunch', null], ['Makki roti', 80, 'Lunch', 'new-1']])
  assert.equal(a.body.dishes[0].ingredients[0].name, 'Wheat flour, atta') // resolved from the real catalogue
  assert.equal(seen.anthropic.length, 2)
  assert.equal(seen.anthropic[0].tools.length, 2)
  assert.equal(seen.anthropic[1].messages[1].role, 'assistant') // the model's turn goes back whole

  await me('POST', '/api/ai', { provider: 'compatible', baseUrl: stubUrl, model: 'local', consent: true })
  const c = await me('POST', '/api/ai/describe', { text: 'dal for dinner', time: '20:00' })
  assert.deepEqual(c.body.entries.map((e) => [e.food.name, e.meal]), [['Mum’s dal', 'Dinner']])
  assert.equal(seen.chat[1].messages.at(-1).role, 'tool')

  // The server saved nothing: the state is as the app last pushed it.
  assert.equal((await me('GET', '/api/state')).body.state.foods.length, 1)
  assert.equal((await me('POST', '/api/ai/describe', { text: 'x' })).status, 400) // too short
})
