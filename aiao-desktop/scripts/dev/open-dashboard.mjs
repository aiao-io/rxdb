// nx dev 的最后一步：开发服务器与开发导航都就绪后打开导航，然后保持运行。设 AIAO_DEV_OPEN=false 不打开浏览器。
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { keepRunning } from './keep-running.mjs';
import { dashboardUrl } from './services.mjs';

const OPENERS = {
  darwin: ['open', [dashboardUrl]],
  linux: ['xdg-open', [dashboardUrl]],
  win32: ['rundll32', ['url.dll,FileProtocolHandler', dashboardUrl]]
};

/** 运行一个命令，退出码非 0 时报错。 */
function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolveRun() : reject(new Error(`${command} 退出码 ${code}`))));
  });
}

/**
 * 用系统浏览器打开一次开发导航；打不开时报错，不换别的方式重试。
 *
 * @param options.enabled 为 false 时什么都不做（无界面环境）
 * @param options.platform 当前系统，默认 `process.platform`
 * @param options.launch 执行打开命令的函数（测试替身用）
 */
export async function openDashboard({ enabled = true, platform = process.platform, launch = run } = {}) {
  if (!enabled) return;
  const opener = OPENERS[platform];
  if (!opener) throw new Error(`当前系统无法自动打开浏览器：${platform}`);
  await launch(...opener);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  keepRunning();
  console.log(`开发导航：${dashboardUrl}`);
  await openDashboard({ enabled: process.env.AIAO_DEV_OPEN !== 'false' }).catch(error =>
    console.error(`无法自动打开浏览器：${error.message}。请手动打开 ${dashboardUrl}`)
  );
}
