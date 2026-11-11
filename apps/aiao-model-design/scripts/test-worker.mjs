import { chromium } from '@playwright/test';
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
    'TRIGGER_API_URL="http://trigger.invalid"',
    'TRIGGER_SECRET_KEY="test-trigger-secret"'
  ].join('\n')
);
const configFile = join(temporary, 'wrangler.json');
const workerConfig = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
workerConfig.name = 'aiao-model-design-network-test';
workerConfig.main = new URL('../server/index.ts', import.meta.url).pathname;
workerConfig.assets.directory = new URL('../../../dist/apps/aiao-model-design/browser', import.meta.url).pathname;
await writeFile(configFile, JSON.stringify(workerConfig));

const authRequests = [];
const sessionRequests = [];

function reply(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function upstreamRequest(request, response) {
  const url = new URL(request.url, 'http://supabase.invalid');
  if (url.pathname === '/auth/v1/user')
    return reply(response, 200, { id: 'worker-user', email: 'designer@example.com' });
  if (url.pathname === '/api/v1/sessions') {
    sessionRequests.push({ authorization: request.headers.authorization, body: JSON.parse(await readBody(request)) });
    return reply(response, 201, { id: 'session_worker', publicAccessToken: 'worker-pat', isCached: false });
  }
  authRequests.push({ path: url.pathname + url.search, apikey: request.headers.apikey });
  return reply(response, 400, { error_code: 'invalid_credentials' });
}

const upstream = createHttpServer(upstreamRequest);
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const sockets = new Set();
function trackSocket(socket) {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
}
const outboundProxy = createHttpServer(upstreamRequest);
outboundProxy.on('connect', (request, socket, head) => {
  if (!['supabase.invalid:80', 'trigger.invalid:80'].includes(request.url)) return socket.destroy();
  const tunnel = connect(upstream.address().port, '127.0.0.1', () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    tunnel.write(head);
    socket.pipe(tunnel).pipe(socket);
  });
  trackSocket(socket);
  trackSocket(tunnel);
  socket.on('error', () => tunnel.destroy());
  tunnel.on('error', () => socket.destroy());
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

function sessionPost(chatId, headers = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ chatId })
  };
}

let browser;
let proxy;
try {
  await waitForWorker();
  for (const [path, init, status] of [
    ['/health', {}, 200],
    ['/api/agent/session', sessionPost('md-worker-user-a'), 401],
    ['/api/ai/model/generate', { method: 'POST', body: '{"prompt":"test"}' }, 404],
    ['/api/model-designer/sql/execute', { method: 'POST', body: '{}' }, 404],
    ['/bff/auth/session', {}, 200]
  ]) {
    const response = await fetch(origin + path, init);
    assert.equal(response.status, status, path);
    console.log(`${path}: ${status}`);
  }
  assert.deepEqual(await (await fetch(`${origin}/api/agent/config`)).json(), {
    enabled: true,
    apiUrl: 'http://trigger.invalid',
    task: 'model-designer'
  });
  const signin = await fetch(`${origin}/bff/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'diagnostic@example.invalid', password: 'diagnostic-only' })
  });
  assert.equal(signin.status, 401, 'Worker 应经过 HTTP_PROXY 访问 Supabase');
  assert.deepEqual(authRequests, [{ path: '/auth/v1/token?grant_type=password', apikey: 'test-anon' }]);
  console.log('Worker 出站代理连接 Supabase，通过真实运行时验证');

  const cookie = { cookie: 'access_token=worker-test' };
  const issued = await fetch(`${origin}/api/agent/session`, sessionPost('md-worker-user-chat-1', cookie));
  assert.equal(issued.status, 200);
  assert.deepEqual(await issued.json(), { publicAccessToken: 'worker-pat' });
  assert.equal(sessionRequests.length, 1);
  assert.equal(sessionRequests[0].authorization, 'Bearer test-trigger-secret');
  assert.equal(sessionRequests[0].body.externalId, 'md-worker-user-chat-1');
  assert.equal(sessionRequests[0].body.taskIdentifier, 'model-designer');
  const foreign = await fetch(`${origin}/api/agent/session`, sessionPost('md-another-user-chat-1', cookie));
  assert.equal(foreign.status, 403);
  assert.equal(sessionRequests.length, 1);
  console.log('真实 Worker 经出站代理为本人签发会话令牌，拒绝他人的 chatId');

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
    const response = await fetch(
      `${proxyOrigin}/api/agent/session`,
      sessionPost('md-worker-user-chat-1', { origin: requestOrigin })
    );
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
  upstream.closeAllConnections();
  await Promise.all([
    new Promise(resolve => outboundProxy.close(resolve)),
    new Promise(resolve => upstream.close(resolve)),
    rm(temporary, { recursive: true, force: true })
  ]);
}
