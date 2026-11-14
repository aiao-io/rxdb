// 开发导航：只监听本机回环地址的小服务器，提供导航页与各服务的运行状态。只在本地开发时运行，不进入 web 的构建产物。
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { dashboardUrl, previewUrl, services, webUrl } from './services.mjs';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ENTITIES[char]);

/** 状态接口探测的服务。 */
const PROBES = { web: `${webUrl}/`, preview: `${previewUrl}/` };

/** VS Code 的文件链接：逐段编码，路径里的空格、`#`、`?` 都不会截断链接。 */
const editorRoot = workspaceRoot => `vscode://file${workspaceRoot.split('/').map(encodeURIComponent).join('/')}/`;

/**
 * 渲染导航页：把服务地址、当前检出位与分支写进模板，取值一律按 HTML 转义。
 *
 * @param options.workspaceRoot 仓库根目录的绝对路径，用于「在 VS Code 中打开」链接与页脚
 * @param options.branch 当前分支名，显示在页脚，区分多个检出位
 */
export async function renderDashboard({ workspaceRoot, branch }) {
  const template = await readFile(new URL('./dashboard.html', import.meta.url), 'utf8');
  const values = {
    WEB_URL: `${webUrl}/`,
    WEB_NOBOOT_URL: `${webUrl}/?boot=0`,
    WEB_ADDRESS: `${services.web.host}:${services.web.port}`,
    WEB_PORT: services.web.port,
    PREVIEW_URL: `${previewUrl}/`,
    PREVIEW_ADDRESS: `${services.preview.host}:${services.preview.port}`,
    PREVIEW_PORT: services.preview.port,
    DASHBOARD_ADDRESS: `${services.dashboard.host}:${services.dashboard.port}`,
    EDITOR_ROOT: editorRoot(workspaceRoot),
    WORKSPACE: workspaceRoot,
    BRANCH: branch
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`导航模板引用了未知的占位符：${name}`);
    return escapeHtml(values[name]);
  });
}

/**
 * 探测一个本地服务：拿到任何 HTTP 响应就算运行中；同时带上 COOP `same-origin` 与 COEP `require-corp` 才算跨源隔离。
 * 连不上或超时算未运行。
 *
 * @param url 服务地址
 * @param options.timeout 等待响应的毫秒数
 */
export async function probeService(url, { timeout = 1500 } = {}) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeout) });
    await response.body?.cancel();
    const isolated =
      response.headers.get('cross-origin-opener-policy') === 'same-origin' &&
      response.headers.get('cross-origin-embedder-policy') === 'require-corp';
    return { up: true, isolated };
  } catch {
    return { up: false, isolated: false };
  }
}

function respond(request, response, status, type, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

/**
 * 导航服务：`/` 返回导航页，`/status.json` 返回各服务的运行状态。
 * 只接受指向本机回环地址的 Host（挡住 DNS 重绑定），只接受 GET 与 HEAD。
 * 导航页每次请求重新渲染：改模板刷新即见，切分支后页脚也跟着变；渲染出错返回 500 并写明原因。
 *
 * @param options.render 渲染导航页的函数
 * @param options.probe 探测单个服务的函数（测试替身用）
 */
export function createDashboardServer({ render, probe = probeService }) {
  const server = createServer(async (request, response) => {
    const { port } = server.address();
    if (request.headers.host !== `127.0.0.1:${port}` && request.headers.host !== `localhost:${port}`)
      return respond(request, response, 403, 'text/plain; charset=utf-8', 'Forbidden');
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return respond(request, response, 405, 'text/plain; charset=utf-8', 'Method Not Allowed', {
        Allow: 'GET, HEAD'
      });
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname === '/') {
      let html;
      try {
        html = await render();
      } catch (error) {
        console.error(`开发导航渲染失败：${error.message}`);
        return respond(request, response, 500, 'text/plain; charset=utf-8', `开发导航渲染失败：${error.message}`);
      }
      return respond(request, response, 200, 'text/html; charset=utf-8', html);
    }
    if (pathname === '/status.json') {
      const [web, preview] = await Promise.all([probe(PROBES.web), probe(PROBES.preview)]);
      return respond(request, response, 200, 'application/json; charset=utf-8', JSON.stringify({ web, preview }));
    }
    return respond(request, response, 404, 'text/plain; charset=utf-8', 'Not Found');
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const workspaceRoot = path.resolve(import.meta.dirname, '../../..');
  const render = async () => {
    const { stdout } = await promisify(execFile)('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspaceRoot });
    return renderDashboard({ workspaceRoot, branch: stdout.trim() });
  };
  const server = createDashboardServer({ render });
  server.once('error', error => {
    console.error(`开发导航无法监听 ${dashboardUrl}：${error.message}`);
    process.exitCode = 1;
  });
  server.listen(services.dashboard.port, services.dashboard.host, () => console.log(`开发导航已就绪：${dashboardUrl}`));
  const stop = () => {
    server.closeAllConnections();
    server.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
