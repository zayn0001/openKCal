// Secrets at rest, webhook signatures, and the rules for where the server may connect out to.
// The encryption, signature and address rules are ported from openGym (api/integrations/crypto.js
// and api/net-guard.js), which has the reasoning in full.
import crypto from 'node:crypto'
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

// ---- the instance secret, and values sealed with it ----

/** DATA_DIR/secret, created on first start. Losing it makes stored API keys unreadable. */
export async function instanceKey(dataDir) {
  const file = path.join(dataDir, 'secret')
  let secret = await readFile(file, 'utf8').catch(() => '')
  if (secret.length < 32) {
    secret = crypto.randomBytes(32).toString('hex')
    await writeFile(file, secret, { mode: 0o600 })
  }
  // 'thally' is the app's old name, kept on purpose: changing it would make every stored value unreadable
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.from('thally'), Buffer.from('sealed values v1'), 32))
}

/** AES-256-GCM. `aad` binds the value to where it is stored, so it cannot be moved elsewhere. */
export function seal(key, plain, aad) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(Buffer.from(aad))
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

/** The plain text, or null when it cannot be opened (other key, other place, tampered). */
export function unseal(key, sealed, aad) {
  const [v, iv, tag, ct] = String(sealed || '').split('.')
  if (v !== 'v1' || !iv || !tag || ct === undefined) return null
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
    d.setAAD(Buffer.from(aad))
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')
export const randomId = (bytes = 12) => crypto.randomBytes(bytes).toString('base64url')

// Human-typed one-time codes: no 0/O/1/I/L, grouped in fours (K7WQ-2MZP-4HXA).
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export function newCode(groups = 3) {
  const chars = Array.from(crypto.randomBytes(groups * 4), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
  return chars.join('').match(/.{4}/g).join('-')
}
/** What a typed code is compared by: case, spaces and dashes don't matter. */
export const codeKey = (code) => sha256(String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, ''))

/** Webhook signature header value: HMAC-SHA256 over "<unix seconds>.<body>". */
export function signature(secret, body, ts = Math.floor(Date.now() / 1000)) {
  return `t=${ts},v1=${crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`
}

/** The receiving side of signature(), constant-time, refusing timestamps over 5 minutes off. */
export function verifySignature(secret, body, header, now = Date.now()) {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(header || ''))
  if (!m || Math.abs(now / 1000 - Number(m[1])) > 300) return false
  const want = crypto.createHmac('sha256', secret).update(`${m[1]}.${body}`).digest()
  const got = Buffer.from(m[2], 'hex')
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

// ---- where the server may connect ----

/** The eight 16-bit groups of an IPv6 literal in any spelling, or null. */
export function ipv6Groups(v) {
  if (!net.isIPv6(v)) return null
  let s = v.replace(/%.*$/, '')
  const m4 = /:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s)
  if (m4) {
    const [a, b, c, d] = m4[1].split('.').map(Number)
    s = s.slice(0, -m4[1].length) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16)
  }
  const [head, tail = ''] = s.split('::')
  const groups = head ? head.split(':') : []
  const rest = tail ? tail.split(':') : []
  if (s.includes('::')) while (groups.length + rest.length < 8) groups.push('0')
  return groups.concat(rest).map((x) => parseInt(x, 16))
}

const fromV6 = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`

/** Loopback, private, link-local (cloud metadata), CGNAT, multicast, reserved: never by default. */
export function isPrivateAddr(ip) {
  const v = String(ip).toLowerCase().replace(/^\[|\]$/g, '')
  const m4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v)
  if (m4) {
    const a = +m4[1]
    const b = +m4[2]
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) || a >= 224
    )
  }
  const g = ipv6Groups(v)
  if (!g) return false
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPrivateAddr(fromV6(g[6], g[7]))
  if (g.slice(0, 7).every((x) => x === 0) && g[7] <= 1) return true
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true
  if ((g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xff00) === 0xff00) return true
  if (g.slice(0, 6).every((x) => x === 0)) return isPrivateAddr(fromV6(g[6], g[7]))
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPrivateAddr(fromV6(g[6], g[7]))
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true
  if (g[0] === 0x2002) return isPrivateAddr(fromV6(g[1], g[2]))
  return false
}

/** A home network: RFC 1918, CGNAT (Tailscale) and IPv6 unique-local. Never loopback or link-local. */
export function isLanAddr(ip) {
  const v = String(ip).toLowerCase().replace(/^\[|\]$/g, '')
  const m4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v)
  if (m4) {
    const a = +m4[1]
    const b = +m4[2]
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  const g = ipv6Groups(v)
  if (!g) return false
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isLanAddr(fromV6(g[6], g[7]))
  return (g[0] & 0xfe00) === 0xfc00
}

const isLoopback = (ip) => {
  const v = String(ip).toLowerCase().replace(/^\[|\]$/g, '').replace(/^::ffff:/, '')
  return /^127\./.test(v) || v === '::1'
}

/**
 * Whether an outbound request may connect to `ip`.
 *   allow = false   the public internet only (default for everyone)
 *   allow = 'lan'   plus home-network addresses (ALLOW_LAN=1)
 *   allow = 'any'   plus this machine (the server's admins, e.g. Ollama on localhost)
 * Link-local (cloud metadata at 169.254.169.254), multicast and reserved blocks: never.
 */
export const addrAllowed = (ip, allow) =>
  !isPrivateAddr(ip) || (!!allow && isLanAddr(ip)) || (allow === 'any' && isLoopback(ip))

/**
 * Checks a user-supplied URL before anything is sent: http(s) only, no credentials in it, plain
 * http only towards an allowed LAN address. Returns the URL or throws an Error with a message
 * fit to show the user. The address rule itself is enforced again at connect time (safeFetch).
 */
export function checkUrl(raw, { allowLan = false } = {}) {
  let u
  try {
    u = new URL(String(raw || '').trim())
  } catch {
    throw new Error('That is not a valid URL')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http:// and https:// addresses work')
  if (u.username || u.password) throw new Error('Put credentials in the key field, not in the URL')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host) && !addrAllowed(host, allowLan))
    throw new Error(allowLan ? 'That address is not allowed' : 'Addresses on a private network are not allowed on this server')
  const nearby = net.isIP(host) ? isPrivateAddr(host) : host === 'localhost' || !host.includes('.') || host.endsWith('.local')
  if (u.protocol === 'http:' && !(allowLan && nearby))
    throw new Error('Use https:// (plain http:// only works for a home-network address the server allows)')
  return u
}

/**
 * fetch-like request that refuses private addresses at connect time too, so a hostname that
 * resolves to one (or changes to one between check and send: DNS rebinding) is still refused.
 * Returns { status, ok, headers, text() }. No redirects are followed.
 */
export function safeFetch(url, { method = 'GET', headers = {}, body, timeout = 30_000, allowLan = false } = {}) {
  const u = checkUrl(url, { allowLan })
  const lookup = (hostname, options, cb) =>
    dns.lookup(hostname, { ...options, all: true }, (err, list) => {
      if (err) return cb(err)
      if (list.some((a) => !addrAllowed(a.address, allowLan)))
        return cb(Object.assign(new Error(`refusing to connect to a private address (${hostname})`), { code: 'EBLOCKED' }))
      if (options.all) return cb(null, list)
      cb(null, list[0].address, list[0].family)
    })
  const mod = u.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = mod.request(u, { method, headers, lookup, timeout }, (res) => {
      const chunks = []
      let size = 0
      res.on('data', (c) => {
        if ((size += c.length) <= 5_000_000) chunks.push(c)
      })
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, headers: res.headers, text: async () => text })
      })
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })))
    req.on('error', reject)
    req.end(body)
  })
}
