import { useState } from 'react'
import { passkeyProof, passkeysSupported, useProof } from './api'
import Dialog from './Dialog'
import { useSync } from './sync'

// "Confirm it's you": the current password, or a passkey of this account. Rendered once in App;
// opened by askProof() in api.js. A session alone may be a copied cookie, so it isn't enough.
export default function ProofPrompt() {
  const open = useProof((s) => s.open)
  const server = useSync((s) => s.server)
  const [error, setError] = useState('')
  if (!open) return null
  const { reason, user, resolve, reject } = open
  const close = (fn) => {
    useProof.setState({ open: null })
    setError('')
    fn()
  }
  const canPasskey = server?.passkeys && user?.passkeys > 0 && passkeysSupported()

  return (
    <Dialog title="Confirm it’s you" onClose={() => close(reject)}>
      <p className="muted">{reason}</p>
      {user?.hasPassword && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const password = new FormData(e.target).get('password')
            close(() => resolve({ password }))
          }}
        >
          <label>
            Your password
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <div className="actions">
            <button>Confirm</button>
          </div>
        </form>
      )}
      {canPasskey && (
        <div className="actions">
          <button
            type="button"
            className={user?.hasPassword ? 'ghost' : undefined}
            onClick={async () => {
              try {
                const proof = await passkeyProof()
                close(() => resolve(proof))
              } catch (e) {
                setError(e.message)
              }
            }}
          >
            Use a passkey instead
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </Dialog>
  )
}
