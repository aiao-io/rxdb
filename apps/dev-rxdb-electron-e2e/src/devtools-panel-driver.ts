/**
 * @fileoverview 从主进程驱动真实 DevTools 与其中的 RxDB 扩展面板。
 *
 * @remarks
 * **为什么整段都走 `app.evaluate()`**：Playwright 的 page 级 API（以及任何 CDP 客户端）
 * 打不开 DevTools 自己的宿主窗口。但 Electron 侧有一条浏览器侧没有的路——主进程的
 * `webContents.openDevTools()` 与 `devToolsWebContents`，它不经 page 级 CDP，
 * 因此与 DevTools 自己的调试通道不冲突。US-904 阶段 D AC#52 的真机跑通就是走的这条路，
 * 「Playwright 打不开 DevTools 宿主」这条推论只对**浏览器**成立。
 *
 * 两个必踩的坑（均为实测，改这个文件前先读）：
 * 1. DevTools 的 `TabbedPane` 会把**放不下的 tab 移出 DOM**，只挂在「»」下拉里。应用窗口默认
 *    900px，bottom 模式下主 tab 条只显示前 9 个内置 tab，扩展面板一律读不到——那会被误读成
 *    「面板没登记」，而它其实一直都登记着。所以 {@link attachPanel} 先 `setSize(1600, 1000)`。
 * 2. `chrome.scripting` 在**隔离世界**执行。用主世界的 `window.__AIAO_RXDB_DEVTOOLS_BRIDGE__`
 *    判断「桥有没有注进去」永远是 false，那个观测口径是错的。要判断连没连上，读面板正文。
 *
 * @module devtools-panel-driver
 */

import { ElectronApplication, expect } from '@playwright/test';

/**
 * 被检查窗口的 URL 前缀。
 *
 * @remarks
 * 两种形态各自对应一条判据：`--serve` 起的 http renderer 是唯一能注入的形态（US-906 AC#2/#3）；
 * `app://` 是打包产物的生产入口，扩展**永远**注不进去（US-906 AC#4），因为自定义 scheme 不在
 * Chromium 扩展 match pattern 的合法 scheme 集里。
 */
export type InspectedWindow = 'http://localhost' | 'app://';

/** 面板从「打开 DevTools」到「四段中继接通」的预算。实测冷启动约 2.6s，留足重试余量。 */
export const PANEL_BUDGET_MS = 40000;

/**
 * 打开 DevTools 并选中扩展面板 tab。
 *
 * @param app - 已启动的打包产物。
 * @param inspected - 被检查窗口的 URL 前缀。
 * @param budgetMs - 等待扩展 tab 出现的预算。
 * @throws 预算内没等到扩展 tab 时断言失败。
 */
export async function attachPanel(
  app: ElectronApplication,
  inspected: InspectedWindow,
  budgetMs = PANEL_BUDGET_MS
): Promise<void> {
  const selected = await app.evaluate(
    async ({ BrowserWindow }, input) => {
      const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
      const win = BrowserWindow.getAllWindows().find(candidate =>
        candidate.webContents.getURL().startsWith(input.inspected)
      );
      if (!win) throw new Error(`找不到 ${input.inspected} 窗口`);

      win.setSize(1600, 1000);
      const opened = new Promise<void>(resolve => {
        if (win.webContents.isDevToolsOpened()) return resolve();
        win.webContents.once('devtools-opened', () => resolve());
      });
      win.webContents.openDevTools({ mode: 'bottom' });
      await opened;

      const devTools = win.webContents.devToolsWebContents;
      if (!devTools) throw new Error('devToolsWebContents 为 null');

      // 内置 tab 的 id 一律是 `tab-*`，含 `chrome-extension://` 就等价于「这是扩展面板」。
      // tab 藏在 DevTools 前端的多层 shadow root 里，只能自己走一遍。
      const clickExtensionTab = `(() => {
      const seen = new Set();
      let hit = null;
      const walk = root => {
        if (seen.has(root) || hit) return;
        seen.add(root);
        for (const el of root.querySelectorAll('*')) {
          if (el.classList.contains('tabbed-pane-header-tab') && el.id.includes('chrome-extension://')) { hit = el; return; }
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      };
      walk(document);
      if (!hit) return false;
      for (const type of ['mousedown', 'mouseup', 'click']) hit.dispatchEvent(new MouseEvent(type, { bubbles: true }));
      return true;
    })()`;

      const deadline = Date.now() + input.budgetMs;
      while (Date.now() < deadline) {
        const done: boolean = await devTools.executeJavaScript(clickExtensionTab).catch(() => false);
        if (done) return true;
        await sleep(500);
      }
      return false;
    },
    { budgetMs, inspected }
  );

  expect(selected, 'DevTools 里始终没有出现扩展面板 tab').toBe(true);
}

/** 一次面板读取的输入。 */
export interface PanelRead {
  /** 被检查窗口的 URL 前缀。 */
  readonly inspected: InspectedWindow;
  /** 面板路由（hash 路由，见 `devtools/main.ts` 的 `withHashLocation()`）。 */
  readonly hash: string;
  /** 需要先点开的实体按钮文本；不给就不点。 */
  readonly clickText?: string;
  /** 轮询到文本匹配它才算读到终态。 */
  readonly awaitPattern: string;
  readonly budgetMs: number;
}

/**
 * 切到面板某一页、可选地点开一个实体，并等页面走到终态。
 *
 * @param app - 已启动的打包产物。
 * @param input - 读取参数。
 * @returns 面板正文（空白已折叠）；超时则返回**最后一次**读到的文本，让断言报出真实现场。
 *
 * @remarks
 * 每次轮询都重新取 `WebFrameMain`：面板帧会随导航重建，缓存住的引用会在半路失效。
 * 已经选中的实体按钮不重复点 —— `selectEntity()` 每次点击都会重新发查询。
 */
export function readPanel(app: ElectronApplication, input: PanelRead): Promise<string> {
  return app.evaluate(async ({ BrowserWindow }, opts) => {
    const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
    const panelFrame = (): Electron.WebFrameMain | null => {
      const win = BrowserWindow.getAllWindows().find(candidate =>
        candidate.webContents.getURL().startsWith(opts.inspected)
      );
      const devTools = win?.webContents.devToolsWebContents;
      return devTools?.mainFrame.framesInSubtree.find(frame => frame.url.includes('/panel.html')) ?? null;
    };

    const script = `(() => {
      const hash = ${JSON.stringify(opts.hash)};
      if (location.hash !== hash) location.hash = hash;
      const label = ${JSON.stringify(opts.clickText ?? '')};
      if (label) {
        const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label);
        if (button && !button.classList.contains('active')) button.click();
      }
      return document.body.innerText.replace(/\\s+/g, ' ').slice(0, 4000);
    })()`;

    const wanted = new RegExp(opts.awaitPattern);
    const deadline = Date.now() + opts.budgetMs;
    let latest = '(面板帧始终没有出现)';
    while (Date.now() < deadline) {
      const frame = panelFrame();
      // `WebFrameMain.executeJavaScript` 回 `Promise<unknown>`；非字符串一律当作「这一轮没读到」，
      // 循环结束后把最后一次真读到的文本抛给调用侧，比在这里编一个占位字符串更早暴露问题。
      const raw =
        frame ? await frame.executeJavaScript(script).catch((error: Error) => `帧内执行抛错：${error.message}`) : null;
      if (typeof raw === 'string' && raw.trim().length > 0) latest = raw;
      if (wanted.test(latest)) return latest;
      await sleep(400);
    }
    return latest;
  }, input);
}
