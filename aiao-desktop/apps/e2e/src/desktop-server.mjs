import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

/** web 的正式构建产物（`aiao-desktop-web:build`）。 */
export const outputRoot = resolve(import.meta.dirname, '../../../../dist/aiao-desktop/apps/web/browser');

export const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm'
};

/**
 * 只监听 127.0.0.1 的静态服务器托管桌面的正式构建，带跨源隔离所需的两个响应头（D-05）。
 * 返回它的来源与关闭函数。
 */
export async function startDesktopServer() {
  const server = createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const relativePath = requestPath === '/' ? '/index.html' : requestPath;
    const filePath = normalize(join(outputRoot, relativePath));
    if (!filePath.startsWith(`${outputRoot}/`) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    });
    createReadStream(filePath).pipe(response);
  });
  await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to start the desktop server');
  return { origin: `http://127.0.0.1:${address.port}`, close: () => server.close() };
}
