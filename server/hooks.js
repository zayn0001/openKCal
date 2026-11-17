// Outgoing webhooks, as in openGym's Integrations: a person adds a URL (Home Assistant, n8n, ntfy,
// Node-RED...) and picks events; the server POSTs signed JSON when they happen, from whichever
// device they were logged on. Events are found by comparing each synced state with the last one.
//
// Stored per person in DATA_DIR/hooks/<account id>.json: the URL and signing secret sealed (a Home
// Assistant URL carries its own secret), plus the last 50 deliveries. Signature header:
// X-Thally-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">.
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { HttpError, readJson, serialize, writeJson } from './http.js'
import { checkUrl, randomId, safeFetch, seal, signature, unseal } from './secure.js'
import { sum } from '../src/lib/nutrition.js'

export const EVENTS = {
  'food.logged': 'Food logged',
  'weighin.logged': 'Weigh-in logged',
  'dish.saved': 'Dish saved',
}
const MAX_HOOKS = 10
const LOG_SIZE = 50
// About 30 s, then 1, 2, 4, 8, 16 and 32 minutes, each give or take a quarter.
const RETRY_SECONDS = [30, 60, 120, 240, 480, 960, 1920]
const RETRY_STATUS = (s) => s === 408 || s === 425 || s === 429 || s >= 500
const RECENT_DAYS = 7

const round1 = (n) => Math.round(n * 10) / 10

/** The events one sync produced, from the state before and after. Pure, so it is tested alone. */
export function eventsFrom(before, after, today = new Date().toISOString().slice(0, 10)) {
  const out = []
  if (!after) return out
  const cutoff = new Date(Date.parse(today) - RECENT_DAYS * 86400_000).toISOString().slice(0, 10)
  const known = new Set(Object.values(before?.diary || {}).flat().map((e) => e.id))
  for (const [date, entries] of Object.entries(after.diary || {})) {
    if (date < cutoff) continue // restoring a backup doesn't replay history
    const fresh = entries.filter((e) => !known.has(e.id))
    if (!fresh.length) continue
    const day = sum(entries)
    out.push({
      type: 'food.logged',
      data: {
        entries: fresh.map(({ id, meal, name, grams, kcal, protein, carbs, fat, fibre }) => ({
          id, date, meal, name, grams: round1(grams), kcal: round1(kcal), protein: round1(protein), carbs: round1(carbs), fat: round1(fat), fibre: round1(fibre || 0),
        })),
        day: { date, ...Object.fromEntries(Object.entries(day).map(([k, v]) => [k, round1(v)])) },
      },
    })
  }
  for (const [date, kg] of Object.entries(after.weights || {}))
    if (date >= cutoff && before?.weights?.[date] !== kg) out.push({ type: 'weighin.logged', data: { weighin: { date, weight: kg, unit: 'kg' } } })
  const knownFoods = new Set((before?.foods || []).map((f) => f.id))
  for (const f of after.foods || [])
    if (f.kind === 'dish' && !knownFoods.has(f.id))
      out.push({ type: 'dish.saved', data: { dish: { id: f.id, name: f.name, servings: f.servings ?? null, per100: f.per100, ingredients: f.ingredients?.length ?? 0 } } })
  return out
}

export async function createHooks({ dataDir, key, allowLan = () => false }) {
  const dir = path.join(dataDir, 'hooks')
  await mkdir(dir, { recursive: true })
  const file = (uid) => path.join(dir, `${uid}.json`)
  const writes = serialize()
  const load = (uid) => readJson(file(uid), { hooks: [], log: [] })
  const aad = (uid, id, field) => `hook:${uid}:${id}:${field}`
  const update = (uid, fn) =>
    writes(async () => {
      const data = await load(uid)
      const out = await fn(data)
      await writeJson(file(uid), data, { private: true })
      return out
    })

  // ponytail: pending deliveries live in memory, so a restart drops retries still waiting;
  // persist the queue if hooks that must never miss an event come up.
  const queue = [] // { uid, hookId, type, body, deliveryId, attempt, due }
  const failedBodies = new Map() // hookId -> deliveries that gave up, for Retry
  const perMinute = new Map() // hookId -> { n, reset }
  let timer = null

  const shownUrl = (u) => {
    try {
      const url = new URL(u)
      return `${url.protocol}//${url.host}${url.pathname.length > 1 ? '/…' : '/'}`
    } catch {
      return '(unreadable)'
    }
  }
  const view = (uid, h) => ({
    id: h.id, name: h.name, url: shownUrl(unseal(key, h.url, aad(uid, h.id, 'url'))), events: h.events, paused: h.paused,
    created: h.created, lastOk: h.lastOk || null, lastError: h.lastError || null, needsAttention: !!h.lastError,
  })

  function enqueue(uid, h, type, data, test = false) {
    const deliveryId = 'evt_' + randomId(9)
    const body = JSON.stringify({ version: 1, id: deliveryId, type, createdAt: new Date().toISOString(), ...(test && { test: true }), data })
    queue.push({ uid, hookId: h.id, type, body, deliveryId, attempt: 0, due: Date.now() })
    timer ??= setTimeout(work, 0)
  }

  async function deliver(job) {
    const data = await load(job.uid)
    const h = data.hooks.find((x) => x.id === job.hookId)
    if (!h || h.paused) return
    const url = unseal(key, h.url, aad(job.uid, h.id, 'url'))
    const secret = unseal(key, h.secret, aad(job.uid, h.id, 'secret'))
    if (!url || !secret) return record(job, { error: 'This webhook can no longer be read. Remove it and add it again.' }, false)
    let status = 0
    let error = null
    let retryAfter = 0
    try {
      const res = await safeFetch(url, {
        method: 'POST',
        timeout: 10_000,
        allowLan: allowLan(job.uid),
        headers: {
          'content-type': 'application/json',
          'user-agent': 'openKCal-Webhook/1',
          'x-thally-event': job.type,
          'x-thally-delivery': job.deliveryId,
          'x-thally-signature': signature(secret, job.body),
        },
        body: job.body,
      })
      status = res.status
      retryAfter = Math.min(6 * 3600, Number(res.headers['retry-after']) || 0)
      if (!res.ok) error = status >= 300 && status < 400 ? `Answered ${status} (a redirect). Use the final URL.` : `Answered ${status}`
    } catch (e) {
      error = e.code === 'EBLOCKED' ? 'That address is on a private network, which this server does not call' : e.code === 'ETIMEDOUT' ? 'No answer within 10 seconds' : `Could not connect (${e.code || 'error'})`
    }
    const retry = error && (status === 0 ? !/private network/.test(error) : RETRY_STATUS(status)) && job.attempt < RETRY_SECONDS.length
    if (retry) {
      const wait = retryAfter || RETRY_SECONDS[job.attempt] * (0.75 + Math.random() / 2)
      queue.push({ ...job, attempt: job.attempt + 1, due: Date.now() + wait * 1000 })
    }
    await record(job, { status, error }, retry, status === 410)
  }

  function record(job, { status = 0, error }, retrying, gone = false) {
    if (error && !retrying) failedBodies.set(job.hookId, [...(failedBodies.get(job.hookId) || []), job].slice(-20))
    return update(job.uid, (data) => {
      const h = data.hooks.find((x) => x.id === job.hookId)
      if (!h) return
      const at = new Date().toISOString()
      if (error) h.lastError = { at, message: error, retrying }
      else {
        h.lastOk = at
        h.lastError = null
      }
      if (gone) h.paused = true // 410 Gone: the receiver says this webhook is finished
      data.log.unshift({ at, hookId: h.id, type: job.type, deliveryId: job.deliveryId, attempt: job.attempt + 1, status, error: error || null })
      data.log.length = Math.min(data.log.length, LOG_SIZE)
    })
  }

  let working = false
  async function work() {
    timer = null
    if (working) return // the running pass reschedules itself when it ends
    working = true
    const now = Date.now()
    const due = queue.filter((j) => j.due <= now).slice(0, 10)
    for (const j of due) {
      const m = perMinute.get(j.hookId)
      if (m && m.reset > now && m.n >= 30) {
        j.due = m.reset // each webhook gets at most 30 deliveries a minute
        continue
      }
      perMinute.set(j.hookId, m && m.reset > now ? { ...m, n: m.n + 1 } : { n: 1, reset: now + 60_000 })
      queue.splice(queue.indexOf(j), 1)
      await deliver(j).catch((e) => console.error('webhook:', e.message))
    }
    working = false
    if (queue.length) timer = setTimeout(work, Math.max(0, Math.min(...queue.map((j) => j.due)) - Date.now()))
  }

  return {
    async list(uid) {
      const data = await load(uid)
      return { hooks: data.hooks.map((h) => view(uid, h)), log: data.log, events: EVENTS }
    },
    async create(uid, { url, name, events }) {
      let u
      try {
        u = checkUrl(url, { allowLan: allowLan(uid) })
      } catch (e) {
        throw new HttpError(400, e.message)
      }
      const picked = (Array.isArray(events) ? events : []).filter((e) => EVENTS[e])
      if (!picked.length) throw new HttpError(400, 'Pick at least one event')
      const secret = 'thwh_' + randomId(24)
      return update(uid, (data) => {
        if (data.hooks.length >= MAX_HOOKS) throw new HttpError(400, `At most ${MAX_HOOKS} webhooks`)
        const id = 'wh_' + randomId(6)
        const h = {
          id, name: String(name || u.host).trim().slice(0, 60), events: picked, paused: false, created: new Date().toISOString(),
          url: seal(key, u.toString(), aad(uid, id, 'url')), secret: seal(key, secret, aad(uid, id, 'secret')),
        }
        data.hooks.push(h)
        return { hook: view(uid, h), secret } // the secret is shown once
      })
    },
    update(uid, { id, name, events, paused }) {
      return update(uid, (data) => {
        const h = data.hooks.find((x) => x.id === id)
        if (!h) throw new HttpError(404, 'No such webhook')
        if (typeof name === 'string') h.name = name.trim().slice(0, 60) || h.name
        if (Array.isArray(events)) {
          const picked = events.filter((e) => EVENTS[e])
          if (!picked.length) throw new HttpError(400, 'Pick at least one event')
          h.events = picked
        }
        if (typeof paused === 'boolean') h.paused = paused
        return view(uid, h)
      })
    },
    remove(uid, id) {
      failedBodies.delete(id)
      return update(uid, (data) => {
        data.hooks = data.hooks.filter((h) => h.id !== id)
        data.log = data.log.filter((l) => l.hookId !== id)
      })
    },
    async test(uid, id) {
      const h = (await load(uid)).hooks.find((x) => x.id === id)
      if (!h) throw new HttpError(404, 'No such webhook')
      const type = h.events[0]
      const sample = {
        'food.logged': { entries: [{ id: 'test', date: new Date().toISOString().slice(0, 10), meal: 'Lunch', name: 'Dal', grams: 150, kcal: 150, protein: 8.3, carbs: 21, fat: 3.8, fibre: 4.5 }], day: { date: new Date().toISOString().slice(0, 10), kcal: 150, protein: 8.3, carbs: 21, fat: 3.8, fibre: 4.5 } },
        'weighin.logged': { weighin: { date: new Date().toISOString().slice(0, 10), weight: 72.4, unit: 'kg' } },
        'dish.saved': { dish: { id: 'test', name: 'Rajma chawal', servings: 2, per100: { kcal: 135, protein: 5, carbs: 22, fat: 2.5, fibre: 3.5 }, ingredients: 4 } },
      }[type]
      enqueue(uid, h, type, sample, true)
      return { queued: true }
    },
    async retry(uid, id) {
      const h = (await load(uid)).hooks.find((x) => x.id === id)
      if (!h) throw new HttpError(404, 'No such webhook')
      const jobs = failedBodies.get(id) || []
      failedBodies.delete(id)
      for (const j of jobs) queue.push({ ...j, attempt: 0, due: Date.now() })
      if (jobs.length) timer ??= setTimeout(work, 0)
      return { queued: jobs.length }
    },
    /** Called after every successful sync. */
    async onSync(uid, before, after) {
      if (after?.settings?.modules?.webhooks === false) return // the Webhooks module is off: nothing is sent
      const events = eventsFrom(before, after)
      if (!events.length) return
      const data = await load(uid)
      for (const h of data.hooks) if (!h.paused) for (const e of events) if (h.events.includes(e.type)) enqueue(uid, h, e.type, e.data)
    },
    forget: (uid) => writes(() => rm(file(uid), { force: true })),
    stop: () => clearTimeout(timer),
  }
}
