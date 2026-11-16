/* mirror.js keeps DATA_DIR in an S3 bucket for hosts whose disk is wiped on restart. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { sign, bucket, restore, pass } from './mirror.js';

test('sign: matches the GET Bucket example in the AWS Signature V4 docs', () => {
  const h = sign('GET', new URL('https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J'), Buffer.alloc(0),
    { keyId: 'AKIAIOSFODNN7EXAMPLE', secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1' },
    '20130524T000000Z');
  assert.equal(h.authorization, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, '
    + 'SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7');
});

// A bucket that keeps objects in a Map and lists them two at a time, so pagination is exercised.
function fakeS3() {
  const objects = new Map();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    assert.match(req.headers.authorization, /^AWS4-HMAC-SHA256 /);
    const key = decodeURIComponent(url.pathname.replace(/^\/b\/?/, ''));
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (req.method === 'GET' && !key) {
      const all = [...objects.keys()].filter(k => k.startsWith(url.searchParams.get('prefix') || '')).sort();
      const from = +(url.searchParams.get('continuation-token') || 0);
      const page = all.slice(from, from + 2);
      const more = from + 2 < all.length;
      res.end(`<ListBucketResult>${page.map(k => `<Contents><Key>${k.replace(/&/g, '&amp;')}</Key></Contents>`).join('')}`
        + `<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${from + 2}</NextContinuationToken>` : ''}</ListBucketResult>`);
    } else if (req.method === 'GET') {
      if (!objects.has(key)) { res.statusCode = 404; return res.end(); }
      res.end(objects.get(key));
    } else if (req.method === 'PUT') { objects.set(key, Buffer.concat(chunks)); res.end(); }
    else if (req.method === 'DELETE') { objects.delete(key); res.statusCode = 204; res.end(); }
  });
  return new Promise(r => server.listen(0, () => r({ server, objects, endpoint: `http://127.0.0.1:${server.address().port}` })));
}

test('restore, then upload changes and deletions, skipping temporary files', async t => {
  const { server, objects, endpoint } = await fakeS3();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-'));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  objects.set('users.json', Buffer.from('{}'));
  objects.set('sessions.json', Buffer.from('{}'));
  objects.set('state-u1.json', Buffer.from('{"_rev":1}'));
  objects.set('uploads/u1/a&b.jpg', Buffer.from([1, 2, 3]));
  const store = bucket({ endpoint, bucket: 'b', keyId: 'k', secret: 's' });

  const seen = await restore(store, dir);
  assert.equal(seen.size, 4);
  assert.equal(fs.readFileSync(path.join(dir, 'state-u1.json'), 'utf8'), '{"_rev":1}');
  assert.deepEqual([...fs.readFileSync(path.join(dir, 'uploads/u1/a&b.jpg'))], [1, 2, 3]);

  await pass(store, dir, seen);   // nothing changed: nothing sent
  fs.writeFileSync(path.join(dir, 'state-u1.json.tmp'), 'half');
  fs.mkdirSync(path.join(dir, 'uploads/u1/.tmp'));
  fs.writeFileSync(path.join(dir, 'uploads/u1/.tmp/x'), 'in flight');
  fs.writeFileSync(path.join(dir, 'state-u1.json'), '{"_rev":2}');
  fs.writeFileSync(path.join(dir, 'state-u2.json'), '{"_rev":1}');
  fs.unlinkSync(path.join(dir, 'sessions.json'));
  await pass(store, dir, seen);

  assert.equal(objects.get('state-u1.json').toString(), '{"_rev":2}');
  assert.equal(objects.get('state-u2.json').toString(), '{"_rev":1}');
  assert.ok(!objects.has('sessions.json'));
  assert.ok(![...objects.keys()].some(k => k.includes('.tmp')));
});

test('restore throws when the bucket cannot be read, so the server never starts empty', async () => {
  const store = bucket({ endpoint: 'http://127.0.0.1:1', bucket: 'b', keyId: 'k', secret: 's' });
  await assert.rejects(restore(store, os.tmpdir()));
});

test('a prefix keeps this app in its own folder of a shared bucket', async t => {
  const { server, objects, endpoint } = await fakeS3();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-'));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  objects.set('db.json', Buffer.from('openGym'));          // another app's files at the top
  objects.set('secret', Buffer.from('openGym secret'));
  objects.set('thally/db.json', Buffer.from('{}'));
  const store = bucket({ endpoint, bucket: 'b', keyId: 'k', secret: 's', prefix: 'thally' });
  const seen = await restore(store, dir);
  assert.deepEqual([...seen.keys()], ['db.json']);
  assert.equal(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'), '{}');
  fs.writeFileSync(path.join(dir, 'secret'), 'thally secret');
  fs.unlinkSync(path.join(dir, 'db.json'));
  await pass(store, dir, seen);
  assert.equal(objects.get('secret').toString(), 'openGym secret');  // untouched
  assert.equal(objects.get('db.json').toString(), 'openGym');
  assert.equal(objects.get('thally/secret').toString(), 'thally secret');
  assert.ok(!objects.has('thally/db.json'));
});
