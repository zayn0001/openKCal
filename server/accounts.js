// People, sessions, invites and one-time codes. Everything lives in DATA_DIR/db.json (users,
// invites, reset codes) and DATA_DIR/sessions.json, written whole on each change.
//
// Modelled on openGym: a stable account id, a sign-in name (case and spaces don't matter), an
// optional sign-in e-mail, an owner (the first account) and admins, invite codes, admin-issued
// password reset codes, codes that sign in another device, and per-account lockouts.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { HttpError, readJson, serialize, writeJson } from './http.js'
import { codeKey, newCode, randomId, sha256 } from './secure.js'

const scryptAsync = promisify(scrypt)
const DAY = 86400_000
export const SESSION_DAYS = 30
const RESET_HOURS = 24
const DEVICE_CODE_MINUTES = 10

// The passwords guessing scripts try first. Not a full breach list: a long passphrase is the point.
const COMMON = new Set(
  'password password1 password12 password123 password1234 passw0rd qwerty qwertyuiop qwerty123 qwerty1234 1234567890 0123456789 12345678910 1111111111 0000000000 abc1234567 iloveyou12 letmein123 welcome123 admin12345 administrator changeme123 football12 baseball12 monkey1234 dragon1234 sunshine12 princess12 trustno1234'.split(' '),
)

/** The comparison form of a name or e-mail: trimmed, lower-case, single spaces. */
export const nameKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

export function checkName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,31}$/u.test(name))
    throw new HttpError(400, 'Name: 2-32 letters or digits (spaces, dots, dashes and underscores allowed)')
  return name
}

export function checkEmail(raw) {
  const email = nameKey(raw)
  if (!email) return null
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'That e-mail address does not look right')
  return email
}

export function checkPassword(password, name) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 256)
    throw new HttpError(400, 'Password: 10 to 256 characters. A few words in a row work well.')
  const plain = password.toLowerCase()
  const bare = plain.replace(/[^\p{L}]/gu, '')
  if (COMMON.has(plain) || (name && bare === nameKey(name).replace(/[^\p{L}]/gu, '')))
    throw new HttpError(400, 'That password is one of the first ones guessing scripts try. Pick another.')
  return password
}

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: (await scryptAsync(password, salt, 64)).toString('hex') }
}

async function passwordMatches(user, password) {
  // Hash even when there is nothing to compare, so timing doesn't say whether the account exists.
  const { hash } = await hashPassword(String(password ?? ''), user?.salt ?? 'no-such-account')
  return !!user?.hash && timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'))
}

/**
 * @param {object} o
 * @param {string} o.dataDir
 * @param {'open'|'invite'|'closed'} [o.signup]  who may create an account once the first one exists
 * @param {string[]} [o.adminUids]  accounts that are always admins (ADMIN_UIDS)
 * @param {object} o.audit  from audit.js
 */
export async function createAccounts({ dataDir, signup = 'invite', adminUids = [], audit }) {
  const dbFile = path.join(dataDir, 'db.json')
  const sessionsFile = path.join(dataDir, 'sessions.json')
  const stateDir = path.join(dataDir, 'state')
  await mkdir(stateDir, { recursive: true })
  const writeDb = serialize()
  const writeSessions = serialize()

  let db = await readJson(dbFile, null)
  let sessions = new Map(Object.entries(await readJson(sessionsFile, {}))) // sha256(token) -> { uid, expires, created }

  // From the first release's layout: users.json keyed by username, state/<username>.json, and
  // sessions naming the username. Each account gets an id; the first one found becomes the owner.
  if (!db) {
    db = { version: 2, owner: null, users: {}, invites: {}, resets: {} }
    const old = await readJson(path.join(dataDir, 'users.json'), null)
    if (old) {
      const byName = {}
      for (const [username, u] of Object.entries(old)) {
        const uid = randomId(9)
        byName[username] = uid
        db.users[uid] = { name: username, email: null, salt: u.salt, hash: u.hash, admin: !db.owner, disabled: false, created: new Date().toISOString(), passkeys: [] }
        db.owner ??= uid
        const from = path.join(stateDir, `${username}.json`)
        if (await stat(from).then(() => true, () => false)) await rename(from, path.join(stateDir, `${uid}.json`))
      }
      for (const [k, s] of sessions) if (s.user) sessions.set(k, { uid: byName[s.user], expires: s.expires, created: s.expires - SESSION_DAYS * DAY })
      for (const [k, s] of sessions) if (!s.uid) sessions.delete(k)
      await writeJson(dbFile, db, { private: true })
      await writeJson(sessionsFile, Object.fromEntries(sessions), { private: true })
      await rm(path.join(dataDir, 'users.json'))
    }
  }

  const saveDb = () => writeDb(() => writeJson(dbFile, db, { private: true }))
  const saveSessions = () =>
    writeSessions(() => {
      const now = Date.now()
      for (const [k, s] of sessions) if (s.expires < now) sessions.delete(k)
      return writeJson(sessionsFile, Object.fromEntries(sessions), { private: true })
    })

  const isAdmin = (uid) => uid === db.owner || !!db.users[uid]?.admin || adminUids.includes(uid)
  const userList = () => Object.entries(db.users)
  const byLogin = (login) => {
    const k = nameKey(login)
    return userList().find(([, u]) => nameKey(u.name) === k || (u.email && u.email === k)) || []
  }

  // Wrong passwords per account: 5 free, then a pause of 1 minute doubling to an hour.
  // Unknown names pause the same way, so a pause says nothing about whether a name exists.
  const failures = new Map()
  function checkLock(key) {
    const f = failures.get(key)
    if (f?.until > Date.now())
      throw new HttpError(429, 'Too many wrong passwords. Try again in a little while.', { retryAfter: Math.ceil((f.until - Date.now()) / 1000) })
  }
  function failed(key) {
    const f = failures.get(key) || { n: 0, until: 0 }
    f.n++
    if (f.n > 5) f.until = Date.now() + Math.min(60, 2 ** (f.n - 6)) * 60_000
    failures.set(key, f)
  }

  // Codes that sign in another device: in memory, ten minutes, one use.
  const deviceCodes = new Map() // codeKey -> { uid, expires }

  const api = {
    get owner() {
      return db.owner
    },
    signupMode: () => (userList().length === 0 ? 'first' : signup),
    isAdmin,
    user: (uid) => db.users[uid] || null,
    users: () => userList(),

    /** What the person themself sees about their account. */
    me(uid) {
      const u = db.users[uid]
      if (!u) return null
      return {
        id: uid,
        name: u.name,
        email: u.email,
        admin: isAdmin(uid),
        owner: uid === db.owner,
        hasPassword: !!u.hash,
        passkeys: u.passkeys.length,
        created: u.created,
      }
    },

    // ---- sessions ----

    async startSession(uid) {
      const token = randomBytes(32).toString('hex')
      sessions.set(sha256(token), { uid, expires: Date.now() + SESSION_DAYS * DAY, created: Date.now() })
      db.users[uid].seen = new Date().toISOString()
      await Promise.all([saveSessions(), saveDb()])
      return token
    },
    /** The account behind a session token, or null (expired, disabled, deleted). */
    sessionUser(token) {
      const s = token && sessions.get(sha256(token))
      if (!s || s.expires < Date.now()) return null
      const u = db.users[s.uid]
      if (!u || u.disabled) return null
      const today = new Date().toISOString().slice(0, 10)
      if (!u.seen?.startsWith(today)) {
        u.seen = new Date().toISOString()
        saveDb()
      }
      return s.uid
    },
    async endSession(token) {
      if (sessions.delete(sha256(token))) await saveSessions()
    },
    async endAllSessions(uid) {
      for (const [k, s] of sessions) if (s.uid === uid) sessions.delete(k)
      await saveSessions()
    },

    // ---- signing up and in ----

    /** Throws unless this person may create an account now; returns the invite to consume. */
    checkSignup(invite) {
      const mode = api.signupMode()
      if (mode === 'first' || mode === 'open') return null
      if (mode === 'closed') throw new HttpError(403, 'New accounts are switched off on this server')
      const [id] = Object.entries(db.invites).find(([, i]) => i.hash === codeKey(invite)) || []
      api.checkInvite(id)
      return id
    },

    /** A free name and e-mail for a new account, cleaned up; throws when either is taken. */
    available(rawName, rawEmail) {
      const name = checkName(rawName)
      const email = checkEmail(rawEmail)
      // A name can't be someone's e-mail either, or signing in by it would be ambiguous.
      if (byLogin(name)[0] || Object.values(db.resets).some((r) => r.name === nameKey(name) && r.expires > Date.now()))
        throw new HttpError(409, 'That name is taken')
      if (email && byLogin(email)[0]) throw new HttpError(409, 'Another account already uses this e-mail address')
      return { name, email }
    },

    /** Throws unless the invite can still be used. */
    checkInvite(id) {
      const inv = db.invites[id]
      if (!inv || inv.used || inv.revoked || inv.expires < Date.now()) throw new HttpError(403, 'That invite code is not valid. Ask the admin for a new one.')
    },

    /** Creates the account, with a password or a first passkey. */
    async createUser({ uid = randomId(9), name: rawName, email: rawEmail, password, passkey, inviteId }) {
      const { name, email } = api.available(rawName, rawEmail)
      if (inviteId) api.checkInvite(inviteId)
      const first = userList().length === 0
      const pw = password ? await hashPassword(checkPassword(password, name)) : { salt: null, hash: null }
      db.users[uid] = { name, email, ...pw, admin: first, disabled: false, created: new Date().toISOString(), passkeys: passkey ? [passkey] : [] }
      if (first) db.owner = uid
      if (inviteId) db.invites[inviteId].used = { uid, at: new Date().toISOString() }
      await saveDb()
      return uid
    },

    /** Name or e-mail and password; returns the account id. */
    async login(login, password) {
      const key = 'acct:' + nameKey(login)
      checkLock(key)
      const [uid, u] = byLogin(login)
      if (!(await passwordMatches(u, password))) {
        failed(key)
        audit.log('auth.login.fail', { uid })
        throw new HttpError(401, 'Wrong name or password')
      }
      if (u.disabled) {
        audit.log('auth.login.disabled', { uid, name: u.name })
        throw new HttpError(403, 'This account is switched off. Ask the admin.')
      }
      failures.delete(key)
      return uid
    },

    /** Checks the account's current password, counting wrong ones against it. */
    async verifyPassword(uid, password) {
      const key = 'uid:' + uid
      checkLock(key)
      if (await passwordMatches(db.users[uid], password)) {
        failures.delete(key)
        return true
      }
      failed(key)
      return false
    },

    async setPassword(uid, password) {
      Object.assign(db.users[uid], await hashPassword(checkPassword(password, db.users[uid].name)))
      await saveDb()
    },
    async removePassword(uid) {
      const u = db.users[uid]
      if (!u.passkeys.length) throw new HttpError(400, 'Add a passkey first: the password is the only way into this account')
      u.salt = u.hash = null
      await saveDb()
    },
    async setEmail(uid, raw) {
      const email = checkEmail(raw)
      const [other] = email ? byLogin(email) : []
      if (other && other !== uid) throw new HttpError(409, 'Another account already uses this e-mail address')
      db.users[uid].email = email
      await saveDb()
      return email
    },
    async rename(uid, raw) {
      const name = checkName(raw)
      const [other] = byLogin(name)
      if (other && other !== uid) throw new HttpError(409, 'That name is taken')
      db.users[uid].name = name
      await saveDb()
      return name
    },

    // ---- passkeys (stored with the user; ceremonies live in passkeys.js) ----

    passkeyOwner(credentialId) {
      for (const [uid, u] of userList()) {
        const pk = u.passkeys.find((p) => p.id === credentialId)
        if (pk) return { uid, user: u, passkey: pk }
      }
      return {}
    },
    async addPasskey(uid, pk) {
      db.users[uid].passkeys.push(pk)
      await saveDb()
    },
    async updatePasskey(uid, id, patch) {
      const pk = db.users[uid].passkeys.find((p) => p.id === id)
      if (!pk) throw new HttpError(404, 'No such passkey')
      Object.assign(pk, patch)
      await saveDb()
    },
    async removePasskey(uid, id) {
      const u = db.users[uid]
      if (!u.passkeys.some((p) => p.id === id)) throw new HttpError(404, 'No such passkey')
      if (u.passkeys.length === 1 && !u.hash) throw new HttpError(400, 'Set a password first: this passkey is the only way into the account')
      u.passkeys = u.passkeys.filter((p) => p.id !== id)
      await saveDb()
    },

    // ---- one-time codes ----

    /** Admin-issued: removes the password, signs the account out, returns the code once. */
    async issueReset(uid) {
      const code = newCode(3)
      db.resets[uid] = { hash: codeKey(code), name: nameKey(db.users[uid].name), expires: Date.now() + RESET_HOURS * 3600_000 }
      db.users[uid].salt = db.users[uid].hash = null
      await saveDb()
      await api.endAllSessions(uid)
      return code
    },
    /** Name (or e-mail) + reset code + new password. Returns the account id. */
    async redeemReset(login, code, password) {
      const [uid, u] = byLogin(login)
      const r = uid && db.resets[uid]
      if (!r || r.expires < Date.now() || r.hash !== codeKey(code)) throw new HttpError(401, 'That code is not valid for this account, or it has expired')
      Object.assign(u, await hashPassword(checkPassword(password, u.name)))
      delete db.resets[uid]
      await saveDb()
      return uid
    },

    deviceCode(uid) {
      const code = newCode(2)
      deviceCodes.set(codeKey(code), { uid, expires: Date.now() + DEVICE_CODE_MINUTES * 60_000 })
      return { code, expires: Date.now() + DEVICE_CODE_MINUTES * 60_000 }
    },
    redeemDeviceCode(code) {
      const k = codeKey(code)
      const c = deviceCodes.get(k)
      deviceCodes.delete(k)
      if (!c || c.expires < Date.now() || !db.users[c.uid] || db.users[c.uid].disabled) throw new HttpError(401, 'That code is not valid, or it has expired')
      return c.uid
    },

    // ---- invites ----

    async newInvite(by, { note = '', days = 7 } = {}) {
      const code = newCode(3)
      const id = randomId(6)
      db.invites[id] = { hash: codeKey(code), note: String(note).slice(0, 80), created: new Date().toISOString(), expires: Date.now() + days * DAY, by, used: null, revoked: false }
      await saveDb()
      return { id, code }
    },
    invites() {
      return Object.entries(db.invites)
        .map(([id, i]) => ({
          id,
          note: i.note,
          created: i.created,
          expires: new Date(i.expires).toISOString(),
          by: db.users[i.by]?.name ?? null,
          status: i.revoked ? 'revoked' : i.used ? 'used' : i.expires < Date.now() ? 'expired' : 'open',
          usedBy: i.used ? (db.users[i.used.uid]?.name ?? '(deleted)') : null,
        }))
        .sort((a, b) => b.created.localeCompare(a.created))
    },
    async revokeInvite(id) {
      if (!db.invites[id]) throw new HttpError(404, 'No such invite')
      db.invites[id].revoked = true
      await saveDb()
    },

    // ---- admin ----

    async setDisabled(uid, disabled) {
      db.users[uid].disabled = !!disabled
      await saveDb()
      if (disabled) await api.endAllSessions(uid)
    },
    async setAdmin(uid, admin) {
      db.users[uid].admin = !!admin
      await saveDb()
    },
    async setOwner(uid) {
      db.owner = uid
      db.users[uid].admin = true
      await saveDb()
    },
    async deleteUser(uid) {
      delete db.users[uid]
      delete db.resets[uid]
      if (db.owner === uid) db.owner = null
      await saveDb()
      await api.endAllSessions(uid)
    },
  }
  return api
}
