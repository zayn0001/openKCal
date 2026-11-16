// The activity log: sign-ins, failures, sign-ups, and every admin action, one JSON object per line
// in DATA_DIR/audit.log (so `tail -f` and `jq` work on it). Same shape and limits as openGym's.
// IP addresses are not recorded unless AUDIT_IP=net (the /24 or /48 only) or AUDIT_IP=full.
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { renameRetrying, serialize } from './http.js'

// "a…@e…": enough for an admin to recognise, not enough to collect.
export const maskEmail = (email) => String(email).replace(/^(.)[^@]*@(.).*$/, '$1…@$2…')

export function maskIp(ip, mode) {
  if (mode === 'full') return ip
  if (mode !== 'net' || !ip) return undefined
  const v = String(ip).replace(/^::ffff:/, '')
  if (net.isIPv4(v)) return v.replace(/\.\d+$/, '.0/24')
  if (net.isIPv6(v)) return v.split(':').slice(0, 3).join(':') + '::/48'
  return undefined
}

export async function createAudit(dataDir, { enabled = true, max = 5000, days = 90, ipMode = '' } = {}) {
  const file = path.join(dataDir, 'audit.log')
  const queue = serialize()
  let events = []
  if (enabled) {
    const text = await readFile(file, 'utf8').catch(() => '')
    for (const line of text.split('\n'))
      try {
        if (line) events.push(JSON.parse(line))
      } catch {
        /* a torn last line from a crash */
      }
  }
  let seq = events.reduce((n, e) => Math.max(n, e.id || 0), 0)

  // Drop what is past the caps; rewrites the file only when something was dropped.
  const prune = () =>
    queue(async () => {
      const cutoff = new Date(Date.now() - days * 86400_000).toISOString()
      const kept = events.filter((e) => e.at >= cutoff).slice(-max)
      if (kept.length === events.length) return
      events = kept
      await writeFile(file + '.tmp', events.map((e) => JSON.stringify(e) + '\n').join(''))
      await renameRetrying(file + '.tmp', file)
    })
  await prune()

  return {
    enabled,
    /** type like "auth.login.ok"; who: { uid, name }; extra fields are copied in as given. */
    log(type, fields = {}, ip) {
      if (!enabled) return
      const e = { id: ++seq, at: new Date().toISOString(), type, ...fields }
      const shown = maskIp(ip, ipMode)
      if (shown) e.ip = shown
      events.push(e)
      queue(() => appendFile(file, JSON.stringify(e) + '\n')).catch((err) => console.error('audit:', err.message))
      if (events.length > max + 200) prune()
    },
    /** Newest first. `uid` limits it to one person's own events. */
    list({ limit = 200, uid } = {}) {
      const out = []
      for (let i = events.length - 1; i >= 0 && out.length < limit; i--) if (!uid || events[i].uid === uid) out.push(events[i])
      return out
    },
    /** Empties the log, then records that it was cleared; ids keep counting so the gap shows. */
    async clear(by) {
      events = []
      await queue(() => writeFile(file, ''))
      this.log('admin.audit.clear', by)
    },
    /** Drops one person's events (account deletion), keeping the deletion itself. */
    async forget(uid) {
      events = events.filter((e) => e.uid !== uid)
      await queue(() => writeFile(file, events.map((e) => JSON.stringify(e) + '\n').join('')))
    },
  }
}
