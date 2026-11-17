import { useEffect, useState } from 'react'
import { call } from '../api'
import { useSync } from '../sync'
import { Toggle } from './basic'

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—')

// Settings → Integrations: webhooks to Home Assistant, n8n, ntfy, Node-RED and the like.
export function IntegrationsPage() {
  const user = useSync((s) => s.user)
  const [data, setData] = useState(null)
  const [secret, setSecret] = useState(null) // shown once, right after adding
  const [msg, setMsg] = useState('')
  const reload = () => call('GET', '/api/hooks').then(setData, (e) => setMsg(e.message))
  useEffect(() => {
    if (user) reload()
  }, [user])
  const act = (fn) => async () => {
    setMsg('')
    try {
      await fn()
      await reload()
    } catch (e) {
      setMsg(e.message)
    }
  }

  if (!user) return <section className="card"><p className="muted">Webhooks are sent by your openKCal server, so sign in first (Settings → Account).</p></section>
  if (!data) return <section className="card"><p className="muted">{msg || 'Loading…'}</p></section>

  return (
    <>
      <section className="card">
        <h2>Webhooks</h2>
        <p className="muted">
          openKCal’s server sends a signed JSON message to a URL you choose when something happens, from whichever device you logged it on. Home Assistant, n8n,
          Node-RED and ntfy all take them. Only events from the last 7 days are sent, so restoring a backup doesn’t replay your history.
        </p>
        {data.hooks.map((h) => {
          const log = data.log.filter((l) => l.hookId === h.id).slice(0, 5)
          return (
            <details key={h.id} className="hook">
              <summary>
                <strong>{h.name}</strong> <small>{h.url}</small>{' '}
                <span className={`tag ${h.needsAttention ? 'bad' : h.paused ? '' : 'good'}`}>{h.paused ? 'Paused' : h.needsAttention ? 'Needs attention' : 'On'}</span>
              </summary>
              <p className="muted">
                Sends: {h.events.map((e) => data.events[e]).join(', ')}. Last delivered: {when(h.lastOk)}.
              </p>
              {h.lastError && (
                <p role="alert">
                  {h.lastError.message} ({when(h.lastError.at)}){h.lastError.retrying ? '. Trying again.' : ''}
                </p>
              )}
              <Toggle label="Paused" checked={h.paused} onChange={(paused) => act(() => call('POST', '/api/hooks/update', { id: h.id, paused }))()} />
              <div className="actions start">
                <button
                  type="button"
                  className="ghost"
                  onClick={act(async () => {
                    await call('POST', '/api/hooks/test', { id: h.id })
                    setMsg('Test event sent.')
                  })}
                >
                  Send test event
                </button>
                {h.needsAttention && (
                  <button type="button" className="ghost" onClick={act(async () => setMsg(`Retrying ${(await call('POST', '/api/hooks/retry', { id: h.id })).queued} deliveries.`))}>
                    Retry
                  </button>
                )}
                <button type="button" className="ghost danger" onClick={() => confirm(`Remove “${h.name}”?`) && act(() => call('POST', '/api/hooks/delete', { id: h.id }))()}>
                  Remove
                </button>
              </div>
              {log.length > 0 && (
                <ul className="list">
                  {log.map((l) => (
                    <li key={l.deliveryId + l.attempt} className="row">
                      <span>
                        {data.events[l.type]} <small>try {l.attempt}</small>
                      </span>
                      <small>{l.error || `OK (${l.status})`}</small>
                      <small>{when(l.at)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          )
        })}
        {!data.hooks.length && <p className="muted">No webhooks yet.</p>}
      </section>

      {secret ? (
        <section className="card">
          <h2>Signing secret</h2>
          <p className="muted">Shown this once. Paste it into your tool if it checks signatures; openKCal can’t show it again.</p>
          <p className="code">{secret}</p>
          <div className="actions">
            <button type="button" className="btn sm tinted" onClick={() => setSecret(null)}>
              Done
            </button>
          </div>
        </section>
      ) : (
        data.hooks.length < 10 && (
          <form
            className="card"
            onSubmit={async (e) => {
              e.preventDefault()
              const f = new FormData(e.target)
              setMsg('')
              try {
                const r = await call('POST', '/api/hooks/new', { url: f.get('url'), name: f.get('name'), events: f.getAll('events') })
                setSecret(r.secret)
                e.target.reset()
                await reload()
              } catch (err) {
                setMsg(err.message)
              }
            }}
          >
            <h2>Add a webhook</h2>
            <label>
              URL
              <input name="url" required inputMode="url" placeholder="https://ha.example.com/api/webhook/thally-…" />
            </label>
            <label>
              Name (optional)
              <input name="name" maxLength="60" placeholder="Home Assistant" />
            </label>
            <fieldset className="choice">
              <legend>Send when</legend>
              {Object.entries(data.events).map(([k, label]) => (
                <label key={k}>
                  <input type="checkbox" name="events" value={k} defaultChecked={k === 'food.logged'} /> {label}
                </label>
              ))}
            </fieldset>
            <div className="actions">
              <button className="btn primary">Add webhook</button>
            </div>
          </form>
        )
      )}
      {msg && <p role="status">{msg}</p>}

      <section className="card">
        <details>
          <summary>Checking the signature</summary>
          <p className="muted">
            Each delivery has <code>X-Thally-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>, where the hex is HMAC-SHA256 of <code>&lt;t&gt;.&lt;raw body&gt;</code> with
            your secret. Check it against the raw body and refuse timestamps more than 5 minutes off. Also sent: <code>X-Thally-Event</code> and{' '}
            <code>X-Thally-Delivery</code> (the same on every retry).
          </p>
        </details>
      </section>
    </>
  )
}
