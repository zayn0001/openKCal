// Talking to the openKCal server: one fetch wrapper, the passkey ceremonies, and the "confirm it's
// you" prompt that sensitive account changes need (the password, or a passkey of the account).
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { create } from 'zustand'

// The Android/iOS app has no server of its own: it is pointed at one (Settings → Account) and,
// being another origin, holds the session token instead of a cookie. A web page served by the
// server leaves both empty and talks to its own origin, as before.
export const isNativeApp = () => !!globalThis.Capacitor?.isNativePlatform?.()
const REMOTE_KEY = 'openkcal_server'
let remote = (() => {
  try {
    return JSON.parse(localStorage.getItem(REMOTE_KEY)) || {}
  } catch {
    return {}
  }
})()
export const serverBase = () => remote.base || ''

/** Points the app at a server (or none: base ''), keeping or dropping the session token. */
export function setRemote(next) {
  remote = next?.base ? { base: next.base, token: next.token || '' } : {}
  try {
    if (remote.base) localStorage.setItem(REMOTE_KEY, JSON.stringify(remote))
    else localStorage.removeItem(REMOTE_KEY)
  } catch {
    // private mode: works until the app restarts
  }
}

// What people type: a bare host, no scheme, a trailing slash. https:// unless they say otherwise.
export function normalizeServerUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
    if (!/^https?:$/.test(u.protocol) || !u.hostname) return null
    return u.origin + u.pathname.replace(/\/+$/, '')
  } catch {
    return null
  }
}

/** Every request to the server goes through here, so the app's base and token apply everywhere. */
export function apiFetch(url, opts = {}) {
  if (isNativeApp() && !remote.base) return Promise.reject(new Error('This app is not connected to an openKCal server'))
  const headers = { ...opts.headers, ...(remote.token && { Authorization: `Bearer ${remote.token}` }) }
  return fetch(serverBase() + url, { ...opts, headers })
}

export async function api(method, url, body) {
  const res = await apiFetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const out = { status: res.status, ok: res.ok, body: await res.json().catch(() => null) }
  // Sign-in answers carry the token only for the app; keep it for every request after
  if (remote.base && out.ok && typeof out.body?.token === 'string') setRemote({ ...remote, token: out.body.token })
  return out
}

/** api() that throws the server's message, for code that just wants the answer. */
export async function call(method, url, body) {
  const r = await api(method, url, body).catch(() => ({ ok: false, body: { error: 'Could not reach the server' } }))
  if (!r.ok) throw new Error(r.body?.error || `Failed (${r.status})`)
  return r.body
}

// Not inside the app: a passkey belongs to the server's address, and the app runs on its own origin.
export const passkeysSupported = () => typeof window !== 'undefined' && !isNativeApp() && browserSupportsWebAuthn()

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
