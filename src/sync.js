// Optional account sync. The app works without it; when the page is served by an openKCal server
// and you sign in, local changes are pushed and remote ones pulled.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from './api'
import { KEYS, mergeState, pick } from './lib/state'
import { EMPTY, useStore } from './store'

export { api } // older imports

export const useSync = create(
  persist(
    () => ({
      user: null, // { id, name, email, admin, owner, hasPassword, passkeys, ai: { ready, provider } }
      guest: false, // chose "use without an account" on a server that offers it
      rev: 0, // server revision this device last saw
      dirty: false, // local changes not yet on the server
      server: null, // null: not checked, false: no server here, else { signup, guests, passkeys, push, version }
      error: '',
    }),
    { name: 'food_sync_v1', partialize: ({ user, guest, rev, dirty }) => ({ user, guest, rev, dirty }) },
  ),
)

const SIGNED_OUT = { user: null, error: 'Signed out. Sign in again to sync.' }
let applying = false // true while we write server data into the store
let changes = 0
let busy = false
let timer

function apply(state) {
  applying = true
  useStore.setState({ ...EMPTY, ...pick(state), gone: state.gone || [], settings: state.settings || {} })
  applying = false
}

export async function fetchSharedRecipes() {
  const r = await api('GET', '/api/recipes').catch(() => null)
  if (r?.ok && Array.isArray(r.body?.recipes)) {
    useStore.getState().setSharedRecipes(r.body.recipes)
  }
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
        if (r.ok) {
          useSync.setState({ rev: r.body.rev, error: '' })
          fetchSharedRecipes().catch(() => {})
        }
        return
      }
      const before = changes
      const r = await api('PUT', '/api/state', { rev, state: pick(useStore.getState()) })
      if (r.status === 401) return useSync.setState(SIGNED_OUT)
      if (r.status === 409) {
        // Another device saved first: fold its copy into ours and try again. A reset elsewhere
        // replaces everything instead of merging.
        apply(r.body.reset ? r.body.state : mergeState(pick(useStore.getState()), r.body.state))
        useSync.setState({ rev: r.body.rev, dirty: !r.body.reset })
        if (r.body.reset) return
        continue
      }
      if (!r.ok) return useSync.setState({ error: r.body?.error || 'Sync failed' })
      fetchSharedRecipes().catch(() => {})
      return useSync.setState({ rev: r.body.rev, dirty: changes !== before, error: '' })
    }
  } catch {
    useSync.setState({ error: 'Offline. Changes will sync later.' })
  } finally {
    busy = false
  }
}

/** After any successful sign-in: push what this device has; a 409 then merges it with the account. */
export async function signedIn(user) {
  useSync.setState({ user, guest: false, rev: 0, dirty: true, error: '' })
  await sync()
}

/** Refreshes what the server says about the signed-in account (after a change in Settings). */
export async function refreshMe() {
  const r = await api('GET', '/api/me').catch(() => null)
  if (r?.ok) useSync.setState({ user: r.body.user, server: r.body.server })
  return r?.body?.user
}

export async function signOut(everywhere = false) {
  await api('POST', everywhere ? '/api/logout/all' : '/api/logout', {}).catch(() => null)
  if (everywhere) await api('POST', '/api/logout', {}).catch(() => null)
  useSync.setState({ user: null, rev: 0, dirty: false, error: '' })
}

/** Reset everything: on the server too when signed in, so other devices follow. */
export async function resetEverything() {
  if (useSync.getState().user) {
    const r = await api('POST', '/api/state/reset', {})
    if (!r.ok) throw new Error(r.body?.error || 'Could not reset on the server')
    apply(r.body.state)
    useSync.setState({ rev: r.body.rev, dirty: false })
  } else useStore.getState().reset()
}

export async function startSync() {
  const me = await api('GET', '/api/me').catch(() => null)
  if (typeof me?.body?.server?.signup !== 'string') return useSync.setState({ server: false })
  useSync.setState({ server: me.body.server, user: me.body.user })
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
  fetchSharedRecipes().catch(() => {})
}
