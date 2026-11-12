// nx dev 的最后一步：全部服务就绪后打开开发导航，然后保持运行。设 AIAO_DEV_OPEN=false 不打开浏览器。
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { run } from '../supabase/supabase-local.mjs';
import { keepRunning } from './keep-running.mjs';
import { dashboardUrl } from './services.mjs';

const OPENERS = {
  darwin: ['open', [dashboardUrl]],
  linux: ['xdg-open', [dashboardUrl]],
  win32: ['rundll32', ['url.dll,FileProtocolHandler', dashboardUrl]]
};

/** 用系统浏览器打开一次开发导航；打不开时报错，不换别的方式重试。 */
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
