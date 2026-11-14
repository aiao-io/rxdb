import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { listDistFiles } from './dist-check.mjs';
import { checkLive, publicPath, waitUntilReachable } from './live-check.mjs';

const REQUIRED = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
};
const ISOLATED = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' };
const BASE = 'https://aiao-desktop.pages.dev';

async function fixture(t, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aiao-desktop-live-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
}

const SITE = {
  'index.html': '<app-root></app-root>',
  'main.js': 'console.log(1)',
  'assets/worker.js': 'self.onmessage=()=>{}',
  _headers: '/*\n  Cross-Origin-Opener-Policy: same-origin\n',
  _redirects: '/saltline.html /saltline 200\n'
};

/** 按路径应答的假 fetch；handlers 的值可以是数组，每次请求依次取一个（最后一个重复使用）。 */
function fakeFetch(handlers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const pathname = new URL(url).pathname;
    calls.push({ pathname, init });
    const entry = handlers[pathname];
    assert.ok(entry, `没有为 ${pathname} 准备应答`);
    const queue = Array.isArray(entry) ? entry : [entry];
    const step = queue[Math.min(calls.filter(call => call.pathname === pathname).length - 1, queue.length - 1)];
    if (step instanceof Error) throw step;
    return new Response(step.body, { status: step.status ?? 200, headers: step.headers ?? ISOLATED });
  };
  return { fetchImpl, calls };
}

async function run(distDir, handlers, options = {}) {
  const files = await listDistFiles(distDir);
  const { fetchImpl, calls } = fakeFetch(handlers);
  const result = await checkLive({
    distDir,
    files,
    baseUrl: BASE,
    requiredHeaders: REQUIRED,
    fetchImpl,
    retryDelayMs: 0,
    ...options
  });
  return { result, calls };
}

const GOOD = {
  '/': { body: SITE['index.html'] },
  '/main.js': { body: SITE['main.js'] },
  '/assets/worker.js': { body: SITE['assets/worker.js'] }
};

test('publicPath：index.html 对应站点根，其余按相对路径', () => {
  assert.equal(publicPath('index.html'), '/');
  assert.equal(publicPath('assets/worker-1.js'), '/assets/worker-1.js');
  assert.equal(publicPath('a b/c#d.js'), '/a%20b/c%23d.js');
});

test('逐个文件对账通过：_headers 与 _redirects 不是站点内容，不请求', async t => {
  const distDir = await fixture(t, SITE);
  const { result, calls } = await run(distDir, GOOD);
  assert.deepEqual(result, { checked: 3, failures: [] });
  assert.deepEqual(calls.map(call => call.pathname).sort(), ['/', '/assets/worker.js', '/main.js']);
});

test('请求不跟随重定向、不用缓存', async t => {
  const distDir = await fixture(t, SITE);
  const { calls } = await run(distDir, GOOD);
  for (const { init } of calls) {
    assert.equal(init.redirect, 'manual');
    assert.equal(init.cache, 'no-store');
  }
});

test('Pages 对不存在的文件回 index.html 且 200：内容不一致必须报出', async t => {
  const distDir = await fixture(t, SITE);
  const { result } = await run(distDir, { ...GOOD, '/main.js': { body: SITE['index.html'] } });
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].path, 'main.js');
  assert.match(result.failures[0].reason, /内容与构建产物不一致/);
});

test('缺少或写错跨源隔离响应头都报，指出是哪一个', async t => {
  const distDir = await fixture(t, SITE);
  const { result } = await run(distDir, {
    ...GOOD,
    '/main.js': { body: SITE['main.js'], headers: { 'cross-origin-opener-policy': 'same-origin' } },
    '/assets/worker.js': {
      body: SITE['assets/worker.js'],
      headers: { ...ISOLATED, 'cross-origin-embedder-policy': 'credentialless' }
    }
  });
  const reasons = Object.fromEntries(result.failures.map(item => [item.path, item.reason]));
  assert.match(reasons['main.js'], /Cross-Origin-Embedder-Policy.*缺少/);
  assert.match(reasons['assets/worker.js'], /Cross-Origin-Embedder-Policy.*credentialless.*require-corp/);
});

test('重定向与错误状态码都算失败', async t => {
  const distDir = await fixture(t, SITE);
  const { result } = await run(distDir, {
    ...GOOD,
    '/': { status: 308, body: '', headers: { ...ISOLATED, location: '/x' } },
    '/main.js': { status: 404, body: 'nope' }
  });
  const reasons = Object.fromEntries(result.failures.map(item => [item.path, item.reason]));
  assert.match(reasons['index.html'], /308/);
  assert.match(reasons['main.js'], /404/);
});

test('网络抖动与 5xx 会重试，重试后通过', async t => {
  const distDir = await fixture(t, SITE);
  const { result, calls } = await run(distDir, {
    ...GOOD,
    '/main.js': [new TypeError('fetch failed'), { status: 503, body: 'busy' }, { body: SITE['main.js'] }]
  });
  assert.deepEqual(result.failures, []);
  assert.equal(calls.filter(call => call.pathname === '/main.js').length, 3);
});

test('一直失败时用尽重试次数后报错，带上最后一次的原因', async t => {
  const distDir = await fixture(t, SITE);
  const { result, calls } = await run(distDir, { ...GOOD, '/main.js': new TypeError('fetch failed') }, { retries: 2 });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].reason, /fetch failed/);
  assert.equal(calls.filter(call => call.pathname === '/main.js').length, 3);
});

test('4xx 不重试', async t => {
  const distDir = await fixture(t, SITE);
  const { calls } = await run(distDir, { ...GOOD, '/main.js': { status: 404, body: 'nope' } });
  assert.equal(calls.filter(call => call.pathname === '/main.js').length, 1);
});

test('waitUntilReachable：只要有 HTTP 应答（哪怕 404）就算连得上，不多请求', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return new Response('nothing here', { status: 404 });
  };
  await waitUntilReachable({ baseUrl: BASE, fetchImpl, intervalMs: 0 });
  assert.deepEqual(calls, [BASE]);
});

test('waitUntilReachable：新项目的子域名证书还没签发时，一直等到连上，只提示一次', async () => {
  const notices = [];
  const failures = [
    Object.assign(new TypeError('fetch failed'), { cause: { code: 'ERR_SSL_TLS_ALERT_HANDSHAKE_FAILURE' } })
  ];
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts <= 3) throw failures[0];
    return new Response('ok');
  };
  await waitUntilReachable({ baseUrl: BASE, fetchImpl, intervalMs: 0, onWait: message => notices.push(message) });
  assert.equal(attempts, 4);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /ERR_SSL_TLS_ALERT_HANDSHAKE_FAILURE/);
});

test('waitUntilReachable：超过时限仍连不上就报错，带上地址与最后一次的原因', async () => {
  const fetchImpl = async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  };
  await assert.rejects(
    waitUntilReachable({ baseUrl: BASE, fetchImpl, timeoutMs: 30, intervalMs: 10 }),
    error => error.message.includes(BASE) && error.message.includes('ENOTFOUND')
  );
});
