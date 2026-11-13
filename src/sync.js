// Optional account sync. The app works without it; when the page is served by a
// Thally server and you sign in, local changes are pushed and remote ones pulled.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { KEYS, mergeState, pick } from './lib/state'
import { useStore } from './store'

export async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  })
  return { status: res.status, ok: res.ok, body: await res.json().catch(() => null) }
}

export const useSync = create(
  persist(
    () => ({
      user: null,
      rev: 0, // server revision this device last saw
      dirty: false, // local changes not yet on the server
      server: null, // null: not checked, false: no server here, else { signup, ai }
      error: '',
    }),
    { name: 'food_sync_v1', partialize: ({ user, rev, dirty }) => ({ user, rev, dirty }) },
  ),
)

const SIGNED_OUT = { user: null, error: 'Signed out. Sign in again to sync.' }
let applying = false // true while we write server data into the store
let changes = 0
let busy = false
let timer

function apply(state) {
  applying = true
  useStore.setState({ ...pick(state), gone: state.gone || [] })
  applying = false
}

export async function sync() {
  if (busy || !useSync.getState().user) return
  busy = true
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { rev, dirty } = useSync.getState()
      if (!dirty) {
        const r = await api('GET', '/api/state')
        if (r.status === 401) return useSync.setState(SIGNED_OUT)
        if (r.ok && r.body.rev !== rev && r.body.state) apply(r.body.state)
        if (r.ok) useSync.setState({ rev: r.body.rev, error: '' })
        return
      }
      const before = changes
      const r = await api('PUT', '/api/state', { rev, state: pick(useStore.getState()) })
      if (r.status === 401) return useSync.setState(SIGNED_OUT)
      if (r.status === 409) {
        // Someone else saved first: fold their copy into ours and try again.
        apply(mergeState(pick(useStore.getState()), r.body.state))
        useSync.setState({ rev: r.body.rev })
        continue
      }
      if (!r.ok) return useSync.setState({ error: r.body?.error || 'Sync failed' })
      return useSync.setState({ rev: r.body.rev, dirty: changes !== before, error: '' })
    }
  } catch {
    useSync.setState({ error: 'Offline. Changes will sync later.' })
  } finally {
    busy = false
  }
}

// kind: 'login' | 'signup'. Returns an error message, or '' on success.
export async function signIn(kind, username, password) {
  const r = await api('POST', `/api/${kind}`, { username, password }).catch(() => null)
  if (!r?.ok) return r?.body?.error || 'Could not reach the server'
  // dirty: push what this device has; a 409 then merges it with the account's data.
  useSync.setState({ user: r.body.user, rev: 0, dirty: true, error: '' })
  await sync()
  return ''
}

export async function signOut() {
  await api('POST', '/api/logout', {}).catch(() => null)
  useSync.setState({ user: null, rev: 0, dirty: false, error: '' })
}

export async function startSync() {
  const me = await api('GET', '/api/me').catch(() => null)
  if (typeof me?.body?.signup !== 'boolean') return useSync.setState({ server: false })
  useSync.setState({ server: { signup: me.body.signup, ai: me.body.ai }, user: me.body.user })
  useStore.subscribe((s, prev) => {
    if (applying || !KEYS.some((k) => s[k] !== prev[k])) return
    changes++
    useSync.setState({ dirty: true })
    clearTimeout(timer)
    timer = setTimeout(sync, 1500)
  })
  addEventListener('online', sync)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync())
  sync()
}
