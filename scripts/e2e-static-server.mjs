#!/usr/bin/env node
/**
 * Playwright webServer 用的 SPA 静态服务。
 *
 * 必须由 Playwright 直接 `node` 拉起（不要再套 nx / pnpm / @nx/web:file-server）：
 * nx 包装层 fork 出的 http-server 是孙子进程，teardown 只杀得掉包装层，
 * http-server 被 reparent 到 init 后继续占端口，下次 e2e 就会报
 * "http://localhost:8200 is already used"。
 *
 * 不调用 detectPort：端口被占立刻 EADDRINUSE，禁止静默换端口。
 * 不往 dist 里 copy 404.html：缺文件直接回 index.html。
 *
 * 用法:
 *   node scripts/e2e-static-server.mjs --root dist/apps/dev-rxdb-angular/browser --port 8200
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8'
};

export function usage(exitCode = 0) {
  console.log(`Usage: node scripts/e2e-static-server.mjs --root <dir> --port <n> [--host <host>]

Serves a built SPA directory over HTTP.
Missing files fall back to index.html. Occupied ports fail immediately.`);
  process.exit(exitCode);
}

function readFlag(argv, index, name) {
  const current = argv[index];
  if (current === name || current === `-${name.slice(2, 3)}`) {
    return { value: argv[index + 1], next: index + 2 };
  }
  if (current.startsWith(`${name}=`)) {
    return { value: current.slice(name.length + 1), next: index + 1 };
  }
  return null;
}

export function parseArgs(argv) {
  let root = '';
  let port;
  let host;
  for (let i = 0; i < argv.length; ) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') usage(0);

    const rootFlag = readFlag(argv, i, '--root');
    if (rootFlag) {
      root = rootFlag.value ?? '';
      i = rootFlag.next;
      continue;
    }

    const portFlag = readFlag(argv, i, '--port');
    if (portFlag) {
      const raw = portFlag.value;
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error(`Invalid port: ${raw ?? '(missing)'}`);
      }
      port = value;
      i = portFlag.next;
      continue;
    }

    const hostFlag = readFlag(argv, i, '--host');
    if (hostFlag) {
      host = hostFlag.value;
      i = hostFlag.next;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!root) throw new Error('Missing --root');
  if (port === undefined) throw new Error('Missing --port');
  return { root, port, host };
}

export function assertStaticRoot(rootPath) {
  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    const error = new Error(`Static root not found: ${rootPath}`);
    error.code = 'ENOENT';
    throw error;
  }
  const indexFile = join(rootPath, 'index.html');
  if (!existsSync(indexFile) || !statSync(indexFile).isFile()) {
    const error = new Error(`Static root missing index.html: ${indexFile}`);
    error.code = 'ENOENT';
    throw error;
  }
}

export function safeJoin(base, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.split('?')[0]);
  } catch {
    return null;
  }
  const cleaned = decoded.replace(/^\/+/, '');
  const target = normalize(join(base, cleaned));
  const rel = relative(base, target);
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) return null;
  return target;
}

function isWithinRoot(realRoot, target) {
  try {
    const rel = relative(realRoot, realpathSync(target));
    return rel === '' || !rel.startsWith('..');
  } catch {
    return false;
  }
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

export function createStaticServer(rootPath) {
  const realRoot = realpathSync(rootPath);
  const indexFile = join(realRoot, 'index.html');

  return createServer((req, res) => {
    const rawPath = req.url ?? '/';
    let filePath = safeJoin(realRoot, rawPath);
    if (!filePath) return send(res, 403, 'Forbidden');

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      const nestedIndex = join(filePath, 'index.html');
      filePath = existsSync(nestedIndex) ? nestedIndex : indexFile;
    }

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      filePath = indexFile;
    }

    if (!isWithinRoot(realRoot, filePath)) return send(res, 403, 'Forbidden');

    const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    send(res, 200, readFileSync(filePath), type);
  });
}

function listenExclusive(server, { port, host }) {
  return new Promise((resolve, reject) => {
    const onError = error => {
      server.close();
      reject(error);
    };
    server.once('error', onError);
    const options = { port, exclusive: true };
    if (host) options.host = host;
    server.listen(options, () => {
      server.off('error', onError);
      resolve(server);
    });
  });
}

export async function startStaticServer({ root, port, host }) {
  const rootPath = resolve(root);
  assertStaticRoot(rootPath);
  return listenExclusive(createStaticServer(rootPath), { port, host });
}

export function closeStaticServer(server) {
  return new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const server = await startStaticServer(options);
    const address = server.address();
    const boundPort = typeof address === 'object' && address ? address.port : options.port;
    const boundHost = options.host ?? 'localhost';
    console.log(`Serving ${resolve(options.root)} on http://${boundHost}:${boundPort}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
