import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, resolve } from 'node:path';

/**
 * dev 产物套件共用的前端静态服务：debug 二进制按 `tauri.conf.json` 的 `devUrl` 取前端，
 * 所以跑之前必须有人在 1420 上服务 `dist/apps/dev-rxdb-tauri/browser`。
 *
 * @remarks
 * 两个 devtools spec（`devtools-window-transport.spec.ts` 与
 * `devtools-provider-gear.spec.ts`）都要这个服务。抽到本文件而不是各自抄一份：
 * 端口与回退规则是这条链路的契约，两处各写一份的话改一处红一处。
 */
export const DEV_URL_PORT = 1420;

/** 前端产物目录，与 `dev-rxdb-tauri` 的 build outputPath 一致。 */
export const FRONTEND_DIST = resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'dist',
  'apps',
  'dev-rxdb-tauri',
  'browser'
);

/** 最小 MIME 表；够本 demo 的产物用。 */
const MIME: Readonly<Record<string, string>> = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
});

/**
 * 在 1420 上服务前端产物。
 *
 * @returns 关闭手柄
 * @throws 端口被占用时抛出，并说清该去关掉什么
 *
 * @remarks
 * 目录穿越用 `startsWith(FRONTEND_DIST)` 挡住：这是个跑在开发机上的临时服务，
 * 但让它能读产物目录之外的文件没有任何好处。
 *
 * 找不到的路径回退到 `index.html`（面板与应用都是 hash 路由的 SPA），
 * 但**只对不带扩展名的路径**回退：给一个 404 的 `.js` 返回 HTML，
 * 表征会是一句与真因毫无关系的语法错误。
 *
 * 端口是配置写死的，不能换。被占用时**显式失败**而不是另挑一个：另挑一个的话应用会连到
 * 那个占着 1420 的东西上，失败形态变成「白屏 + 看门狗超时」，与前端挂死无法区分。
 */
export async function serveFrontend(): Promise<{ close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0];
    const wanted = resolve(FRONTEND_DIST, `.${path === '/' ? '/index.html' : path}`);
    const target = wanted.startsWith(FRONTEND_DIST) ? wanted : FRONTEND_DIST;
    void readFile(target)
      .catch(async error => {
        if (extname(target) !== '') throw error;
        return readFile(join(FRONTEND_DIST, 'index.html'));
      })
      .then(body => {
        response.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' }).end(body);
      })
      .catch(() => response.writeHead(404).end());
  });

  await new Promise<void>((settle, fail) => {
    server.on('error', error => {
      fail(
        new Error(
          [
            `无法在 ${String(DEV_URL_PORT)} 上启动前端服务：${String(error)}`,
            '这个端口是 tauri.conf.json 的 devUrl 写死的，换不了。',
            '多半是有一个 `nx serve dev-rxdb-tauri` 还开着——先关掉它再跑。'
          ].join('\n')
        )
      );
    });
    server.listen(DEV_URL_PORT, '127.0.0.1', () => settle());
  });

  return {
    close: () =>
      new Promise<void>((settle, fail) => {
        server.close(error => (error ? fail(error) : settle()));
      })
  };
}
