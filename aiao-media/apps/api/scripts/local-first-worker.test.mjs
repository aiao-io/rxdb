import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/local-first-worker.ts';
const origin = 'https://app.example.test';
const env = {
  ALLOWED_PROVIDER_BASE_URLS: '["https://provider.example.test/v1"]',
  ASSETS: { fetch: () => new Response('static application') }
};
test('旧无状态代理已下线，任何方法或用户 Key 都不发出上游请求', async context => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw new Error('must not dispatch');
  });
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const response = await worker.fetch(
      new Request(`${origin}/api/relay`, {
        method,
        headers: {
          origin,
          authorization: 'Bearer old-provider-key',
          'x-provider-base': 'https://provider.example.test/v1'
        }
      }),
      env
    );
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(calls, 0);
});
test('后台路径加载独立管理产物并禁止缓存', async () => {
  const redirect = await worker.fetch(new Request(`${origin}/admin`), env);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), `${origin}/admin/`);
  const response = await worker.fetch(new Request(`${origin}/admin/`), {
    ...env,
    ASSETS: { fetch: request => new Response(new URL(request.url).pathname) }
  });
  assert.equal(await response.text(), '/admin/index.html');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('未知 API 返回 404，普通页面走静态资源', async () => {
  assert.equal((await worker.fetch(new Request(`${origin}/api/auth/session`), env)).status, 404);
  const page = await worker.fetch(new Request(`${origin}/providers`), env);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(await page.text(), 'static application');
  const workerScript = await worker.fetch(new Request(`${origin}/offline-worker.js`), env);
  assert.equal(workerScript.headers.get('cache-control'), 'no-store');
});

test('免费平台停用平台生图与计费接口，不访问账号服务或任务协调器', async t => {
  const previous = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previous;
  });
  let requested = false;
  const unexpected = () => {
    requested = true;
    throw new Error('停用接口不应访问外部服务或任务协调器');
  };
  globalThis.fetch = unexpected;
  const disabledEnv = {
    ...env,
    MEDIA_SUPABASE_URL: 'https://platform.example.test',
    MEDIA_SUPABASE_ANON_KEY: 'fixture-anon',
    MEDIA_SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-role',
    MEDIA_PLATFORM: { idFromName: unexpected, get: unexpected }
  };
  for (const path of ['catalog', 'account', 'jobs', 'checkout', 'webhook', 'admin']) {
    for (const method of ['GET', 'POST']) {
      const response = await worker.fetch(
        new Request(`${origin}/api/platform/${path}`, {
          method,
          headers: { origin, authorization: 'Bearer fixture-only' }
        }),
        disabledEnv
      );
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await response.json()).error, 'Unknown API');
    }
  }
  assert.equal(requested, false);
});

test('平台统一同步不提供用户项目授权与初始化接口', async t => {
  const previous = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previous;
  });
  let requested = false;
  globalThis.fetch = async () => {
    requested = true;
    throw new Error('不应访问项目管理接口');
  };
  for (const [path, method] of [
    ['status', 'GET'],
    ['start', 'GET'],
    ['callback', 'GET'],
    ['projects', 'GET'],
    ['initialize', 'POST'],
    ['revoke', 'POST']
  ]) {
    const response = await worker.fetch(new Request(`${origin}/api/supabase/oauth/${path}`, { method }), env);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).error, 'Unknown API');
  }
  assert.equal(requested, false);
});

test('公开 API 不再暴露上游地址、运行策略或直连探针', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw new Error('不得访问上游');
  });
  for (const path of ['provider-probe', 'provider-policies']) {
    for (const method of ['GET', 'POST']) {
      const response = await worker.fetch(new Request(`${origin}/api/${path}`, { method }), env);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await response.json()).error, 'Unknown API');
    }
  }
  assert.equal(calls, 0);
});
