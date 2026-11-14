import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { createDashboardServer, probeService, renderDashboard } from './dashboard.mjs';
import { previewUrl, webUrl } from './services.mjs';

const WORKSPACE = '/work/rxdb product';

/** 在随机端口启动服务；测试结束时连同保活连接一起关掉，避免 close 等待空闲连接。 */
async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  return server.address().port;
}

/** 取一个当前没有人监听的端口。 */
async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

/** 用指定的 Host 请求导航服务；fetch 不允许改 Host，这里直接用 http 模块。 */
function request(port, path, { method = 'GET', host = `127.0.0.1:${port}` } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method, headers: { host } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('导航页列出服务入口、常用命令与文档，并标明当前检出位', async () => {
  const html = await renderDashboard({ workspaceRoot: WORKSPACE, branch: 'feature/desk' });
  assert.match(html, /<title>Aiao Desktop 开发导航<\/title>/);
  for (const href of [`${webUrl}/`, `${webUrl}/?boot=0`, `${previewUrl}/`])
    assert.ok(html.includes(`href="${href}"`), href);
  for (const command of [
    'pnpm nx run aiao-desktop:verify',
    'pnpm nx run aiao-desktop-e2e:e2e',
    'pnpm nx run aiao-desktop-web:serve-static'
  ])
    assert.ok(html.includes(`data-copy="${command}"`), command);
  assert.ok(html.includes('href="vscode://file/work/rxdb%20product/aiao-desktop/README.md"'));
  assert.ok(html.includes('feature/desk'));
  assert.doesNotMatch(html, /\{\{.*?\}\}/);
});

test('检出位与分支名按 HTML 转义后再写入页面', async () => {
  const html = await renderDashboard({ workspaceRoot: '/tmp/<x>"', branch: '<script>alert(1)</script>' });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('/tmp/<x>"'));
});

test('导航服务返回页面与服务状态，不缓存、不带来源', async t => {
  const probe = async url => ({ up: url.startsWith(webUrl), isolated: url.startsWith(webUrl) });
  const port = await listen(t, createDashboardServer({ render: async () => '<p>导航</p>', probe }));

  const page = await request(port, '/');
  assert.equal(page.status, 200);
  assert.equal(page.body, '<p>导航</p>');
  assert.match(page.headers['content-type'], /^text\/html; charset=utf-8/);
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.equal(page.headers['referrer-policy'], 'no-referrer');

  const status = await request(port, '/status.json');
  assert.equal(status.status, 200);
  assert.equal(status.headers['cache-control'], 'no-store');
  assert.deepEqual(JSON.parse(status.body), {
    web: { up: true, isolated: true },
    preview: { up: false, isolated: false }
  });
});

test('每次请求重新渲染导航页，模板出错时返回 500 并写明原因', async t => {
  let calls = 0;
  const render = async () => {
    calls += 1;
    if (calls === 2) throw new Error('导航模板引用了未知的占位符：X');
    return `<p>第 ${calls} 次</p>`;
  };
  const port = await listen(t, createDashboardServer({ render, probe: async () => ({}) }));
  assert.equal((await request(port, '/')).body, '<p>第 1 次</p>');
  const failed = await request(port, '/');
  assert.equal(failed.status, 500);
  assert.match(failed.body, /未知的占位符：X/);
  assert.equal((await request(port, '/')).body, '<p>第 3 次</p>');
});

test('导航服务拒绝其他 Host、其他方法与未知路径', async t => {
  const port = await listen(t, createDashboardServer({ render: async () => '<p>导航</p>', probe: async () => ({}) }));
  assert.equal((await request(port, '/', { host: 'evil.example' })).status, 403);
  assert.equal((await request(port, '/', { host: `localhost:${port}` })).status, 200);
  assert.equal((await request(port, '/', { method: 'POST' })).status, 405);
  assert.equal((await request(port, '/README.md')).status, 404);
});

test('探测服务：带齐跨源隔离响应头才算隔离，连不上或超时算未运行', async t => {
  const isolatedPort = await listen(
    t,
    createServer((_, response) => {
      response.writeHead(200, {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      });
      response.end('ok');
    })
  );
  const plainPort = await listen(
    t,
    createServer((_, response) => response.end('ok'))
  );
  const slowPort = await listen(
    t,
    createServer(() => undefined)
  );
  const closedPort = await freePort();

  assert.deepEqual(await probeService(`http://127.0.0.1:${isolatedPort}/`), { up: true, isolated: true });
  assert.deepEqual(await probeService(`http://127.0.0.1:${plainPort}/`), { up: true, isolated: false });
  assert.deepEqual(await probeService(`http://127.0.0.1:${closedPort}/`), { up: false, isolated: false });
  assert.deepEqual(await probeService(`http://127.0.0.1:${slowPort}/`, { timeout: 200 }), {
    up: false,
    isolated: false
  });
});
