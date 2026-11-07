import { chromium } from '@playwright/test';
import { EventSourceParserStream } from 'eventsource-parser/stream';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const app = new URL('../', import.meta.url).pathname;
const origin = 'http://127.0.0.1:4389';
const temporary = await mkdtemp(join(tmpdir(), 'model-design-worker-'));
const envFile = join(temporary, '.dev.vars');
await writeFile(
  envFile,
  [
    'SUPABASE_URL="http://supabase.invalid"',
    'SUPABASE_ANON_KEY="test-anon"',
    'DEEPSEEK_API_KEY="test-ai-key"',
    'DEEPSEEK_BASE_URL="http://provider.invalid/v1"'
  ].join('\n')
);
const configFile = join(temporary, 'wrangler.json');
const workerConfig = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
workerConfig.name = 'aiao-model-design-network-test';
workerConfig.main = new URL('../server/index.ts', import.meta.url).pathname;
workerConfig.assets.directory = new URL('../../../dist/apps/aiao-model-design/browser', import.meta.url).pathname;
await writeFile(configFile, JSON.stringify(workerConfig));
const authRequests = [];
function rejectCredentials(request, response) {
  const url = new URL(request.url, 'http://supabase.invalid');
  authRequests.push({ path: url.pathname + url.search, apikey: request.headers.apikey });
  response.writeHead(400, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error_code: 'invalid_credentials' }));
}
const completions = [];
const firstDelta = '{"thinking":"逐步';
const lastDelta = '生成","entities":[]}';
function sendCompletion(response, content, finishReason = null) {
  response.write(
    `data: ${JSON.stringify({
      id: 'worker-completion',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'deepseek-chat',
      choices: [{ index: 0, delta: { content }, finish_reason: finishReason }]
    })}\n\n`
  );
}
function upstreamRequest(request, response) {
  const url = new URL(request.url, 'http://supabase.invalid');
  if (url.pathname === '/auth/v1/user') {
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end(JSON.stringify({ id: 'worker-user', email: 'designer@example.com' }));
  }
  if (url.pathname !== '/v1/chat/completions') return rejectCredentials(request, response);
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  sendCompletion(response, firstDelta);
  completions.push(() => {
    sendCompletion(response, lastDelta);
    sendCompletion(response, '', 'stop');
    response.end('data: [DONE]\n\n');
  });
}
const auth = createHttpServer(upstreamRequest);
await new Promise(resolve => auth.listen(0, '127.0.0.1', resolve));
const sockets = new Set();
function trackSocket(socket) {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
}
const outboundProxy = createHttpServer(upstreamRequest);
outboundProxy.on('connect', (request, socket, head) => {
  if (!['supabase.invalid:80', 'provider.invalid:80'].includes(request.url)) return socket.destroy();
  const upstream = connect(auth.address().port, '127.0.0.1', () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  trackSocket(socket);
  trackSocket(upstream);
  socket.on('error', () => upstream.destroy());
  upstream.on('error', () => socket.destroy());
});
await new Promise(resolve => outboundProxy.listen(0, '127.0.0.1', resolve));
const proxyUrl = `http://127.0.0.1:${outboundProxy.address().port}`;
const server = spawn(
  process.execPath,
  [new URL('./serve-api.mjs', import.meta.url).pathname, '--port', '4389', '--config', configFile],
  {
    cwd: app,
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: 'false',
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      NO_PROXY: 'localhost,127.0.0.1,::1',
      http_proxy: proxyUrl,
      https_proxy: proxyUrl,
      no_proxy: 'localhost,127.0.0.1,::1'
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  }
);
let logs = '';
let serverError;
server.stdout.on('data', chunk => {
  logs += chunk;
});
server.stderr.on('data', chunk => {
  logs += chunk;
});
server.on('error', error => {
  serverError = error;
});

async function waitForWorker() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error(`Worker exited: ${logs}`);
    const response = await fetch(`${origin}/health`).catch(() => null);
    if (response?.ok) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Worker startup timed out: ${logs}`);
}

let browser;
let proxy;
try {
  await waitForWorker();
  for (const [path, init, status] of [
    ['/health', {}, 200],
    [
      '/api/ai/model/generate',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"prompt":"test"}' },
      401
    ],
    ['/api/model-designer/sql/execute', { method: 'POST', body: '{}' }, 404],
    ['/bff/auth/session', {}, 200]
  ]) {
    const response = await fetch(origin + path, init);
    assert.equal(response.status, status, path);
    console.log(`${path}: ${status}`);
  }
  const signin = await fetch(`${origin}/bff/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'diagnostic@example.invalid', password: 'diagnostic-only' })
  });
  assert.equal(signin.status, 401, 'Worker 应经过 HTTP_PROXY 访问 Supabase');
  assert.deepEqual(authRequests, [{ path: '/auth/v1/token?grant_type=password', apikey: 'test-anon' }]);
  console.log('Worker 出站代理连接 Supabase，通过真实运行时验证');
  for (const action of ['generate', 'chat']) {
    const body = action === 'generate' ? { prompt: '用户模型' } : { messages: [{ role: 'user', content: '用户模型' }] };
    const response = await fetch(`${origin}/api/ai/model/${action}`, {
      method: 'POST',
      headers: { cookie: 'access_token=worker-test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    assert.match(response.headers.get('cache-control'), /no-transform/);
    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventSourceParserStream())
      .getReader();
    let text = '';
    let finished = false;
    while (!finished) {
      const next = await reader.read();
      assert.equal(next.done, false, `${action}: 必须有结束标志`);
      if (next.value.data === '[DONE]') {
        finished = true;
        continue;
      }
      const event = JSON.parse(next.value.data);
      assert.notEqual(event.type, 'error', `${action}: ${event.errorText}`);
      if (event.type !== 'text-delta') continue;
      text += event.delta;
      if (text === firstDelta) completions.shift()();
    }
    assert.equal(text, firstDelta + lastDelta);
    await reader.cancel();
    reader.releaseLock();
    console.log(`${action}: 真实 Worker 在上游结束前发出 SSE 文本事件`);
  }
  const config = createRequire(import.meta.url)('../proxy.conf.cjs');
  proxy = await createServer({
    configFile: false,
    root: app,
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': { ...config['/api/**'], target: origin } } }
  });
  await proxy.listen();
  const proxyOrigin = proxy.resolvedUrls.local[0].replace(/\/$/, '');
  for (const [requestOrigin, status] of [
    [proxyOrigin, 401],
    ['https://evil.example', 403]
  ]) {
    const response = await fetch(`${proxyOrigin}/api/ai/model/generate`, {
      method: 'POST',
      headers: { origin: requestOrigin, 'content-type': 'application/json' },
      body: '{"prompt":"test"}'
    });
    assert.equal(response.status, status, `开发代理: ${requestOrigin}`);
  }
  console.log('开发代理放行同源请求，拒绝跨站请求');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let user = null;
  let credentials;
  await page.route('**/bff/auth/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/signin')) {
      credentials = route.request().postDataJSON();
      user = { id: 'user', email: 'designer@example.com' };
    }
    if (path.endsWith('/signout')) user = null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) });
  });
  await page.goto(`${origin}/login.html`);
  await page.getByLabel('邮箱').fill('designer@example.com');
  await page.getByLabel('密码').fill('test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL('**/model-designer/canvas');
  assert.deepEqual(credentials, { email: 'designer@example.com', password: 'test-password' });
  await page.goto(`${origin}/login.html`);
  await page.getByText('已登录：designer@example.com').waitFor();
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.getByLabel('邮箱').waitFor({ state: 'visible' });
  await page.getByText('已退出登录。').waitFor();
  console.log('Worker 路由、登录表单、设计器跳转和退出登录通过');
} finally {
  await browser?.close();
  await proxy?.close();
  if (server.pid && server.exitCode === null) process.kill(-server.pid, 'SIGTERM');
  for (const socket of sockets) socket.destroy();
  outboundProxy.closeAllConnections();
  auth.closeAllConnections();
  await Promise.all([
    new Promise(resolve => outboundProxy.close(resolve)),
    new Promise(resolve => auth.close(resolve)),
    rm(temporary, { recursive: true, force: true })
  ]);
}
