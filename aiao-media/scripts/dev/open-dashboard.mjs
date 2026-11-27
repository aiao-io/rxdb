import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { run } from '../supabase/supabase-local.mjs';

export const dashboardUrl = 'http://127.0.0.1:8787/';

export async function openDashboard({ enabled = true, platform = process.platform, launch = run } = {}) {
  if (!enabled) return;
  const commands = {
    darwin: ['open', [dashboardUrl]],
    linux: ['xdg-open', [dashboardUrl]],
    win32: ['rundll32', ['url.dll,FileProtocolHandler', dashboardUrl]]
  };
  const command = commands[platform];
  if (!command) throw new Error(`当前系统无法自动打开浏览器：${platform}`);
  await launch(...command);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const keepAlive = setInterval(() => undefined, 60_000);
  const stop = () => clearInterval(keepAlive);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log(`开发导航：${dashboardUrl}`);
  try {
    await openDashboard({ enabled: process.env.AIAO_DEV_OPEN !== 'false' });
  } catch (error) {
    console.error(`无法自动打开浏览器：${error.message}。请打开 ${dashboardUrl}`);
  }
}
