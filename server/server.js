// Thali server: serves the built app and syncs one JSON state blob per user.
// Plain node:http, files on disk under DATA_DIR, no database.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { isState } from '../src/lib/state.js'

const scryptAsync = promisify(scrypt)
const SESSION_DAYS = 30
const USERNAME = /^[a-z0-9_-]{3,32}$/ // also keeps usernames safe as file names
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return fallback
    throw e
  }
}

// Write-then-rename so a crash mid-write never leaves a half-written file.
async function writeJson(file, data) {
  await writeFile(file + '.tmp', JSON.stringify(data))
  await rename(file + '.tmp', file)
}

async function body(req, limit) {
  if (!/^application\/json\b/.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Send JSON')
  const chunks = []
  let size = 0
  for await (const c of req) {
    if ((size += c.length) > limit) throw new HttpError(413, 'Too large')
    chunks.push(c)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

// At most `max` hits per key per window. In memory: resets on restart.
function limiter(max, windowMs) {
  const hits = new Map()
  return (key) => {
    const now = Date.now()
    const h = hits.get(key)
    if (!h || now > h.reset) hits.set(key, { n: 1, reset: now + windowMs })
    else if (++h.n > max) throw new HttpError(429, 'Too many attempts. Try again later.')
  }
}

/**
 * @param {object} o
 * @param {string} o.dataDir  where users and state live
 * @param {string} [o.distDir]  built frontend to serve, if any
 * @param {boolean} [o.openSignup]  let anyone create an account (default: only the first user)
 * @param {object} [o.ai]  { photo(image), review(summary) } from ai.js, when a key is configured
 */
export async function createApp({ dataDir, distDir, openSignup = false, ai = null }) {
  await mkdir(path.join(dataDir, 'state'), { recursive: true })
  const usersFile = path.join(dataDir, 'users.json')
  const users = await readJson(usersFile, {}) // username -> { salt, hash }
  // ponytail: sessions live in memory, so a restart signs everyone out;
  // persist them (hashed) if that gets annoying.
  const sessions = new Map() // token -> { user, expires }
  const authLimit = limiter(10, 15 * 60_000)
  const aiLimit = limiter(40, 24 * 3600_000) // per user per day: AI calls cost the server owner money
  const stateFile = (user) => path.join(dataDir, 'state', `${user}.json`)

  const hashPassword = async (password, salt) => (await scryptAsync(password, salt, 64)).toString('hex')

  function sessionUser(req) {
    const token = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1]
    const s = token && sessions.get(token)
    if (!s || s.expires < Date.now()) return null
    return s.user
  }

  function startSession(req, res, user) {
    const token = randomBytes(32).toString('hex')
    sessions.set(token, { user, expires: Date.now() + SESSION_DAYS * 86400_000 })
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`)
  }

  function credentials(b) {
    const username = String(b?.username ?? '').trim().toLowerCase()
    const password = String(b?.password ?? '')
    if (!USERNAME.test(username)) throw new HttpError(400, 'Username: 3-32 characters, a-z, 0-9, - or _')
    if (password.length < 10 || password.length > 200) throw new HttpError(400, 'Password: at least 10 characters')
    return { username, password }
  }

  const signupOpen = () => openSignup || Object.keys(users).length === 0

  const routes = {
    'GET /api/me': (req) => ({ user: sessionUser(req), signup: signupOpen(), ai: !!ai }),

    'POST /api/signup': async (req, res) => {
      authLimit(req.socket.remoteAddress)
      if (!signupOpen()) throw new HttpError(403, 'Sign-up is closed on this server')
      const { username, password } = credentials(await body(req, 10_000))
      if (users[username]) throw new HttpError(409, 'That username is taken')
      const salt = randomBytes(16).toString('hex')
      users[username] = { salt, hash: await hashPassword(password, salt) }
      await writeJson(usersFile, users)
      startSession(req, res, username)
      return { user: username }
    },

    'POST /api/login': async (req, res) => {
      authLimit(req.socket.remoteAddress)
      const { username, password } = credentials(await body(req, 10_000))
      const u = users[username]
      // Hash even for unknown users so response time doesn't reveal who exists.
      const hash = Buffer.from(await hashPassword(password, u?.salt ?? 'no-such-user'), 'hex')
      if (!u || !timingSafeEqual(hash, Buffer.from(u.hash, 'hex'))) throw new HttpError(401, 'Wrong username or password')
      startSession(req, res, username)
      return { user: username }
    },

    'POST /api/logout': async (req) => {
      await body(req, 100)
      const token = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1]
      sessions.delete(token)
      return { user: null }
    },

    'GET /api/state': (req, res, user) => readJson(stateFile(user), { rev: 0, state: null }),

    // Optimistic concurrency: the client says which revision it last saw; if the
    // server has moved on, it gets the current copy back (409) to merge and retry.
    'PUT /api/state': async (req, res, user) => {
      const b = await body(req, 10_000_000)
      if (!isState(b?.state)) throw new HttpError(400, 'Not a valid state')
      const current = await readJson(stateFile(user), { rev: 0, state: null })
      if (b.rev !== current.rev) {
        res.statusCode = 409
        return current
      }
      await writeJson(stateFile(user), { rev: current.rev + 1, state: b.state })
      return { rev: current.rev + 1 }
    },

    'POST /api/ai/photo': async (req, res, user) => {
      if (!ai) throw new HttpError(404, 'AI is not configured on this server')
      const b = await body(req, 8_000_000)
      if (typeof b?.image !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(b.image)) throw new HttpError(400, 'image: base64 JPEG')
      aiLimit(user)
      return ai.photo(b.image)
    },

    'POST /api/ai/review': async (req, res, user) => {
      if (!ai) throw new HttpError(404, 'AI is not configured on this server')
      const b = await body(req, 50_000)
      if (!b?.summary || typeof b.summary !== 'object') throw new HttpError(400, 'summary: object')
      aiLimit(user)
      return ai.review(b.summary)
    },
  }
  const PUBLIC = new Set(['GET /api/me', 'POST /api/signup', 'POST /api/login', 'POST /api/logout'])

  async function serveStatic(req, res, pathname) {
    if (!distDir || (req.method !== 'GET' && req.method !== 'HEAD')) throw new HttpError(404, 'Not found')
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

  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      const { pathname } = new URL(req.url, 'http://x')
      if (!pathname.startsWith('/api/')) return await serveStatic(req, res, pathname)
      const key = `${req.method} ${pathname}`
      const handler = routes[key]
      if (!handler) throw new HttpError(404, 'Not found')
      const user = sessionUser(req)
      if (!user && !PUBLIC.has(key)) throw new HttpError(401, 'Sign in first')
      const out = await handler(req, res, user)
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(out))
    } catch (e) {
      const status = e instanceof HttpError || e.name === 'AiError' ? e.status : e instanceof URIError ? 400 : 500
      if (status === 500) console.error(e)
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: status === 500 ? 'Server error' : e.message }))
    }
  })
}

// Run directly: node server/server.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const hasKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
  const ai = hasKey ? (await import('./ai.js')).createAi() : null
  const app = await createApp({
    dataDir: path.resolve(process.env.DATA_DIR || path.join(root, 'data-server')),
    distDir: path.join(root, 'dist'),
    openSignup: process.env.SIGNUP === 'open',
    ai,
  })
  const port = Number(process.env.PORT) || 3000
  app.listen(port, () => console.log(`Thali on http://localhost:${port} (AI ${ai ? 'on' : 'off'})`))
}
