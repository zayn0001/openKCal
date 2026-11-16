// Small helpers every route module shares: errors with a status, JSON files on disk, request bodies.
import { chmod, readFile, rename, writeFile } from 'node:fs/promises'

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message)
    this.status = status
    this.extra = extra // extra JSON fields for the response, e.g. { retryAfter }
  }
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return fallback
    throw e
  }
}

// Write-then-rename so a crash mid-write never leaves a half-written file.
// `private` files (credentials) are readable by the server's own user only.
export async function writeJson(file, data, { private: secret = false } = {}) {
  await writeFile(file + '.tmp', JSON.stringify(data), secret ? { mode: 0o600 } : undefined)
  await renameRetrying(file + '.tmp', file)
  if (secret) await chmod(file, 0o600).catch(() => {}) // no-op on Windows
}

// On Windows a virus scanner or indexer can hold a just-written file for a moment, and rename
// then fails with EPERM/EBUSY. Waiting briefly and trying again is the usual remedy.
export async function renameRetrying(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(from, to)
    } catch (e) {
      if (attempt >= 8 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)))
    }
  }
}

// One write at a time per file: two requests saving the same file must not interleave.
export function serialize() {
  let chain = Promise.resolve()
  return (fn) => (chain = chain.then(fn, fn))
}

export async function body(req, limit) {
  if (!/^application\/json\b/.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Send JSON')
  const chunks = []
  let size = 0
  for await (const c of req) {
    if ((size += c.length) > limit) throw new HttpError(413, 'Too large')
    chunks.push(c)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

// At most `max` hits per key per window. In memory: resets on restart.
export function limiter(max, windowMs, message = 'Too many attempts. Try again later.') {
  const hits = new Map()
  return (key) => {
    const now = Date.now()
    if (hits.size > 10_000) for (const [k, h] of hits) if (now > h.reset) hits.delete(k)
    const h = hits.get(key)
    if (!h || now > h.reset) hits.set(key, { n: 1, reset: now + windowMs })
    else if (++h.n > max) throw new HttpError(429, message, { retryAfter: Math.ceil((h.reset - now) / 1000) })
  }
}

// A string field from a request body: trimmed, length-checked, or the fallback when absent.
export function str(v, { max = 200, min = 0, name = 'value', optional = false } = {}) {
  if (v == null || v === '') {
    if (optional) return null
    throw new HttpError(400, `${name} is required`)
  }
  if (typeof v !== 'string') throw new HttpError(400, `${name} must be text`)
  const s = v.trim()
  if (s.length < min || s.length > max) throw new HttpError(400, `${name}: ${min}-${max} characters`)
  return s
}
