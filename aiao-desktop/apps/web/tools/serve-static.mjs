import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const outputRoot = resolve(process.cwd(), 'dist/apps/aiao-desktop/browser');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm'
};
const portArgument = process.argv.find(argument => argument.startsWith('--port='));
const port = Number(portArgument?.slice('--port='.length) ?? process.env.PORT ?? 4200);

if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error(`Invalid port: ${port}`);
}

const headers = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const candidate = normalize(join(outputRoot, requestPath));
  if (!candidate.startsWith(`${outputRoot}${sep}`)) {
    response.writeHead(403, headers);
    response.end('Forbidden');
    return;
  }

  const fallback = join(outputRoot, 'index.html');
  const hasFile = existsSync(candidate) && statSync(candidate).isFile();
  const filePath = hasFile ? candidate : extname(requestPath) ? null : fallback;
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, headers);
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    ...headers,
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream'
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to start static server');
  process.stdout.write(`AIAO_DESKTOP_STATIC_SERVER_READY http://127.0.0.1:${address.port}\n`);
});
