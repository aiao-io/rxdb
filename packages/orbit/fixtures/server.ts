import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const root = path.join(import.meta.dirname, 'dist');
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.map': 'application/json'
  };
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    void readFile(filename)
      .then(content => {
        response
          .writeHead(200, { 'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream' })
          .end(content);
      })
      .catch(() => response.writeHead(404).end());
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务器未分配端口');
  project.provide('fixtureOrigin', `http://127.0.0.1:${address.port}`);
  return async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  };
}
