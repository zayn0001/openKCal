// Optional account sync. The app works without it; when the page is served by an openKCal server
// and you sign in, local changes are pushed and remote ones pulled.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, normalizeServerUrl, serverBase, setRemote } from './api'
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
    // server too: opened offline, the app still knows what it last saw
    { name: 'food_sync_v1', partialize: ({ user, guest, rev, dirty, server }) => ({ user, guest, rev, dirty, server }) },
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
  if (serverBase()) setRemote({ base: serverBase() }) // the app drops its token, keeps the address
  useSync.setState({ user: null, rev: 0, dirty: false, error: '' })
}

/** The app: checks an openKCal server answers at that address, saves it and starts over against it. */
export async function connectServer(raw) {
  const base = normalizeServerUrl(raw)
  if (!base) throw new Error('Enter a valid server address, like openkcal.example.com')
  const me = await fetch(`${base}/api/me`).then((r) => r.json()).catch(() => null)
  if (typeof me?.server?.signup !== 'string') throw new Error(`No openKCal server answered at ${base}. Check the address, and that the server is up to date.`)
  setRemote({ base })
  useSync.setState({ user: null, guest: false, rev: 0 })
  location.reload() // sync starts once, at launch, against the server it finds
}

/** The app: signs out and goes back to keeping data on this phone only. */
export async function disconnectServer() {
  if (useSync.getState().user) await signOut()
  setRemote(null)
  useSync.setState({ user: null, guest: false, rev: 0, dirty: false })
  location.reload()
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

let offline = false // signed in, but the server did not answer: keep working locally, keep trying

// Asks the server who we are. If it cannot be reached and this device was signed in (or the app
// has a server address), that is "offline", not "no server": edits stay marked unsynced and go
// up, merged, once it answers.
async function connect() {
  const me = await api('GET', '/api/me').catch(() => null)
  if (typeof me?.body?.server?.signup === 'string') {
    offline = false
    useSync.setState({ server: me.body.server, user: me.body.user })
    sync()
    fetchSharedRecipes().catch(() => {})
  } else if (useSync.getState().user || serverBase()) {
    offline = true
    useSync.setState({ server: useSync.getState().server || { signup: 'closed' }, error: 'Offline. Changes will sync later.' })
  } else useSync.setState({ server: false })
}

export async function startSync() {
  // From the start, so edits made before the server answers are not lost
  useStore.subscribe((s, prev) => {
    if (applying || !KEYS.some((k) => s[k] !== prev[k])) return
    changes++
    useSync.setState({ dirty: true })
    clearTimeout(timer)
    timer = setTimeout(sync, 1500)
  })
  const retry = () => (offline ? connect() : sync())
  addEventListener('online', retry)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && retry())
  // ponytail: fixed 30 s retry; back off if a sleeping server ever minds being asked
  setInterval(() => (offline || useSync.getState().dirty) && retry(), 30_000)
  await connect()
}
