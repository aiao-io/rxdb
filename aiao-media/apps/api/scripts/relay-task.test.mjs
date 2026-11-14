import { createRelayTaskToken, openRelayResult, relayResultKey } from '@aiao-media/api-contracts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/local-first-worker.ts';
import { RelayTask } from '../src/relay-task.ts';
import { durableObjectNamespace, r2Bucket } from './cloudflare-stand-ins.mjs';
import { fixtureModel, platformFixture } from './fixtures/platform-fixture.ts';

const origin = 'https://app.example.test';
const evil = 'https://evil.example.test';
const provider = 'https://provider.example.test/v1';
const minimax = 'https://api.minimax.cn/v1';
const image = { model: 'standard', prompt: 'test forest', n: 1, size: '1024x1024' };
const result = { data: [{ b64_json: 'private-fixture-image' }] };
const day = 24 * 60 * 60 * 1000;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup(context, upstream = () => Response.json(result)) {
  const calls = [];
  const fixture = platformFixture();
  context.mock.method(globalThis, 'fetch', fixture.backendFetch);
  const env = {
    ...fixture.env,
    MEDIA_PLATFORM_MODELS: JSON.stringify([
      fixtureModel,
      { ...fixtureModel, id: 'minimax', baseUrl: minimax, model: 'image-01' }
    ]),
    ALLOWED_PROVIDER_BASE_URLS: JSON.stringify([provider, minimax]),
    ASSETS: { fetch: () => new Response('static application') },
    RELAY_RESULTS: r2Bucket()
  };
  env.RELAY_TASKS = durableObjectNamespace(
    ctx =>
      new RelayTask(ctx, env, async (url, init) => {
        calls.push({ url, init });
        return upstream(url, init);
      }),
    { autoAlarms: false }
  );
  const task = { id: crypto.randomUUID(), token: createRelayTaskToken() };
  const name = `relay-task:${task.id}`;
  const send = (method, path = '', { token = task.token, headers = {}, data } = {}) =>
    worker.fetch(
      new Request(`${origin}/api/relay/tasks/${task.id}${path}`, {
        method,
        headers: {
          ...(method === 'GET' ? {} : { origin }),
          'x-relay-task-token': token,
          ...(data ? { 'content-type': 'application/json', authorization: 'Bearer fixture-session' } : {}),
          ...headers
        },
        ...(data ? { body: JSON.stringify(data) } : {})
      }),
      env
    );
  return {
    env,
    calls,
    task,
    name,
    create: (data = image, headers = {}) => send('PUT', '', { data, headers }),
    status: ({ wait, ...options } = {}) => send('GET', wait ? `?wait=${wait}` : '', options),
    result: options => send('GET', '/result', options),
    abandon: options => send('POST', '/abandon', options),
    remove: options => send('DELETE', '', options),
    view: async () => (await send('GET')).json(),
    settled: () => env.RELAY_TASKS.settled(name)
  };
}

test('接单立即返回回执，上游在页面断开后继续，结果只以密文暂存', async context => {
  const upstream = deferred();
  const t = setup(context, () => upstream.promise);
  const accepted = await t.create();
  assert.equal(accepted.status, 202);
  assert.equal((await accepted.json()).status, 'dispatched');
  assert.equal(accepted.headers.get('cache-control'), 'no-store');
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].url, `${provider}/images/generations`);
  assert.equal(t.calls[0].init.redirect, 'manual');
  assert.deepEqual(t.calls[0].init.headers, {
    authorization: 'Bearer fixture-model-private',
    'content-type': 'application/json'
  });
  assert.deepEqual(JSON.parse(t.calls[0].init.body), {
    ...image,
    model: 'private-image-model',
    quality: 'low',
    output_format: 'png'
  });
  upstream.resolve(Response.json(result));
  await t.settled();
  assert.equal((await t.view()).status, 'received');
  const sealed = new Uint8Array(await (await t.result()).arrayBuffer());
  const opened = await openRelayResult(await relayResultKey(t.task.token, t.task.id, 'decrypt'), sealed);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(opened)), result);
  const stored =
    [...t.env.RELAY_RESULTS.objects.values()].map(object => Buffer.from(object.bytes).toString('latin1')).join() +
    JSON.stringify(t.env.RELAY_TASKS.rows(t.name, 'SELECT * FROM relay_task'));
  for (const secret of [
    'fixture-model-private',
    'fixture-session',
    'test forest',
    t.task.token,
    'private-fixture-image'
  ])
    assert.ok(!stored.includes(secret), secret);
});

test('同一任务重复接单只调用一次上游；同一标识改参数被拒绝', async context => {
  const t = setup(context);
  assert.equal((await t.create()).status, 202);
  const replay = await t.create();
  assert.equal(replay.status, 200);
  assert.ok(['dispatched', 'received'].includes((await replay.json()).status));
  assert.equal((await t.create({ ...image, prompt: 'another forest' })).status, 409);
  await t.settled();
  assert.equal(t.calls.length, 1);
});

test('未知任务声明放弃会封存标识，迟到接单不能再创建任务', async context => {
  const t = setup(context);
  const abandoned = await t.abandon();
  assert.equal(abandoned.status, 404);
  assert.deepEqual(await abandoned.json(), { error: 'Task not found' });
  assert.equal((await t.create()).status, 409);
  assert.equal(t.calls.length, 0);
});

test('已接单后声明放弃只返回当前状态', async context => {
  const t = setup(context);
  await t.create();
  await t.settled();
  const response = await t.abandon();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'received');
});

test('上游明确拒绝记为 rejected，保留状态码且不暂存结果', async context => {
  for (const code of [400, 401, 403, 404, 413, 422, 429]) {
    const t = setup(context, () => Response.json({ error: 'private' }, { status: code }));
    await t.create();
    await t.settled();
    const view = await t.view();
    assert.deepEqual([view.status, view.upstreamStatus], ['rejected', code]);
    assert.equal((await t.result()).status, 409);
    assert.equal(t.env.RELAY_RESULTS.objects.size, 0);
  }
});

test('5xx、断连和非 JSON 结果都记为待核对，不重发', async context => {
  for (const upstream of [
    () => new Response('failure', { status: 502 }),
    () => Promise.reject(new TypeError('network')),
    () => new Response('<html>', { headers: { 'content-type': 'text/html' } })
  ]) {
    const t = setup(context, upstream);
    await t.create();
    await t.settled();
    assert.equal((await t.view()).status, 'needs_review');
    assert.equal(t.calls.length, 1);
    assert.equal(t.env.RELAY_RESULTS.objects.size, 0);
  }
});

test('等待中实例被重置：看门狗按 R2 是否已有密文恢复为可取回或转为待核对', async context => {
  for (const [stored, expected] of [
    [true, 'received'],
    [false, 'needs_review']
  ]) {
    const upstream = deferred();
    const t = setup(context, () => upstream.promise);
    await t.create();
    t.env.RELAY_TASKS.reset(t.name);
    if (stored) upstream.resolve(Response.json(result));
    else upstream.reject(new Error('instance reset'));
    await t.settled();
    assert.equal((await t.view()).status, 'dispatched');
    await t.env.RELAY_TASKS.alarm(t.name);
    assert.equal((await t.view()).status, expected);
    assert.equal(t.calls.length, 1);
  }
});

test('没有令牌或令牌错误时，与任务不存在返回相同结果，任务不变', async context => {
  const t = setup(context);
  await t.create();
  await t.settled();
  for (const token of [createRelayTaskToken(), 'malformed'])
    for (const response of [
      await t.status({ token }),
      await t.result({ token }),
      await t.remove({ token }),
      await t.abandon({ token })
    ]) {
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'Task not found' });
    }
  assert.equal((await t.view()).status, 'received');
  assert.equal(t.env.RELAY_RESULTS.objects.size, 1);
});

test('保存后删除：结果对象移除，再查询不存在，重放接单被拒绝', async context => {
  const t = setup(context);
  await t.create();
  await t.settled();
  assert.equal((await t.remove()).status, 204);
  assert.equal(t.env.RELAY_RESULTS.objects.size, 0);
  assert.equal((await t.status()).status, 404);
  assert.equal((await t.result()).status, 404);
  assert.equal((await t.remove()).status, 404);
  assert.equal((await t.create()).status, 409);
  assert.equal(t.calls.length, 1);
});

test('上游仍在等待时不删除任务', async context => {
  const upstream = deferred();
  const t = setup(context, () => upstream.promise);
  await t.create();
  assert.equal((await t.remove()).status, 409);
  upstream.resolve(Response.json(result));
  await t.settled();
  assert.equal((await t.view()).status, 'received');
});

test('无人取回的任务与结果在 24 小时后由 alarm 删除', async context => {
  const start = Date.parse('2026-11-03T00:00:00Z');
  context.mock.timers.enable({ apis: ['Date'], now: start });
  const t = setup(context);
  await t.create();
  await t.settled();
  assert.equal(t.env.RELAY_TASKS.alarmAt(t.name), start + day);
  context.mock.timers.tick(day - 1);
  await t.env.RELAY_TASKS.alarm(t.name);
  assert.equal(t.env.RELAY_TASKS.alarmAt(t.name), start + day);
  assert.equal(t.env.RELAY_RESULTS.objects.size, 1);
  context.mock.timers.tick(1);
  await t.env.RELAY_TASKS.alarm(t.name);
  assert.equal(t.env.RELAY_RESULTS.objects.size, 0);
  assert.equal(t.env.RELAY_TASKS.alarmAt(t.name), null);
  assert.deepEqual(t.env.RELAY_TASKS.rows(t.name, "SELECT name FROM sqlite_master WHERE type='table'"), []);
  assert.equal((await t.status()).status, 404);
});

test('长轮询在状态变化时立即返回，超时后返回当前状态', async context => {
  const upstream = deferred();
  const t = setup(context, () => upstream.promise);
  await t.create();
  const idle = Date.now();
  assert.equal((await (await t.status({ wait: 1 })).json()).status, 'dispatched');
  assert.ok(Date.now() - idle >= 900);
  const started = Date.now();
  const waiting = t.status({ wait: 25 });
  setTimeout(() => upstream.resolve(Response.json(result)), 50);
  assert.equal((await (await waiting).json()).status, 'received');
  assert.ok(Date.now() - started < 5000);
});

test('写操作只接受同源或桌面来源；查询只认令牌', async context => {
  const t = setup(context);
  assert.equal((await t.create(image, { origin: evil })).status, 403);
  assert.equal(t.env.RELAY_TASKS.size, 0);
  await t.create();
  await t.settled();
  assert.equal((await t.remove({ headers: { origin: evil } })).status, 403);
  assert.equal((await t.abandon({ headers: { origin: evil } })).status, 403);
  assert.equal((await t.status()).status, 200);
});

test('任务绑定缺失时在调用上游前拒绝', async context => {
  const t = setup(context);
  t.env.RELAY_RESULTS = undefined;
  assert.equal((await t.create()).status, 503);
  assert.equal(t.calls.length, 0);
});

test('MiniMax 任务改为 base64 返回，避免暂存会过期的临时 URL', async context => {
  const t = setup(context, () => Response.json({ base_resp: { status_code: 0 }, data: { image_base64: ['fixture'] } }));
  assert.equal((await t.create({ ...image, model: 'minimax' })).status, 202);
  await t.settled();
  assert.equal(t.calls[0].url, `${minimax}/image_generation`);
  assert.equal(JSON.parse(t.calls[0].init.body).response_format, 'base64');
});

test('平台任务校验非法参数、未知模型与失效会话，上游零调用', async context => {
  const t = setup(context);
  for (const [data, headers, code] of [
    [{ ...image, n: 2 }, {}, 400],
    [{ ...image, prompt: 'x'.repeat(2001) }, {}, 400],
    [{ ...image, prompt: 'x'.repeat(17000) }, {}, 413],
    [{ ...image, model: 'other' }, {}, 400],
    [image, { authorization: 'Basic nope' }, 401],
    [image, { 'x-relay-task-token': 'malformed' }, 400]
  ])
    assert.equal((await t.create(data, headers)).status, code);
  const unknown = await worker.fetch(
    new Request(`${origin}/api/relay/tasks/not-a-task`, {
      method: 'GET',
      headers: { 'x-relay-task-token': t.task.token }
    }),
    t.env
  );
  assert.equal(unknown.status, 404);
  assert.equal(t.env.RELAY_TASKS.size, 0);
  assert.equal(t.calls.length, 0);
});

test('桌面来源的预检放行任务接口的方法与令牌头', async () => {
  const response = await worker.fetch(
    new Request(`${origin}/api/relay/tasks/${crypto.randomUUID()}`, {
      method: 'OPTIONS',
      headers: { origin: 'tauri://localhost' }
    }),
    { MEDIA_ALLOW_DESKTOP_ORIGIN: 'true' }
  );
  assert.equal(response.status, 204);
  assert.match(response.headers.get('access-control-allow-methods'), /\bPUT\b/);
  assert.match(response.headers.get('access-control-allow-headers'), /x-relay-task-token/);
});
