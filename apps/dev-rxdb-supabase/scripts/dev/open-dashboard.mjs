import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appUrl, dashboardUrl } from './endpoints.mjs';

const browsers = {
  darwin: ['open', [dashboardUrl]],
  linux: ['xdg-open', [dashboardUrl]],
  win32: ['rundll32', ['url.dll,FileProtocolHandler', dashboardUrl]]
};

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code ?? signal}`))
    );
  });
}

/**
 * 用系统浏览器打开测试起始页。
 *
 * @param options.enabled - 为 false 时什么都不做（`AIAO_DEV_OPEN=false`）
 * @throws {@link Error} 当前系统没有已知的打开方式，或打开命令失败时
 */
export async function openDashboard({ enabled = true, platform = process.platform, launch = run } = {}) {
  if (!enabled) return;
  const browser = browsers[platform];
  if (!browser) throw new Error(`当前系统无法自动打开浏览器：${platform}`);
  await launch(...browser);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // dev 是常驻任务：进程一退出 Nx 就会收掉整条开发链
  const keepAlive = setInterval(() => undefined, 60_000);
  for (const name of ['SIGINT', 'SIGTERM']) process.once(name, () => clearInterval(keepAlive));
  console.log(`本地开发环境已就绪\n  测试起始页  ${dashboardUrl}\n  应用        ${appUrl}`);
  try {
    await openDashboard({ enabled: process.env.AIAO_DEV_OPEN !== 'false' });
  } catch (error) {
    console.error(`无法自动打开浏览器：${error.message}。请手动打开 ${dashboardUrl}`);
  }
}
