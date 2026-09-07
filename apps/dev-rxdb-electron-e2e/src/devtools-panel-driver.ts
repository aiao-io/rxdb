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
 * **单次**帧内取值的上限。
 *
 * @remarks
 * 轮询循环的 `budgetMs` 只在**两轮之间**被检查，管不住卡在循环体里的那一次调用。
 * 而 `WebFrameMain.executeJavaScript()` 在目标帧于调用途中被拆掉时**不 settle**——
 * 既不 resolve 也不 reject，`.catch()` 因此也接不住。于是整个 `app.evaluate()`
 * 连同 Electron 主进程一起停在那里，表征是：
 *
 * - 用例跑满**超过自己配置的** timeout（实测 420000ms 的用例跑了 15.6 分钟）；
 * - 随后 `app.close()` 也拿不到主进程，worker teardown 一并超时；
 * - 泄漏的 Electron 进程堆积，把后面用例的 `electron.launch()` 拖垮——
 *   `devtools-mv3-feasibility` 的 `beforeAll` 只做 `existsSync` 却超时 120s，就是这个尾巴。
 *
 * 这一幕只在 DevTools 反复开关或被检查页 `reload()` 前后出现（帧正在重建），
 * 所以它是间歇的：同一个文件单跑全绿，跟同目录其余用例一起跑就轮流红。
 *
 * 取 5s：帧内脚本只做 `querySelector` 与读 `innerText`，正常在毫秒级；
 * 5s 还没回来就当这一轮没读到，把控制权交回循环，由 `budgetMs` 统一裁决。
 * **不是兜底**——超时不伪造结果，只是让「读不到」按既有路径如实变成红。
 */
const FRAME_CALL_BUDGET_MS = 5000;

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

      // 单次调用也要有上限：帧在调用途中被拆掉时 `executeJavaScript` 不 settle，
      // `.catch()` 接不住，循环的 deadline 也就永远轮不到被检查（见 FRAME_CALL_BUDGET_MS）。
      const withCallBudget = (promise: Promise<unknown>): Promise<unknown> =>
        Promise.race([
          promise.catch(() => false),
          new Promise(resolve => setTimeout(() => resolve(false), input.callBudgetMs))
        ]);

      const deadline = Date.now() + input.budgetMs;
      while (Date.now() < deadline) {
        const done = await withCallBudget(devTools.executeJavaScript(clickExtensionTab));
        if (done === true) return true;
        await sleep(500);
      }
      return false;
    },
    { budgetMs, callBudgetMs: FRAME_CALL_BUDGET_MS, inspected }
  );

  expect(selected, 'DevTools 里始终没有出现扩展面板 tab').toBe(true);
}

/**
 * 关掉 DevTools，并等到它真的关上。
 *
 * @param app - 已启动的打包产物。
 * @param inspected - 被检查窗口的 URL 前缀。
 * @throws 预算内没关上时断言失败。
 *
 * @remarks
 * 与 {@link attachPanel} 配对，用来制造「session A 结束 → 重开得到 session B」这一幕（AC#51）。
 * 等 `isDevToolsOpened()` 翻成 false 而不是关完就走：关闭是异步的，紧接着重开会撞上
 * 还没拆完的旧宿主，表征是重开后拿到的仍是旧面板帧。
 */
export async function closePanel(app: ElectronApplication, inspected: InspectedWindow): Promise<void> {
  const closed = await app.evaluate(async ({ BrowserWindow }, input) => {
    const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
    const win = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().startsWith(input));
    if (!win) throw new Error(`找不到 ${input} 窗口`);
    win.webContents.closeDevTools();
    for (let attempt = 0; attempt < 40; attempt++) {
      if (!win.webContents.isDevToolsOpened()) return true;
      await sleep(250);
    }
    return false;
  }, inspected);

  expect(closed, 'DevTools 始终没有关上').toBe(true);
}

/**
 * 在面板帧里执行一段脚本并取回结果。
 *
 * @param app - 已启动的打包产物。
 * @param inspected - 被检查窗口的 URL 前缀。
 * @param script - 一段 IIFE 源码；返回值必须能结构化克隆。
 * @returns 脚本的返回值。
 * @throws 找不到面板帧时抛出 —— 静默返回 `undefined` 会让「面板没打开」伪装成「脚本返回了空」。
 *
 * @remarks
 * 与 {@link readPanel} 的分工：那个负责**轮询到终态**，这个负责**做一次动作**。
 * 驱动面板里的按钮与对话框走这里；Angular 的 `(input)` 绑定读的是事件里的
 * `target.value`，所以设完 `value` 必须补一次冒泡的 `input` 事件，只赋值不派发是无效的。
 */
export async function panelEvaluate<T>(
  app: ElectronApplication,
  inspected: InspectedWindow,
  script: string
): Promise<T> {
  return app.evaluate(
    async ({ BrowserWindow }, input) => {
      const win = BrowserWindow.getAllWindows().find(candidate =>
        candidate.webContents.getURL().startsWith(input.inspected)
      );
      const frame = win?.webContents.devToolsWebContents?.mainFrame.framesInSubtree.find(candidate =>
        candidate.url.includes('/panel.html')
      );
      if (!frame) throw new Error('找不到面板帧；DevTools 没开或扩展面板没登记');
      // 同 readPanel：帧在调用途中被拆掉时这个 promise 不 settle，会把主进程连同
      // app.close() 一起挂住（见 FRAME_CALL_BUDGET_MS）。这里没有「下一轮」可退，
      // 所以超时抛错——一次带现场的红，好过一个跑满 timeout 的假死。
      return (await Promise.race([
        frame.executeJavaScript(input.script) as Promise<unknown>,
        new Promise((_resolve, reject) =>
          setTimeout(
            () => reject(new Error(`面板帧内脚本 ${String(input.callBudgetMs)}ms 未返回；帧多半已在执行途中被拆掉`)),
            input.callBudgetMs
          )
        )
      ])) as unknown;
    },
    { callBudgetMs: FRAME_CALL_BUDGET_MS, inspected, script }
  ) as Promise<T>;
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
  return app.evaluate(
    async ({ BrowserWindow }, opts) => {
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

      // 单次调用也要有上限：帧在调用途中被拆掉时 `executeJavaScript` 不 settle，
      // `.catch()` 接不住，循环的 deadline 也就永远轮不到被检查（见 FRAME_CALL_BUDGET_MS）。
      // 超时按 `null` 处理，与「这一轮没读到」同一条路径，不伪造任何正文。
      const readOnce = (frame: Electron.WebFrameMain): Promise<unknown> =>
        Promise.race([
          frame.executeJavaScript(script).catch((error: Error) => `帧内执行抛错：${error.message}`),
          new Promise(resolve => setTimeout(() => resolve(null), opts.callBudgetMs))
        ]);

      const wanted = new RegExp(opts.awaitPattern);
      const deadline = Date.now() + opts.budgetMs;
      let latest = '(面板帧始终没有出现)';
      while (Date.now() < deadline) {
        const frame = panelFrame();
        // `WebFrameMain.executeJavaScript` 回 `Promise<unknown>`；非字符串一律当作「这一轮没读到」，
        // 循环结束后把最后一次真读到的文本抛给调用侧，比在这里编一个占位字符串更早暴露问题。
        const raw = frame ? await readOnce(frame) : null;
        if (typeof raw === 'string' && raw.trim().length > 0) latest = raw;
        if (wanted.test(latest)) return latest;
        await sleep(400);
      }
      return latest;
    },
    { ...input, callBudgetMs: FRAME_CALL_BUDGET_MS }
  );
}
