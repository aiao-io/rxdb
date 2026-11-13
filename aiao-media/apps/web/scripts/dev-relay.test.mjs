import { createRelayTaskToken, openRelayResult, relayResultKey } from '@aiao-media/api-contracts';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { startDevRelay } from '../../api/scripts/dev-relay.mjs';
import { fixtureProvider, platformFixture } from '../../api/scripts/fixtures/platform-fixture.ts';

const imageRequest = { model: 'standard', prompt: 'test forest', n: 1, size: '1024x1024' };
async function withRelay(context, run) {
  const fixture = platformFixture(),
    calls = [];
  context.mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).startsWith(fixtureProvider)) return fixture.backendFetch(url, init);
    calls.push({ url, init });
    return Response.json({ data: [{ b64_json: 'fixture' }] });
  });
  const relay = await startDevRelay({ allowedProviders: [fixtureProvider], environment: fixture.env });
  try {
    await run(relay, calls, fixture.ledger);
  } finally {
    await relay.close();
  }
}
function send(relay, method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      new URL(path, relay.url),
      {
        method,
        headers: {
          origin: relay.url,
          'content-type': 'application/json',
          authorization: 'Bearer fixture-session',
          ...headers
        }
      },
      incoming => {
        const chunks = [];
        incoming.on('data', chunk => chunks.push(chunk));
        incoming.on('end', () => {
          const bytes = Buffer.concat(chunks);
          resolve({ status: incoming.statusCode, headers: incoming.headers, text: bytes.toString(), bytes });
        });
      }
    );
    outgoing.on('error', reject);
    outgoing.end(method === 'PUT' ? JSON.stringify(imageRequest) : undefined);
  });
}
test('开发入口移除旧 Key 代理，拒绝跨源和用户供应商 Key', async context => {
  await withRelay(context, async (relay, calls) => {
    const path = `/api/relay/tasks/${crypto.randomUUID()}`,
      headers = { 'x-relay-task-token': createRelayTaskToken() };
    assert.equal((await send(relay, 'POST', '/api/relay')).status, 404);
    assert.equal((await send(relay, 'PUT', path, { ...headers, origin: 'https://evil.test' })).status, 403);
    assert.equal(
      (await send(relay, 'PUT', path, { ...headers, authorization: 'Bearer user-provider-key' })).status,
      401
    );
    assert.equal((await send(relay, 'GET', '/api/platform/session')).status, 404);
    assert.equal(calls.length, 0);
  });
});
test('开发任务可刷新续接、取回密文和确认扣费，上游只收到平台凭据', async context => {
  await withRelay(context, async (relay, calls, ledger) => {
    const id = crypto.randomUUID(),
      token = createRelayTaskToken(),
      path = `/api/relay/tasks/${id}`,
      headers = { 'x-relay-task-token': token };
    assert.match(relay.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal((await send(relay, 'PUT', path, headers)).status, 202);
    const view = await send(relay, 'GET', `${path}?wait=5`, headers);
    assert.equal(JSON.parse(view.text).status, 'received');
    const sealed = await send(relay, 'GET', `${path}/result`, headers);
    const plain = await openRelayResult(await relayResultKey(token, id, 'decrypt'), new Uint8Array(sealed.bytes));
    assert.deepEqual(JSON.parse(new TextDecoder().decode(plain)), { data: [{ b64_json: 'fixture' }] });
    assert.equal(ledger.charges, 0);
    assert.equal((await send(relay, 'POST', `${path}/confirm`, headers)).status, 204);
    assert.equal(ledger.charges, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers.authorization, 'Bearer fixture-model-private');
    assert.equal((await send(relay, 'DELETE', path, headers)).status, 204);
  });
});
test('旧开发代理配置仍下线无状态入口，未配置模型服务明确报错', async () => {
  const { default: proxy } = await import('../../web/proxy.conf.mjs');
  const response = await fetch(new URL('/api/relay', proxy['/api/relay'].target));
  assert.equal(response.status, 404);
});
