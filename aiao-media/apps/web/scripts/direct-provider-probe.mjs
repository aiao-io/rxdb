import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const probeSource = fileURLToPath(new URL('../direct-provider-probe/', import.meta.url));
export const probeOutput = fileURLToPath(new URL('../dist/direct-provider-probe/', import.meta.url));
const assets = new Map([
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/main.js', ['main.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
]);
export async function buildProbe() {
  await rm(probeOutput, { recursive: true, force: true });
  await mkdir(probeOutput, { recursive: true });
  for (const name of ['index.html', 'main.js', 'styles.css', '_headers'])
    await copyFile(resolve(probeSource, name), resolve(probeOutput, name));
}
export async function startProbeServer(port = 0) {
  const headersText = await readFile(resolve(probeOutput, '_headers'), 'utf8');
  const policy = headersText
    .split('\n')
    .map(line => line.trim())
    .find(line => line.startsWith('Content-Security-Policy:'))
    ?.slice('Content-Security-Policy:'.length)
    .trim();
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = assets.get(path === '/' ? '/index.html' : path);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (policy) response.setHeader('Content-Security-Policy', policy);
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    try {
      const bytes = await readFile(resolve(probeOutput, file[0]));
      response.setHeader('Content-Type', file[1]);
      response.writeHead(200).end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((yes, no) => {
    server.once('error', no);
    server.listen(port, '127.0.0.1', yes);
  });
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise(yes => {
        server.close(yes);
        server.closeAllConnections();
      })
  };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const command = process.argv[2];
  if (command === 'build') {
    await buildProbe();
    console.log('Static files: dist/direct-provider-probe (no credentials or backend).');
  } else if (command === 'serve') {
    const port = Number(process.env.AIAO_DIRECT_PROBE_PORT || 4310);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid probe port.');
    const app = await startProbeServer(port);
    console.log(`Direct API probe: ${app.origin}`);
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () => {
        void app.close();
      });
  } else throw new Error('Use build or serve.');
}
