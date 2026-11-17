// Meal reminders by web push, the food counterpart of openGym's workout reminders. Each browser
// that turns reminders on registers a push subscription here; the reminder times themselves are
// part of the person's synced settings (settings.reminders), so every device agrees on them.
// A tick each minute sends what is due in the person's own time zone.
import dns from 'node:dns'
import https from 'node:https'
import { mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import webpush from 'web-push'
import { HttpError, readJson, serialize, writeJson } from './http.js'
import { isPrivateAddr } from './secure.js'

const MAX_SUBSCRIPTIONS = 10

// Push services are on the public internet; refuse an endpoint that resolves anywhere private.
const agent = new https.Agent({
  lookup: (host, opts, cb) =>
    dns.lookup(host, { ...opts, all: true }, (err, list) => {
      if (err) return cb(err)
      if (list.some((a) => isPrivateAddr(a.address))) return cb(Object.assign(new Error('private address'), { code: 'EBLOCKED' }))
      return opts.all ? cb(null, list) : cb(null, list[0].address, list[0].family)
    }),
})

export function checkSubscription(s) {
  let u
  try {
    u = new URL(s?.endpoint)
  } catch {
    throw new HttpError(400, 'Not a push subscription')
  }
  if (u.protocol !== 'https:' || u.username || String(s.endpoint).length > 2048 || isPrivateAddr(u.hostname))
    throw new HttpError(400, 'Not a push subscription this server can use')
  if (typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string' || s.keys.p256dh.length > 200 || s.keys.auth.length > 100)
    throw new HttpError(400, 'Not a push subscription')
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }
}

/** HH:MM and YYYY-MM-DD now in `tz`; falls back to UTC for an unknown zone. */
export function localNow(tz, now = new Date()) {
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  } catch {
    return localNow('UTC', now)
  }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

/**
 * The notifications due for one person this minute. Pure, so it is tested alone.
 * reminders: { tz, meals: [{ meal, time, on }], nudge: { on, time } }
 * A meal reminder is skipped when that meal already has something logged; the nudge only goes
 * out when nothing at all is logged that day.
 */
export function dueReminders(state, now = new Date()) {
  const r = state?.settings?.reminders
  if (!r || state.settings.modules?.reminders === false) return [] // the Reminders module is off
  const { date, time } = localNow(r.tz, now)
  const today = state.diary?.[date] || []
  const out = []
  for (const m of r.meals || [])
    if (m.on && m.time === time && !today.some((e) => e.meal === m.meal))
      out.push({ key: `meal:${m.meal}:${date}`, title: `Time to log ${String(m.meal).toLowerCase()}`, body: 'Tap to add what you ate.' })
  if (r.nudge?.on && r.nudge.time === time && !today.length)
    out.push({ key: `nudge:${date}`, title: 'Nothing logged today yet', body: 'A quick entry keeps your week accurate.' })
  return out
}

export async function createPush({ dataDir, subject = 'mailto:admin@localhost', readState, tickMs = 60_000 }) {
  const dir = path.join(dataDir, 'push')
  await mkdir(dir, { recursive: true })
  const vapidFile = path.join(dataDir, 'vapid.json')
  let vapid = await readJson(vapidFile, null)
  if (!vapid) {
    vapid = webpush.generateVAPIDKeys()
    await writeJson(vapidFile, vapid, { private: true })
  }
  const file = (uid) => path.join(dir, `${uid}.json`)
  const writes = serialize()
  const load = (uid) => readJson(file(uid), { subs: [] })
  const sent = new Set() // reminder keys already sent, so a slow tick never sends twice

  async function sendTo(uid, payload) {
    const { subs } = await load(uid)
    const gone = []
    let ok = 0
    for (const s of subs) {
      try {
        await webpush.sendNotification(s, JSON.stringify(payload), {
          vapidDetails: { subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
          TTL: 3600,
          timeout: 10_000,
          agent,
        })
        ok++
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.endpoint) // unsubscribed in the browser
      }
    }
    if (gone.length)
      await writes(async () => {
        const data = await load(uid)
        data.subs = data.subs.filter((s) => !gone.includes(s.endpoint))
        await writeJson(file(uid), data, { private: true })
      })
    return ok
  }

  async function tick() {
    const files = await readdir(dir).catch(() => [])
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      const uid = f.slice(0, -5)
      const state = await readState(uid).catch(() => null)
      for (const n of dueReminders(state)) {
        const k = `${uid}:${n.key}`
        if (sent.has(k)) continue
        sent.add(k)
        await sendTo(uid, { title: n.title, body: n.body, tag: n.key })
      }
    }
    if (sent.size > 50_000) sent.clear()
  }
  const timer = tickMs ? setInterval(() => tick().catch((e) => console.error('push:', e.message)), tickMs) : null
  timer?.unref()

  return {
    publicKey: vapid.publicKey,
    tick,
    async subscribe(uid, raw) {
      const sub = checkSubscription(raw)
      await writes(async () => {
        const data = await load(uid)
        data.subs = [{ ...sub, created: new Date().toISOString() }, ...data.subs.filter((s) => s.endpoint !== sub.endpoint)].slice(0, MAX_SUBSCRIPTIONS)
        await writeJson(file(uid), data, { private: true })
      })
    },
    async unsubscribe(uid, endpoint) {
      await writes(async () => {
        const data = await load(uid)
        data.subs = data.subs.filter((s) => s.endpoint !== endpoint)
        await writeJson(file(uid), data, { private: true })
      })
    },
    async subscribed(uid, endpoint) {
      return (await load(uid)).subs.some((s) => s.endpoint === endpoint)
    },
    test: (uid) => sendTo(uid, { title: 'openKCal', body: 'Reminders work on this device.', tag: 'test' }),
    forget: (uid) => writes(() => rm(file(uid), { force: true })),
    stop: () => clearInterval(timer),
  }
}
