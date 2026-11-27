// 正式构建的本地预览服务（`aiao-desktop-web:serve-static`）：托管 web 的构建产物，响应头与生产的 `_headers` 一致。
// 从仓库根执行，以 `process.cwd()` 解析产物目录；`--port=<端口>`（或环境变量 PORT）指定端口，0 表示随机端口。
import { existsSync, realpathSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm'
};

/**
 * 预览服务对所有响应返回的响应头：跨源隔离（D-05）加防嵌入（D-16），与 `public/_headers` 的 `/*` 规则一致。
 * `scripts/deploy/config.spec.mjs` 校验它们与 `deployConfig.requiredHeaders` 一致。
 */
export const staticHeaders = Object.freeze({
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN'
});

/** 已解码的请求路径；地址畸形（如 `/%zz`）时返回 `undefined`，由调用方回 400。 */
function requestPathOf(request) {
  try {
    return decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    return undefined;
  }
}

/** 请求对应的文件：存在的文件原样返回；无扩展名的路径回退到 index.html（单页应用路由）；其余没有。 */
function locate(root, requestPath) {
  const candidate = normalize(join(root, requestPath));
  if (!candidate.startsWith(`${root}${sep}`)) return { forbidden: true };
  if (existsSync(candidate) && statSync(candidate).isFile()) return { filePath: candidate };
  const fallback = join(root, 'index.html');
  return { filePath: !extname(requestPath) && existsSync(fallback) ? fallback : undefined };
}

/** 出错时结束响应：响应头还没写就回 500，写了就只能销毁连接（客户端据此知道正文不完整）。 */
function failResponse(response, headers) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(500, headers);
  response.end('Internal Server Error');
}

async function sendFile(response, filePath, { headers, openFile, onError }) {
  // 先打开文件再写响应头：打开失败（权限、被删除）时还能回 500
  const file = await openFile(filePath);
  const stream = file.createReadStream();
  stream.once('error', error => {
    onError(error);
    failResponse(response, headers);
  });
  response.once('close', () => stream.destroy());
  response.writeHead(200, {
    ...headers,
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream'
  });
  stream.pipe(response);
}

async function serve(request, response, options) {
  const { root, headers } = options;
  const requestPath = requestPathOf(request);
  if (requestPath === undefined) {
    response.writeHead(400, headers);
    response.end('Bad Request');
    return;
  }
  const { forbidden, filePath } = locate(root, requestPath);
  if (forbidden || !filePath) {
    response.writeHead(forbidden ? 403 : 404, headers);
    response.end(forbidden ? 'Forbidden' : 'Not found');
    return;
  }
  await sendFile(response, filePath, options);
}

/**
 * 托管一个构建产物目录的静态服务器（还没监听，调用方 `listen`）。任何一个请求出错都不会让进程退出。
 *
 * @param options.root 产物目录
 * @param options.headers 每个响应都带的响应头，默认 {@link staticHeaders}
 * @param options.openFile 打开文件（返回带 `createReadStream()` 的句柄），测试用来制造读文件失败
 * @param options.onError 读写文件出错时的回调（响应已按出错的阶段结束）
 */
export function createStaticServer({ root, headers = staticHeaders, openFile = open, onError = () => undefined }) {
  const options = { root: resolve(root), headers, openFile, onError };
  return createServer((request, response) => {
    serve(request, response, options).catch(error => {
      onError(error);
      failResponse(response, headers);
    });
  });
}

// 作为脚本运行才起服务；被 import（单测）时不监听端口。路径经符号链接进来时 argv[1] 不是真实路径，要先解析
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const portArgument = process.argv.find(argument => argument.startsWith('--port='));
  const port = Number(portArgument?.slice('--port='.length) ?? process.env.PORT ?? 4411);

  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid port: ${port}`);
  }

  const server = createStaticServer({
    root: resolve(process.cwd(), 'dist/aiao-desktop/apps/web/browser'),
    onError: error => process.stderr.write(`serve-static: ${error.message}\n`)
  });
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to start static server');
    process.stdout.write(`AIAO_DESKTOP_STATIC_SERVER_READY http://127.0.0.1:${address.port}\n`);
  });
}
