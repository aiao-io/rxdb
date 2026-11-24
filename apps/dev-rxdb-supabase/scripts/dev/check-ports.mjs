import { execFile } from 'node:child_process';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { appPort, dashboardPort } from './endpoints.mjs';

const execute = promisify(execFile);

const devPorts = [
  ['应用 dev server', appPort],
  ['测试起始页', dashboardPort]
];

// macOS 上通配地址与回环地址的监听可以共存，试着 listen 会放过「localhost 已被别的服务占住」，所以按能否连上回环地址判断
const loopbacks = ['127.0.0.1', '::1'];
// 本机没有 IPv6 回环时 ::1 连不上也不算占用
const nobodyListening = new Set(['ECONNREFUSED', 'EADDRNOTAVAIL', 'ENETUNREACH', 'EAFNOSUPPORT']);

function accepts(port, host) {
  return new Promise((resolveProbe, reject) => {
    const socket = connect({ port, host });
    socket.once('connect', () => {
      socket.destroy();
      resolveProbe(true);
    });
    socket.once('error', error => (nobodyListening.has(error.code) ? resolveProbe(false) : reject(error)));
  });
}

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

/**
 * 确认固定端口在本机回环地址上没有服务在监听。
 *
 * @throws {@link Error} 端口已被占用时，尽量带上占用进程的 pid、命令与目录
 */
export async function assertPortFree(name, port) {
  const probes = await Promise.all(loopbacks.map(host => accepts(port, host)));
  if (!probes.includes(true)) return;
  // 占用者信息只用于补充提示，lsof 不可用时保持原提示
  const owner = await portOwner(port).then(
    detail => `（${detail}）`,
    () => ''
  );
  throw new Error(`${name} 的固定端口 ${port} 已被占用${owner}，请停止占用服务后重试；不会切换端口。`);
}

/**
 * 一次检查所有固定端口。
 *
 * @returns 每个被占用端口的失败说明，全部空闲时为空数组
 */
export async function checkPorts(targets = devPorts) {
  const results = await Promise.allSettled(targets.map(([name, port]) => assertPortFree(name, port)));
  return results.filter(result => result.status === 'rejected').map(result => result.reason.message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const failures = await checkPorts();
  for (const message of failures) console.error(message);
  if (failures.length > 0) process.exitCode = 1;
}
