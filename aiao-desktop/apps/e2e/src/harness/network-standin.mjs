import { execFile } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { promisify } from 'node:util';

import { contentTypes, isolationHeaders } from '../fixtures/artifact-server.mjs';

/** 证书只用于本次测试上下文，不安装到系统信任库，读取后立即删除临时文件。 */
async function testCertificate() {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-standin-tls-'));
  const key = join(directory, 'key.pem');
  const cert = join(directory, 'cert.pem');
  try {
    await promisify(execFile)('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-keyout',
      key,
      '-out',
      cert
    ]);
    const [keyBytes, certBytes] = await Promise.all([readFile(key), readFile(cert)]);
    return { key: keyBytes, cert: certBytes };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** 在独立的 loopback Origin 托管替身，避免 Firefox 无法操作 route.fulfill 生成的跨源文档。 */
export async function startStandinServer({ scriptsRoot, document }) {
  const server = createServer(await testCertificate(), (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const headers = {
      ...isolationHeaders,
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'no-store'
    };
    if (pathname === '/') {
      response.writeHead(200, { ...headers, 'Content-Type': contentTypes['.html'] });
      response.end(document());
      return;
    }
    const script = pathname.startsWith('/__standin/orbit/') ? pathname.slice('/__standin/orbit/'.length) : null;
    const file = script === null ? '' : normalize(join(scriptsRoot, script));
    if (!file.startsWith(`${scriptsRoot}/`) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { ...headers, 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('替身服务器未取得端口');
  return {
    origin: `https://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    }
  };
}

/** 仅替换被测上下文里的应用 Origin；真实跨源文档由 HTTPS 返回，产品产物与允许来源的推导逻辑原样使用。 */
export async function installNetworkStandin(
  context,
  { desktopOrigin, originalOrigin, scriptsRoot, document, offline }
) {
  const server = await startStandinServer({ scriptsRoot, document });
  const rewriteSource = source => source.replaceAll(originalOrigin, server.origin);
  await context.route(`${server.origin}/**`, route =>
    offline() ? route.abort('internetdisconnected') : route.continue()
  );
  await context.route(
    url => url.origin === desktopOrigin && url.pathname.endsWith('.js'),
    async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: rewriteSource(await response.text()) });
    }
  );
  return { ...server, rewriteSource };
}
