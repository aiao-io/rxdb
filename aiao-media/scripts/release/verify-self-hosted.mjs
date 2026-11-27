import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

process.umask(0o077);
const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, 'tmp/self-hosted');
const env = parseEnv(await readFile(resolve(directory, '.env'), 'utf8'));
const origin = `https://${env.MEDIA_PUBLIC_HOST}`;
const phase = process.env.AIAO_VERIFY_PHASE;
assert.ok(['before-restart', 'after-restart'].includes(phase), 'Set AIAO_VERIFY_PHASE explicitly.');
const digest = value => createHash('sha256').update(value).digest('hex');
const stateFile = resolve(directory, 'verification-state.json');
const adminFile = resolve(directory, 'initial-admin.json');
const service = env.SERVICE_ROLE_KEY;
const anon = env.ANON_KEY;

async function call(path, { token = anon, method = 'GET', json, body, headers = {} } = {}) {
  return fetch(`${origin}${path}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
    headers: {
      apikey: anon,
      authorization: `Bearer ${token}`,
      ...(json ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    body: json ? JSON.stringify(json) : body
  });
}
async function data(path, options) {
  const response = await call(path, options);
  assert.ok(response.ok, `${options?.method ?? 'GET'} ${path.split('?')[0]}: HTTP ${response.status}`);
  return response.json();
}
async function createUser(email, password) {
  return data('/auth/v1/admin/users', {
    token: service,
    method: 'POST',
    json: { email, password, email_confirm: true }
  });
}
async function login(user) {
  const session = await data('/auth/v1/token?grant_type=password', {
    method: 'POST',
    json: { email: user.email, password: user.password }
  });
  return session.access_token;
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1kAAAAASUVORK5CYII=',
  'base64'
);
const jpeg = await readFile(resolve(root, 'apps/web/public/image-examples/ceramic.jpg'));
const large = Buffer.alloc(6 * 1024 * 1024 + 1);
png.copy(large);
const fixtures = [
  { bytes: png, mime: 'image/png', extension: 'png' },
  { bytes: jpeg, mime: 'image/jpeg', extension: 'jpg' },
  { bytes: large, mime: 'image/png', extension: 'png', tus: true }
];

let state;
if (phase === 'before-restart') {
  let admin;
  try {
    admin = JSON.parse(await readFile(adminFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    admin = { origin, email: 'admin@aiao.local', password: randomBytes(24).toString('base64url') };
    const user = await createUser(admin.email, admin.password);
    admin.id = user.id;
    await writeFile(adminFile, JSON.stringify(admin, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  assert.equal(admin.origin, origin);
  const adminToken = await login(admin);
  const memberships = await data(`/rest/v1/media_admin_memberships?user_id=eq.${admin.id}`, { token: service });
  if (!memberships.length)
    await data('/rest/v1/rpc/media_trusted_membership', {
      token: service,
      method: 'POST',
      json: { p_target: admin.id, p_enabled: true, p_revision: 0, p_request_id: randomUUID() }
    });
  assert.equal((await call('/api/admin/users', { token: adminToken })).status, 200);
  console.log('PASS initial administrator login and protected API');
  state = { origin, users: [], files: [] };
  for (let i = 0; i < 2; i++) {
    const credentials = {
      email: `deployment-${randomUUID()}@example.invalid`,
      password: randomBytes(24).toString('base64url')
    };
    const user = await createUser(credentials.email, credentials.password);
    state.users.push({ ...credentials, id: user.id });
    await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
  }
} else {
  state = JSON.parse(await readFile(stateFile, 'utf8'));
  assert.equal(state.origin, origin);
}
if (phase === 'before-restart' && !state.relay) {
  state.relay = { id: randomUUID(), token: randomBytes(32).toString('base64url') };
  await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
}
assert.ok(state.relay, 'Verification relay must exist before restarting.');
const relayPath = `/api/relay/tasks/${state.relay.id}`;
const relayHeaders = { origin, 'x-relay-task-token': state.relay.token };
if (phase === 'before-restart')
  assert.equal((await call(`${relayPath}/abandon`, { method: 'POST', headers: relayHeaders })).status, 404);
assert.equal((await call(relayPath, { headers: relayHeaders })).status, 404);
assert.equal(
  (
    await call(relayPath, {
      method: 'PUT',
      token: 'unused-test-provider-key',
      headers: { ...relayHeaders, 'x-provider-base': 'https://api.minimax.cn/v1' },
      json: { model: 'image-01', prompt: 'sealed deployment test', n: 1, size: '1024x1024' }
    })
  ).status,
  409
);
console.log(`PASS sealed relay replay cannot dispatch${phase === 'after-restart' ? ' after restart' : ''}`);
const tokens = await Promise.all(state.users.map(login));
const workspace = await data('/rest/v1/rpc/media_ensure_workspace', {
  token: tokens[0],
  method: 'POST',
  json: { p_request_id: randomUUID() }
});
assert.ok(workspace.id);
const otherWorkspaces = await data(`/rest/v1/media_workspaces?id=eq.${workspace.id}`, { token: tokens[1] });
assert.deepEqual(otherWorkspaces, []);
assert.ok(!(await call('/api/admin/users', { token: tokens[1] })).ok);
assert.ok(!(await call('/rest/v1/media_workspaces')).ok);
const signup = await call('/auth/v1/signup', {
  method: 'POST',
  json: { email: `signup-${randomUUID()}@example.invalid`, password: randomBytes(24).toString('base64url') }
});
assert.equal(signup.status, 422);
assert.equal((await signup.json()).error_code, 'signup_disabled');
console.log('PASS two-account workspace isolation, ordinary-user admin denial, disabled public signup');

for (const fixture of fixtures) {
  const hash = digest(fixture.bytes);
  const path = `${state.users[0].id}/${workspace.id}/${hash}.${fixture.extension}`;
  const upload = `/storage/v1/object/aiao-media-images/${path}`;
  const download = `/storage/v1/object/authenticated/aiao-media-images/${path}`;
  if (phase === 'before-restart') {
    if (fixture.tus) {
      const created = await call('/storage/v1/upload/resumable', {
        method: 'POST',
        token: tokens[0],
        headers: {
          'tus-resumable': '1.0.0',
          'upload-length': String(fixture.bytes.length),
          'upload-metadata': `bucketName ${Buffer.from('aiao-media-images').toString('base64')},objectName ${Buffer.from(path).toString('base64')},contentType ${Buffer.from(fixture.mime).toString('base64')}`
        }
      });
      assert.equal(created.status, 201, 'TUS creation');
      const location = new URL(created.headers.get('location'));
      assert.equal(location.origin, origin, 'TUS public origin');
      assert.ok(location.pathname.startsWith('/storage/v1/upload/resumable/'), 'TUS public route');
      for (let offset = 0; offset < fixture.bytes.length; offset += 6 * 1024 * 1024) {
        const result = await call(location.pathname + location.search, {
          method: 'PATCH',
          token: tokens[0],
          headers: {
            'tus-resumable': '1.0.0',
            'upload-offset': String(offset),
            'content-type': 'application/offset+octet-stream'
          },
          body: fixture.bytes.subarray(offset, offset + 6 * 1024 * 1024)
        });
        assert.equal(result.status, 204, 'TUS chunk');
      }
    } else {
      const result = await call(upload, {
        method: 'POST',
        token: tokens[0],
        headers: { 'content-type': fixture.mime },
        body: fixture.bytes
      });
      assert.ok(result.ok, `Storage upload HTTP ${result.status}`);
    }
    state.files.push(path);
    await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
  }
  const result = await call(download, { token: tokens[0] });
  assert.equal(result.status, 200);
  assert.equal(digest(Buffer.from(await result.arrayBuffer())), hash);
  for (const token of [tokens[1], anon]) assert.ok(!(await call(download, { token })).ok, 'private object isolation');
  const forbidden = await call(
    `/storage/v1/object/aiao-media-images/${state.users[0].id}/${workspace.id}/forbidden.png`,
    { token: tokens[1], method: 'POST', headers: { 'content-type': 'image/png' }, body: png }
  );
  assert.ok(!forbidden.ok, 'cross-account upload denied');
  console.log(
    `PASS ${fixture.tus ? 'TUS 6MiB+' : fixture.mime} exact SHA-256, anonymous/cross-account denial${phase === 'after-restart' ? ', restart persistence' : ''}`
  );
}
if (phase === 'after-restart') {
  for (const path of state.files)
    assert.ok((await call(`/storage/v1/object/aiao-media-images/${path}`, { method: 'DELETE', token: tokens[0] })).ok);
  for (const user of state.users)
    assert.ok((await call(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE', token: service })).ok);
  await rm(stateFile);
  console.log('PASS verification accounts and objects cleaned; initial administrator retained');
}
console.log(`Self-hosted ${phase} verification completed over publicly trusted HTTPS.`);
