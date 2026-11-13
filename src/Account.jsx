import { useState } from 'react'
import { signIn, signOut, useSync } from './sync'

export default function Account() {
  const { user, server, error, dirty } = useSync()
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  if (!server)
    return (
      <section className="card">
        <h2>Sync</h2>
        <p className="muted">
          {server === null ? 'Checking for a sync server…' : 'No sync server at this address. Your data stays on this device.'}
        </p>
      </section>
    )

  if (user)
    return (
      <section className="card">
        <header>
          <h2>Sync</h2>
          <button type="button" className="ghost" onClick={signOut}>
            Sign out
          </button>
        </header>
        <p className="muted" role="status">
          Signed in as {user}. {error || (dirty ? 'Saving…' : 'Up to date.')}
        </p>
      </section>
    )

  const submit = async (e) => {
    e.preventDefault()
    const v = Object.fromEntries(new FormData(e.target))
    setBusy(true)
    setProblem(await signIn(e.nativeEvent.submitter.value, v.username, v.password))
    setBusy(false)
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>Sync</h2>
      <p className="muted">Sign in to keep your phone and laptop in step. What is on this device is kept and merged.</p>
      <div className="fields">
        <label>
          Username
          <input name="username" required minLength="3" maxLength="32" autoComplete="username" autoCapitalize="none" />
        </label>
        <label>
          Password
          <input name="password" type="password" required minLength="10" maxLength="200" autoComplete="current-password" />
        </label>
      </div>
      {(problem || error) && <p role="alert">{problem || error}</p>}
      <div className="actions">
        {server.signup && (
          <button className="ghost" value="signup" disabled={busy}>
            Create account
          </button>
        )}
        <button value="login" disabled={busy}>
          Sign in
        </button>
      </div>
    </form>
  )
}
