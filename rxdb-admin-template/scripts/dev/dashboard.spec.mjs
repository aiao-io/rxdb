import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { describe, it } from 'node:test';
import { deployedWorkspace } from '../../deploy/scripts/lib/paths.mjs';
import { developmentAccounts } from './accounts.mjs';
import {
  accountCodes,
  createDashboardServer,
  dashboardValues,
  probeHttp,
  probeTcp,
  renderDashboard,
  serviceStatus
} from './dashboard.mjs';
import { apiUrl, apps, stack } from './services.mjs';

const secrets = {
  POSTGRES_PASSWORD: 'superuser-password-value',
  ANON_KEY: 'anon-key-value',
  SERVICE_ROLE_KEY: 'service-role-key-value',
  JWT_SECRET: 'jwt-secret-value',
  JWT_KEYS: 'jwt-signing-keys-value',
  ADMIN_SERVICE_PASSWORD: 'service-password-value',
  ADMIN_BOOTSTRAP_KEY: 'bootstrap-key-value'
};
const values = dashboardValues({ secrets, workspaceRoot: '/work/rxdb product', branch: 'admin-template' });

/** 在随机端口启动服务；测试结束时连同保活连接一起关掉。 */
async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections?.();
    return new Promise(resolve => server.close(resolve));
  });
  return server.address().port;
}

/** 取一个当前没有人监听的端口。 */
async function freePort() {
  const server = createTcpServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

/** 用指定的 Host 请求导航服务；fetch 不允许改 Host，这里直接用 http 模块。 */
function request(port, target, { method = 'GET', host = `127.0.0.1:${port}` } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: target, method, headers: { host } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('开发导航页', () => {
  it('列出三端入口、团队协作入口、后端服务与常用命令，不留占位符', async () => {
    const html = await renderDashboard(values);
    assert.match(html, /<title>RxDB Admin Template 开发导航<\/title>/);
    for (const app of apps) {
      assert.ok(html.includes(`href="http://127.0.0.1:${app.port}/"`), app.id);
      assert.ok(html.includes(`href="http://127.0.0.1:${app.port}/collaboration"`), app.id);
    }
    for (const href of [`${apiUrl}/health`, stack.studio, stack.mail, `${stack.collector}/events`])
      assert.ok(html.includes(`href="${href}`), href);
    for (const command of [
      'pnpm nx run rxdb-admin-template:local-down',
      'pnpm nx run rxdb-admin-template:local-down -- --volumes',
      'AIAO_DEV_OPEN=false pnpm nx dev rxdb-admin-template'
    ])
      assert.ok(html.includes(`data-copy="${command}"`), command);
    assert.ok(html.includes('href="vscode://file/work/rxdb%20product/rxdb-admin-template/README.md"'));
    assert.doesNotMatch(html, /\{\{.*?\}\}/);
  });

  it('列出每个测试账号的邮箱、权限与验证码位置，并说明登录不需要密码', async () => {
    const html = await renderDashboard(values);
    for (const account of developmentAccounts) {
      assert.ok(html.includes(`data-copy="${account.email}"`), account.email);
      assert.ok(html.includes(`data-code="${account.email}"`), account.email);
    }
    assert.match(html, /没有密码/);
    assert.ok(html.includes(deployedWorkspace.name));
  });

  it('给出数据库连接与公开 anon key，不放 service role key、JWT 密钥、专用角色口令与初始化密钥', async () => {
    const database = new URL(values.DB_URI);
    assert.equal(database.username, 'postgres');
    assert.equal(database.password, secrets.POSTGRES_PASSWORD);
    assert.equal(database.port, String(stack.database));
    const html = await renderDashboard(values);
    assert.ok(html.includes(secrets.POSTGRES_PASSWORD));
    assert.ok(html.includes(secrets.ANON_KEY));
    for (const name of ['SERVICE_ROLE_KEY', 'JWT_SECRET', 'JWT_KEYS', 'ADMIN_SERVICE_PASSWORD', 'ADMIN_BOOTSTRAP_KEY'])
      assert.ok(!html.includes(secrets[name]), name);
  });

  it('写进页面的取值一律按 HTML 转义，账号表也一样', async () => {
    const accounts = [{ key: 'x', role: '<b>角色</b>', email: 'x"@example.test', permissions: ['read'], duty: '<i>' }];
    const html = await renderDashboard(
      dashboardValues({ secrets, workspaceRoot: '/tmp/<x>"', branch: '<script>alert(1)</script>', accounts })
    );
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('/tmp/<x>"'));
    assert.ok(!html.includes('<b>角色</b>'));
    assert.ok(html.includes('x&quot;@example.test'));
  });

  it('模板引用未知的占位符时报错', async () => {
    await assert.rejects(renderDashboard(values, '<p>{{ NOT_DEFINED }}</p>'), /NOT_DEFINED/);
  });
});

describe('开发导航服务', () => {
  const page = async () => '<p>导航</p>';
  const status = async () => ({ react: { state: 'up' } });
  const codes = async () => ({ 'owner@admin-template.local': { code: '123456', receivedAt: 'now' } });

  it('返回页面、服务状态与验证码，不缓存、不带来源、限制脚本与嵌入', async t => {
    const port = await listen(t, createDashboardServer({ render: page, status, codes }));
    const home = await request(port, '/');
    assert.equal(home.status, 200);
    assert.equal(home.body, '<p>导航</p>');
    assert.match(home.headers['content-type'], /^text\/html; charset=utf-8/);
    assert.equal(home.headers['cache-control'], 'no-store');
    assert.equal(home.headers['referrer-policy'], 'no-referrer');
    assert.equal(home.headers['x-content-type-options'], 'nosniff');
    assert.match(home.headers['content-security-policy'], /default-src 'none'/);
    assert.match(home.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.deepEqual(JSON.parse((await request(port, '/status.json')).body), await status());
    assert.deepEqual(JSON.parse((await request(port, '/codes.json')).body), await codes());
  });

  it('每次请求重新渲染，渲染出错时返回 500 并写明原因', async t => {
    let calls = 0;
    const render = async () => {
      calls += 1;
      if (calls === 2) throw new Error('缺少 deploy/local/.env.local');
      return `<p>第 ${calls} 次</p>`;
    };
    const port = await listen(t, createDashboardServer({ render, status, codes }));
    assert.equal((await request(port, '/')).body, '<p>第 1 次</p>');
    const failed = await request(port, '/');
    assert.equal(failed.status, 500);
    assert.match(failed.body, /缺少 deploy\/local\/\.env\.local/);
    assert.equal((await request(port, '/')).body, '<p>第 3 次</p>');
  });

  it('收件服务不可用时验证码接口返回 502 与原因', async t => {
    const failing = async () => {
      throw new Error('收件服务返回 500');
    };
    const port = await listen(t, createDashboardServer({ render: page, status, codes: failing }));
    const response = await request(port, '/codes.json');
    assert.equal(response.status, 502);
    assert.deepEqual(JSON.parse(response.body), { error: '收件服务返回 500' });
  });

  it('只接受指向本机回环地址的 Host、GET 与 HEAD，未知路径 404', async t => {
    const port = await listen(t, createDashboardServer({ render: page, status, codes }));
    assert.equal((await request(port, '/', { host: 'evil.example' })).status, 403);
    assert.equal((await request(port, '/', { host: `localhost:${port}` })).status, 200);
    assert.equal((await request(port, '/', { method: 'HEAD' })).status, 200);
    const post = await request(port, '/', { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
    assert.equal((await request(port, '/README.md')).status, 404);
  });
});

describe('服务状态探测', () => {
  it('HTTP：有应答即运行中，5xx 算异常，连不上或超时算未响应；重定向不跟随', async t => {
    const reply = status => createServer((_, response) => response.writeHead(status, { location: '/x' }).end());
    const ok = await listen(t, reply(200));
    const failing = await listen(t, reply(503));
    const redirect = await listen(t, reply(307));
    const slow = await listen(
      t,
      createServer(() => undefined)
    );
    const closed = await freePort();
    assert.deepEqual(await probeHttp(`http://127.0.0.1:${ok}/`), { state: 'up', status: 200 });
    assert.deepEqual(await probeHttp(`http://127.0.0.1:${failing}/`), { state: 'degraded', status: 503 });
    assert.deepEqual(await probeHttp(`http://127.0.0.1:${redirect}/`), { state: 'up', status: 307 });
    assert.deepEqual(await probeHttp(`http://127.0.0.1:${closed}/`), { state: 'down' });
    assert.deepEqual(await probeHttp(`http://127.0.0.1:${slow}/`, { timeout: 200 }), { state: 'down' });
  });

  it('TCP：能连上即运行中', async t => {
    const open = await listen(
      t,
      createTcpServer(socket => socket.end())
    );
    assert.deepEqual(await probeTcp(open), { state: 'up' });
    assert.deepEqual(await probeTcp(await freePort()), { state: 'down' });
  });

  it('汇总三端、协作命令服务、网关、Studio、收件服务、收集器、数据库与连接池', async () => {
    const seen = [];
    const http = async (url, options = {}) => {
      seen.push({ url, headers: options.headers });
      return { state: 'up', status: 200, body: url.endsWith('/health') ? { status: 'ok' } : undefined };
    };
    const tcp = async port => ({ state: port === stack.database ? 'up' : 'down' });
    const result = await serviceStatus({ anonKey: secrets.ANON_KEY, http, tcp });
    assert.deepEqual(Object.keys(result), [
      'react',
      'angular',
      'vue',
      'api',
      'gateway',
      'studio',
      'mail',
      'collector',
      'database',
      'pooler'
    ]);
    assert.deepEqual(result.database, { state: 'up' });
    assert.deepEqual(result.pooler, { state: 'down' });
    const gateway = seen.find(item => item.url === `${stack.gateway}/auth/v1/health`);
    assert.equal(gateway.headers.apikey, secrets.ANON_KEY);
    assert.ok(seen.some(item => item.url === `${apiUrl}/health`));
  });
});

describe('测试账号的最新验证码', () => {
  it('逐个账号读收件服务，按邮箱汇总', async () => {
    const read = async email => (email.startsWith('reviewer') ? { code: '654321', receivedAt: 't' } : null);
    const result = await accountCodes({ read });
    assert.deepEqual(
      Object.keys(result),
      developmentAccounts.map(account => account.email)
    );
    assert.deepEqual(result['reviewer@admin-template.local'], { code: '654321', receivedAt: 't' });
    assert.equal(result['owner@admin-template.local'], null);
  });
});
