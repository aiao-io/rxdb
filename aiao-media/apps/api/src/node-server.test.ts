import { createRelayTaskToken, relayTaskTokenHash } from '@aiao-media/api-contracts';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
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
