import { createRelayTaskToken, relayTaskTokenHash } from '@aiao-media/api-contracts';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { startNodeServer } from './node-server.ts';

test('HTTP 桥接保留任务响应，优雅退出等待长轮询后才关闭数据库', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-node-http-'));
  await mkdir(join(directory, 'tasks'));
  const id = crypto.randomUUID();
  const token = createRelayTaskToken();
  const db = new DatabaseSync(join(directory, 'tasks', `${id}.sqlite`));
  db.exec(
    'CREATE TABLE relay_task (task_id TEXT PRIMARY KEY, token_hash TEXT, fingerprint TEXT, status TEXT, upstream_status INTEGER, created_at INTEGER, updated_at INTEGER)'
  );
  db.prepare('INSERT INTO relay_task VALUES (?,?,?,?,NULL,?,?)').run(
    id,
    await relayTaskTokenHash(token),
    'fingerprint',
    'dispatched',
    Date.now(),
    Date.now()
  );
  db.exec('CREATE TABLE relay_alarm (id INTEGER PRIMARY KEY, at INTEGER)');
  db.prepare('INSERT INTO relay_alarm VALUES (1,?)').run(Date.now() + 210_000);
  db.close();
  const app = await startNodeServer({
    MEDIA_DATA_DIRECTORY: directory,
    MEDIA_PUBLIC_ORIGIN: 'https://media.example.test',
    PORT: '0'
  });
  try {
    if (!app.server.listening) await once(app.server, 'listening');
    const address = app.server.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    assert.deepEqual(await (await fetch(`${origin}/api/health`)).json(), { ok: true });
    assert.equal((await fetch(`${origin}/api/admin/session`)).status, 401);
    const incoming = once(app.server, 'request');
    const waiting = fetch(`${origin}/api/relay/tasks/${id}?wait=1`, { headers: { 'x-relay-task-token': token } });
    await incoming;
    await app.close();
    const response = await waiting;
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as { status: string }).status, 'dispatched');
  } finally {
    if (app.server.listening) await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('自托管首次安装持久化配置，服务重启后只能登录且公开地址不泄露内部 Supabase 地址', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-node-installation-'));
  const origin = 'https://media.example.test';
  const actor = crypto.randomUUID();
  const actualFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const target = new URL(url instanceof Request ? url.url : url);
    if (target.origin !== 'https://supabase.example.test') return actualFetch(url, init);
    const path = target.pathname;
    if (path.endsWith('/settings')) return Response.json({});
    if (path.endsWith('/media_installation_state')) return Response.json([]);
    if (path.endsWith('/media_admin_memberships')) return Response.json([]);
    if (path.endsWith('/admin/users') || path.endsWith('/user')) return Response.json({ id: actor });
    if (path.endsWith('/token'))
      return Response.json({ access_token: 'session-token', expires_in: 3600, user: { id: actor } });
    if (path.endsWith('/media_bootstrap_admin')) return Response.json(actor);
    if (path.endsWith('/media_admin_authorized')) return Response.json(true);
    throw new Error('Unexpected upstream request');
  });
  const environment = {
    MEDIA_DATA_DIRECTORY: directory,
    MEDIA_PUBLIC_ORIGIN: origin,
    PORT: '0',
    MEDIA_SUPABASE_URL: 'https://supabase.example.test',
    MEDIA_SUPABASE_ANON_KEY: 'sb_publishable_fixture',
    MEDIA_SUPABASE_SERVICE_ROLE_KEY: 'private-service-key',
    MEDIA_INSTALLATION_BOOTSTRAP_SECRET: 'bootstrap-secret-fixture-32-chars!!'
  };
  let app = await startNodeServer(environment);
  const address = async () => {
    if (!app.server.listening) await once(app.server, 'listening');
    const current = app.server.address();
    assert.ok(current && typeof current !== 'string');
    return `http://127.0.0.1:${current.port}`;
  };
  const setup = (base: string) =>
    actualFetch(`${base}/api/installation`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@example.test',
        password: 'a-long-owner-password',
        bootstrapSecret: environment.MEDIA_INSTALLATION_BOOTSTRAP_SECRET
      })
    });
  try {
    assert.equal(
      ((await (await actualFetch(`${await address()}/api/installation`)).json()) as { initialized: boolean })
        .initialized,
      false
    );
    assert.equal((await setup(await address())).status, 200);
    await app.close();
    app = await startNodeServer(environment);
    const base = await address();
    const state = (await (await actualFetch(`${base}/api/installation`)).json()) as {
      initialized: boolean;
      auth: { url: string };
    };
    assert.equal(state.initialized, true);
    assert.equal(state.auth.url, origin);
    assert.equal((await setup(base)).status, 409);
    const login = await actualFetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.test', password: 'a-long-owner-password' })
    });
    assert.equal(login.status, 200);
    assert.equal((await stat(join(directory, 'installation.sqlite'))).mode & 0o777, 0o600);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
