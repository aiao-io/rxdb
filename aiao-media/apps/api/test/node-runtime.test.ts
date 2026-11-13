import { createRelayTaskToken, openRelayResult, relayResultKey, relayTaskTokenHash } from '@aiao-media/api-contracts';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { platformFixture } from '../scripts/fixtures/platform-fixture.ts';
import worker from '../src/local-first-worker.ts';
import { NodeRelayRuntime } from '../src/node-runtime.ts';
import type { WorkerRequest } from '../src/worker-env.ts';

const origin = 'https://47.103.117.118';
const provider = 'https://provider.example.test/v1';
const body = { model: 'standard', prompt: 'private prompt', n: 1, size: '1024x1024' };

async function fixture(
  context: TestContext,
  request: WorkerRequest = async () => Response.json({ data: [{ b64_json: 'image-secret' }] })
) {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-node-runtime-'));
  const platform = platformFixture();
  context.mock.method(globalThis, 'fetch', platform.backendFetch);
  const runtime = new NodeRelayRuntime({ directory, request, env: platform.env });
  await runtime.start();
  const id = crypto.randomUUID();
  const token = createRelayTaskToken();
  const env = { ...platform.env, ...runtime.bindings(), ALLOWED_PROVIDER_BASE_URLS: JSON.stringify([provider]) };
  const send = (method: string, suffix = '', taskId = id, taskToken = token) =>
    worker.fetch(
      new Request(`${origin}/api/relay/tasks/${taskId}${suffix}`, {
        method,
        headers: {
          origin,
          authorization: 'Bearer fixture-session',
          'content-type': 'application/json',
          'x-provider-base': provider,
          'x-relay-task-token': taskToken
        },
        ...(method === 'PUT' ? { body: JSON.stringify(body) } : {})
      }),
      env
    );
  return {
    directory,
    platform,
    runtime,
    id,
    token,
    env,
    send,
    async dispose() {
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    }
  };
}

test('国内任务持久化密文与状态，重启后可取回，同标识重放不再调用上游', async context => {
  let calls = 0;
  const t = await fixture(context, async () => {
    calls++;
    return Response.json({ data: [{ b64_json: 'image-secret' }] });
  });
  try {
    assert.equal((await t.send('PUT')).status, 202);
    await t.runtime.settled();
    assert.equal(((await (await t.send('GET')).json()) as { status: string }).status, 'received');
    await t.send('PUT');
    assert.equal(calls, 1);
    await t.runtime.close();
    const restarted = new NodeRelayRuntime({
      directory: t.directory,
      env: t.platform.env,
      request: async () => {
        throw new Error('must not retry');
      }
    });
    await restarted.start();
    try {
      const response = await worker.fetch(
        new Request(`${origin}/api/relay/tasks/${t.id}/result`, {
          headers: { 'x-relay-task-token': t.token }
        }),
        restarted.bindings()
      );
      assert.equal(response.status, 200);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const plain = await openRelayResult(await relayResultKey(t.token, t.id, 'decrypt'), bytes);
      assert.equal(JSON.parse(new TextDecoder().decode(plain)).data[0].b64_json, 'image-secret');
      const stored = Buffer.concat(
        await Promise.all([
          readFile(join(t.directory, 'tasks', `${t.id}.sqlite`)),
          readFile(join(t.directory, 'results', `${t.id}.bin`))
        ])
      ).toString('latin1');
      for (const secret of ['fixture-model-private', 'fixture-session', 'private prompt', 'image-secret', t.token])
        assert.ok(!stored.includes(secret));
    } finally {
      await restarted.close();
    }
  } finally {
    await t.dispose();
  }
});

test('启动恢复逾期在途任务为待核对，不重新调用供应商', async context => {
  const t = await fixture(context);
  try {
    await t.runtime.close();
    const db = new DatabaseSync(join(t.directory, 'tasks', `${t.id}.sqlite`));
    db.exec(
      'CREATE TABLE relay_task (task_id TEXT PRIMARY KEY, token_hash TEXT, fingerprint TEXT, status TEXT, upstream_status INTEGER, created_at INTEGER, updated_at INTEGER)'
    );
    db.prepare('INSERT INTO relay_task VALUES (?,?,?, ?,NULL,?,?)').run(
      t.id,
      await relayTaskTokenHash(t.token),
      'fingerprint',
      'dispatched',
      Date.now() - 220_000,
      Date.now()
    );
    db.exec('CREATE TABLE relay_alarm (id INTEGER PRIMARY KEY, at INTEGER)');
    db.prepare('INSERT INTO relay_alarm VALUES (1,?)').run(Date.now() - 1);
    db.close();
    const restarted = new NodeRelayRuntime({
      directory: t.directory,
      env: t.platform.env,
      request: async () => {
        throw new Error('must not retry');
      }
    });
    await restarted.start();
    try {
      const response = await worker.fetch(
        new Request(`${origin}/api/relay/tasks/${t.id}`, { headers: { 'x-relay-task-token': t.token } }),
        restarted.bindings()
      );
      assert.equal(((await response.json()) as { status: string }).status, 'needs_review');
    } finally {
      await restarted.close();
    }
  } finally {
    await t.dispose();
  }
});

test('未存在任务的读取不创建数据库，第二个进程不能共享同一任务目录', async context => {
  const t = await fixture(context);
  try {
    assert.equal((await t.send('GET')).status, 404);
    assert.deepEqual(await readdir(join(t.directory, 'tasks')), []);
    const second = new NodeRelayRuntime({ directory: t.directory });
    await assert.rejects(second.start(), /locked/);
    await second.close();
  } finally {
    await t.dispose();
  }
});

test('容量在派发前限制，删除后封存阻止重发，错误令牌不能读取', async context => {
  const finishes: ((response: Response) => void)[] = [];
  const t = await fixture(
    context,
    () =>
      new Promise<Response>(resolve => {
        finishes.push(resolve);
      })
  );
  try {
    assert.equal((await t.send('PUT')).status, 202);
    assert.equal((await t.send('PUT', '', crypto.randomUUID())).status, 202);
    assert.equal((await t.send('PUT', '', crypto.randomUUID())).status, 429);
    assert.equal((await t.send('GET', '', t.id, createRelayTaskToken())).status, 404);
    for (const finish of finishes.splice(0)) finish(Response.json({ data: [] }));
    await t.runtime.settled();
    assert.equal((await t.send('DELETE')).status, 204);
    assert.equal((await t.send('PUT')).status, 409);
  } finally {
    for (const finish of finishes) finish(Response.json({ data: [] }));
    await t.dispose();
  }
});

test('重启清理写入中断的临时文件及逾期密文，磁盘预算不足时不派发', async context => {
  const t = await fixture(context);
  try {
    assert.equal((await t.send('PUT')).status, 202);
    await t.runtime.settled();
    await t.runtime.close();
    const db = new DatabaseSync(join(t.directory, 'tasks', `${t.id}.sqlite`));
    db.prepare('UPDATE relay_task SET created_at=?').run(Date.now() - 25 * 60 * 60 * 1000);
    db.prepare('UPDATE relay_alarm SET at=?').run(Date.now() - 1);
    db.close();
    await writeFile(join(t.directory, 'results', `${t.id}.${crypto.randomUUID()}.pending`), 'encrypted-partial');
    const restarted = new NodeRelayRuntime({
      directory: t.directory,
      env: t.platform.env,
      maxResultBytes: 0,
      request: async () => {
        throw new Error('must not dispatch');
      }
    });
    await restarted.start();
    try {
      assert.deepEqual(await readdir(join(t.directory, 'results')), []);
      assert.deepEqual(await readdir(join(t.directory, 'tasks')), []);
      assert.equal(
        (await restarted.fetch(crypto.randomUUID(), new Request('https://relay-task.internal/', { method: 'PUT' })))
          .status,
        429
      );
    } finally {
      await restarted.close();
    }
  } finally {
    await t.dispose();
  }
});
