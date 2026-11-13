/**
 * 几猫3A大作的本机实测（ADESK-US-103 #9、ADESK-US-008 #9）：本机有 GPU 的真 Chrome 里，对桌面的正式构建
 * 从启动台打开真游戏，记录启动到标题画面的耗时、点「开始行动」后指针锁定、帧率、Esc 退出锁定并暂停、
 * 游戏开着时桌面是否照常响应，以及最小化后游戏循环是否仍在运行。要 GPU，不进 CI。
 *
 *   --channel=<名>   Playwright 的浏览器通道，默认 chrome（本机安装的 Chrome）；传 chromium 用自带的无头构建（只有软件 WebGL）
 *   --dist=<目录>    托管另一份桌面产物（默认 dist/aiao-desktop/apps/web/browser）
 *   --headless       不显示窗口（默认显示：指针锁定与 GPU 加速在有窗口的 Chrome 里才可靠）
 *   --screenshot=<文件>  到标题画面后截一张整页图
 *
 * 输出一份 JSON 报告：环境、各检查项、耗时与帧率。检查项不通过时退出码为 1。
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { outputRoot, startDesktopServer } from './desktop-server.mjs';
import { launchEngine } from './fixtures/engines.mjs';

const { values } = parseArgs({
  options: {
    channel: { type: 'string', default: 'chrome' },
    dist: { type: 'string' },
    headless: { type: 'boolean', default: false },
    screenshot: { type: 'string' }
  },
  strict: true
});

const BOOT_TIMEOUT = 180_000;
const desktop = await startDesktopServer({ root: values.dist ? resolve(values.dist) : outputRoot });
const browser = await launchEngine('chromium', {
  headless: values.headless,
  channel: values.channel === 'chromium' ? undefined : values.channel
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.route(
  url => !url.href.startsWith(desktop.origin),
  route => route.abort()
);
const page = await context.newPage();
const logs = [];
page.on('console', message => {
  if (['error', 'warning'].includes(message.type()) && !/Failed to load resource/.test(message.text()))
    logs.push(`[${message.type()}] ${message.text().slice(0, 240)}`);
});
page.on('pageerror', error => logs.push(`[pageerror] ${error.message}`));

const report = {
  format: 'aiao-desktop.verify-saltline',
  version: 1,
  measuredAt: new Date().toISOString(),
  environment: { channel: values.channel, headless: values.headless, browser: browser.version() },
  checks: {},
  timings: {},
  metrics: {},
  logs
};

try {
  await page.goto(`${desktop.origin}/?boot=0`, { waitUntil: 'load' });
  await page.locator('.win[data-app="finder"]').waitFor();
  await page.locator('.win:not(.closing) .tl .c').first().dispatchEvent('click');

  const gameWin = page.locator('.win[data-app="saltline"]:not(.closing)');
  const frame = () => page.frames().find(item => item.url().endsWith('/saltline.html'));
  const state = () =>
    frame().evaluate(() => ({
      ready: window.__ready,
      fatal: window.__fatal,
      errors: window.__errors?.length ?? 0,
      isolated: window.crossOriginIsolated,
      screen: document.querySelector('.menu')?.dataset.screen,
      game: window.__stats?.().state,
      fps: window.__stats?.().fps,
      locked: Boolean(document.pointerLockElement)
    }));

  const openedAt = Date.now();
  await page.locator('#dock .di[data-app="launchpad"]').click();
  await page.waitForSelector('#lpad:not(.out) [data-lq]');
  await page.locator('#lpad [data-lq]').fill('几猫');
  await page.locator('#lpad [data-lq]').press('Enter');
  await gameWin.locator('[data-saltline-frame]').waitFor();
  await page.waitForFunction(
    () => {
      const view = document.querySelector('[data-saltline-frame]')?.contentWindow;
      return view?.__ready === true || Boolean(view?.__fatal);
    },
    undefined,
    { timeout: BOOT_TIMEOUT, polling: 250 }
  );
  report.timings.bootToTitleMs = Date.now() - openedAt;
  const booted = await state();
  report.checks.titleReached = booted.ready === true && booted.fatal === null && booted.screen === 'title';
  report.checks.noGameErrors = booted.errors === 0;
  report.checks.crossOriginIsolated = booted.isolated === true;
  report.metrics.renderer = await frame().evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : (gl?.getParameter(gl.RENDERER) ?? null);
  });
  if (values.screenshot) await page.screenshot({ path: values.screenshot });

  /* 游戏开着时桌面照常响应：从 Dock 打开计算器要多久。 */
  const calculatorAt = Date.now();
  await page.locator('#dock .di[data-app="calculator"]').click();
  await page.locator('.win[data-app="calculator"]:not(.closing)').waitFor();
  report.timings.calculatorOpensMs = Date.now() - calculatorAt;
  report.checks.desktopResponsive = report.timings.calculatorOpensMs < 1_000;
  await page.locator('.win[data-app="calculator"] .tl .c').click();
  await page.waitForTimeout(400);

  /* 点激活层回到游戏，点「开始行动」进入游戏，等片头过去。 */
  const box = await gameWin.locator('[data-saltline-frame]').boundingBox();
  await page.mouse.click(box.x + 30, box.y + box.height - 30);
  await page.waitForTimeout(300);
  await frame().locator('button[data-act="deploy"]').click({ timeout: 20_000 });
  await page.waitForTimeout(1_500);
  await page.waitForTimeout(8_000);

  /* 点击画面请求指针锁定；有 GPU 时帧率约 60。 */
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(800);
  const playing = await state();
  report.checks.pointerLocked = playing.locked === true;
  report.checks.playing = playing.game === 'playing';
  report.metrics.fps = playing.fps;
  report.checks.fpsNear60 = typeof playing.fps === 'number' && playing.fps >= 50;

  /* Esc：退出指针锁定，游戏暂停。 */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  const paused = await state();
  report.checks.escExitsLock = paused.locked === false;
  report.checks.escPauses = paused.game === 'paused';

  /* 最小化（黄色按钮）后的游戏循环：桌面不通知游戏，隐藏的窗口里循环照常运行（D-15 的已知限制）。 */
  await gameWin.locator('.tl .m').click();
  await page.waitForTimeout(1_500);
  const first = await frame().evaluate(() => window.__frames);
  await page.waitForTimeout(1_000);
  const second = await frame().evaluate(() => window.__frames);
  report.metrics.minimizedFramesPerSecond = second - first;
  report.checks.minimizedLoopStillRuns = second - first > 0;

  report.checks.noPageErrors = logs.length === 0;
} finally {
  await browser.close();
  desktop.close();
}

console.log(JSON.stringify(report, null, 2));
if (Object.values(report.checks).some(check => !check)) {
  console.error('几猫3A大作实测有检查项未通过');
  process.exitCode = 1;
}
