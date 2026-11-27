import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { get } from 'node:http';
import { test } from 'node:test';
import { createDashboardServer, dashboardValues, renderDashboard } from './dashboard.mjs';

const stack = {
  project: 'rxdb-supabase-0123456789',
  url: 'http://localhost:55001',
  anonKey: 'eyJhbGciOiJIUzI1NiJ9.anon.signature',
  studioUrl: 'http://127.0.0.1:63915'
};

async function renderedTemplate() {
  const template = await readFile(new URL('./dashboard.html', import.meta.url), 'utf8');
  return renderDashboard(template, dashboardValues(stack));
}

async function listen(t, html) {
  const server = createDashboardServer(html);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return server.address().port;
}

function request(port, path, host = `127.0.0.1:${port}`) {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path, headers: { host } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    }).on('error', reject);
  });
}

test('占位符替换成 HTML 转义后的值，属性与正文里都不能注入标记', () => {
  const value = `http://x/?a=1&b="2"<script>'`;
  assert.equal(
    renderDashboard('<a href="{{ URL }}">{{URL}}</a>', { URL: value }),
    '<a href="http://x/?a=1&amp;b=&quot;2&quot;&lt;script&gt;&#39;">http://x/?a=1&amp;b=&quot;2&quot;&lt;script&gt;&#39;</a>'
  );
});

test('模板引用了未提供的值时直接失败，不渲染出 undefined', () => {
  assert.throws(() => renderDashboard('<code>{{ MISSING }}</code>', {}), /MISSING/);
});

test('起始页模板的每个占位符都有值', async () => {
  assert.doesNotMatch(await renderedTemplate(), /\{\{|\}\}/);
});

test('起始页给出连本栈的测试入口与命令', async () => {
  const html = await renderedTemplate();
  assert.ok(html.includes('href="http://localhost:4203/todo"'), 'Todo 入口');
  assert.ok(!html.includes('/todo-cursor'), 'Todo 只有一个页面，不再链到已删掉的 /todo-cursor');
  assert.ok(html.includes('href="http://localhost:4203/catalog"'), '商品目录（按身份同步）入口');
  for (const identity of ['访客', '匿名用户', 'Alice', 'Bob']) {
    assert.ok(html.includes(identity), `测试身份：${identity}`);
  }
  assert.ok(html.includes('SELECT public.demo_catalog_reset()'), '可复制的演示数据重置命令');
  assert.ok(html.includes('href="http://127.0.0.1:63915"'), 'Studio 入口');
  assert.ok(html.includes('href="http://localhost:55001"'), 'Supabase API 网关');
  assert.ok(html.includes(`data-copy="${stack.anonKey}"`), '可复制的 anon key');
  // 起始页只在 dev 链开着时看得到，这时 serve-remote 起不来（Nx 不让同一个 serve 任务跑两份）：
  // 命令要打到开着的 dev server，且不带依赖任务，否则一直挂着（与 e2e README 同一写法）
  assert.ok(
    html.includes(
      'BASE_URL=http://localhost:4203 VITE_SUPABASE_URL=http://localhost:55001 ' +
        'pnpm nx run dev-rxdb-supabase-e2e:e2e-remote --excludeTaskDependencies'
    ),
    '远端 e2e 命令打到开着的 dev server、指向本栈的实际端口'
  );
});

test('测试入口的计数与卡片数一致', async () => {
  const html = await renderedTemplate();
  const entries = html.slice(html.indexOf('id="entries-title"'), html.indexOf('class="details"'));
  const caption = entries.match(/<span class="caption">(\d+) 个入口<\/span>/);
  assert.ok(caption, '入口计数');
  assert.equal(Number(caption[1]), entries.match(/<a class="card"/g)?.length);
});

test('起始页不缓存、不向外发 Referer', async t => {
  const port = await listen(t, '<p>ready</p>');
  const response = await request(port, '/');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /^text\/html; charset=utf-8$/);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.body, '<p>ready</p>');
});

test('localhost 与 127.0.0.1 两种写法都能打开起始页', async t => {
  const port = await listen(t, '<p>ready</p>');
  assert.equal((await request(port, '/', `localhost:${port}`)).status, 200);
});

test('Host 不是本机地址的请求一律拒绝，挡住 DNS 重绑定读取页面', async t => {
  const port = await listen(t, '<p>ready</p>');
  const response = await request(port, '/', `attacker.example:${port}`);
  assert.equal(response.status, 403);
  assert.ok(!response.body.includes('ready'));
});

test('起始页之外的路径返回 404', async t => {
  const port = await listen(t, '<p>ready</p>');
  assert.equal((await request(port, '/favicon.ico')).status, 404);
});
