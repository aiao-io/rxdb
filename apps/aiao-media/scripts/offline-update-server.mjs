import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../dist/browser');
const source = await readFile(resolve(root, 'offline-worker.js'), 'utf8');
const match = /^const MANIFEST = (.+);\n/.exec(source);
if (!match) throw new Error('Missing production offline manifest');
const original = JSON.parse(match[1]),
  template = source.slice(match[0].length);
const originalShell = await readFile(resolve(root, 'offline-shell.html'), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
let revision = 'a';
function build() {
  const shell = originalShell.replace('</head>', `<meta name="local-test-build" content="${revision}"></head>`);
  const assets = original.assets.map(asset =>
    asset.path === '/offline-shell.html' ? { ...asset, size: Buffer.byteLength(shell), sha256: hash(shell) } : asset
  );
  const version = hash(JSON.stringify(assets) + template);
  return { shell, version, worker: `const MANIFEST = ${JSON.stringify({ version, assets })};\n${template}` };
}
const contentTypes = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://127.0.0.1:4397').pathname;
    if (request.method === 'POST' && /^\/__build\/[ab]$/.test(path)) {
      revision = path.at(-1);
      response.writeHead(200).end(build().version);
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    const current = build();
    if (path === '/__build') {
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ revision, version: current.version }));
      return;
    }
    const file = resolve(root, `.${extname(path) ? path : '/index.html'}`);
    if (relative(root, file).startsWith('..')) {
      response.writeHead(404).end();
      return;
    }
    const body =
      path === '/offline-worker.js' ? current.worker
      : ['/offline-shell.html', '/', '/create', '/images', '/providers'].includes(path) ? current.shell
      : await readFile(file);
    response
      .writeHead(200, {
        'content-type': contentTypes[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store'
      })
      .end(body);
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(4397, '127.0.0.1');
process.on('SIGTERM', () => server.close());
