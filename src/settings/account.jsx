import { useEffect, useState } from 'react'
import { call, passkeysSupported, registerPasskey, withProof } from '../api'
import Dialog from '../Dialog'
import { eventWords } from '../lib/events'
import Login from '../Login'
import { refreshMe, signOut, sync, useSync } from '../sync'

const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function useMessage() {
  const [msg, setMsg] = useState('')
  const wrap = (fn) => async (...a) => {
    setMsg('')
    try {
      const out = await fn(...a)
      await refreshMe()
      return out
    } catch (e) {
      setMsg(e.message)
    }
  }
  return [msg, setMsg, wrap]
}

function Passkeys({ user, server }) {
  const [list, setList] = useState(null)
  const [msg, setMsg, wrap] = useMessage()
  useEffect(() => {
    call('GET', '/api/account/passkeys').then((r) => setList(r.passkeys), () => setList([]))
  }, [user.passkeys])
  if (!server.passkeys) return <p className="muted">Passkeys are off on this server (its admin sets ORIGIN to turn them on).</p>
  return (
    <>
      <ul className="list">
        {(list || []).map((p) => (
          <li key={p.id} className="row">
            <span>
              {p.name} <small>{p.synced ? 'synced passkey' : 'this device only'} · added {new Date(p.created).toLocaleDateString()}</small>
            </span>
            <button
              type="button"
              className="ghost"
              onClick={wrap(async () => {
                const name = prompt('Name this passkey', p.name)
                if (name) setList((await call('POST', '/api/account/passkeys/rename', { id: p.id, name })).passkeys)
              })}
            >
              Rename
            </button>
            <button
              type="button"
              className="ghost"
              aria-label={`Remove ${p.name}`}
              onClick={wrap(() =>
                withProof('Removing a passkey needs your password or another passkey.', user, async (proof) =>
                  setList((await call('POST', '/api/account/passkeys/delete', { id: p.id, ...proof })).passkeys),
                ),
              )}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {list && !list.length && <p className="muted">No passkeys yet. A passkey signs you in with Face ID, a fingerprint or your device PIN, and can’t be phished.</p>}
      {passkeysSupported() ? (
        <div className="actions start">
          <button
            type="button"
            className="ghost"
            onClick={wrap(() =>
              withProof('Adding a passkey needs your password (or an existing passkey).', user, async (proof) => {
                const label = /iPhone|iPad|Mac/.test(navigator.userAgent) ? 'Apple device' : /Android/.test(navigator.userAgent) ? 'Android device' : 'This device'
                setList((await registerPasskey('/api/account/passkeys/options', '/api/account/passkeys/verify', proof, { label })).passkeys)
                setMsg('Passkey added.')
              }),
            )}
          >
            Add a passkey
          </button>
        </div>
      ) : (
        <p className="muted">This browser can’t create passkeys.</p>
      )}
      {msg && <p role="status">{msg}</p>}
    </>
  )
}

function DeviceCode({ user }) {
  const [code, setCode] = useState(null)
  const [msg, , wrap] = useMessage()
  return (
    <>
      <p className="muted">Sign in on a phone or another computer without typing your password there: make a one-time code here and enter it on the other device’s sign-in screen.</p>
      {code ? (
        <p className="code" aria-live="polite">
          {code.code} <small>works once, until {new Date(code.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
        </p>
      ) : (
        <div className="actions start">
          <button type="button" className="ghost" onClick={wrap(() => withProof('Making a sign-in code needs your password or a passkey.', user, async (proof) => setCode(await call('POST', '/api/account/device-code', proof))))}>
            Make a code
          </button>
        </div>
      )}
      {msg && <p role="alert">{msg}</p>}
    </>
  )
}

export function AccountPage() {
  const { user, server, error, dirty } = useSync()
  const [activity, setActivity] = useState(null)
  const [msg, setMsg, wrap] = useMessage()
  const [copied, setCopied] = useState(false)
  const [pwProof, setPwProof] = useState(null) // set while the new-password dialog is open

  if (!server)
    return (
      <section className="card">
        <p className="muted">{server === null ? 'Checking for a server…' : 'Thally is running on its own here, without a server, so there is no account: your data stays in this browser. Run the Thally server to sync devices.'}</p>
      </section>
    )
  if (!user) return <Login />

  return (
    <>
      <section className="card">
        <h2>{user.name}</h2>
        <p className="muted" role="status">
          {user.owner ? 'Owner of this server. ' : user.admin ? 'Admin. ' : ''}
          {error || (dirty ? 'Saving…' : 'Synced.')}{' '}
          <button type="button" className="link" onClick={() => sync()}>
            Sync now
          </button>
        </p>
        <div className="setting">
          <span>Account ID</span>
          <button
            type="button"
            className="ghost mono"
            title="Tap to copy. Give this to the admin if they ask which account is yours."
            onClick={() => navigator.clipboard?.writeText(user.id).then(() => setCopied(true))}
          >
            {user.id} {copied ? '✓' : ''}
          </button>
        </div>
        <div className="actions start">
          <button type="button" className="ghost" onClick={wrap(async () => {
            const name = prompt('Your name (you sign in with it)', user.name)
            if (name && name !== user.name) await call('POST', '/api/account/name', { name })
          })}>
            Change name
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Signing in</h2>
        <div className="setting">
          <span>
            Password <small>{user.hasPassword ? 'set' : 'not set'}</small>
          </span>
          <span className="actions">
            <button
              type="button"
              className="ghost"
              onClick={wrap(() =>
                withProof(user.hasPassword ? 'Changing your password needs the current one (or a passkey).' : 'Setting a password needs one of your passkeys.', user, async (proof) =>
                  setPwProof(proof),
                ),
              )}
            >
              {user.hasPassword ? 'Change' : 'Set'}
            </button>
            {user.hasPassword && user.passkeys > 0 && (
              <button
                type="button"
                className="ghost"
                onClick={wrap(() =>
                  withProof('Removing your password needs it (or a passkey).', user, async (proof) => {
                    await call('POST', '/api/account/password', { ...proof, newPassword: null })
                    setMsg('Password removed. Sign in with a passkey from now on.')
                  }),
                )}
              >
                Remove
              </button>
            )}
          </span>
        </div>
        <div className="setting">
          <span>
            Sign-in e-mail <small>{user.email || 'none'}</small>
          </span>
          <button
            type="button"
            className="ghost"
            onClick={wrap(() =>
              withProof('Changing your sign-in e-mail needs your password or a passkey.', user, async (proof) => {
                const email = prompt('E-mail to sign in with (leave empty to remove). Thally never sends mail to it.', user.email || '')
                if (email === null) return
                await call('POST', '/api/account/email', { ...proof, email })
              }),
            )}
          >
            {user.email ? 'Change' : 'Add'}
          </button>
        </div>
        {msg && <p role="status">{msg}</p>}
        <h3>Passkeys</h3>
        <Passkeys user={user} server={server} />
        <h3>Add another device</h3>
        <DeviceCode user={user} />
      </section>

      <section className="card">
        <header>
          <h2>Recent activity</h2>
          <button type="button" className="ghost" onClick={() => call('GET', '/api/account/activity').then((r) => setActivity(r.events), (e) => setMsg(e.message))}>
            {activity ? 'Refresh' : 'Show'}
          </button>
        </header>
        {activity && (
          <ul className="list">
            {activity.map((e, i) => (
              <li key={i} className="row">
                <span>{eventWords(e.type)}</span>
                <small>{when(e.at)}</small>
              </li>
            ))}
            {!activity.length && <li className="muted">Nothing yet.</li>}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="actions start">
          <button type="button" className="ghost" onClick={() => signOut()}>
            Sign out
          </button>
          <button type="button" className="ghost" onClick={() => confirm('Sign out on every device, this one included?') && signOut(true)}>
            Sign out everywhere
          </button>
        </div>
      </section>

      {pwProof && (
        <Dialog title="New password" onClose={() => setPwProof(null)}>
          <form
            onSubmit={wrap(async (e) => {
              e.preventDefault()
              const v = Object.fromEntries(new FormData(e.target))
              if (v.a !== v.b) throw new Error('The two passwords are not the same')
              await call('POST', '/api/account/password', { ...pwProof, newPassword: v.a })
              setPwProof(null)
              setMsg('Password saved. Other devices were signed out.')
            })}
          >
            <label>
              New password (10 or more characters; a few words in a row work well)
              <input name="a" type="password" required minLength="10" maxLength="256" autoComplete="new-password" />
            </label>
            <label>
              Same again
              <input name="b" type="password" required minLength="10" maxLength="256" autoComplete="new-password" />
            </label>
            {msg && <p role="alert">{msg}</p>}
            <div className="actions">
              <button>Save password</button>
            </div>
          </form>
        </Dialog>
      )}

      <section className="card danger-zone">
        <h2>Delete my account</h2>
        <p className="muted">Deletes your account and everything stored for it on the server: diary, foods, dishes, AI settings, webhooks. What is in this browser stays until you reset it under Data.</p>
        <div className="actions start">
          <button
            type="button"
            className="danger"
            onClick={wrap(() =>
              withProof('Deleting your account needs your password or a passkey.', user, async (proof) => {
                if (!confirm('Delete your account for good?')) return
                await call('POST', '/api/account/delete', proof)
                useSync.setState({ user: null, rev: 0, dirty: false })
              }),
            )}
          >
            Delete my account
          </button>
        </div>
      </section>
    </>
  )
}
