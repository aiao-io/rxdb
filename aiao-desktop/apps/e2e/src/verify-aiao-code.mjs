/**
 * Aiao Code 的线上验收（ADESK-US-203）：本地托管桌面的正式构建，从 Dock 打开集成应用 Aiao Code，
 * 对真实的 https://vscode.aiao.io/ 验证就绪、跨源隔离、新建项目与终端、最小化还原与关闭重开。要外网，不进 CI。
 *
 *   --vscode-dist=<目录>  vscode.aiao.io 的请求改由本地构建产物应答（Aiao Code 发布前验证），响应头照
 *                         apps/aiao-vscode/public/_headers 补齐；这时屏蔽 Service Worker，免得它缓存本地产物。
 *   --headed              显示浏览器窗口。
 *   --screenshot=<文件>   终端跑通后截一张整页图。
 */
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';
import { expect as playwrightExpect } from 'playwright/test';

import { startDesktopServer } from './desktop-server.mjs';

const VSCODE = 'https://vscode.aiao.io';
const expect = playwrightExpect.configure({ timeout: 30_000 });
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const vscodeDist = argument('vscode-dist') ? resolve(process.cwd(), argument('vscode-dist')) : undefined;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

/** 本地构建产物顶替 vscode.aiao.io：找不到的导航回退到 index.html，与 Pages 的单页应用行为一致。 */
function serveLocalVscode(route) {
  const request = route.request();
  const pathname = decodeURIComponent(new URL(request.url()).pathname);
  const candidate = normalize(join(vscodeDist, pathname.endsWith('/') ? `${pathname}index.html` : pathname));
  const found = candidate.startsWith(`${vscodeDist}/`) && existsSync(candidate) && statSync(candidate).isFile();
  if (!found && request.resourceType() !== 'document') return route.fulfill({ status: 404 });
  const file = found ? candidate : join(vscodeDist, 'index.html');
  const shared = /^\/(browser-workbench-assets|sqlite-wasm)\//.test(pathname);
  return route.fulfill({
    path: file,
    headers: {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      ...(shared ? { 'Access-Control-Allow-Origin': '*' } : {})
    }
  });
}

const report = {
  format: 'aiao-desktop.verify-aiao-code',
  version: 1,
  target: vscodeDist ? `local:${vscodeDist}` : VSCODE,
  checks: {},
  timings: {},
  desktopErrors: [],
  appConsoleErrors: []
};
const desktop = await startDesktopServer();
const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: vscodeDist ? 'block' : 'allow'
});
if (vscodeDist) await context.route(`${VSCODE}/**`, serveLocalVscode);
const page = await context.newPage();
page.on('pageerror', error => {
  const fromApp = (error.stack ?? '').includes(VSCODE);
  (fromApp ? report.appConsoleErrors : report.desktopErrors).push(error.message);
});
page.on('console', message => {
  if (message.type() !== 'error') return;
  const fromDesktop = (message.location().url ?? '').startsWith(desktop.origin);
  if (fromDesktop && !/Failed to load resource/.test(message.text())) report.desktopErrors.push(message.text());
  else report.appConsoleErrors.push(message.text().slice(0, 300));
});

const vscodeWin = page.locator('.win[data-app="vscode"]:not(.closing)');
const appFrame = () => page.frames().find(frame => frame.url().startsWith(`${VSCODE}/`));
/** 等桌面窗口进入就绪（应用向桌面报告），返回耗时毫秒；窗口显示失败时带上窗口里的原因抛错。 */
const openedWithin = async open => {
  const started = Date.now();
  await open();
  const settled = vscodeWin.locator('.webapp[data-webapp-state="ready"], .webapp[data-webapp-state="failed"]');
  await settled.waitFor({ state: 'attached', timeout: 90_000 });
  if ((await vscodeWin.locator('.webapp').getAttribute('data-webapp-state')) === 'failed')
    throw new Error(`Aiao Code 打开失败：${await vscodeWin.locator('[data-webapp-reason]').textContent()}`);
  return Date.now() - started;
};
const workbench = frame => frame.getByRole('region', { name: '浏览器开发工作台', exact: true });

try {
  await page.goto(`${desktop.origin}/?boot=0`);
  await page.locator('.win[data-app="finder"]').waitFor();

  /* #1 从 Dock 打开，工作台出现并报告就绪。 */
  report.timings.firstReadyMs = await openedWithin(() => page.locator('#dock .di[data-app="vscode"]').click());
  const frame = appFrame();
  const root = workbench(frame);
  await expect(root).toBeVisible({ timeout: 60_000 });
  report.checks.workbenchReady = true;

  /* #2 应用里处于跨源隔离。 */
  report.checks.crossOriginIsolated = (await frame.evaluate(() => crossOriginIsolated)) === true;

  /* #3 新建 vanilla 项目，打开终端执行命令。 */
  const project = `Desktop check ${Date.now()}`;
  await root.getByRole('button', { name: '应用程序菜单', exact: true }).click();
  await root.getByRole('menuitem', { name: '新建项目', exact: true }).click();
  await frame.getByRole('textbox', { name: '项目名称', exact: true }).fill(project);
  await frame.getByRole('dialog').locator('input[name="template"][value="vanilla"]').check();
  await frame.getByRole('dialog').getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(root.locator('[data-slot="workspace-label"]')).toHaveText(project);
  const terminal = root.locator('[data-log="terminal"]');
  const screen = terminal.locator('.xterm-rows:visible');
  const started = Date.now();
  await root.locator('.wb-title-actions [data-action="terminal"]').click();
  await expect(terminal.locator('[data-terminal-status]')).toHaveText('运行中', { timeout: 120_000 });
  report.timings.terminalRunningMs = Date.now() - started;
  await terminal.getByRole('textbox', { name: '终端输入', exact: true }).filter({ visible: true }).focus();
  await page.keyboard.type('echo AIAO_DESKTOP_OK');
  await page.keyboard.press('Enter');
  const printed = () =>
    expect
      .poll(async () =>
        (await screen.locator(':scope > div').allTextContents()).some(line => line.trim() === 'AIAO_DESKTOP_OK')
      )
      .toBe(true);
  await printed();
  report.checks.terminalRuns = true;
  if (argument('screenshot')) await page.screenshot({ path: resolve(process.cwd(), argument('screenshot')) });

  /* #4 最小化再还原：同一个文档，项目与终端输出还在。 */
  await frame.evaluate(() => Reflect.set(window, '__desktopProbe', 'before-minimize'));
  await vscodeWin.locator('.tl .m').click();
  await page.waitForTimeout(800);
  await page.locator('#dock .di[data-app="vscode"]').click();
  await page.waitForTimeout(1_000);
  report.checks.restoreKeepsWorkbench =
    appFrame() === frame &&
    (await frame.evaluate(() => Reflect.get(window, '__desktopProbe'))) === 'before-minimize' &&
    (await root.locator('[data-slot="workspace-label"]').textContent())?.trim() === project &&
    (await printed().then(
      () => true,
      () => false
    ));

  /* #5 关闭再从启动台打开：重新就绪，刚建的项目还在。 */
  await vscodeWin.locator('.tl .c').click();
  await vscodeWin.waitFor({ state: 'detached' });
  report.timings.reopenReadyMs = await openedWithin(async () => {
    await page.locator('#dock .di[data-app="launchpad"]').click();
    await page.locator('#lpad [data-lq]').fill('Aiao Code');
    await page.locator('#lpad [data-lq]').press('Enter');
  });
  const reopened = workbench(appFrame());
  await expect(reopened).toBeVisible({ timeout: 60_000 });
  report.checks.reopenKeepsProject = await expect(reopened)
    .toContainText(project, { timeout: 30_000 })
    .then(
      () => true,
      () => false
    );

  /* #6 桌面页面没有错误。 */
  report.checks.noDesktopErrors = report.desktopErrors.length === 0;
} catch (error) {
  report.error = error instanceof Error ? error.message.split('\n')[0] : String(error);
  await page.screenshot({ path: '/tmp/aiao-desktop-verify-aiao-code.png' }).catch(() => undefined);
} finally {
  await browser.close();
  desktop.close();
}

const passed =
  !report.error && Object.values(report.checks).length === 6 && Object.values(report.checks).every(Boolean);
report.status = passed ? 'passed' : 'failed';
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;
