// openKCal server: serves the built app, keeps accounts and each person's synced state, and runs the
// optional extras (AI on the person's own provider, webhooks, reminders). Plain node:http, files on
// disk under DATA_DIR, no database. Every route is listed in `routes` below.
import { createReadStream } from 'node:fs'
import { rm, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rowToFood } from '../src/lib/catalogue.js'
import { MEALS } from '../src/lib/settings.js'
import { isState } from '../src/lib/state.js'
import { SESSION_DAYS, createAccounts } from './accounts.js'
import { createAi } from './ai.js'
import { createAudit, maskEmail } from './audit.js'
import { createHooks } from './hooks.js'
import { HttpError, body, limiter, readJson, serialize, str, writeJson } from './http.js'
import { createPasskeys } from './passkeys.js'
import { createPush } from './push.js'
import { instanceKey, randomId } from './secure.js'

// Where CI publishes the signed APK (see .github/workflows/release-apk.yml)
const RELEASES_URL = 'https://github.com/zayn0001/openKCal/releases/latest/download'
// The Capacitor WebView origins of the Android and iOS apps. They cannot use the cookie (another
// origin), so they hold the session token and send it as a Bearer; see sessionToken().
const APP_ORIGINS = new Set(['https://localhost', 'capacitor://localhost', 'http://localhost'])

const VERSION = '0.3.0'
const EMPTY = { profile: null, diary: {}, foods: [], weights: {}, water: {}, gone: [], settings: {} }
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive',
}

/**
 * @param {object} o
 * @param {string} o.dataDir  where everything is stored
 * @param {string} [o.distDir]  built frontend to serve, if any
 * @param {string} [o.siteDir]  the download page (website/), served at /welcome
 * @param {string} [o.releasesDir]  the Android app and its details (releases/), served at /download/
 * @param {'open'|'invite'|'closed'} [o.signup]  who may sign up once the first account exists
 * @param {boolean} [o.guests]  offer "use without an account" (the app then keeps data in the browser)
 * @param {string[]} [o.adminUids]  accounts that are always admins
 * @param {string} [o.origin]  the exact address people use; turns passkeys on
 * @param {boolean} [o.trustProxy]  behind a reverse proxy: rate-limit by the address it reports
 * @param {boolean} [o.allowLan]  let everyone's webhooks and AI endpoints reach the server's own network
 * @param {object} [o.audit]  { enabled, max, days, ipMode }
 * @param {number} [o.aiDailyLimit]  AI calls per person per day
 * @param {number} [o.pushTickMs]  reminder check interval; 0 turns the timer off (tests)
 */
export async function createApp({
  dataDir, distDir, siteDir, releasesDir, signup = 'invite', guests = true, adminUids = [], origin, trustProxy = false, allowLan = false,
  audit: auditOpts = {}, aiDailyLimit = 40, pushTickMs = 60_000, pushSubject,
}) {
  const key = await instanceKey(dataDir)
  const audit = await createAudit(dataDir, auditOpts)
  const accounts = await createAccounts({ dataDir, signup, adminUids, audit })
  const passkeys = createPasskeys({ origin })
  // Admins may point AI endpoints and webhooks at this machine or its network (Ollama, Home Assistant);
  // everyone else only with ALLOW_LAN=1, and then only the home network.
  const lanFor = (uid) => (accounts.isAdmin(uid) ? 'any' : allowLan ? 'lan' : false)
  const ai = await createAi({ dataDir, key, allowLan: lanFor })
  const hooks = await createHooks({ dataDir, key, allowLan: lanFor })
  const stateFile = (uid) => path.join(dataDir, 'state', `${uid}.json`)
  const readState = async (uid) => (await readJson(stateFile(uid), { state: null })).state
  // The food catalogue, for the meal agent's searches. Read once, on first use.
  let catalogue
  const loadCatalogue = async () =>
    (catalogue ??= readJson(path.join(root, 'src', 'foods-data.json'), []).then((rows) => rows.map(rowToFood)))
  const push = await createPush({ dataDir, readState, tickMs: pushTickMs, subject: pushSubject })
  const stateWrites = serialize()

  // All recipe dishes made by any user are shared across all users
  const recipesFile = path.join(dataDir, 'recipes.json')
  const readRecipes = async () => await readJson(recipesFile, [])
  const writeRecipes = async (list) => writeJson(recipesFile, list)

  async function syncFoodsToCommunity(uid, foods = [], gone = []) {
    const user = accounts.user(uid)
    const authorName = user?.name || 'Community Member'
    const current = await readRecipes()
    const map = new Map(current.map((r) => [r.id, r]))

    // Handle deletions if user removed a food or dish they owned
    if (Array.isArray(gone) && gone.length) {
      for (const id of gone) {
        if (map.has(id) && map.get(id).authorId === uid) {
          map.delete(id)
        }
      }
    }

    for (const f of foods || []) {
      if (!f || !f.id) continue
      const isDish = f.kind === 'dish' || Array.isArray(f.ingredients)
      map.set(f.id, {
        ...f,
        kind: isDish ? 'dish' : 'food',
        authorName: f.authorName || authorName,
        authorId: f.authorId || uid,
        sharedAt: f.sharedAt || new Date().toISOString(),
      })
    }
    await writeRecipes([...map.values()])
  }

  const cookieToken = (req) => /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1] || ''
  // The browser's cookie, or the app's Bearer. A Bearer is never sent by a browser on its own, so
  // accepting it opens no cross-site request path.
  const sessionToken = (req) => cookieToken(req) || /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1] || ''
  const fromApp = (req) => APP_ORIGINS.has(req.headers.origin)
  // The proxy appends the address it saw, so the last entry is the one a client cannot forge.
  const clientIp = (req) => (trustProxy && req.headers['x-forwarded-for']?.split(',').at(-1).trim()) || req.socket.remoteAddress
  const authLimit = limiter(20, 15 * 60_000)
  const aiLimit = limiter(aiDailyLimit, 24 * 3600_000, `That is ${aiDailyLimit} AI requests today, the most this server allows. Try again tomorrow.`)
  const codeLimit = limiter(10, 15 * 60_000)

  function setCookie(req, res, token) {
    const secure = req.headers['x-forwarded-proto'] === 'https' || origin?.startsWith('https:') ? '; Secure' : ''
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`)
  }

  async function signIn(req, res, uid, how) {
    const token = await accounts.startSession(uid)
    setCookie(req, res, token)
    // A new account's first sign-in is already in the log as the sign-up.
    if (how !== 'new') audit.log(`auth.login.${how}`, { uid, name: accounts.user(uid).name }, clientIp(req))
    // The phone app keeps the token itself; a web page never sees it (the cookie is HttpOnly).
    return { user: accounts.me(uid), ...(fromApp(req) && { token }) }
  }

  // Sensitive changes need more than a session (which may be a copied cookie): the current
  // password, or a passkey of the account, as in openGym.
  async function prove(uid, b) {
    const u = accounts.user(uid)
    if (typeof b?.password === 'string' && u.hash) {
      if (await accounts.verifyPassword(uid, b.password)) return
      throw new HttpError(403, 'That password is not right')
    }
    if (b?.assertion && passkeys) {
      const r = await passkeys.verifyAuthentication(b.assertion, 'proof', (id) => accounts.passkeyOwner(id))
      if (r.uid !== uid) throw new HttpError(403, 'That passkey belongs to another account')
      await accounts.updatePasskey(uid, b.assertion.id, { counter: r.newCounter, used: new Date().toISOString() })
      return
    }
    throw new HttpError(403, u.hash ? 'Confirm with your password' : 'Confirm with your passkey')
  }

  // Admins manage people; only the owner manages admins; nobody acts on the owner or on themself.
  function manageable(actor, uid, { adminsToo = false } = {}) {
    const u = accounts.user(uid)
    if (!u) throw new HttpError(404, 'No such account')
    if (uid === actor) throw new HttpError(400, 'Use Settings → Account for your own account')
    if (uid === accounts.owner) throw new HttpError(403, 'The owner’s account cannot be changed from here')
    if (accounts.isAdmin(uid) && (actor !== accounts.owner || !adminsToo)) throw new HttpError(403, 'Only the owner can change another admin')
    return u
  }

  async function wipe(uid) {
    await Promise.all([rm(stateFile(uid), { force: true }), ai.forget(uid), hooks.forget(uid), push.forget(uid)])
    await audit.forget(uid)
    await accounts.deleteUser(uid)
  }

  const isAdmin = (uid) => {
    if (!accounts.isAdmin(uid)) throw new HttpError(403, 'Admins only')
  }

  const routes = {
    'GET /api/health': () => ({ ok: true }),

    'GET /api/me': async (req, res, uid) => ({
      user: uid ? { ...accounts.me(uid), ai: await ai.config(uid).then((c) => ({ ready: !!(c.provider && c.consented), provider: c.provider })) } : null,
      server: { signup: accounts.signupMode(), guests, passkeys: !!passkeys, push: push.publicKey, version: VERSION },
    }),

    // ---- signing up and in ----

    'POST /api/signup': async (req, res) => {
      authLimit(clientIp(req))
      const b = await body(req, 10_000)
      let inviteId
      try {
        inviteId = accounts.checkSignup(b?.invite)
      } catch (e) {
        audit.log('auth.signup.refused', { reason: e.message }, clientIp(req))
        throw e
      }
      if (typeof b?.password !== 'string') throw new HttpError(400, 'Choose a password')
      const uid = await accounts.createUser({ name: b.name, email: b.email, password: b.password, inviteId })
      audit.log('auth.signup', { uid, name: accounts.user(uid).name, invite: inviteId || undefined }, clientIp(req))
      return signIn(req, res, uid, 'new')
    },

    'POST /api/signup/passkey/options': async (req) => {
      authLimit(clientIp(req))
      if (!passkeys) throw new HttpError(404, 'Passkeys are off on this server')
      const b = await body(req, 10_000)
      const inviteId = accounts.checkSignup(b?.invite)
      const { name, email } = accounts.available(b?.name, b?.email) // checked again when the account is created
      const uid = randomId(9)
      return passkeys.registrationOptions({ userId: uid, name, purpose: 'signup', data: { uid, name, email, inviteId } })
    },
    'POST /api/signup/passkey/verify': async (req, res) => {
      if (!passkeys) throw new HttpError(404, 'Passkeys are off on this server')
      const b = await body(req, 50_000)
      const { credential, data } = await passkeys.verifyRegistration(b?.response, 'signup')
      if (data.inviteId) accounts.checkInvite(data.inviteId) // it may have been used meanwhile
      credential.name = String(b?.label || 'Passkey').slice(0, 40)
      const uid = await accounts.createUser({ uid: data.uid, name: data.name, email: data.email, passkey: credential, inviteId: data.inviteId })
      audit.log('auth.signup', { uid, name: accounts.user(uid).name, passkey: true }, clientIp(req))
      return signIn(req, res, uid, 'new')
    },

    'POST /api/login': async (req, res) => {
      authLimit(clientIp(req))
      const b = await body(req, 10_000)
      const uid = await accounts.login(str(b?.name, { name: 'Name', max: 200 }), b?.password)
      return signIn(req, res, uid, 'password')
    },

    'POST /api/login/passkey/options': async (req) => {
      authLimit(clientIp(req))
      if (!passkeys) throw new HttpError(404, 'Passkeys are off on this server')
      return passkeys.authenticationOptions({ purpose: 'login' })
    },
    'POST /api/login/passkey/verify': async (req, res) => {
      authLimit(clientIp(req))
      if (!passkeys) throw new HttpError(404, 'Passkeys are off on this server')
      const b = await body(req, 50_000)
      const r = await passkeys.verifyAuthentication(b?.response, 'login', (id) => accounts.passkeyOwner(id)).catch((e) => {
        audit.log('auth.passkey.fail', {}, clientIp(req))
        throw e
      })
      if (accounts.user(r.uid).disabled) throw new HttpError(403, 'This account is switched off. Ask the admin.')
      await accounts.updatePasskey(r.uid, b.response.id, { counter: r.newCounter, used: new Date().toISOString() })
      return signIn(req, res, r.uid, 'passkey')
    },

    'POST /api/login/reset': async (req, res) => {
      codeLimit(clientIp(req))
      const b = await body(req, 10_000)
      const uid = await accounts.redeemReset(str(b?.name, { name: 'Name', max: 200 }), b?.code, b?.password)
      audit.log('auth.password.reset', { uid, name: accounts.user(uid).name }, clientIp(req))
      return signIn(req, res, uid, 'reset')
    },

    'POST /api/login/device': async (req, res) => {
      codeLimit(clientIp(req))
      const b = await body(req, 1000)
      const uid = accounts.redeemDeviceCode(b?.code)
      return signIn(req, res, uid, 'device')
    },

    'POST /api/logout': async (req, res, uid) => {
      await body(req, 100)
      await accounts.endSession(sessionToken(req))
      if (uid) audit.log('auth.logout', { uid })
      res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
      return { user: null }
    },

    'POST /api/logout/all': async (req, res, uid) => {
      await body(req, 100)
      await accounts.endAllSessions(uid)
      audit.log('auth.logout.all', { uid })
      return { user: null }
    },

    // ---- your account ----

    'POST /api/account/proof/options': async (req, res, uid) => {
      if (!passkeys) throw new HttpError(404, 'Passkeys are off on this server')
      return passkeys.authenticationOptions({ purpose: 'proof', allow: accounts.user(uid).passkeys })
    },

    'POST /api/account/name': async (req, res, uid) => {
      const b = await body(req, 1000)
      const name = await accounts.rename(uid, b?.name)
      audit.log('account.rename', { uid, name })
      return { user: accounts.me(uid) }
    },

    'POST /api/account/password': async (req, res, uid) => {
      const b = await body(req, 10_000)
      await prove(uid, b)
      const had = !!accounts.user(uid).hash
      if (b.newPassword === null) {
        await accounts.removePassword(uid)
        audit.log('auth.password.remove', { uid })
      } else {
        await accounts.setPassword(uid, b.newPassword)
        audit.log(had ? 'auth.password.change' : 'auth.password.set', { uid })
      }
      // Like openGym: a new password signs the account out everywhere else.
      await accounts.endAllSessions(uid)
      setCookie(req, res, await accounts.startSession(uid))
      return { user: accounts.me(uid) }
    },

    'POST /api/account/email': async (req, res, uid) => {
      const b = await body(req, 10_000)
      await prove(uid, b)
      const before = accounts.user(uid).email
      const email = await accounts.setEmail(uid, b.email)
      audit.log(email ? (before ? 'auth.email.change' : 'auth.email.set') : 'auth.email.remove', { uid, email: email ? maskEmail(email) : undefined })
      return { user: accounts.me(uid) }
    },

    'GET /api/account/passkeys': (req, res, uid) => ({
      passkeys: accounts.user(uid).passkeys.map(({ id, name, created, used, backedUp }) => ({ id, name, created, used: used || null, synced: !!backedUp })),
    }),
    'POST /api/account/passkeys/options': async (req, res, uid) => {
      if (!passkeys) throw new HttpError(404, 'Passkeys are off on this server')
      const b = await body(req, 50_000)
      await prove(uid, b)
      const u = accounts.user(uid)
      return passkeys.registrationOptions({ userId: uid, name: u.name, exclude: u.passkeys, purpose: 'add', data: { uid } })
    },
    'POST /api/account/passkeys/verify': async (req, res, uid) => {
      if (!passkeys) throw new HttpError(404, 'Passkeys are off on this server')
      const b = await body(req, 50_000)
      const { credential, data } = await passkeys.verifyRegistration(b?.response, 'add')
      if (data.uid !== uid) throw new HttpError(403, 'That passkey prompt was for another account')
      credential.name = String(b?.label || 'Passkey').trim().slice(0, 40) || 'Passkey'
      await accounts.addPasskey(uid, credential)
      audit.log('auth.passkey.add', { uid })
      return routes['GET /api/account/passkeys'](req, res, uid)
    },
    'POST /api/account/passkeys/rename': async (req, res, uid) => {
      const b = await body(req, 1000)
      await accounts.updatePasskey(uid, b?.id, { name: str(b?.name, { name: 'Name', max: 40 }) })
      return routes['GET /api/account/passkeys'](req, res, uid)
    },
    'POST /api/account/passkeys/delete': async (req, res, uid) => {
      const b = await body(req, 50_000)
      await prove(uid, b)
      await accounts.removePasskey(uid, b.id)
      audit.log('auth.passkey.remove', { uid })
      return routes['GET /api/account/passkeys'](req, res, uid)
    },

    'POST /api/account/device-code': async (req, res, uid) => {
      const b = await body(req, 50_000)
      await prove(uid, b)
      audit.log('auth.device.code', { uid })
      return accounts.deviceCode(uid)
    },

    'GET /api/account/activity': (req, res, uid) => ({
      events: audit.list({ uid, limit: 30 }).map(({ at, type, ip }) => ({ at, type, ip })),
    }),

    'POST /api/account/delete': async (req, res, uid) => {
      const b = await body(req, 50_000)
      await prove(uid, b)
      if (uid === accounts.owner && accounts.users().length > 1)
        throw new HttpError(400, 'You own this server. Make someone else the owner in the admin dashboard first.')
      await wipe(uid)
      audit.log('account.delete', {})
      res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
      return { user: null }
    },

    // ---- synced state ----

    'GET /api/state': (req, res, uid) => readJson(stateFile(uid), { rev: 0, state: null }),

    // Optimistic concurrency: the client says which revision it last saw; if the server has moved
    // on, it gets the current copy back (409) to merge and retry.
    'PUT /api/state': async (req, res, uid) => {
      const b = await body(req, 10_000_000)
      if (!isState(b?.state)) throw new HttpError(400, 'Not a valid state')
      return stateWrites(async () => {
        const current = await readJson(stateFile(uid), { rev: 0, state: null })
        if (b.rev !== current.rev) {
          res.statusCode = 409
          return current
        }
        await writeJson(stateFile(uid), { rev: current.rev + 1, state: b.state })
        syncFoodsToCommunity(uid, b.state.foods, b.state.gone).catch((e) => console.error('community foods sync:', e.message))
        hooks.onSync(uid, current.state, b.state).catch((e) => console.error('webhooks:', e.message))
        return { rev: current.rev + 1 }
      })
    },

    // ---- shared foods & recipe dishes across all users ----
    'GET /api/recipes': async () => ({ recipes: await readRecipes() }),

    'POST /api/recipes': async (req, res, uid) => {
      const item = await body(req, 100_000)
      if (!item || (!item.name && !item.ingredients && !item.per100)) throw new HttpError(400, 'Not a valid food or recipe')
      const user = uid ? accounts.user(uid) : null
      const authorName = item.authorName || user?.name || 'Community Member'
      const isDish = item.kind === 'dish' || Array.isArray(item.ingredients)
      const saved = {
        ...item,
        kind: isDish ? 'dish' : 'food',
        id: item.id || randomId(),
        authorName,
        authorId: uid || item.authorId || 'guest',
        sharedAt: item.sharedAt || new Date().toISOString(),
      }
      const current = await readRecipes()
      const list = [saved, ...current.filter((r) => r.id !== saved.id)]
      await writeRecipes(list)
      return { ok: true, recipe: saved, food: saved }
    },

    'DELETE /api/recipes': async (req, res, uid) => {
      const { id } = (await body(req, 1000)) || {}
      if (!id) throw new HttpError(400, 'Recipe id required')
      const current = await readRecipes()
      const existing = current.find((r) => r.id === id)
      if (!existing) return { ok: true }
      if (existing.authorId && existing.authorId !== uid && !accounts.isAdmin(uid)) {
        throw new HttpError(403, 'You can only delete recipes you created')
      }
      await writeRecipes(current.filter((r) => r.id !== id))
      return { ok: true }
    },

    // Reset everything: an empty state with a new revision, so other devices take it instead of merging.
    'POST /api/state/reset': async (req, res, uid) => {
      await body(req, 100)
      return stateWrites(async () => {
        const current = await readJson(stateFile(uid), { rev: 0, state: null })
        await writeJson(stateFile(uid), { rev: current.rev + 1, state: EMPTY, reset: true })
        audit.log('data.reset', { uid })
        return { rev: current.rev + 1, state: EMPTY }
      })
    },

    // ---- AI, on the person's own provider ----

    'GET /api/ai': (req, res, uid) => ai.config(uid),
    'POST /api/ai': async (req, res, uid) => {
      await ai.save(uid, await body(req, 10_000))
      return ai.config(uid)
    },
    'POST /api/ai/models': async (req, res, uid) => {
      aiLimit(uid)
      return ai.models(uid, await body(req, 10_000))
    },
    'POST /api/ai/test': async (req, res, uid) => {
      await body(req, 100)
      aiLimit(uid)
      return ai.test(uid)
    },
    'POST /api/ai/forget': async (req, res, uid) => {
      await body(req, 100)
      await ai.forget(uid)
      return ai.config(uid)
    },
    'POST /api/ai/photo': async (req, res, uid) => {
      const b = await body(req, 8_000_000)
      if (typeof b?.image !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(b.image)) throw new HttpError(400, 'image: base64 JPEG')
      aiLimit(uid)
      return ai.photo(uid, b.image)
    },
    'POST /api/ai/label': async (req, res, uid) => {
      const b = await body(req, 16_000_000)
      if (typeof b?.image !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(b.image)) throw new HttpError(400, 'image: base64 JPEG')
      if (b.packageImage && (typeof b.packageImage !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(b.packageImage))) {
        throw new HttpError(400, 'packageImage: base64 JPEG')
      }
      aiLimit(uid)
      return ai.label(uid, { image: b.image, packageImage: b.packageImage })
    },
    // "I had two rotis and a bowl of dal": a proposal of entries and new dishes to confirm.
    'POST /api/ai/describe': async (req, res, uid) => {
      const b = await body(req, 20_000)
      const text = str(b?.text, { name: 'What you ate', min: 2, max: 1000 })
      const time = /^\d\d:\d\d$/.test(b?.time) ? b.time : '12:00'
      const meal = MEALS.includes(b?.meal) ? b.meal : undefined
      aiLimit(uid)
      const state = await readState(uid)
      return ai.describe(uid, { text, time, meal, foods: state?.foods || [], catalogue: await loadCatalogue() })
    },

    'POST /api/ai/review': async (req, res, uid) => {
      const b = await body(req, 50_000)
      if (!b?.summary || typeof b.summary !== 'object') throw new HttpError(400, 'summary: object')
      aiLimit(uid)
      return ai.review(uid, b.summary)
    },

    'POST /api/ai/coach': async (req, res, uid) => {
      const b = await body(req, 40_000)
      const prompt = str(b?.prompt, { name: 'Prompt', min: 1, max: 2000 })
      const history = (Array.isArray(b?.history) ? b.history : [])
        .filter((m) => (m?.role === 'user' || m?.role === 'coach') && typeof m.text === 'string' && m.text.trim())
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text.slice(0, 1500) }))
      aiLimit(uid)
      return ai.coach(uid, { prompt, context: typeof b?.context === 'string' ? b.context.slice(0, 1000) : undefined, history })
    },

    // ---- webhooks ----

    'GET /api/hooks': (req, res, uid) => hooks.list(uid),
    'POST /api/hooks/new': async (req, res, uid) => hooks.create(uid, await body(req, 10_000)),
    'POST /api/hooks/update': async (req, res, uid) => hooks.update(uid, await body(req, 10_000)),
    'POST /api/hooks/delete': async (req, res, uid) => {
      await hooks.remove(uid, (await body(req, 1000))?.id)
      return hooks.list(uid)
    },
    'POST /api/hooks/test': async (req, res, uid) => hooks.test(uid, (await body(req, 1000))?.id),
    'POST /api/hooks/retry': async (req, res, uid) => hooks.retry(uid, (await body(req, 1000))?.id),

    // ---- reminders ----

    'POST /api/push/subscribe': async (req, res, uid) => {
      await push.subscribe(uid, (await body(req, 10_000))?.subscription)
      return { ok: true }
    },
    'POST /api/push/unsubscribe': async (req, res, uid) => {
      await push.unsubscribe(uid, (await body(req, 10_000))?.endpoint)
      return { ok: true }
    },
    'POST /api/push/status': async (req, res, uid) => ({ subscribed: await push.subscribed(uid, (await body(req, 10_000))?.endpoint) }),
    'POST /api/push/test': async (req, res, uid) => {
      await body(req, 100)
      return { sent: await push.test(uid) }
    },

    // ---- admin dashboard ----

    'GET /api/admin/users': async (req, res, uid) => {
      isAdmin(uid)
      const out = []
      for (const [id, u] of accounts.users()) {
        const s = await readState(id).catch(() => null)
        const days = Object.entries(s?.diary || {}).filter(([, e]) => e.length)
        const weighed = Object.keys(s?.weights || {}).sort()
        out.push({
          id, name: u.name, email: u.email, created: u.created, seen: u.seen || null, admin: accounts.isAdmin(id), owner: id === accounts.owner,
          disabled: u.disabled, hasPassword: !!u.hash, passkeys: u.passkeys.length,
          daysLogged: days.length, lastLogged: days.map(([d]) => d).sort().at(-1) || null,
          weight: weighed.length ? s.weights[weighed.at(-1)] : null,
        })
      }
      return { users: out.sort((a, b) => a.created.localeCompare(b.created)), me: uid, owner: uid === accounts.owner }
    },
    'POST /api/admin/user/disable': async (req, res, uid) => {
      isAdmin(uid)
      const b = await body(req, 1000)
      const u = manageable(uid, b?.id, { adminsToo: true })
      await accounts.setDisabled(b.id, !!b.disabled)
      audit.log(b.disabled ? 'admin.user.disable' : 'admin.user.enable', { uid: b.id, name: u.name, by: accounts.user(uid).name })
      return routes['GET /api/admin/users'](req, res, uid)
    },
    'POST /api/admin/user/delete': async (req, res, uid) => {
      isAdmin(uid)
      const b = await body(req, 1000)
      const u = manageable(uid, b?.id, { adminsToo: true })
      await wipe(b.id)
      audit.log('admin.user.delete', { name: u.name, by: accounts.user(uid).name })
      return routes['GET /api/admin/users'](req, res, uid)
    },
    'POST /api/admin/user/role': async (req, res, uid) => {
      if (uid !== accounts.owner) throw new HttpError(403, 'Only the owner can change who is an admin')
      const b = await body(req, 1000)
      const u = manageable(uid, b?.id, { adminsToo: true })
      await accounts.setAdmin(b.id, !!b.admin)
      audit.log(b.admin ? 'admin.user.promote' : 'admin.user.demote', { uid: b.id, name: u.name, by: accounts.user(uid).name })
      return routes['GET /api/admin/users'](req, res, uid)
    },
    'POST /api/admin/owner': async (req, res, uid) => {
      if (uid !== accounts.owner) throw new HttpError(403, 'Only the owner can hand over ownership')
      const b = await body(req, 50_000)
      await prove(uid, b)
      const u = accounts.user(b.id)
      if (!u || u.disabled || b.id === uid) throw new HttpError(400, 'Pick another active account')
      await accounts.setOwner(b.id)
      audit.log('admin.owner', { uid: b.id, name: u.name, by: accounts.user(uid).name })
      return routes['GET /api/admin/users'](req, res, uid)
    },
    'POST /api/admin/user/reset': async (req, res, uid) => {
      isAdmin(uid)
      const b = await body(req, 1000)
      const u = manageable(uid, b?.id)
      if (accounts.isAdmin(b.id)) throw new HttpError(403, 'Admins set their own password in Settings')
      const code = await accounts.issueReset(b.id)
      audit.log('admin.password.reset', { uid: b.id, name: u.name, by: accounts.user(uid).name })
      return { code, expiresHours: 24 }
    },
    'GET /api/admin/invites': (req, res, uid) => {
      isAdmin(uid)
      return { invites: accounts.invites(), signup: accounts.signupMode() }
    },
    'POST /api/admin/invites/new': async (req, res, uid) => {
      isAdmin(uid)
      const b = await body(req, 1000)
      const days = Math.min(30, Math.max(1, Number(b?.days) || 7))
      const inv = await accounts.newInvite(uid, { note: b?.note || '', days })
      audit.log('admin.invite.new', { id: inv.id, by: accounts.user(uid).name })
      return { ...inv, invites: accounts.invites() }
    },
    'POST /api/admin/invites/revoke': async (req, res, uid) => {
      isAdmin(uid)
      const b = await body(req, 1000)
      await accounts.revokeInvite(b?.id)
      audit.log('admin.invite.revoke', { id: b.id, by: accounts.user(uid).name })
      return { invites: accounts.invites() }
    },
    'GET /api/admin/audit': (req, res, uid) => {
      isAdmin(uid)
      return { events: audit.list({ limit: 300 }), enabled: audit.enabled }
    },
    'POST /api/admin/audit/clear': async (req, res, uid) => {
      isAdmin(uid)
      await body(req, 100)
      await audit.clear({ by: accounts.user(uid).name })
      return { events: audit.list({ limit: 300 }), enabled: audit.enabled }
    },
  }
  const PUBLIC = new Set([
    'GET /api/health', 'GET /api/me', 'POST /api/signup', 'POST /api/signup/passkey/options', 'POST /api/signup/passkey/verify',
    'POST /api/login', 'POST /api/login/passkey/options', 'POST /api/login/passkey/verify', 'POST /api/login/reset',
    'POST /api/login/device', 'POST /api/logout', 'GET /api/recipes', 'POST /api/recipes',
  ])

  // The download page and the Android app, from the repository's website/ and releases/ folders.
  // basename() keeps a /download/ path inside releases/.
  function extraFile(pathname) {
    if (siteDir && (pathname === '/welcome' || pathname === '/welcome/')) return path.join(siteDir, 'index.html')
    if (releasesDir && pathname.startsWith('/download/')) return path.join(releasesDir, path.basename(decodeURIComponent(pathname)))
    return null
  }

  // No APK in releases/: hand out the newest build CI published on GitHub instead. The APK is a
  // redirect; the small details file is fetched here (GitHub sends no CORS headers) and cached.
  let latestInfo = { at: 0, body: null }
  async function latestRelease(res, name) {
    if (name === 'openkcal.apk') {
      res.writeHead(302, { Location: `${RELEASES_URL}/openkcal.apk`, 'Cache-Control': 'no-cache' })
      return res.end()
    }
    if (name !== 'openkcal.json') throw new HttpError(404, 'Not found')
    if (Date.now() - latestInfo.at > 10 * 60_000) {
      const r = await fetch(`${RELEASES_URL}/openkcal.json`, { signal: AbortSignal.timeout(8000) }).catch(() => null)
      const body = r?.ok ? await r.text().catch(() => null) : null
      if (body) latestInfo = { at: Date.now(), body }
    }
    if (!latestInfo.body) throw new HttpError(404, 'Not found')
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    return res.end(latestInfo.body)
  }

  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(404, 'Not found')
    const extra = extraFile(pathname)
    if (extra) {
      const size = await stat(extra).then((s) => (s.isFile() ? s.size : -1), () => -1)
      if (size < 0 && pathname.startsWith('/download/')) return latestRelease(res, path.basename(extra))
      if (size < 0) throw new HttpError(404, 'Not found')
      res.setHeader('Content-Type', TYPES[path.extname(extra)] || 'application/octet-stream')
      res.setHeader('Cache-Control', 'no-cache')
      if (extra.endsWith('.apk')) {
        res.setHeader('Content-Length', size)
        res.setHeader('Content-Disposition', 'attachment; filename="openkcal.apk"')
      }
      if (req.method === 'HEAD') return res.end()
      return createReadStream(extra).on('error', () => res.destroy()).pipe(res)
    }
    if (!distDir) throw new HttpError(404, 'Not found')
    // normalize() on the absolute URL path collapses any "..", so the join can't leave distDir.
    let file = path.join(distDir, path.normalize(decodeURIComponent(pathname)))
    const isFile = (f) => stat(f).then((s) => s.isFile(), () => false)
    if (!file.startsWith(distDir + path.sep) || !(await isFile(file))) {
      file = path.join(distDir, 'index.html') // single-page app: unknown paths get the shell
      if (!(await isFile(file))) throw new HttpError(404, 'Not found')
    }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
    res.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
    if (req.method === 'HEAD') return res.end()
    createReadStream(file).on('error', () => res.destroy()).pipe(res)
  }

  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'same-origin')
    try {
      const { pathname } = new URL(req.url, 'http://x')
      if (!pathname.startsWith('/api/')) return await serveStatic(req, res, pathname)
      // Only the phone app's own origins may call across origins. It carries no cookie, so
      // Allow-Credentials is never set and a reflected origin cannot reach a cookie session.
      if (fromApp(req)) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
        res.setHeader('Vary', 'Origin')
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
            // Chrome asks before a page reaches a home-network address (a server on 192.168.x.x)
            ...(req.headers['access-control-request-private-network'] === 'true' && { 'Access-Control-Allow-Private-Network': 'true' }),
          })
          return res.end()
        }
      }
      const route = `${req.method} ${pathname}`
      const handler = routes[route]
      if (!handler) throw new HttpError(404, 'Not found')
      const uid = accounts.sessionUser(sessionToken(req))
      if (!uid && !PUBLIC.has(route)) throw new HttpError(401, 'Sign in first')
      const out = await handler(req, res, uid)
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(out))
    } catch (e) {
      const status = e instanceof HttpError || e.name === 'AiError' ? e.status : e instanceof URIError ? 400 : 500
      if (status === 500) console.error(e)
      if (e.extra?.retryAfter) res.setHeader('Retry-After', String(e.extra.retryAfter))
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: status === 500 ? 'Server error' : e.message, ...e.extra }))
    }
  })
  server.on('close', () => {
    hooks.stop()
    push.stop()
  })
  return server
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
export const dataDir = () => path.resolve(process.env.DATA_DIR || path.join(root, 'data-server'))

const on = (v, fallback) => (v == null || v === '' ? fallback : !/^(0|false|no|off)$/i.test(v))

// Start from the environment. Also called by mirror.js once the data folder is in place.
export async function main() {
  const env = process.env
  const signup = ['open', 'invite', 'closed'].includes(env.SIGNUP) ? env.SIGNUP : 'invite'
  const app = await createApp({
    dataDir: dataDir(),
    distDir: path.join(root, 'dist'),
    siteDir: path.join(root, 'website'),
    releasesDir: path.join(root, 'releases'),
    signup,
    guests: on(env.ALLOW_GUEST, true),
    adminUids: String(env.ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean),
    origin: env.ORIGIN ? new URL(env.ORIGIN).origin : undefined,
    trustProxy: on(env.TRUST_PROXY, false),
    allowLan: on(env.ALLOW_LAN, false),
    audit: { enabled: on(env.AUDIT_LOG, true), max: Number(env.AUDIT_MAX) || 5000, days: Number(env.AUDIT_DAYS) || 90, ipMode: env.AUDIT_IP || '' },
    aiDailyLimit: Number(env.AI_DAILY_LIMIT) || 40,
    pushSubject: env.PUSH_CONTACT ? `mailto:${env.PUSH_CONTACT}` : undefined,
  })
  const port = Number(env.PORT) || 3000
  app.listen(port, () => console.log(`openKCal ${VERSION} on http://localhost:${port} (sign-up: ${signup}, passkeys: ${env.ORIGIN ? 'on' : 'off, set ORIGIN'})`))
  // A deploy or a host putting the service to sleep: finish what is in flight, then exit.
  process.once('SIGTERM', () => app.close(() => process.exit(0)))
}

// Run directly: node server/server.js
if (process.argv[1] === fileURLToPath(import.meta.url)) main()

