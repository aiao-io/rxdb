import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { test } from 'node:test';
import { createRelayTaskToken, openRelayResult, relayResultKey } from '@aiao-media/api-contracts';
import { startDevRelay } from '../../api/scripts/dev-relay.mjs';

const provider = 'https://provider.example.test/v1';
const imageRequest = { model: 'image-test', prompt: 'test forest', n: 1, size: '1024x1024' };
const allowOnly = { allowedProviders: [provider] };
const image = () => Response.json({ data: [{ b64_json: 'fixture' }] });

// The relay's own fetch reaches the provider; the test client uses node:http, so the stub never sees it.
async function withRelay(options, handler, run) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  const relay = await startDevRelay(options);
  try {
    await run(relay, calls);
  } finally {
    globalThis.fetch = previous;
    await relay.close();
  }
}
function post(relay, { path = '/api/relay', method = 'POST', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      new URL(path, relay.url),
      {
        method,
        headers: {
          origin: relay.url,
          'content-type': 'application/json',
          authorization: 'Bearer fixture-only',
          'x-provider-base': provider,
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
    outgoing.end(method === 'GET' ? undefined : JSON.stringify(imageRequest));
  });
}

test('forwards a same-origin relay request to the allow-listed provider with only the caller Key', async () => {
  await withRelay(allowOnly, image, async (relay, calls) => {
    const result = await post(relay, { headers: { cookie: 'private=secret' } });
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.text), { data: [{ b64_json: 'fixture' }] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${provider}/images/generations`);
    assert.deepEqual(calls[0].init.headers, {
      authorization: 'Bearer fixture-only',
      'content-type': 'application/json'
    });
  });
});
test('keeps the delayed-result stream marker that the browser relies on', async () => {
  const slow = async () => {
    await new Promise(resolve => setTimeout(resolve, 400));
    return image();
  };
  await withRelay(allowOnly, slow, async relay => {
    const result = await post(relay);
    assert.equal(result.status, 200);
    assert.equal(result.headers['x-aiao-relay-stream'], 'late-upstream');
    assert.deepEqual(JSON.parse(result.text), { data: [{ b64_json: 'fixture' }] });
  });
});
test('answers a provider rejection with JSON, which is how the browser tells it from a missing relay', async () => {
  await withRelay(
    allowOnly,
    () => new Response('private', { status: 404 }),
    async relay => {
      const result = await post(relay);
      assert.equal(result.status, 404);
      assert.match(result.headers['content-type'], /application\/json/);
      assert.ok(!result.text.includes('private'));
    }
  );
});
test('refuses cross-origin callers, other providers and other API routes before contacting a provider', async () => {
  await withRelay(allowOnly, image, async (relay, calls) => {
    assert.equal((await post(relay, { headers: { origin: 'https://evil.example.test' } })).status, 403);
    assert.equal((await post(relay, { headers: { 'x-provider-base': 'https://other.example.test/v1' } })).status, 403);
    assert.equal((await post(relay, { path: '/api/platform/session' })).status, 404);
    assert.equal(calls.length, 0);
  });
});
test('starts from the allow-list committed for deployment and listens on loopback only', async () => {
  const [committed] = JSON.parse(
    JSON.parse(readFileSync(new URL('../../api/wrangler.json', import.meta.url), 'utf8')).vars
      .ALLOWED_PROVIDER_BASE_URLS
  );
  await withRelay(undefined, image, async (relay, calls) => {
    assert.match(relay.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal((await post(relay, { headers: { 'x-provider-base': committed } })).status, 200);
    assert.equal(calls[0].url, `${committed}/images/generations`);
  });
});
test('runs relay tasks on in-process stand-ins, so a reloaded page can still read the sealed result', async () => {
  const slow = async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return image();
  };
  await withRelay(allowOnly, slow, async (relay, calls) => {
    const id = crypto.randomUUID(),
      token = createRelayTaskToken(),
      path = `/api/relay/tasks/${id}`,
      headers = { 'x-relay-task-token': token };
    assert.equal((await post(relay, { method: 'PUT', path, headers })).status, 202);
    // The sending page is gone; a later request with the stored token waits for the outcome.
    const view = await post(relay, { method: 'GET', path: `${path}?wait=5`, headers });
    assert.equal(JSON.parse(view.text).status, 'received');
    const sealed = await post(relay, { method: 'GET', path: `${path}/result`, headers });
    const opened = await openRelayResult(await relayResultKey(token, id, 'decrypt'), new Uint8Array(sealed.bytes));
    assert.deepEqual(JSON.parse(new TextDecoder().decode(opened)), { data: [{ b64_json: 'fixture' }] });
    assert.equal(calls.length, 1);
  });
});
test('the Angular proxy config sends only /api/relay to a live relay', async () => {
  const { default: proxy } = await import('../../web/proxy.conf.mjs');
  assert.deepEqual(Object.keys(proxy), ['/api/relay']);
  const response = await fetch(new URL('/api/relay', proxy['/api/relay'].target));
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { error: 'POST required' });
});
