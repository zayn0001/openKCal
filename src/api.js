// Talking to the Thally server: one fetch wrapper, the passkey ceremonies, and the "confirm it's
// you" prompt that sensitive account changes need (the password, or a passkey of the account).
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { create } from 'zustand'

export async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, ok: res.ok, body: await res.json().catch(() => null) }
}

/** api() that throws the server's message, for code that just wants the answer. */
export async function call(method, url, body) {
  const r = await api(method, url, body).catch(() => ({ ok: false, body: { error: 'Could not reach the server' } }))
  if (!r.ok) throw new Error(r.body?.error || `Failed (${r.status})`)
  return r.body
}

export const passkeysSupported = () => typeof window !== 'undefined' && browserSupportsWebAuthn()

// The browser's own errors, in words a person can act on.
function passkeyError(e) {
  if (e?.name === 'NotAllowedError') return new Error('The passkey prompt was closed or timed out')
  if (e?.name === 'InvalidStateError') return new Error('This device already has a passkey for this account')
  return e instanceof Error ? e : new Error('The passkey did not work')
}

/** Runs a registration: options from `optionsUrl`, then the result to `verifyUrl`. */
export async function registerPasskey(optionsUrl, verifyUrl, optionsBody, extra = {}) {
  const optionsJSON = await call('POST', optionsUrl, optionsBody)
  let response
  try {
    response = await startRegistration({ optionsJSON })
  } catch (e) {
    throw passkeyError(e)
  }
  return call('POST', verifyUrl, { response, ...extra })
}

/** Signs in with any passkey this site has on the device. */
export async function passkeyLogin() {
  const optionsJSON = await call('POST', '/api/login/passkey/options', {})
  let response
  try {
    response = await startAuthentication({ optionsJSON })
  } catch (e) {
    throw passkeyError(e)
  }
  return call('POST', '/api/login/passkey/verify', { response })
}

// ---- "confirm it's you" ----
// askProof() opens the prompt (rendered once, by <ProofPrompt/> in App) and resolves with
// { password } or { assertion }, or rejects when the person cancels.
export const useProof = create(() => ({ open: null }))

export function askProof(reason, user) {
  return new Promise((resolve, reject) => useProof.setState({ open: { reason, user, resolve, reject } }))
}

export async function passkeyProof() {
  const optionsJSON = await call('POST', '/api/account/proof/options', {})
  try {
    return { assertion: await startAuthentication({ optionsJSON }) }
  } catch (e) {
    throw passkeyError(e)
  }
}

/** Runs `fn(proof)` after asking; returns its result, or undefined when cancelled. */
export async function withProof(reason, user, fn) {
  let proof
  try {
    proof = await askProof(reason, user)
  } catch {
    return undefined
  }
  return fn(proof)
}
