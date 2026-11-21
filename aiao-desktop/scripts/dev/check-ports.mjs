// nx dev 的第一步：开发服务器与开发导航的固定端口必须空闲。被占用就报错退出，不换端口，也不停止占用者。
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { services } from './services.mjs';

/**
 * 确认端口可以监听：试着监听一次再立刻关闭。
 *
 * @param name 服务名，用在报错信息里
 * @param port 固定端口
 * @param host 服务实际监听的主机名
 */
export function assertPortAvailable(name, port, host) {
  return new Promise((resolveCheck, reject) => {
    const server = createServer();
    server.once('error', cause =>
      reject(
        new Error(`${name}的固定端口 ${host}:${port} 已被占用，请停止占用它的服务后重试；不会切换端口。`, { cause })
      )
    );
    server.listen(port, host, () => server.close(error => (error ? reject(error) : resolveCheck())));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const checks = [services.web, services.dashboard].map(({ name, port, host }) =>
    assertPortAvailable(name, port, host)
  );
  for (const result of await Promise.allSettled(checks)) {
    if (result.status === 'rejected') {
      console.error(result.reason.message);
      process.exitCode = 1;
    }
  }
}
