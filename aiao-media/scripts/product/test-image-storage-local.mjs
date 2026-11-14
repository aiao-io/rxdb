import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { storageAcceptanceEnvironment } from '../supabase/storage-acceptance-environment.mjs';

process.umask(0o077);
const root = resolve(import.meta.dirname, '../..');
const bundled = await build({
  entryPoints: [resolve(import.meta.dirname, 'image-storage-browser.mjs')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser'
});
function pngChunk(type, bytes) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, bytes])));
  return Buffer.concat([size, name, bytes, checksum]);
}
const dimensions = Buffer.alloc(13);
dimensions.writeUInt32BE(1536, 0);
dimensions.writeUInt32BE(1536, 4);
dimensions[8] = 8;
dimensions[9] = 2;
const pixels = randomBytes((1536 * 3 + 1) * 1536);
for (let row = 0; row < 1536; row++) pixels[row * (1536 * 3 + 1)] = 0;
const large = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', dimensions),
  pngChunk('IDAT', deflateSync(pixels)),
  pngChunk('IEND', Buffer.alloc(0))
]);
assert.ok(large.length > 6 * 1024 * 1024 && large.length < 16 * 1024 * 1024);
const jpeg = await readFile(resolve(root, 'apps/web/public/image-examples/ceramic.jpg'));
const fixtures = { 'large.png': { bytes: large, mime: 'image/png' }, 'small.jpg': { bytes: jpeg, mime: 'image/jpeg' } };
const server = createServer((request, response) => {
  if (request.url === '/browser.js') {
    response.writeHead(200, { 'content-type': 'application/javascript' }).end(bundled.outputFiles[0].contents);
    return;
  }
  const fixture = fixtures[request.url?.replace('/fixtures/', '')];
  if (fixture) {
    response.writeHead(200, { 'content-type': fixture.mime }).end(fixture.bytes);
    return;
  }
  response
    .writeHead(200, { 'content-type': 'text/html' })
    .end('<!doctype html><script type="module" src="/browser.js"></script>');
});
await new Promise((done, fail) => server.once('error', fail).listen(0, '127.0.0.1', done));
const browserOrigin = `http://127.0.0.1:${server.address().port}`;
const environment = await storageAcceptanceEnvironment(browserOrigin);
let browser;
const evidence = {
  version: 1,
  startedAt: new Date().toISOString(),
  layer: 'local-real-storage-browser-transport',
  checks: []
};
try {
  await environment.start();
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(environment.url, environment.env.SERVICE_ROLE_KEY, options);
  const users = [];
  for (let i = 0; i < 2; i++) {
    const credentials = { email: `storage-${randomUUID()}@example.test`, password: randomBytes(24).toString('hex') };
    const created = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
    assert.equal(created.error, null);
    const client = createClient(environment.url, environment.env.ANON_KEY, options);
    const signed = await client.auth.signInWithPassword(credentials);
    assert.equal(signed.error, null);
    const workspace = await client.rpc('media_ensure_workspace', { p_request_id: randomUUID() });
    assert.equal(workspace.error, null);
    users.push({ userId: signed.data.user.id, session: signed.data.session, workspaceId: workspace.data.id, client });
  }
  const settings = {
    url: environment.url,
    anonKey: environment.env.ANON_KEY,
    userId: users[0].userId,
    session: users[0].session,
    workspaceId: users[0].workspaceId
  };
  browser = await chromium.launch({ channel: process.env.AIAO_PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage();
  await page.goto(browserOrigin);
  await page.waitForFunction(() => typeof globalThis.imageStorageAcceptance === 'function');
  const sourceId = randomUUID();
  const first = await page.evaluate(input => globalThis.imageStorageAcceptance(input), {
    ...settings,
    sourceId,
    fixture: 'large.png',
    interrupt: 'chunk'
  });
  assert.equal(first.error, 'ACCEPTANCE_CHUNK_ACK_LOST', JSON.stringify(first));
  const firstChunk = first.calls.filter(call => call.method === 'PATCH' && call.path.includes('/upload/resumable/'));
  assert.equal(firstChunk.length, 1);
  evidence.checks.push('first 6 MiB reaches real private Storage before the response is lost');
  await environment.restartStorage();
  await page.reload();
  await page.waitForFunction(() => typeof globalThis.imageStorageAcceptance === 'function');
  const resumed = await page.evaluate(input => globalThis.imageStorageAcceptance(input), {
    ...settings,
    sourceId,
    fixture: 'large.png'
  });
  assert.equal(resumed.error, undefined, JSON.stringify(resumed));
  assert.ok(resumed.calls.some(call => call.method === 'HEAD' && call.path.includes('/upload/resumable/')));
  assert.deepEqual(
    resumed.calls
      .filter(call => call.method === 'PATCH' && call.path.includes('/upload/resumable/'))
      .map(call => call.offset),
    [String(6 * 1024 * 1024)]
  );
  assert.equal(
    resumed.calls.filter(call => call.method === 'POST' && call.path.endsWith('/upload/resumable')).length,
    0
  );
  const hash = createHash('sha256').update(large).digest('hex');
  assert.equal(resumed.record.status, 'uploaded');
  assert.equal(resumed.record.sha256, hash);
  assert.deepEqual(resumed.saved, { jobId: sourceId, digest: hash, bytes: large.length, width: 1536, height: 1536 });
  evidence.checks.push(
    'page reload and Storage restart resume the same TUS session at 6 MiB; downloaded PNG SHA-256 matches'
  );
  const jpg = await page.evaluate(input => globalThis.imageStorageAcceptance(input), {
    ...settings,
    sourceId: randomUUID(),
    fixture: 'small.jpg'
  });
  assert.equal(jpg.error, undefined, JSON.stringify(jpg));
  assert.equal(jpg.saved.digest, createHash('sha256').update(jpeg).digest('hex'));
  evidence.checks.push(
    'JPEG private upload, file-record commit and product-controller download preserve original bytes'
  );
  for (const [interrupt, expected] of [
    ['object', 'ACCEPTANCE_OBJECT_ACK_LOST'],
    ['record', 'ACCEPTANCE_RECORD_ACK_LOST']
  ]) {
    const source = randomUUID();
    const interrupted = await page.evaluate(input => globalThis.imageStorageAcceptance(input), {
      ...settings,
      sourceId: source,
      fixture: 'small.jpg',
      interrupt
    });
    assert.equal(interrupted.error, expected, JSON.stringify(interrupted));
    await page.reload();
    await page.waitForFunction(() => typeof globalThis.imageStorageAcceptance === 'function');
    const restored = await page.evaluate(input => globalThis.imageStorageAcceptance(input), {
      ...settings,
      sourceId: source,
      fixture: 'small.jpg'
    });
    assert.equal(restored.error, undefined, JSON.stringify(restored));
    assert.equal(restored.saved.digest, createHash('sha256').update(jpeg).digest('hex'));
    const rows = await users[0].client.from('media_file_records').select('*').eq('sourceId', source);
    assert.equal(rows.error, null);
    assert.equal(rows.data.length, 1);
    assert.equal(rows.data[0].status, 'uploaded');
    evidence.checks.push(
      `${interrupt} acknowledgement loss recovers the same immutable object and single file association`
    );
  }
  const path = resumed.record.path;
  for (const token of [users[1].session.access_token, environment.env.ANON_KEY]) {
    const denied = await fetch(`${environment.url}/storage/v1/object/authenticated/aiao-media-images/${path}`, {
      headers: { apikey: environment.env.ANON_KEY, authorization: `Bearer ${token}` }
    });
    assert.equal(denied.ok, false, 'private original must reject other accounts and anonymous sessions');
  }
  const other = await users[1].client.from('media_file_records').select('*').eq('id', resumed.record.id);
  assert.equal(other.error, null);
  assert.deepEqual(other.data, []);
  const foreign = {
    apikey: environment.env.ANON_KEY,
    authorization: `Bearer ${users[1].session.access_token}`,
    'content-type': 'image/jpeg',
    'x-upsert': 'true'
  };
  const overwrite = await fetch(`${environment.url}/storage/v1/object/aiao-media-images/${path}`, {
    method: 'POST',
    headers: foreign,
    body: jpeg
  });
  assert.equal(overwrite.ok, false, 'another account cannot overwrite the private original');
  const removed = await users[1].client.storage.from('aiao-media-images').remove([path]);
  if (!removed.error) assert.deepEqual(removed.data, [], 'another account cannot delete the private original');
  const unchanged = await users[0].client.storage.from('aiao-media-images').download(path);
  assert.equal(unchanged.error, null);
  assert.equal(
    createHash('sha256')
      .update(Buffer.from(await unchanged.data.arrayBuffer()))
      .digest('hex'),
    hash
  );
  const publicRead = await fetch(`${environment.url}/storage/v1/object/public/aiao-media-images/${path}`);
  assert.equal(publicRead.ok, false, 'the originals bucket must stay private');
  evidence.checks.push(
    'anonymous/public and second-account reads are denied; foreign overwrite/deletion leave the original SHA-256 unchanged'
  );
  evidence.passed = true;
  evidence.original = { bytes: large.length, sha256: hash, width: 1536, height: 1536 };
  console.log(
    'PASS real Storage PNG/JPEG, lost chunk receipt, browser reload, service restart, exact resume, file association and private isolation.'
  );
} catch (error) {
  evidence.passed = false;
  evidence.error = error.message;
  throw error;
} finally {
  evidence.finishedAt = new Date().toISOString();
  await writeFile(resolve(environment.directory, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', {
    mode: 0o600
  });
  await browser?.close();
  await new Promise(done => server.close(done));
  await environment.close();
  console.log(`Storage acceptance evidence: ${resolve(environment.directory, 'evidence.json')}`);
}
