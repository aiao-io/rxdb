import { createRelayTaskToken, openRelayResult, relayResultKey } from '@aiao-media/api-contracts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/local-first-worker.ts';
import { RelayTask } from '../src/relay-task.ts';
import { durableObjectNamespace, r2Bucket } from './cloudflare-stand-ins.mjs';
import { fixtureProvider, platformFixture } from './fixtures/platform-fixture.ts';

const origin = 'https://app.example.test';
const body = { model: 'standard', prompt: 'private forest prompt', size: '1024x1024', n: 1 };
function rig(context, upstream = async () => Response.json({ data: [{ b64_json: 'private-original-image' }] })) {
  const fixture = platformFixture(),
    calls = [];
  context.mock.method(globalThis, 'fetch', fixture.backendFetch);
  const env = { ...fixture.env, RELAY_RESULTS: r2Bucket(), ASSETS: { fetch: () => new Response('assets') } };
  env.RELAY_TASKS = durableObjectNamespace(
    ctx =>
      new RelayTask(ctx, env, async (url, init) => {
        calls.push({ url, init });
        return upstream(url, init);
      }),
    { autoAlarms: false }
  );
  const id = crypto.randomUUID(),
    token = createRelayTaskToken(),
    name = `relay-task:${id}`;
  const send = (method = 'GET', path = '', payload, headers = {}) =>
    worker.fetch(
      new Request(`${origin}/api/relay/tasks/${id}${path}`, {
        method,
        headers: {
          origin,
          authorization: 'Bearer fixture-session',
          'content-type': 'application/json',
          'x-relay-task-token': token,
          ...headers
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
      }),
      env
    );
  return {
    ...fixture,
    env,
    calls,
    id,
    token,
    name,
    send,
    create: (value = body, headers) => send('PUT', '', value, headers),
    settled: () => env.RELAY_TASKS.settled(name)
  };
}
test('平台生图只接受有效账号与平台模型，目录和任务不泄露上游配置', async context => {
  const t = rig(context);
  const catalog = await worker.fetch(new Request(`${origin}/api/models`), t.env);
  assert.equal(catalog.status, 200);
  const text = await catalog.text();
  for (const secret of [
    'fixture-model-private',
    'fixture-service-private',
    fixtureProvider,
    'private-image-model',
    'MEDIA_IMAGE_KEY'
  ])
    assert.ok(!text.includes(secret));
  assert.deepEqual(JSON.parse(text).models[0], { id: 'standard', name: '平台生图', credits: 3, protocol: 'openai' });
  assert.equal((await t.create(body, { authorization: 'Bearer user-supplied-provider-key' })).status, 401);
  assert.equal((await t.create({ ...body, baseUrl: 'https://evil.test' })).status, 400);
  assert.equal((await t.create({ ...body, model: 'private-image-model' })).status, 400);
  t.ledger.disabled = true;
  assert.equal((await t.create()).status, 403);
  assert.equal(t.calls.length, 0);
});
test('余额不足不发出上游请求，用户会话不会作为模型凭据发送', async context => {
  const t = rig(context);
  t.ledger.balance = 2;
  assert.equal((await t.create()).status, 402);
  assert.equal(t.calls.length, 0);
  assert.equal(t.ledger.reserved, 0);
  const other = rig(context);
  assert.equal((await other.create()).status, 202);
  await other.settled();
  assert.equal(other.calls[0].init.headers.authorization, 'Bearer fixture-model-private');
  assert.equal(other.calls[0].url, `${fixtureProvider}/images/generations`);
  assert.equal(JSON.parse(other.calls[0].init.body).model, 'private-image-model');
});
test('接单只预占，图片取回后确认才扣一次；重复接单与确认不重复生成或消费', async context => {
  const t = rig(context);
  const receipts = await Promise.all(Array.from({ length: 8 }, () => t.create()));
  assert.ok(receipts.every(receipt => receipt.ok));
  await t.settled();
  assert.equal(t.calls.length, 1);
  assert.equal(t.ledger.balance, 10);
  assert.equal(t.ledger.reserved, 3);
  const result = await t.send('GET', '/result');
  const plain = await openRelayResult(
    await relayResultKey(t.token, t.id, 'decrypt'),
    new Uint8Array(await result.arrayBuffer())
  );
  assert.ok(new TextDecoder().decode(plain).includes('private-original-image'));
  assert.equal(t.ledger.charges, 0);
  const confirmations = await Promise.all(Array.from({ length: 8 }, () => t.send('POST', '/confirm')));
  assert.ok(confirmations.every(receipt => receipt.ok));
  assert.equal(t.ledger.charges, 1);
  assert.equal(t.ledger.balance, 7);
  assert.equal(t.ledger.reserved, 0);
  assert.equal((await t.send('POST', '/discard')).status, 409);
  assert.equal((await t.send('DELETE')).status, 204);
  assert.equal((await t.create()).status, 409);
  assert.equal(t.env.RELAY_RESULTS.objects.size, 0);
  const stored = JSON.stringify(t.env.RELAY_TASKS.rows(t.name, 'SELECT * FROM relay_task'));
  for (const secret of [body.prompt, t.token, 'fixture-model-private', 'fixture-session', 'private-original-image'])
    assert.ok(!stored.includes(secret));
});
test('明确拒绝、5xx 和本机图片校验失败都释放预占，不消费积分', async context => {
  for (const status of [401, 503]) {
    const t = rig(context, async () => new Response('private-model-error', { status }));
    await t.create();
    await t.settled();
    assert.equal(t.ledger.balance, 10);
    assert.equal(t.ledger.reserved, 0);
    assert.equal(t.ledger.charges, 0);
    assert.equal((await t.send('POST', '/confirm')).status, 409);
    await t.create();
    assert.equal(t.calls.length, 1);
  }
  const t = rig(context);
  await t.create();
  await t.settled();
  assert.equal((await t.send('POST', '/discard')).status, 204);
  assert.equal(t.ledger.reserved, 0);
  assert.equal(t.ledger.charges, 0);
  assert.equal((await (await t.send()).json()).status, 'needs_review');
});
test('未接单的放弃封存任务标识，迟到接单不再生成', async context => {
  const t = rig(context);
  assert.equal((await t.send('POST', '/abandon')).status, 404);
  assert.equal((await t.create()).status, 409);
  assert.equal(t.calls.length, 0);
  assert.equal(t.ledger.reserved, 0);
});
test('到期先释放未结算预占再删除，结果取回前的确认失败不扣积分', async context => {
  const t = rig(context);
  await t.create();
  await t.settled();
  const created = Date.now();
  context.mock.method(Date, 'now', () => created + 24 * 60 * 60 * 1000 + 1);
  await t.env.RELAY_TASKS.alarm(t.name);
  assert.equal(t.ledger.reserved, 0);
  assert.equal(t.ledger.charges, 0);
  assert.equal(t.env.RELAY_RESULTS.objects.size, 0);
  assert.equal((await t.send()).status, 404);
  assert.equal((await t.send('POST', '/confirm')).status, 404);
});
test('预占应答丢失会释放或封存，原标识重试不再调用上游', async context => {
  const t = rig(context);
  context.mock.method(globalThis, 'fetch', async (input, init) => {
    const receipt = await t.backendFetch(input, init);
    if (String(input).endsWith('/media_reserve_credits')) throw new Error('lost reservation receipt');
    return receipt;
  });
  assert.equal((await t.create()).status, 502);
  assert.equal(t.calls.length, 0);
  assert.equal(t.ledger.reserved, 0);
  assert.equal((await (await t.send()).json()).status, 'needs_review');
  assert.equal((await t.create()).status, 200);
  assert.equal(t.calls.length, 0);
});
test('扣费应答丢失仍可幂等确认，放弃也不能回滚已扣任务或隐藏原图', async context => {
  for (const retry of ['confirm', 'discard']) {
    const t = rig(context);
    await t.create();
    await t.settled();
    let lose = true;
    context.mock.method(globalThis, 'fetch', async (input, init) => {
      const receipt = await t.backendFetch(input, init);
      if (String(input).endsWith('/media_settle_credits') && lose) {
        lose = false;
        throw new Error('lost charge receipt');
      }
      return receipt;
    });
    assert.equal((await t.send('POST', '/confirm')).status, 502);
    assert.equal(t.ledger.charges, 1);
    assert.equal((await t.send('POST', `/${retry}`)).status, retry === 'confirm' ? 204 : 409);
    assert.equal((await t.send('GET', '/result')).status, 200);
    assert.equal((await (await t.send()).json()).status, 'received');
    assert.equal((await t.send('POST', '/confirm')).status, 204);
    assert.equal(t.ledger.charges, 1);
    assert.equal(t.ledger.reserved, 0);
  }
});
test('释放账本暂不可用时保留预占并由 alarm 重试，不丢失结算意图', async context => {
  const t = rig(context, async () => new Response('unavailable', { status: 503 }));
  let unavailable = true;
  context.mock.method(globalThis, 'fetch', (input, init) => {
    if (String(input).endsWith('/media_abort_credits') && unavailable) throw new Error('ledger unavailable');
    return t.backendFetch(input, init);
  });
  await t.create();
  await t.settled();
  assert.equal(t.ledger.reserved, 3);
  assert.equal(t.ledger.charges, 0);
  assert.equal((await (await t.send()).json()).status, 'needs_review');
  await assert.rejects(t.env.RELAY_TASKS.alarm(t.name), /unavailable/);
  assert.ok(t.env.RELAY_TASKS.alarmAt(t.name) > Date.now());
  unavailable = false;
  await t.env.RELAY_TASKS.alarm(t.name);
  assert.equal(t.ledger.reserved, 0);
  assert.equal(t.ledger.balance, 10);
});
test('实例重置后从密文恢复结果，确认前后都不会重发生成', async context => {
  let respond;
  const t = rig(
    context,
    () =>
      new Promise(resolve => {
        respond = resolve;
      })
  );
  await t.create();
  t.env.RELAY_TASKS.reset(t.name);
  respond(Response.json({ data: [{ b64_json: 'restored-image' }] }));
  await t.settled();
  assert.equal(t.env.RELAY_RESULTS.objects.size, 1);
  await t.env.RELAY_TASKS.alarm(t.name);
  assert.equal((await (await t.send()).json()).status, 'received');
  assert.equal(t.ledger.charges, 0);
  assert.equal((await t.send('POST', '/confirm')).status, 204);
  assert.equal(t.ledger.charges, 1);
  assert.equal(t.calls.length, 1);
});
test('预占期间实例重置，不派发上游，恢复时释放迟到的预占', async context => {
  const t = rig(context);
  let reserved, resume;
  const entered = new Promise(resolve => {
    reserved = resolve;
  });
  const pending = new Promise(resolve => {
    resume = resolve;
  });
  context.mock.method(globalThis, 'fetch', async (input, init) => {
    const receipt = await t.backendFetch(input, init);
    if (String(input).endsWith('/media_reserve_credits')) {
      reserved();
      await pending;
    }
    return receipt;
  });
  const creating = t.create();
  await entered;
  t.env.RELAY_TASKS.reset(t.name);
  resume();
  assert.equal((await creating).status, 502);
  assert.equal(t.ledger.reserved, 3);
  assert.equal(t.calls.length, 0);
  await t.env.RELAY_TASKS.alarm(t.name);
  assert.equal(t.ledger.reserved, 0);
  assert.equal(t.ledger.charges, 0);
  assert.equal((await (await t.send()).json()).status, 'needs_review');
});
test('到期释放失败时不删持久任务和结果，恢复账本后再完成清理', async context => {
  const t = rig(context);
  await t.create();
  await t.settled();
  const now = Date.now();
  context.mock.method(Date, 'now', () => now + 25 * 60 * 60 * 1000);
  let unavailable = true;
  context.mock.method(globalThis, 'fetch', (input, init) => {
    if (String(input).endsWith('/media_abort_credits') && unavailable) throw new Error('ledger unavailable');
    return t.backendFetch(input, init);
  });
  await assert.rejects(t.env.RELAY_TASKS.alarm(t.name), /unavailable/);
  assert.equal(t.env.RELAY_RESULTS.objects.size, 1);
  assert.equal(t.env.RELAY_TASKS.rows(t.name, 'SELECT * FROM relay_task').length, 1);
  unavailable = false;
  await t.env.RELAY_TASKS.alarm(t.name);
  assert.equal(t.ledger.reserved, 0);
  assert.equal(t.env.RELAY_RESULTS.objects.size, 0);
});
test('模型配置、允许列表或平台凭据无效时明确停用，不泄露配置细节', async context => {
  const t = rig(context),
    model = JSON.parse(t.env.MEDIA_PLATFORM_MODELS)[0];
  for (const models of [
    '{',
    'null',
    '{}',
    '[]',
    JSON.stringify([model, model]),
    ...[
      { id: 12 },
      { model: 12 },
      { secret: 12 },
      { name: '' },
      { credits: 0 },
      { baseUrl: 'http://127.0.0.1' },
      { secret: 'MISSING_PLATFORM_KEY' }
    ].map(patch => JSON.stringify([{ ...model, ...patch }]))
  ]) {
    t.env.MEDIA_PLATFORM_MODELS = models;
    const response = await worker.fetch(new Request(`${origin}/api/models`), t.env);
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('fixture-model-private'));
  }
  t.env.MEDIA_PLATFORM_MODELS = JSON.stringify([model]);
  t.env.ALLOWED_PROVIDER_BASE_URLS = '[]';
  assert.equal((await t.create()).status, 503);
  t.env.ALLOWED_PROVIDER_BASE_URLS = '{';
  assert.equal((await t.create()).status, 503);
  assert.equal(t.calls.length, 0);
});
test('模型目录遵守后台停用策略，三画幅与协议由服务端固定', async context => {
  const t = rig(context),
    model = JSON.parse(t.env.MEDIA_PLATFORM_MODELS)[0];
  const minimax = { ...model, baseUrl: 'https://api.minimax.cn/v1', model: 'image-01' };
  t.env.MEDIA_PLATFORM_MODELS = JSON.stringify([minimax]);
  t.env.ALLOWED_PROVIDER_BASE_URLS = JSON.stringify([minimax.baseUrl]);
  let enabled = false;
  context.mock.method(globalThis, 'fetch', (input, init) => {
    if (String(input).includes('/media_public_content'))
      return Response.json([
        {
          revision: 1,
          payload: {
            version: 1,
            providers: [
              {
                id: crypto.randomUUID(),
                name: 'private',
                baseUrl: minimax.baseUrl,
                models: ['image-01'],
                sizes: ['1024x1024'],
                direct: false,
                proxy: true,
                enabled
              }
            ]
          }
        }
      ]);
    return t.backendFetch(input, init);
  });
  assert.deepEqual(await (await worker.fetch(new Request(`${origin}/api/models`), t.env)).json(), { models: [] });
  enabled = true;
  const catalog = await (await worker.fetch(new Request(`${origin}/api/models`), t.env)).json();
  assert.equal(catalog.models[0].protocol, 'minimax');
  assert.equal((await t.create({ ...body, size: '1536x1024' })).status, 403);
  assert.equal((await t.create({ ...body, prompt: 'x'.repeat(1501) })).status, 400);
  assert.equal(t.calls.length, 0);
});
test('确认前密文丢失不消费，过期查询释放积分，旧任务标识不能再次生成', async context => {
  const t = rig(context);
  await t.create();
  await t.settled();
  await t.env.RELAY_RESULTS.delete(t.id);
  assert.equal((await t.send('POST', '/confirm')).status, 410);
  assert.equal(t.ledger.charges, 0);
  const now = Date.now();
  context.mock.method(Date, 'now', () => now + 25 * 60 * 60 * 1000);
  assert.equal((await t.send()).status, 404);
  assert.equal(t.ledger.reserved, 0);
  assert.equal((await t.create()).status, 409);
  assert.equal(t.calls.length, 1);
});
test('即使知道任务令牌，另一个平台账号也不能用原标识接单', async context => {
  const t = rig(context);
  await t.create();
  await t.settled();
  context.mock.method(globalThis, 'fetch', (input, init) =>
    String(input).endsWith('/auth/v1/user') ?
      Response.json({ id: '00000000-0000-4000-8000-000000000002' })
    : t.backendFetch(input, init)
  );
  assert.equal((await t.create()).status, 409);
  assert.equal(t.calls.length, 1);
  assert.equal(t.ledger.charges, 0);
});
