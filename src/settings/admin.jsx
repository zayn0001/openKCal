import { useEffect, useState } from 'react'
import { call, withProof } from '../api'
import { eventWords } from '../lib/events'
import { refreshMe, useSync } from '../sync'
import { Segmented } from './basic'

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const day = (iso) => (iso ? new Date(iso).toLocaleDateString() : '—')

function Users({ me }) {
  const [data, setData] = useState(null)
  const [msg, setMsg] = useState('')
  const [code, setCode] = useState(null) // { name, code } of a reset code just issued
  useEffect(() => {
    call('GET', '/api/admin/users').then(setData, (e) => setMsg(e.message))
  }, [])
  const act = (fn) => async () => {
    setMsg('')
    try {
      const r = await fn()
      if (r?.users) setData(r)
    } catch (e) {
      setMsg(e.message)
    }
  }
  if (!data) return <p className="muted">{msg || 'Loading…'}</p>

  return (
    <>
      {code && (
        <section className="card">
          <h2>Reset code for {code.name}</h2>
          <p className="code">{code.code}</p>
          <p className="muted">Shown once. Hand it over in person or by message: it works once, for 24 hours, at Sign in → Have a reset code? Their old password no longer works; their passkeys still do.</p>
          <div className="actions">
            <button type="button" onClick={() => setCode(null)}>
              Done
            </button>
          </div>
        </section>
      )}
      {data.users.map((u) => {
        const self = u.id === data.me
        const canTouch = !self && !u.owner && (!u.admin || data.owner)
        return (
          <details key={u.id} className="card user">
            <summary>
              <strong>{u.name}</strong>
              {u.owner && <span className="tag good">Owner</span>}
              {u.admin && !u.owner && <span className="tag">Admin</span>}
              {u.disabled && <span className="tag bad">Switched off</span>}
              <small>
                {u.daysLogged} {u.daysLogged === 1 ? 'day' : 'days'} logged · last {day(u.lastLogged)}
              </small>
            </summary>
            <dl className="facts">
              <dt>Account ID</dt>
              <dd className="mono">{u.id}</dd>
              <dt>Sign-in e-mail</dt>
              <dd>{u.email || '—'}</dd>
              <dt>Signs in with</dt>
              <dd>{[u.hasPassword && 'password', u.passkeys && `${u.passkeys} passkey${u.passkeys > 1 ? 's' : ''}`].filter(Boolean).join(', ') || 'nothing (reset code pending)'}</dd>
              <dt>Created / last seen</dt>
              <dd>
                {day(u.created)} / {when(u.seen)}
              </dd>
              <dt>Latest weight</dt>
              <dd>{u.weight != null ? `${u.weight} kg` : '—'}</dd>
            </dl>
            {canTouch && (
              <div className="actions start">
                <button type="button" className="ghost" onClick={act(() => call('POST', '/api/admin/user/disable', { id: u.id, disabled: !u.disabled }))}>
                  {u.disabled ? 'Switch back on' : 'Switch off'}
                </button>
                {!u.admin && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={act(async () => {
                      if (!confirm(`Remove ${u.name}’s password and make a one-time reset code? They are signed out everywhere.`)) return
                      const r = await call('POST', '/api/admin/user/reset', { id: u.id })
                      setCode({ name: u.name, code: r.code })
                      return call('GET', '/api/admin/users')
                    })}
                  >
                    Reset password
                  </button>
                )}
                {data.owner && (
                  <button type="button" className="ghost" onClick={act(() => call('POST', '/api/admin/user/role', { id: u.id, admin: !u.admin }))}>
                    {u.admin ? 'Remove admin' : 'Make admin'}
                  </button>
                )}
                {data.owner && !u.disabled && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={act(() =>
                      withProof(`Handing the server over to ${u.name} needs your password or a passkey. You stay an admin.`, me, async (proof) => {
                        const r = await call('POST', '/api/admin/owner', { id: u.id, ...proof })
                        await refreshMe()
                        return r
                      }),
                    )}
                  >
                    Make owner
                  </button>
                )}
                <button
                  type="button"
                  className="ghost danger"
                  onClick={act(() => confirm(`Delete ${u.name}’s account and all their data? This cannot be undone.`) && call('POST', '/api/admin/user/delete', { id: u.id }))}
                >
                  Delete
                </button>
              </div>
            )}
          </details>
        )
      })}
      {msg && <p role="alert">{msg}</p>}
    </>
  )
}

function Invites() {
  const [data, setData] = useState(null)
  const [fresh, setFresh] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    call('GET', '/api/admin/invites').then(setData, (e) => setMsg(e.message))
  }, [])
  if (!data) return <p className="muted">{msg || 'Loading…'}</p>
  const modeText = { open: 'Anyone who can reach this server can create an account (SIGNUP=open).', invite: 'New accounts need an invite code from an admin.', closed: 'New accounts are switched off (SIGNUP=closed).' }[data.signup]

  return (
    <>
      <section className="card">
        <p className="muted">{modeText}</p>
        {fresh ? (
          <>
            <p className="code">{fresh.code}</p>
            <p className="muted">Shown once. It works for one account, until it expires.</p>
            <div className="actions">
              <button type="button" onClick={() => setFresh(null)}>
                Done
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const v = Object.fromEntries(new FormData(e.target))
              try {
                const r = await call('POST', '/api/admin/invites/new', { note: v.note, days: +v.days })
                setFresh(r)
                setData({ ...data, invites: r.invites })
              } catch (err) {
                setMsg(err.message)
              }
            }}
          >
            <div className="fields">
              <label>
                Who it’s for (optional)
                <input name="note" maxLength="80" placeholder="My sister" />
              </label>
              <label>
                Valid for
                <select name="days" defaultValue="7">
                  <option value="1">1 day</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                </select>
              </label>
            </div>
            <div className="actions">
              <button>Make an invite code</button>
            </div>
          </form>
        )}
      </section>
      <section className="card">
        <ul className="list">
        {data.invites.map((i) => (
          <li key={i.id} className="row">
            <span>
              {i.note || 'Invite'} <small>by {i.by || '—'} · {day(i.created)}</small>
            </span>
            <small>{i.status === 'used' ? `used by ${i.usedBy}` : i.status === 'open' ? `until ${day(i.expires)}` : i.status}</small>
            {i.status === 'open' && (
              <button type="button" className="ghost" onClick={() => call('POST', '/api/admin/invites/revoke', { id: i.id }).then((r) => setData({ ...data, invites: r.invites }), (e) => setMsg(e.message))}>
                Revoke
              </button>
            )}
          </li>
        ))}
        {!data.invites.length && <li className="muted">No invite codes yet.</li>}
        </ul>
      </section>
      {msg && <p role="alert">{msg}</p>}
    </>
  )
}

function Activity() {
  const [data, setData] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    call('GET', '/api/admin/audit').then(setData, (e) => setMsg(e.message))
  }, [])
  if (!data) return <p className="muted">{msg || 'Loading…'}</p>
  return (
    <>
      <section className="card">
        <p className="muted">
          {data.enabled
            ? 'Sign-ins, failed attempts, sign-ups and every admin action. Kept for 90 days or 5,000 events. IP addresses are recorded only if the server sets AUDIT_IP. Also in the server’s data folder as audit.log.'
            : 'The activity log is switched off on this server (AUDIT_LOG=0).'}
        </p>
        <div className="actions start">
          <button type="button" className="ghost" onClick={() => call('GET', '/api/admin/audit').then(setData)}>
            Refresh
          </button>
          <button type="button" className="ghost danger" onClick={() => confirm('Clear the activity log? The clearing itself is recorded.') && call('POST', '/api/admin/audit/clear', {}).then(setData, (e) => setMsg(e.message))}>
            Clear
          </button>
        </div>
      </section>
      <section className="card">
        <ul className="list">
        {data.events.map((e) => (
          <li key={e.id} className="row">
            <span>
              {eventWords(e.type)} {e.name && <small>{e.name}</small>} {e.by && <small>by {e.by}</small>}
            </span>
            {e.ip && <small>{e.ip}</small>}
            <small>{when(e.at)}</small>
          </li>
        ))}
        </ul>
      </section>
      {msg && <p role="alert">{msg}</p>}
    </>
  )
}

// Settings → Admin dashboard: people, invite codes and the activity log. Admins only.
export function AdminPage() {
  const me = useSync((s) => s.user)
  const [tab, setTab] = useState('users')
  return (
    <>
      <Segmented label="Show" value={tab} options={[['users', 'People'], ['invites', 'Invites'], ['log', 'Activity log']]} onChange={setTab} />
      {tab === 'users' && <Users me={me} />}
      {tab === 'invites' && <Invites />}
      {tab === 'log' && <Activity />}
    </>
  )
}
