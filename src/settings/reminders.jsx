import { useEffect, useState } from 'react'
import { call } from '../api'
import { MEALS } from '../lib/settings'
import { useSettings, useStore } from '../store'
import { useSync } from '../sync'
import { Toggle } from './basic'

const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

// Settings → Reminders: meal reminders by notification, sent by the server in your time zone.
export function RemindersPage() {
  const { user, server } = useSync()
  const { reminders } = useSettings()
  const [device, setDevice] = useState(null) // this browser's subscription, if any
  const [msg, setMsg] = useState('')
  const set = (patch) =>
    useStore.getState().setSettings('reminders', { ...reminders, ...patch, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })

  useEffect(() => {
    if (!user || !pushSupported() || !navigator.serviceWorker.controller) return
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then(async (sub) => {
      if (sub && (await call('POST', '/api/push/status', { endpoint: sub.endpoint })).subscribed) setDevice(sub)
    })
  }, [user])

  if (!user) return <section className="card"><p className="muted">Reminders are sent by your Thally server, so sign in first (Settings → Account).</p></section>
  if (!pushSupported()) return <section className="card"><p className="muted">This browser can’t receive notifications. On iPhone, add Thally to the Home Screen first, then open it from there.</p></section>
  if (!navigator.serviceWorker.controller)
    return <section className="card"><p className="muted">Reminders need the installed app (the production build). Reload once, or install Thally from the browser menu.</p></section>

  const turnOn = async () => {
    setMsg('')
    try {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in the browser’s site settings.')
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(server.push) })
      await call('POST', '/api/push/subscribe', { subscription: sub.toJSON() })
      setDevice(sub)
    } catch (e) {
      setMsg(e.message)
    }
  }
  const turnOff = async () => {
    await call('POST', '/api/push/unsubscribe', { endpoint: device.endpoint }).catch(() => {})
    await device.unsubscribe().catch(() => {})
    setDevice(null)
  }

  return (
    <>
      <section className="card">
        <Toggle label="Notifications on this device" hint="Each phone or computer is switched on separately." checked={!!device} onChange={(on) => (on ? turnOn() : turnOff())} />
        {device && (
          <div className="actions start">
            <button type="button" className="ghost" onClick={() => call('POST', '/api/push/test', {}).then((r) => setMsg(r.sent ? 'Sent. It should arrive in a moment.' : 'Nothing was sent.'), (e) => setMsg(e.message))}>
              Send a test notification
            </button>
          </div>
        )}
        {msg && <p role="status">{msg}</p>}
      </section>
      <section className="card">
        <h2>When</h2>
        <p className="muted">A meal reminder is skipped when that meal is already logged. Times are in your time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
        {MEALS.map((meal) => {
          const m = reminders.meals.find((x) => x.meal === meal) || { meal, time: '12:00', on: false }
          const update = (patch) => set({ meals: MEALS.map((x) => (x === meal ? { ...m, ...patch } : reminders.meals.find((y) => y.meal === x) || { meal: x, time: '12:00', on: false })) })
          return (
            <div key={meal} className="setting">
              <label className="inline">
                <input type="checkbox" checked={m.on} onChange={(e) => update({ on: e.target.checked })} /> {meal}
              </label>
              <input type="time" value={m.time} onChange={(e) => update({ time: e.target.value })} aria-label={`${meal} reminder time`} />
            </div>
          )
        })}
        <div className="setting">
          <label className="inline">
            <input type="checkbox" checked={reminders.nudge.on} onChange={(e) => set({ nudge: { ...reminders.nudge, on: e.target.checked } })} /> Nudge me if nothing is logged by
          </label>
          <input type="time" value={reminders.nudge.time} onChange={(e) => set({ nudge: { ...reminders.nudge, time: e.target.value } })} aria-label="Nudge time" />
        </div>
      </section>
    </>
  )
}
