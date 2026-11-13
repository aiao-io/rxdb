/**
 * 真实键盘实测（ADESK-US-107 AC#8）：在本机的 Chrome 普通标签页里，**用手按**能力矩阵「快捷键」表里的每个组合，
 * 记录它有没有到达页面、到达后行为对不对。脚本只负责摆好状态、监听按键、核对结果；按键必须来自真实键盘——
 * Playwright 的 `keyboard.press` 走浏览器协议，绕过了系统与浏览器对 ⌘W / ⌘Q / ⌘N / ⌘Space 的占用，不能代表真实键盘。
 * 不进 CI。
 *
 *   --dist=<目录>      托管另一份桌面产物（默认 dist/aiao-desktop/apps/web/browser）
 *   --channel=<名>     浏览器通道，默认 chrome（本机安装的 Chrome）
 *   --timeout=<秒>     每个组合等你按键的时间，默认 20；超时记为「没到达页面」
 *   --only=<id,id>     只测指定的组合（id 见 keyboard/checklist.mjs）
 *   --out=<文件>       把结果写成 JSON（默认只打印 Markdown 表）
 *   --headless         不显示窗口（只用来自检脚本本身：没有人按键，所有组合都会超时）
 *
 * 运行时会弹出一个有窗口的 Chrome。按终端提示逐个按键；被浏览器占用而关掉标签页或浏览器的组合，脚本会自动重新打开。
 * 结论（Markdown 表）贴进验收台账；没到达的组合要在能力矩阵标注，并说明可用的替代入口。
 */
import { writeFileSync } from 'node:fs';
import { release } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { outputRoot, startDesktopServer } from './desktop-server.mjs';
import { launchEngine } from './fixtures/engines.mjs';
import { SHORTCUTS, brokenOnes, formatReport } from './keyboard/checklist.mjs';

const { values } = parseArgs({
  options: {
    dist: { type: 'string' },
    channel: { type: 'string', default: 'chrome' },
    timeout: { type: 'string', default: '20' },
    only: { type: 'string' },
    out: { type: 'string' },
    headless: { type: 'boolean', default: false }
  },
  strict: true
});
const timeoutMs = Number(values.timeout) * 1000;
if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) throw new Error('--timeout 必须是不小于 1 的秒数');
const only = values.only?.split(',').filter(Boolean);
const unknown = (only ?? []).filter(id => !SHORTCUTS.some(item => item.id === id));
if (unknown.length)
  throw new Error(`未知的组合 id：${unknown.join('、')}（可选：${SHORTCUTS.map(item => item.id).join('、')}）`);
const selected = SHORTCUTS.filter(item => !only || only.includes(item.id));

/** 页面里记录按键的探针：捕获阶段、页面自己的处理器之前。 */
const PROBE = () => {
  window.__keyArrivals = [];
  window.addEventListener(
    'keydown',
    event => window.__keyArrivals.push({ key: event.key, code: event.code, meta: event.metaKey, ctrl: event.ctrlKey }),
    true
  );
};

const desktop = await startDesktopServer({ root: values.dist ? resolve(values.dist) : outputRoot });
const launch = () =>
  launchEngine('chromium', {
    headless: values.headless,
    channel: values.channel === 'chromium' ? undefined : values.channel
  });
let browser = await launch();
let context;
let page;

async function openPage() {
  if (!browser.isConnected()) browser = await launch();
  context = await browser.newContext({ viewport: null });
  await context.route(
    url => !url.href.startsWith(desktop.origin),
    route => route.abort()
  );
  await context.addInitScript(PROBE);
  page = await context.newPage();
  await page.goto(`${desktop.origin}/?boot=0`, { waitUntil: 'load' });
  await page.waitForSelector('.win[data-app="finder"]');
  await page.bringToFront();
}

const win = app => page.locator(`.win[data-app="${app}"]:not(.closing)`);
const closeAll = async () => {
  for (let guard = 0; guard < 20; guard++) {
    const close = page.locator('.win:not(.closing) .tl .c');
    if ((await close.count()) === 0) return;
    await close.first().dispatchEvent('click');
    await page.waitForTimeout(250);
  }
};
const openApp = async app => {
  await page.locator(`#dock .di[data-app="${app}"]`).click();
  await win(app).first().waitFor();
  await page.waitForTimeout(400);
};

/** 收起上一个组合留下的弹层（聚焦搜索、启动台、菜单）：这里的 Esc 是脚本自己按的清理，不是被测的按键。 */
const reset = async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
};

/** 把页面摆到按键前该有的状态。 */
const PREPARE = {
  async clean() {
    await reset();
    await closeAll();
  },
  async window() {
    await PREPARE.clean();
    await openApp('calculator');
  },
  async 'two-windows'() {
    await PREPARE.clean();
    await openApp('calculator');
    await openApp('notes');
  },
  async finder() {
    await PREPARE.clean();
    await openApp('finder');
  },
  async spotlight() {
    await PREPARE.clean();
    await page.locator('#menubar [data-st="spot"]').dispatchEvent('mousedown');
    await page.locator('#spot').waitFor({ timeout: 3000 });
  },
  async launchpad() {
    await PREPARE.clean();
    await page.locator('#dock .di[data-app="launchpad"]').click();
    await page.locator('#lpad').waitFor({ timeout: 3000 });
  }
};

/** 按键到达后，行为对不对。 */
const EFFECT = {
  'spotlight-open': async () => (await page.locator('#spot').count()) > 0,
  'launchpad-open': async () => (await page.locator('#lpad').count()) > 0,
  'overlay-closed': async () => (await page.locator('#spot').count()) === 0,
  'window-closed': async () => (await win('calculator').count()) === 0,
  'window-minimized': async () =>
    win('calculator')
      .first()
      .evaluate(node => node.style.visibility === 'hidden'),
  'app-quit': async () => (await win('calculator').count()) === 0,
  'window-cycled': async () => {
    const fronts = await page
      .locator('.win.front')
      .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-app')));
    return fronts.length === 1 && fronts[0] === 'calculator';
  },
  'new-window': async () => (await win('finder').count()) >= 2
};

const arrivals = () => page.evaluate(() => window.__keyArrivals ?? []);

async function waitForKey() {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (page.isClosed() || !browser.isConnected()) return { closed: true };
    const seen = await arrivals().catch(() => null);
    if (seen === null) return { closed: true };
    if (seen.length > 0) return { seen };
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return { timeout: true };
}

const results = [];
try {
  await openPage();
  console.error(
    `\n共 ${selected.length} 个组合。每个组合有 ${values.timeout} 秒；按终端提示在弹出的 Chrome 窗口里按键。\n`
  );
  for (const item of selected) {
    await PREPARE[item.prepare]();
    await page.evaluate(() => (window.__keyArrivals = []));
    await page.bringToFront();
    console.error(`▶ ${item.combo}：请按 ${item.press}  —— 期望：${item.description}`);
    const outcome = await waitForKey();
    if (outcome.closed) {
      results.push({
        id: item.id,
        combo: item.combo,
        reached: false,
        works: null,
        note: '标签页或浏览器被关闭，被浏览器占用'
      });
      console.error('  ✗ 标签页/浏览器被关掉了（被浏览器占用），重新打开。');
      await openPage();
      continue;
    }
    if (outcome.timeout) {
      results.push({
        id: item.id,
        combo: item.combo,
        reached: false,
        works: null,
        note: `${values.timeout} 秒内页面没收到按键`
      });
      console.error('  ✗ 页面没收到按键（被浏览器或系统占用）。');
      continue;
    }
    await page.waitForTimeout(700);
    const works = await EFFECT[item.effect]();
    results.push({ id: item.id, combo: item.combo, reached: true, works });
    console.error(`  ${works ? '✓ 到达且行为正确' : '✗ 到达但行为不对'}`);
  }
} finally {
  await browser.close().catch(() => undefined);
  desktop.close();
}

const environment = {
  browser: `${values.channel} ${browser.version?.() ?? ''}`.trim(),
  platform: `${process.platform} ${release()}`,
  date: new Date().toISOString().slice(0, 10)
};
console.log(formatReport(results, environment));
if (values.out) writeFileSync(values.out, `${JSON.stringify({ environment, results }, null, 2)}\n`);
if (brokenOnes(results).length > 0) process.exitCode = 1;
