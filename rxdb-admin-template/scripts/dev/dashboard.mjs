/**
 * 开发导航（`127.0.0.1:4209`）：只监听本机回环地址的小服务，提供导航页、各服务的运行状态与测试账号的最新验证码。
 * 页面里有本地数据库口令（`.env.local` 随机生成，只在本机），所以只接受指向回环地址的 Host（挡住 DNS 重绑定），不缓存、不带来源、
 * 不允许被嵌入；service role key、JWT 密钥、协作专用角色口令与初始化密钥一概不放进页面。只在本地开发时运行，不进任何构建产物。
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { databaseUrl, loadEnv } from '../../deploy/scripts/lib/env.mjs';
import { deployedWorkspace, workspaceRoot } from '../../deploy/scripts/lib/paths.mjs';
import { developmentAccounts } from './accounts.mjs';
import { untilStopped } from './lifecycle.mjs';
import { latestCode } from './mail.mjs';
import { apiUrl, appUrl, apps, dashboard, dashboardUrl, host, stack } from './services.mjs';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ENTITIES[char]);

/** VS Code 的文件链接：逐段编码，路径里的空格、`#`、`?` 都不会截断链接。 */
const editorRoot = root => `vscode://file${root.split('/').map(encodeURIComponent).join('/')}/`;

/** 测试账号表的行：每个取值都先转义，整段作为已转义的片段交给模板。 */
function accountRows(accounts) {
  return accounts
    .map(account => {
      const email = escapeHtml(account.email);
      const permissions = account.permissions.map(permission => `<code>${escapeHtml(permission)}</code>`).join(' ');
      return [
        '<tr>',
        `<td><strong>${escapeHtml(account.role)}</strong><span class="hint">${escapeHtml(account.duty)}</span></td>`,
        `<td><code>${email}</code> <button aria-label="复制邮箱 ${email}" data-copy="${email}" type="button">复制</button></td>`,
        `<td class="permissions">${permissions}</td>`,
        `<td><span class="code" data-code="${email}">读取中</span></td>`,
        '</tr>'
      ].join('');
    })
    .join('\n');
}

/**
 * 导航页的取值：服务地址、连接信息、测试账号与当前检出位。
 *
 * @param {object} options
 * @param {Record<string, string>} options.secrets `.env.local` 的内容（只取数据库口令与公开的 anon key）
 * @param {string} options.workspaceRoot 仓库根的绝对路径（「在 VS Code 中打开」链接与页脚）
 * @param {string} options.branch 当前分支，显示在页脚，区分多个检出位
 * @param {typeof developmentAccounts} [options.accounts]
 */
export function dashboardValues({ secrets, workspaceRoot: root, branch, accounts = developmentAccounts }) {
  const dbUri = databaseUrl('postgres', secrets.POSTGRES_PASSWORD, stack.database);
  const app = Object.fromEntries(apps.map(item => [item.id, appUrl(item)]));
  return {
    REACT_URL: app.react,
    ANGULAR_URL: app.angular,
    VUE_URL: app.vue,
    API_URL: apiUrl,
    GATEWAY_URL: stack.gateway,
    STUDIO_URL: stack.studio,
    MAIL_URL: stack.mail,
    COLLECTOR_URL: stack.collector,
    DB_ADDRESS: `${host}:${stack.database}`,
    POOLER_ADDRESS: `${host}:${stack.pooler}`,
    DB_PASSWORD: secrets.POSTGRES_PASSWORD,
    DB_URI: dbUri,
    PSQL_COMMAND: `psql "${dbUri}"`,
    ANON_KEY: secrets.ANON_KEY,
    TEAM_NAME: deployedWorkspace.name,
    TEAM_ID: deployedWorkspace.teamId,
    APP_ID: deployedWorkspace.appId,
    ACCOUNT_ROWS: { html: accountRows(accounts) },
    DASHBOARD_ADDRESS: `${host}:${dashboard.port}`,
    EDITOR_ROOT: editorRoot(root),
    WORKSPACE: root,
    BRANCH: branch
  };
}

/**
 * 把取值填进模板的 `{{ 名称 }}`：字符串一律转义，`{ html }` 是已经转义好的片段。模板引用了没有的取值时报错。
 *
 * @param {Record<string, string | number | { html: string }>} values
 * @param {string} [template] 默认读同目录的 dashboard.html（每次重新读，改模板刷新即见）
 */
export async function renderDashboard(values, template) {
  const source = template ?? (await readFile(new URL('./dashboard.html', import.meta.url), 'utf8'));
  return source.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`导航模板引用了未知的占位符：${name}`);
    const value = values[name];
    return typeof value === 'object' ? value.html : escapeHtml(value);
  });
}

/**
 * HTTP 探测：拿到应答就算运行中（5xx 算异常），连不上或超时算未响应；不跟随重定向。
 *
 * @param {string} url
 * @param {{ headers?: Record<string, string>, timeout?: number }} [options]
 * @returns {Promise<{ state: 'up' | 'degraded' | 'down', status?: number, body?: unknown }>}
 */
export async function probeHttp(url, { headers = {}, timeout = 1500 } = {}) {
  try {
    const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
    const state = response.status < 500 ? 'up' : 'degraded';
    if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
      await response.body?.cancel();
      return { state, status: response.status };
    }
    return { state, status: response.status, body: await response.json() };
  } catch {
    return { state: 'down' };
  }
}

/** TCP 探测（数据库与连接池）：能连上就算运行中。 */
export function probeTcp(port, { timeout = 1500 } = {}) {
  return new Promise(resolveProbe => {
    const socket = connect({ host, port, timeout });
    const settle = state => {
      socket.destroy();
      resolveProbe({ state });
    };
    socket.once('connect', () => settle('up'));
    socket.once('timeout', () => settle('down'));
    socket.once('error', () => settle('down'));
  });
}

/**
 * 汇总全部服务的状态。协作命令服务的健康检查带数据库与 Auth 两项，原样交给页面；网关要带 anon key 才应答。
 *
 * @param {{ anonKey: string, http?: typeof probeHttp, tcp?: typeof probeTcp }} options
 */
export async function serviceStatus({ anonKey, http = probeHttp, tcp = probeTcp }) {
  const probes = {
    ...Object.fromEntries(apps.map(app => [app.id, () => http(`${appUrl(app)}/`)])),
    api: () => http(`${apiUrl}/health`),
    gateway: () =>
      http(`${stack.gateway}/auth/v1/health`, { headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` } }),
    studio: () => http(`${stack.studio}/`),
    mail: () => http(`${stack.mail}/`),
    collector: () => http(`${stack.collector}/events`),
    database: () => tcp(stack.database),
    pooler: () => tcp(stack.pooler)
  };
  const results = await Promise.all(Object.values(probes).map(probe => probe()));
  return Object.fromEntries(Object.keys(probes).map((name, index) => [name, results[index]]));
}

/**
 * 每个测试账号的最新验证码（还没有时为 null）。
 *
 * @param {{ read?: (email: string) => Promise<{ code: string, receivedAt: string } | null> }} [options]
 */
export async function accountCodes({ read = email => latestCode(email, { mailUrl: stack.mail }) } = {}) {
  const codes = await Promise.all(developmentAccounts.map(account => read(account.email)));
  return Object.fromEntries(developmentAccounts.map((account, index) => [account.email, codes[index]]));
}

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
};

function respond(request, response, status, type, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': type, ...SECURITY_HEADERS, ...headers });
  response.end(request.method === 'HEAD' ? undefined : body);
}

const json = (request, response, status, value) =>
  respond(request, response, status, 'application/json; charset=utf-8', JSON.stringify(value));

/**
 * 导航服务：`/` 返回导航页（每次请求重新渲染），`/status.json` 返回各服务的状态，`/codes.json` 返回测试账号的最新验证码。
 * 只接受指向本机回环地址的 Host，只接受 GET 与 HEAD。渲染或读取出错时写明原因，不吞掉。
 *
 * @param {{ render: () => Promise<string>, status: () => Promise<unknown>, codes: () => Promise<unknown> }} options
 */
export function createDashboardServer({ render, status, codes }) {
  const routes = {
    '/': async (request, response) => respond(request, response, 200, 'text/html; charset=utf-8', await render()),
    '/status.json': async (request, response) => json(request, response, 200, await status()),
    '/codes.json': (request, response) =>
      codes().then(
        value => json(request, response, 200, value),
        error => json(request, response, 502, { error: error.message })
      )
  };
  const server = createServer(async (request, response) => {
    const { port } = server.address();
    if (request.headers.host !== `127.0.0.1:${port}` && request.headers.host !== `localhost:${port}`)
      return respond(request, response, 403, 'text/plain; charset=utf-8', 'Forbidden');
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return respond(request, response, 405, 'text/plain; charset=utf-8', 'Method Not Allowed', {
        Allow: 'GET, HEAD'
      });
    const route = routes[new URL(request.url ?? '/', 'http://localhost').pathname];
    if (!route) return respond(request, response, 404, 'text/plain; charset=utf-8', 'Not Found');
    try {
      await route(request, response);
    } catch (error) {
      console.error(`开发导航出错：${error.message}`);
      respond(request, response, 500, 'text/plain; charset=utf-8', `开发导航出错：${error.message}`);
    }
  });
  return server;
}

async function currentBranch() {
  const { stdout } = await promisify(execFile)('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspaceRoot });
  return stdout.trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const server = createDashboardServer({
    render: async () =>
      renderDashboard(dashboardValues({ secrets: await loadEnv(), workspaceRoot, branch: await currentBranch() })),
    status: async () => serviceStatus({ anonKey: (await loadEnv()).ANON_KEY }),
    codes: () => accountCodes()
  });
  untilStopped(() => {
    server.closeAllConnections();
    server.close();
  });
  server.once('error', error => {
    console.error(`开发导航无法监听 ${dashboardUrl}：${error.message}`);
    process.exit(1);
  });
  server.listen(dashboard.port, host, () => console.info(`开发导航已就绪：${dashboardUrl}`));
}
