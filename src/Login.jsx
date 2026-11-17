import { useState } from 'react'
import Icon from './components/Icon'
import { call, passkeyLogin, passkeysSupported, registerPasskey } from './api'
import { signedIn, useSync } from './sync'

// Signing in and creating an account. What is offered follows the server: passkeys need its
// ORIGIN set, new accounts need an invite code unless sign-up is open, and "without an account"
// is only there when the server allows guests.
export default function Login({ full = false, onOpenWelcome }) {
  const server = useSync((s) => s.server)
  const [mode, setMode] = useState(server?.signup === 'first' ? 'signup' : 'signin')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const passkeys = server?.passkeys && passkeysSupported()
  const needsInvite = server?.signup === 'invite'
  const canSignUp = server?.signup !== 'closed'

  const run = (fn) => async (e) => {
    e?.preventDefault?.()
    setBusy(true)
    setProblem('')
    try {
      const r = await fn(e?.target?.tagName === 'FORM' ? Object.fromEntries(new FormData(e.target)) : {})
      if (r?.user) await signedIn(r.user)
    } catch (err) {
      setProblem(err.message)
    }
    setBusy(false)
  }

  const tabs = [
    ['signin', 'Sign in'],
    ...(canSignUp ? [['signup', server?.signup === 'first' ? 'Set up this server' : 'Create account']] : []),
  ]

  return (
    <section className={full ? 'card login' : 'card'}>
      {full && <h2 className="hero">Welcome to openKCal</h2>}
      {['signin', 'signup'].includes(mode) && (
        <div className="segmented" role="tablist">
          {tabs.map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === 'signin' && (
        <>
          <form onSubmit={run((v) => call('POST', '/api/login', { name: v.name, password: v.password }))}>
            <label>
              Name or e-mail
              <input name="name" required autoComplete="username" autoCapitalize="none" />
            </label>
            <label>
              Password
              <input name="password" type="password" required autoComplete="current-password" />
            </label>
            <div className="actions">
              {passkeys && (
                <button type="button" className="ghost" disabled={busy} onClick={run(() => passkeyLogin())}>
                  Use a passkey
                </button>
              )}
              <button disabled={busy} className="btn primary">Sign in</button>
            </div>
          </form>
          <p className="muted">
            <button type="button" className="link" onClick={() => setMode('reset')}>
              Have a reset code?
            </button>{' '}
            ·{' '}
            <button type="button" className="link" onClick={() => setMode('device')}>
              Have a code from your other device?
            </button>
          </p>
        </>
      )}

      {mode === 'signup' && (
        <form
          onSubmit={run(async (v) => {
            const fields = { name: v.name, email: v.email || undefined, invite: v.invite || undefined }
            if (v.how === 'passkey') return registerPasskey('/api/signup/passkey/options', '/api/signup/passkey/verify', fields, { label: 'This device' })
            if (v.password !== v.password2) throw new Error('The two passwords are not the same')
            return call('POST', '/api/signup', { ...fields, password: v.password })
          })}
        >
          {server?.signup === 'first' && <p className="muted">You are the first person here, so this account will own the server and can invite others.</p>}
          {needsInvite && (
            <label>
              Invite code
              <input name="invite" required autoComplete="off" placeholder="XXXX-XXXX-XXXX" autoCapitalize="characters" />
            </label>
          )}
          <label>
            Name
            <input name="name" required minLength="2" maxLength="32" autoComplete="username" />
          </label>
          <label>
            E-mail (optional, to sign in with)
            <input name="email" type="email" autoComplete="email" />
          </label>
          <SignupSecret passkeys={passkeys} />
          {problem && <p role="alert">{problem}</p>}
          <div className="actions">
            <button disabled={busy} className="btn primary">{server?.signup === 'first' ? 'Create the owner account' : 'Create account'}</button>
          </div>
        </form>
      )}

      {mode === 'reset' && (
        <form onSubmit={run((v) => call('POST', '/api/login/reset', { name: v.name, code: v.code, password: v.password }))}>
          <h2>Use a reset code</h2>
          <p className="muted">Your admin can give you a one-time code when you forget your password. It works once, for 24 hours.</p>
          <label>
            Name or e-mail
            <input name="name" required autoComplete="username" />
          </label>
          <label>
            Reset code
            <input name="code" required autoComplete="one-time-code" autoCapitalize="characters" />
          </label>
          <label>
            New password
            <input name="password" type="password" required minLength="10" autoComplete="new-password" />
          </label>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => setMode('signin')}>
              Back
            </button>
            <button disabled={busy} className="btn primary">Set password and sign in</button>
          </div>
        </form>
      )}

      {mode === 'device' && (
        <form onSubmit={run((v) => call('POST', '/api/login/device', { code: v.code }))}>
          <h2>Sign in with a code</h2>
          <p className="muted">On a device where you are signed in, open Settings → Account → Add another device. The code works once, for 10 minutes.</p>
          <label>
            Code
            <input name="code" required autoComplete="one-time-code" autoCapitalize="characters" placeholder="XXXX-XXXX" />
          </label>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => setMode('signin')}>
              Back
            </button>
            <button disabled={busy} className="btn primary">Sign in</button>
          </div>
        </form>
      )}

      {problem && mode !== 'signup' && <p role="alert">{problem}</p>}

      {full && (
        <p className="muted center">
          <button
            type="button"
            className="link"
            onClick={() => {
              if (onOpenWelcome) onOpenWelcome()
              else {
                window.location.hash = '#welcome'
                window.dispatchEvent(new Event('popstate'))
              }
            }}
          >
            What is openKCal, and the Android app
          </button>
        </p>
      )}

      {full && server?.guests && (
        <p className="muted center">
          <button type="button" className="link" onClick={() => useSync.setState({ guest: true })}>
            Use without an account
          </button>{' '}
          (everything stays in this browser)
        </p>
      )}
    </section>
  )
}

function SignupSecret({ passkeys }) {
  const [how, setHow] = useState(passkeys ? 'passkey' : 'password')
  return (
    <>
      <input type="hidden" name="how" value={how} />
      {passkeys && (
        <div style={{ margin: '14px 0' }}>
          <span style={{ fontSize: 'var(--fs-footnote)', color: 'var(--label-2)', fontWeight: 500, display: 'block', marginBottom: 8 }}>
            Sign in method
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              type="button"
              className={`choice-tile ${how === 'passkey' ? 'active' : ''}`}
              onClick={() => setHow('passkey')}
            >
              <span className="choice-tile-icon"><Icon name="key" /></span>
              <span className="choice-tile-title">Passkey</span>
              <span className="choice-tile-desc">Face ID or PIN</span>
            </button>
            <button
              type="button"
              className={`choice-tile ${how === 'password' ? 'active' : ''}`}
              onClick={() => setHow('password')}
            >
              <span className="choice-tile-icon"><Icon name="lock" /></span>
              <span className="choice-tile-title">Password</span>
              <span className="choice-tile-desc">Secret phrase</span>
            </button>
          </div>
        </div>
      )}
      {how === 'password' && (
        <div className="fields">
          <label>
            Password (10+ characters)
            <input name="password" type="password" required minLength="10" maxLength="256" autoComplete="new-password" />
          </label>
          <label>
            Same again
            <input name="password2" type="password" required minLength="10" autoComplete="new-password" />
          </label>
        </div>
      )}
    </>
  )
}
