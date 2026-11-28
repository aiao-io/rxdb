import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appUrl, dashboardPort, dashboardUrl } from './endpoints.mjs';
import { readLocalStack, readStudioUrl } from './local-stack.mjs';

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const pageHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};
const textHeaders = { 'Content-Type': 'text/plain; charset=utf-8' };

/**
 * 把模板里的 `{{ NAME }}` 换成 HTML 转义后的值。
 *
 * @throws {@link Error} 模板引用了 `values` 里没有的名字时
 */
export function renderDashboard(template, values) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`测试起始页模板引用了未提供的值：${name}`);
    return String(values[name]).replace(/[&<>"']/g, char => entities[char]);
  });
}

/**
 * 起始页模板用到的值：本次运行的实际地址、公开 anon key 与连这套栈的远端 e2e 命令。
 *
 * 起始页只在 dev 链开着时看得到，这时 `serve-remote` 起不来（Nx 不让同一个 serve 任务跑两份），
 * 所以远端 e2e 命令打到开着的 dev server（`BASE_URL`）、不带依赖任务，与 e2e README 同一写法。
 * 不带 anon key：dev server 已经配好了，用例只拿 `VITE_SUPABASE_URL` 算库名。
 */
export function dashboardValues({ project, url, anonKey, studioUrl }) {
  return {
    PROJECT: project,
    APP_URL: appUrl,
    APP_PORT: new URL(appUrl).port,
    SUPABASE_URL: url,
    SUPABASE_PORT: new URL(url).port,
    ANON_KEY: anonKey,
    STUDIO_URL: studioUrl,
    STUDIO_PORT: new URL(studioUrl).port,
    E2E_REMOTE_COMMAND: `BASE_URL=${appUrl} VITE_SUPABASE_URL=${url} pnpm nx run dev-rxdb-supabase-e2e:e2e-remote --excludeTaskDependencies`
  };
}

function statusOf(request) {
  const port = request.socket.localPort;
  // 只认本机地址的 Host：挡住 DNS 重绑定让别的网页读到本页
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) return 403;
  return new URL(request.url, dashboardUrl).pathname === '/' ? 200 : 404;
}

/**
 * 只提供一张渲染好的起始页的 HTTP 服务。
 */
export function createDashboardServer(html) {
  return createServer((request, response) => {
    const status = statusOf(request);
    const page = status === 200;
    response.writeHead(status, page ? pageHeaders : textHeaders).end(page ? html : String(status));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [stack, studioUrl, template] = await Promise.all([
    readLocalStack(),
    readStudioUrl(),
    readFile(new URL('./dashboard.html', import.meta.url), 'utf8')
  ]);
  const html = renderDashboard(template, dashboardValues({ ...stack, studioUrl }));
  createDashboardServer(html).listen(dashboardPort, '127.0.0.1', () => console.log(`测试起始页：${dashboardUrl}`));
}
