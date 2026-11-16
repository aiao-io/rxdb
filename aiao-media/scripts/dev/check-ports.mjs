import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);

const devPorts = [
  ['Web', 4300, 'localhost'],
  ['Admin', 4302, 'localhost'],
  ['API', 8787, '127.0.0.1']
];

async function lsof(args) {
  const { stdout } = await execute('lsof', args, { timeout: 5000 });
  return stdout;
}

async function portOwner(port) {
  const listeners = await lsof(['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc']);
  const [, pid] = listeners.match(/^p(\d+)$/m);
  const [, command] = listeners.match(/^c(.+)$/m);
  const [, cwd] = (await lsof(['-a', '-p', pid, '-d', 'cwd', '-Fn'])).match(/^n(.+)$/m);
  return `占用进程 pid ${pid} ${command}，目录 ${cwd}`;
}

export function assertPortAvailable(name, port, host) {
  return new Promise((resolveCheck, reject) => {
    const server = createServer();
    server.once('error', async cause => {
      // 占用者信息只用于补充提示，lsof 不可用时保持原提示。
      const owner = await portOwner(port).then(
        detail => `（${detail}）`,
        () => ''
      );
      reject(
        new Error(`${name} 固定端口 ${host}:${port} 无法使用${owner}，请停止占用服务后重试；不会切换端口。`, { cause })
      );
    });
    server.listen(port, host, () => server.close(error => (error ? reject(error) : resolveCheck())));
  });
}

export async function checkPorts(targets = devPorts) {
  const results = await Promise.allSettled(targets.map(target => assertPortAvailable(...target)));
  return results.filter(result => result.status === 'rejected').map(result => result.reason.message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const failures = await checkPorts();
  for (const message of failures) console.error(message);
  if (failures.length > 0) process.exitCode = 1;
}
