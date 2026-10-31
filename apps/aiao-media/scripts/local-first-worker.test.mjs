import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../server/cloudflare/local-first-worker.mjs';
const origin = 'https://app.example.test';
const env = {
  ALLOWED_PROVIDER_BASE_URLS: '["https://provider.example.test/v1"]',
  ASSETS: { fetch: () => new Response('static application') }
};
const body = {
  model: 'image-test',
  prompt: 'test forest',
  n: 1,
  size: '1024x1024'
};
const request = (extra = {}, data = body) =>
  new Request(`${origin}/api/relay`, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      authorization: 'Bearer fixture-only',
      'x-provider-base': 'https://provider.example.test/v1',
      ...extra
    },
    body: JSON.stringify(data)
  });
test('只接收同源、允许列表中的供应商，不暴露任意 URL 代理', async () => {
  for (const headers of [
    { origin: 'https://evil.example.test' },
    { 'x-provider-base': 'https://other.example.test/v1' },
    { 'x-provider-base': 'http://127.0.0.1' },
    { 'x-provider-base': 'https://provider.example.test/v1?secret=1' }
  ])
    assert.ok([400, 403].includes((await worker.fetch(request(headers), env)).status));
  assert.equal((await worker.fetch(request({}, { ...body, n: 2 }), env)).status, 400);
  assert.equal((await worker.fetch(request({}, { ...body, prompt: 'x'.repeat(2001) }), env)).status, 400);
  assert.equal((await worker.fetch(request({}, { ...body, prompt: 'x'.repeat(17000) }), env)).status, 413);
});
test('Key 仅在本次转发，剥离其他头、禁止重定向、结果不缓存', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://provider.example.test/v1/images/generations');
    assert.equal(init.redirect, 'manual');
    assert.deepEqual(init.headers, {
      authorization: 'Bearer fixture-only',
      'content-type': 'application/json'
    });
    assert.equal(JSON.parse(init.body).n, 1);
    return Response.json({ data: [{ b64_json: 'fixture' }] });
  };
  try {
    const response = await worker.fetch(
      request({
        cookie: 'private=secret',
        'x-internal-token': 'do-not-forward'
      }),
      env
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      data: [{ b64_json: 'fixture' }]
    });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previous;
  }
});
test('上游重定向在立即和延迟响应中均被拒绝，不转发 Key 到新地址', async () => {
  const previous = globalThis.fetch;
  try {
    for (const delay of [0, 300]) {
      let calls = 0;
      globalThis.fetch = async (url, init) => {
        calls++;
        assert.equal(url, 'https://provider.example.test/v1/images/generations');
        // This is the only non-following mode accepted by the Workers runtime.
        assert.equal(init.redirect, 'manual');
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        return new Response('private redirect body', {
          status: 307,
          headers: { location: 'https://other.example.test/collect' }
        });
      };
      const response = await worker.fetch(request(), env);
      const result = await response.json();
      assert.equal(delay ? result.status : response.status, 502);
      assert.equal(calls, 1);
      assert.equal(response.headers.get('location'), null);
      assert.ok(!JSON.stringify(result).includes('private redirect body'));
    }
  } finally {
    globalThis.fetch = previous;
  }
});
test('供应商错误不泄露响应和 Key；网络失败不重试', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response('sensitive fixture-only error', { status: 401 });
  };
  try {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 401);
    assert.ok(!(await response.text()).includes('fixture-only'));
    globalThis.fetch = async () => {
      calls++;
      throw new Error('sensitive fixture-only');
    };
    const interrupted = await worker.fetch(request(), env);
    assert.equal(interrupted.status, 502);
    assert.ok(!(await interrupted.text()).includes('fixture-only'));
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previous;
  }
});
test('未知 API 返回 404，普通页面走静态资源', async () => {
  assert.equal((await worker.fetch(new Request(`${origin}/api/auth/session`), env)).status, 404);
  const page = await worker.fetch(new Request(`${origin}/providers`), env);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(await page.text(), 'static application');
  const workerScript = await worker.fetch(new Request(`${origin}/offline-worker.js`), env);
  assert.equal(workerScript.headers.get('cache-control'), 'no-store');
});

test('provider probe checks server-to-server reachability without a Key', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(init.redirect, 'manual');
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ?? null });
    return new Response(null, {
      status: 204,
      headers: { 'content-type': 'text/plain' }
    });
  };
  try {
    const response = await worker.fetch(new Request(`${origin}/api/provider-probe`), env);
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.providers.length, 1);
    assert.equal(result.providers[0].reachable, true);
    assert.equal(result.providers[0].browserDirect, false);
    assert.equal(result.controls.length, 3);
    assert.equal(calls.length, 6);
    const providerCalls = calls.filter(({ url }) => new URL(url).origin === 'https://provider.example.test');
    assert.deepEqual(providerCalls.map(({ method }) => method).sort(), ['GET', 'OPTIONS', 'POST']);
    const keylessPost = providerCalls.find(({ method }) => method === 'POST');
    assert.deepEqual(JSON.parse(keylessPost.body), {
      model: 'reachability-probe',
      prompt: 'reachability-probe',
      n: 1,
      size: '1024x1024'
    });
    assert.ok(!keylessPost.body.includes('fixture-only'));
    assert.deepEqual(calls.map(({ url }) => url).sort(), [
      'https://api.openai.com/v1/models',
      'https://example.com/',
      'https://provider.example.test/v1/',
      'https://provider.example.test/v1/images/generations',
      'https://provider.example.test/v1/images/generations',
      'https://www.cloudflare.com/'
    ]);
  } finally {
    globalThis.fetch = previous;
  }
});

test('probe marks browser-direct only when the provider answers CORS preflight', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST',
          'access-control-allow-headers': 'authorization,content-type'
        }
      });
    return new Response(null, { status: 204 });
  };
  try {
    const response = await worker.fetch(new Request(`${origin}/api/provider-probe`), env);
    const result = await response.json();
    assert.equal(result.providers[0].reachable, true);
    assert.equal(result.providers[0].browserDirect, true);
    assert.ok(result.interpretation.includes('relay'));
  } finally {
    globalThis.fetch = previous;
  }
});

test('长耗时上游以 JSON 空白心跳保持连接并转发结果', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return Response.json({ data: [{ b64_json: 'fixture' }] });
  };
  try {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-aiao-relay-stream'), 'late-upstream');
    assert.deepEqual(await response.json(), {
      data: [{ b64_json: 'fixture' }]
    });
  } finally {
    globalThis.fetch = previous;
  }
});

const miniMaxBase = 'https://api.minimax.cn/v1';
const miniMaxEnv = { ...env, ALLOWED_PROVIDER_BASE_URLS: JSON.stringify([miniMaxBase]) };
const miniMaxHeaders = { 'x-provider-base': miniMaxBase };

test('MiniMax 代理保留入口契约，固定映射三画幅原生请求，剥离多余参数和请求头', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json({
      base_resp: { status_code: 0 },
      data: { image_urls: ['https://images.example/native.png'] }
    });
  };
  try {
    for (const [size, width, height] of [
      ['1024x1024', 1024, 1024],
      ['1536x1024', 1536, 1024],
      ['1024x1536', 1024, 1536]
    ]) {
      const response = await worker.fetch(
        request(
          { ...miniMaxHeaders, cookie: 'private' },
          {
            ...body,
            model: 'image-01',
            size,
            callback_url: 'https://evil.example/',
            aspect_ratio: '1:1'
          }
        ),
        miniMaxEnv
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).base_resp.status_code, 0);
      const call = calls.at(-1);
      assert.equal(call.url, `${miniMaxBase}/image_generation`);
      assert.equal(call.init.redirect, 'manual');
      assert.deepEqual(call.init.headers, { authorization: 'Bearer fixture-only', 'content-type': 'application/json' });
      assert.deepEqual(JSON.parse(call.init.body), {
        model: 'image-01',
        prompt: body.prompt,
        n: 1,
        width,
        height,
        response_format: 'url',
        prompt_optimizer: false
      });
    }
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = previous;
  }
});

test('MiniMax 仍须逐项允许列表授权；不接受不支持的模型和过长提示词', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('must not dispatch');
  };
  try {
    const nativeBody = { ...body, model: 'image-01' };
    assert.equal((await worker.fetch(request(miniMaxHeaders, nativeBody), env)).status, 403);
    assert.equal(
      (await worker.fetch(request(miniMaxHeaders, { ...nativeBody, model: 'unsupported' }), miniMaxEnv)).status,
      400
    );
    assert.equal(
      (await worker.fetch(request(miniMaxHeaders, { ...nativeBody, prompt: 'x'.repeat(1501) }), miniMaxEnv)).status,
      400
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test('MiniMax 业务错误按原样交给浏览器分类，代理不重试', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    assert.equal(url, `${miniMaxBase}/image_generation`);
    return Response.json({ base_resp: { status_code: 1033, status_msg: 'system error' } });
  };
  try {
    const response = await worker.fetch(request(miniMaxHeaders, { ...body, model: 'image-01' }), miniMaxEnv);
    assert.equal((await response.json()).base_resp.status_code, 1033);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previous;
  }
});

test('MiniMax 无 Key 连通性探针使用原生路径和固定参数', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 204 });
  };
  try {
    await worker.fetch(new Request(`${origin}/api/provider-probe`), miniMaxEnv);
    const post = calls.find(call => call.init.method === 'POST');
    assert.equal(post.url, `${miniMaxBase}/image_generation`);
    assert.equal(post.init.headers.authorization, undefined);
    assert.deepEqual(JSON.parse(post.init.body), {
      model: 'image-01',
      prompt: 'reachability-probe',
      n: 1,
      width: 1024,
      height: 1024,
      response_format: 'url',
      prompt_optimizer: false
    });
  } finally {
    globalThis.fetch = previous;
  }
});
