import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function assertPortAvailable(name, port, host) {
  return new Promise((resolveCheck, reject) => {
    const server = createServer();
    server.once('error', cause =>
      reject(new Error(`${name} 固定端口 ${host}:${port} 无法使用，请停止占用服务后重试；不会切换端口。`, { cause }))
    );
    server.listen(port, host, () => server.close(error => (error ? reject(error) : resolveCheck())));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await Promise.all([
    assertPortAvailable('Web', 4300, 'localhost'),
    assertPortAvailable('Admin', 4302, 'localhost'),
    assertPortAvailable('API', 8787, '127.0.0.1')
  ]).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
