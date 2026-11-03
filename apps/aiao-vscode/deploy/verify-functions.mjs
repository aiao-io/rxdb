// Node ≥ 26 直跑：node deploy/verify-functions.mjs
// 校验 /redirect 与 token 交换 / 撤销两个 Pages Function 的请求 → 响应行为。
import assert from 'node:assert/strict';
import { onRequestPost } from './functions/api/github-token.ts';
import { onRequestGet } from './functions/redirect.ts';

const ORIGIN = 'https://ide.example';
const ENV = { GITHUB_CLIENT_ID: 'client-1', GITHUB_CLIENT_SECRET: 'secret-1' };

const get = (path, origin = ORIGIN) => onRequestGet({ request: new Request(`${origin}${path}`), env: {} });
const post = (path, body, env = ENV, origin = ORIGIN) =>
  onRequestPost({
    request: new Request(`${origin}${path}`, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body)
    }),
    env
  });

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(`ok  ${name}`);
  } catch (cause) {
    results.push(`FAIL ${name}: ${cause.message}`);
  }
};

await check('redirect: 302 回同源回调并带上 code 与 state', async () => {
  const response = await get('/redirect?code=abc&state=' + encodeURIComponent(`${ORIGIN}/github-callback?nonce=1234`));
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, ORIGIN);
  assert.equal(location.pathname, '/github-callback');
  assert.equal(location.searchParams.get('code'), 'abc');
  assert.equal(location.searchParams.get('nonce'), '1234');
  assert.equal(location.searchParams.get('state'), `${ORIGIN}/github-callback?nonce=1234`);
});

await check('redirect: 缺少参数返回 400', async () => {
  assert.equal((await get('/redirect')).status, 400);
  assert.equal((await get('/redirect?code=abc')).status, 400);
  assert.equal((await get('/redirect?state=x')).status, 400);
});

await check('redirect: 拒绝跨源与非法 state（开放重定向防护）', async () => {
  assert.equal((await get('/redirect?code=abc&state=https%3A%2F%2Fevil.example%2Fx')).status, 400);
  assert.equal((await get('/redirect?code=abc&state=' + encodeURIComponent(`${ORIGIN}/elsewhere`))).status, 400);
  assert.equal((await get('/redirect?code=abc&state=not-a-url')).status, 400);
});

await check('exchange: 用 secret 交换授权码并返回 access_token', async () => {
  const upstream = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    upstream.push({ input, init });
    return Response.json({ access_token: 'gho_abc' });
  };
  try {
    const response = await post('/api/github-token', {
      code: 'code-1',
      code_verifier: 'verifier-1',
      redirect_uri: `${ORIGIN}/redirect`
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { access_token: 'gho_abc' });
    assert.equal(upstream[0].input, 'https://github.com/login/oauth/access_token');
    const form = new URLSearchParams(String(upstream[0].init.body));
    assert.equal(form.get('code'), 'code-1');
    assert.equal(form.get('code_verifier'), 'verifier-1');
    assert.equal(form.get('client_id'), 'client-1');
    assert.equal(form.get('client_secret'), 'secret-1');
    assert.equal(form.get('redirect_uri'), `${ORIGIN}/redirect`);
  } finally {
    globalThis.fetch = original;
  }
});

await check('exchange: 未配置 secret 返回 500，缺字段返回 400', async () => {
  assert.equal(
    (await post('/api/github-token', { code: 'c', code_verifier: 'v', redirect_uri: `${ORIGIN}/redirect` }, {})).status,
    500
  );
  assert.equal((await post('/api/github-token', { code: 'c' })).status, 400);
  assert.equal((await post('/api/github-token', {})).status, 400);
  assert.equal((await post('/api/github-token', 'not-json')).status, 400);
});

await check('exchange: 上游失败透传 502', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('upstream error', { status: 401 });
  try {
    const response = await post('/api/github-token', {
      code: 'c',
      code_verifier: 'v',
      redirect_uri: `${ORIGIN}/redirect`
    });
    assert.equal(response.status, 502);
    assert.equal(await response.text(), 'upstream error');
  } finally {
    globalThis.fetch = original;
  }
});

await check('revoke: 带 Basic 认证调用 token 删除 API', async () => {
  const upstream = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    upstream.push({ input, init });
    return new Response(null, { status: 204 });
  };
  try {
    const response = await post('/api/github-token/delete', { token: 'gho_abc' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(upstream[0].input, 'https://api.github.com/applications/client-1/token');
    assert.equal(upstream[0].init.method, 'DELETE');
    assert.equal(upstream[0].init.headers.Authorization, `Basic ${btoa('client-1:secret-1')}`);
    assert.deepEqual(JSON.parse(upstream[0].init.body), { access_token: 'gho_abc' });
  } finally {
    globalThis.fetch = original;
  }
});

await check('revoke: 缺 token 返回 400', async () => {
  assert.equal((await post('/api/github-token/delete', {})).status, 400);
});

console.log(results.join('\n'));
if (results.some(line => line.startsWith('FAIL'))) process.exit(1);
console.log(`\n${results.length} checks passed`);
