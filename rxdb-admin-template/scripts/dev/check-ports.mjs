/**
 * nx dev 的第一步：开发导航与协作命令服务的固定端口必须空闲。被占用就报错退出，不换端口，也不停止占用者；
 * 提示里带上占用者的 pid、命令与目录，便于认出是不是上一轮遗留的进程。
 * 三端开发服务器不在这里查：它们与本检查并行启动，端口被占时自己失败（vite 开了 strictPort，Angular 开发服务器本来就不换号）。
 */
import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { api, dashboard, host } from './services.mjs';

const execute = promisify(execFile);

/** 要检查的固定端口：[服务名, 端口, 监听地址]。 */
export const devPorts = [
  [dashboard.name, dashboard.port, host],
  [api.name, api.port, host]
];

async function lsof(args) {
  const { stdout } = await execute('lsof', args, { timeout: 5000 });
  return stdout;
}

/** 端口占用者的 pid、命令与工作目录（lsof 的字段输出）。 */
async function portOwner(port) {
  const listeners = await lsof(['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc']);
  const [, pid] = /^p(\d+)$/m.exec(listeners);
  const [, command] = /^c(.+)$/m.exec(listeners);
  const [, cwd] = /^n(.+)$/m.exec(await lsof(['-a', '-p', pid, '-d', 'cwd', '-Fn']));
  return `占用进程 pid ${pid} ${command}，目录 ${cwd}`;
}

/** 试着监听一次再立刻关闭；监听失败即端口不可用。 */
export function assertPortAvailable(name, port, address) {
  return new Promise((resolveCheck, reject) => {
    const server = createServer();
    server.once('error', async cause => {
      // 占用者信息只是补充提示：lsof 不可用时仍报出端口本身
      const owner = await portOwner(port).then(
        detail => `（${detail}）`,
        () => ''
      );
      reject(new Error(`${name}的固定端口 ${address}:${port} 无法使用${owner}，请停止占用它的服务后重试；不会切换端口。`, { cause }));
    });
    server.listen(port, address, () => server.close(error => (error ? reject(error) : resolveCheck())));
  });
}

/** 并行检查全部端口，返回全部失败原因（一次报全）。 */
export async function checkPorts(targets = devPorts) {
  const results = await Promise.allSettled(targets.map(target => assertPortAvailable(...target)));
  return results.filter(result => result.status === 'rejected').map(result => result.reason.message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const failures = await checkPorts();
  for (const message of failures) console.error(message);
  if (failures.length > 0) process.exitCode = 1;
}
