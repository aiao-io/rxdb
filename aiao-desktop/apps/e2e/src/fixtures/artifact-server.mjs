import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

export const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm'
};

/**
 * 跨源隔离所需的两个响应头（D-05）。集成应用的夹具服务器只带它们：桌面要把集成应用嵌进 iframe，
 * 不能带下面的防嵌入响应头。
 */
export const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
};

/**
 * 桌面自己的整套托管响应头：跨源隔离（D-05）加防嵌入（D-16），与生产 `public/_headers` 的 `/*` 规则一致。
 * `scripts/deploy/config.spec.mjs` 校验它与 `deployConfig.requiredHeaders` 相同。
 */
export const desktopHeaders = { ...isolationHeaders, 'X-Frame-Options': 'SAMEORIGIN' };

/** 已解码的请求路径；地址畸形（如 `/%zz`）时返回 `undefined`，由调用方回 400。 */
function requestPathOf(request) {
  try {
    return decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    return undefined;
  }
}

/**
 * 只监听 127.0.0.1 的静态服务器，托管一份构建产物（ADESK-US-008 的「新旧产物服务器」夹具）。
 *
 * `switchTo(目录)` 在**不换端口**的前提下换一份产物：来源（Origin）不变，浏览器里按来源隔离的
 * OPFS、IndexedDB 与 localStorage 因此保留，刷新后加载到新产物。旧库升级验收（ADESK-US-106）靠它
 * 先用旧产物建库、再换新产物打开。`port` 省略时由系统分配；重启同一个服务器要沿用端口，传上一次的 `port`。
 *
 * `headers` 默认是桌面的整套托管响应头 {@link desktopHeaders}；托管集成应用的夹具要显式传入自己的（不带防嵌入）。
 *
 * @param {{ root: string, port?: number, headers?: Record<string, string> }} options
 */
export async function startArtifactServer({ root, port = 0, headers = desktopHeaders }) {
  let current = normalize(root);
  const server = createServer((request, response) => {
    const requestPath = requestPathOf(request);
    if (requestPath === undefined) {
      response.writeHead(400);
      response.end('Bad request');
      return;
    }
    const relativePath = requestPath === '/' ? '/index.html' : requestPath;
    const filePath = normalize(join(current, relativePath));
    if (!filePath.startsWith(`${current}/`) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      ...headers
    });
    createReadStream(filePath).pipe(response);
  });
  await new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer);
    server.listen(port, '127.0.0.1', resolveServer);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to start the artifact server');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    port: address.port,
    /** 当前托管的目录。 */
    root: () => current,
    /** 换成另一份产物，来源不变。 */
    switchTo(next) {
      current = normalize(next);
    },
    close() {
      server.closeAllConnections();
      server.close();
    }
  };
}
