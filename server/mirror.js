// The server on a disk that does not survive a restart (Render's free tier, say), with DATA_DIR
// kept in an S3-compatible bucket: Supabase Storage, Cloudflare R2, Backblaze B2...
// Ported from the same file in the openGym fork.
//
//   node server/mirror.js      instead of   node server/server.js
//
// Without MIRROR_ENDPOINT it just runs the server, so one Docker image serves both cases.
// With it: on start the bucket is copied into DATA_DIR, and nothing starts if that fails, since a
// server that started empty would upload an empty users.json over the real one. Then the server
// runs unchanged, and every 2 s the files that changed are uploaded and the ones removed are
// deleted. SIGTERM (a deploy, the host putting the service to sleep) runs one last pass first.
//
// ponytail: a write is confirmed to the client before it is uploaded, so a hard crash loses up to
// a couple of seconds of writes (a device pushes its copy again on its next sync; an account just
// created would be gone). One instance per bucket: two would overwrite each other. Give this app
// a bucket of its own: everything in the bucket is copied into DATA_DIR on start.
//
// Env: MIRROR_ENDPOINT (https://<project>.supabase.co/storage/v1/s3, or
// https://<account>.r2.cloudflarestorage.com), MIRROR_BUCKET, MIRROR_KEY_ID, MIRROR_SECRET,
// MIRROR_REGION (default "auto", which R2 wants; Supabase wants the project's region).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/** AWS Signature V4 headers for one S3 request. `url.pathname` must already be encoded. */
export function sign(method, url, body, { keyId, secret, region }, amz = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')) {
  const day = amz.slice(0, 8);
  const hash = sha(body);
  const qs = [...url.searchParams].map(([k, v]) => enc(k) + '=' + enc(v)).sort().join('&');
  const headers = { host: url.host, 'x-amz-content-sha256': hash, 'x-amz-date': amz };
  const names = Object.keys(headers).join(';');
  const canon = [method, url.pathname, qs, ...Object.entries(headers).map(([k, v]) => k + ':' + v), '', names, hash].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const key = ['s3', 'aws4_request'].reduce(hmac, hmac(hmac('AWS4' + secret, day), region));
  const sig = hmac(key, ['AWS4-HMAC-SHA256', amz, scope, sha(canon)].join('\n')).toString('hex');
  return {
    'x-amz-content-sha256': hash, 'x-amz-date': amz,
    authorization: `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${names}, Signature=${sig}`,
  };
}

const unxml = s => s.replace(/&(lt|gt|quot|apos|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[e]);

/** list / get / put / del against one bucket, path-style. */
export function bucket({ endpoint, bucket: name, keyId, secret, region = 'auto' }) {
  const creds = { keyId, secret, region };
  const base = endpoint.replace(/\/+$/, '') + '/' + enc(name);
  async function call(method, key, query, body = Buffer.alloc(0)) {
    const url = new URL(base + (key ? '/' + key.split('/').map(enc).join('/') : ''));
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
    const res = await fetch(url, {
      method, headers: sign(method, url, body, creds),
      body: method === 'PUT' ? body : undefined, signal: AbortSignal.timeout(60000),
    });
    if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
      throw new Error(`${method} ${key || name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    return res;
  }
  return {
    async list() {
      const keys = [];
      let token;
      do {
        const xml = await (await call('GET', '', { 'list-type': '2', ...(token && { 'continuation-token': token }) })).text();
        for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(unxml(m[1]));
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) && unxml(xml.match(/<NextContinuationToken>([^<]*)</)?.[1] || '');
      } while (token);
      return keys;
    },
    get: async key => Buffer.from(await (await call('GET', key)).arrayBuffer()),
    put: (key, body) => call('PUT', key, null, body),
    del: key => call('DELETE', key),
  };
}

// Half-written files (*.tmp, see writeJson in server.js) and .tmp folders never leave the disk.
const skip = rel => rel.endsWith('.tmp') || rel.split('/').includes('.tmp');

/** Every file under `dir` as relative path -> a signature that changes when the file does. */
export function scan(dir, base = dir, out = new Map()) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of entries) {
    const p = path.join(dir, d.name);
    const rel = path.relative(base, p).split(path.sep).join('/');
    if (skip(rel)) continue;
    if (d.isDirectory()) scan(p, base, out);
    else if (d.isFile()) {
      try { const st = fs.statSync(p); out.set(rel, `${st.size}:${st.mtimeMs}:${st.ino}`); } catch { /* gone meanwhile */ }
    }
  }
  return out;
}

/** The bucket into `dir`. Throws if any of it cannot be read. Returns what is now on disk. */
export async function restore(store, dir) {
  const keys = (await store.list()).filter(k => !skip(k));
  for (let i = 0; i < keys.length; i += 8) {
    await Promise.all(keys.slice(i, i + 8).map(async k => {
      const file = path.join(dir, ...k.split('/'));
      if (!file.startsWith(path.resolve(dir) + path.sep)) throw new Error(`refusing key outside DATA_DIR: ${k}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, await store.get(k), { mode: 0o600 });
    }));
  }
  return scan(dir);
}

/** Uploads what changed since `seen`, deletes what is gone, and updates `seen`. Never throws:
 *  a failed file stays out of `seen` and is tried again on the next pass. */
export async function pass(store, dir, seen) {
  const now = scan(dir);
  for (const [rel, sig] of now) {
    if (seen.get(rel) === sig) continue;
    try { await store.put(rel, fs.readFileSync(path.join(dir, rel))); seen.set(rel, sig); }
    catch (e) { console.error('mirror: upload failed,', e.message); }
  }
  for (const rel of [...seen.keys()]) {
    if (now.has(rel)) continue;
    try { await store.del(rel); seen.delete(rel); }
    catch (e) { console.error('mirror: delete failed,', e.message); }
  }
}

async function main() {
  const env = process.env;
  const { main: serve, dataDir } = await import('./server.js');
  if (!env.MIRROR_ENDPOINT) return serve();
  if (!env.MIRROR_BUCKET || !env.MIRROR_KEY_ID || !env.MIRROR_SECRET) {
    console.error('mirror: MIRROR_ENDPOINT is set, so MIRROR_BUCKET, MIRROR_KEY_ID and MIRROR_SECRET are needed too');
    process.exit(1);
  }
  const dir = dataDir();
  const store = bucket({
    endpoint: env.MIRROR_ENDPOINT, bucket: env.MIRROR_BUCKET,
    keyId: env.MIRROR_KEY_ID, secret: env.MIRROR_SECRET, region: env.MIRROR_REGION || 'auto',
  });
  fs.mkdirSync(dir, { recursive: true });
  let seen;
  try { seen = await restore(store, dir); }
  catch (e) { console.error('mirror: cannot read the bucket, not starting:', e.message); process.exit(1); }
  console.log(`mirror: ${seen.size} files restored from ${env.MIRROR_BUCKET}`);

  let chain = Promise.resolve(), busy = false;
  const tick = () => (chain = chain.then(() => pass(store, dir, seen)));
  const timer = setInterval(() => { if (!busy) { busy = true; tick().finally(() => { busy = false; }); } }, 2000);
  const stop = async () => { clearInterval(timer); await tick(); process.exit(0); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  await serve();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
