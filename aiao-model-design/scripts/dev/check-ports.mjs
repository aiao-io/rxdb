// 启动前检查 Web 与 Worker 的固定端口；Supabase 的端口由 docker compose 自己报冲突。
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { services } from './services.mjs';

/** 端口能监听就立即释放；被占用时报出服务名与地址，不换端口，也不碰占用它的进程。 */
export function assertPortAvailable(name, port, host) {
  return new Promise((resolveCheck, reject) => {
    const server = createServer();
    server.once('error', cause =>
      reject(
        new Error(`${name} 的固定端口 ${host}:${port} 已被占用：先停掉占用它的服务再启动，不会自动换端口。`, { cause })
      )
    );
    server.listen(port, host, () => server.close(error => (error ? reject(error) : resolveCheck())));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await Promise.all(Object.values(services).map(({ name, port, host }) => assertPortAvailable(name, port, host))).catch(
    error => {
      console.error(error.message);
      process.exitCode = 1;
    }
  );
}
