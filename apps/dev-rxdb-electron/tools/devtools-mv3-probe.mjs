/**
 * US-904 阶段 A：Electron 43 MV3 扩展可行性探针（stop/go 门禁）。
 *
 * 作为**真实 Electron 主进程**运行，不是测试替身：
 *
 * ```
 * ELECTRON_RUN_AS_NODE= <electron> apps/dev-rxdb-electron/tools/devtools-mv3-probe.mjs \
 *   <扩展 dist 目录> <结果 JSON 输出路径>
 * ```
 *
 * 断言在 `apps/dev-rxdb-electron-e2e/src/devtools-mv3-feasibility.spec.ts` —— 本文件只负责
 * 「把事情做一遍并如实记录」，判定与红绿留给那一侧，免得探针自己既当运动员又当裁判。
 *
 * ## 为什么是 .mjs 脚本而不是 src-electron 里的模块
 *
 * 阶段 A 的技术约束要求「可行性代码必须与正式 provider 解耦，`unsupported` 结论也应能删除
 * fixture 而不留下运行时 fallback」。本文件不被 `src-electron/` 的任何模块 import，删掉它
 * 与配套 spec，生产主进程一行都不用改。
 *
 * ## 六个踩过的坑（改动前先读）
 *
 * 1. **DevTools 必须 dock**：`mode: 'detach'` / `'undocked'` 的 DevTools 窗口不注册任何扩展
 *    面板（Lighthouse、Recorder 也一并消失），等多久都不出现。只有 `mode: 'bottom'` 会注册。
 * 2. **DevTools 里有三条同构的 tab 条**：主面板条、抽屉条、Elements 侧边栏条，class 完全一样。
 *    读「当前选中的 tab」必须锚定 `.main-tabbed-pane`，不能按 DOM 序取第一个 —— 抽屉打开时它
 *    排在主条**之前**（Electron 44 首启会自动打开「新变化 / What's New」抽屉），选中项就恒读成
 *    抽屉里那个，按多少次「下一个面板」都不变。见 `MAIN_TABS`。
 * 3. **不能靠在 tab 条 DOM 里找 RxDB 再点它**：`devtools.html` 帧已加载 ≠ `panels.create` 已登记，
 *    本地 1500 宽的窗口（宽到足以显示 11 个 tab）拍到的 `tabsBeforeActivation` 里照样没有 RxDB。
 *    所以选中面板走 DevTools 自己的「下一个面板」快捷键循环，并逐次轮询直到选中 RxDB
 *    （见 `selectRxdbTab()`）；`activatePanel()` 还会先等注册最多 20 秒，把「没登记」与
 *    「登记了但没选中」分成两个可区分的事实。
 *    **溢出折叠不是失效来源，别再往这个方向查**：`main.next-tab` 走的是 `TabbedPane.selectNextTab()`，
 *    它遍历完整的 `this.tabs` 数组，被折进「更多标签页」的 tab 照样轮得到。CI 上循环两圈
 *    （Elements→…→Recorder→Elements）都没经过 RxDB，只能说明它根本不在数组里。
 * 4. **面板页惰性实例化**：`chrome.devtools.panels.create` 只登记 tab，`panel.html` 要等 tab
 *    被选中才加载 —— 所以「注册成功」和「面板真的跑起来」是两件事，本探针两件都验。
 * 5. **`window-all-closed` 默认退出应用**：AC#4c 销毁窗口后主进程会先于记录结果退出，
 *    必须注册空 listener 顶住。
 * 6. **别加 `--no-sandbox`**：非沙箱渲染进程走 `renderer_init`，它同步向主进程要 preload 列表，
 *    扩展的 `devtools_page` 拿回 `null`，bundle 在 `object null is not iterable` 处中断 ——
 *    页面脚本一行都不执行，`panels.create` 从未被调用，面板不进 tab 条。而这两行只出现在
 *    DevTools 前端的 console（`devToolsConsole`），主进程 stderr 干干净净，帧树里
 *    `devtools.html` 还在，`chrome.devtools` 探起来也正常 —— 只有 `devtoolsPageState` 的
 *    `readyState: 'loading'` + `scripts: []` 露馅。Linux 上要跑就先把 `dist/chrome-sandbox`
 *    配成 root:root 4755（见 spec 的 `assertSandboxUsable()`）。
 *
 * ## 唯一的可容忍差异
 *
 * Electron 43 **没有 `chrome.permissions` 命名空间**（见 `finding.chromePermissionsMissing`）。
 * 按故事「关键项与可容忍差异」，fixture 改用静态窄 host permission（只覆盖自身 origin），
 * 并且只改临时目录里的构建产物副本 —— 生产 `manifest.config.ts` 与 `dist/manifest.json`
 * 一个字节都不动。注入本身仍由 background 的真实 `chrome.scripting` 执行，未授权 origin
 * 的负向用例同样真实跑一遍。
 *
 * 授权差异的**生产处理**在面板的 `InspectedPageAccessService`：宿主没有该 API 时按
 * 「静态 host permission 已生效」判 granted 并真实 INIT（详见该服务 @remarks）。所以正向
 * 链路的 INIT 由面板自己发出，本探针不再代发 —— `relayScript` 只留给负向用例：向未授权
 * origin 的 tab 发起 INIT，证注入被拒。
 */

import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { app, BrowserWindow, session, webContents } = createRequire(import.meta.url)('electron');

// 按位置取参数会被 Chromium 开关打乱：只要在脚本路径**之前**插一个 `--xxx`，
// `process.argv[2]` 就从「扩展 dist」变成脚本自身，两个参数一起错位、报出来的错和原因无关。
// 剥掉所有 `--` 开头的项后，argv[1] 恒为本脚本路径，其后才是两个真正的位置参数。
// （门禁本身不传任何开关 —— 尤其**不要**传 `--no-sandbox`，见上面第 6 条坑。）
const positional = process.argv.slice(1).filter(arg => !arg.startsWith('--'));
const EXTENSION_DIST = positional[1];
const OUTPUT_PATH = positional[2];

if (!EXTENSION_DIST || !OUTPUT_PATH) {
  process.stderr.write('用法：<electron> devtools-mv3-probe.mjs <扩展 dist 目录> <结果 JSON 路径>\n');
  process.exit(2);
}

/** 已授权 origin 的 host permission。Chrome match pattern 不接受端口，所以只能写主机名。 */
const AUTHORIZED_PATTERN = 'http://127.0.0.1/*';

/** 观察到的事实。每项 `{ step, ok, detail }`，由 spec 侧逐项断言。 */
const findings = [];
const record = (step, ok, detail) => findings.push({ step, ok, detail });

/**
 * inspected page 的最小 connector。
 *
 * 不引真实 RxDB：`HANDSHAKE` 的 `payload` 允许为 `null`，握手往返本身与数据库无关，
 * 而阶段 A 要证的是**传输链路**通不通，不是数据对不对。
 */
const FIXTURE_HTML = `<!doctype html><meta charset="utf-8"><title>us904 fixture</title>
<body><h1>fixture</h1><script>
const SRC = '@aiao/rxdb-devtools';
window.__probe = { seen: [], ports: 0 };
function handshake() {
  return { source: SRC, direction: 'page-to-devtools', type: 'HANDSHAKE', payload: null, timestamp: Date.now(), sequence: 0 };
}
// 真实 connector 的 PING 可能走 window.postMessage，也可能走已建立的私有 MessagePort，
// 两条都要回握手 —— 只处理前者的话，页面没刷新时第二次 PING 会静默丢掉，看上去像 Electron 的锅。
function respondToPing() {
  const channel = new MessageChannel();
  window.__probe.ports++;
  channel.port1.onmessage = event => {
    const type = event.data && event.data.type;
    window.__probe.seen.push('port:' + type);
    if (type === 'PING') respondToPing();
  };
  window.postMessage(handshake(), window.location.origin, [channel.port2]);
}
window.addEventListener('message', event => {
  const data = event.data;
  if (!data || data.source !== SRC) return;
  window.__probe.seen.push(data.type);
  if (data.type === 'PING') respondToPing();
});
</script></body>`;

/**
 * 起一个只回 fixture 页面的 HTTP 服务。
 *
 * 必须是 HTTP 而不是 `file:` —— 扩展的 `web_accessible_resources` 只覆盖 http 与 https 两种协议，
 * `file:` 下 content script 根本取不到资源。
 */
const makeServer = () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(FIXTURE_HTML);
  });
  return {
    server,
    listen: host => new Promise(resolve => server.listen(0, host, () => resolve(server.address().port)))
  };
};

/** 已授权 origin（`127.0.0.1`）。 */
const authorized = makeServer();
/** 未授权 origin。必须换**主机名**而非端口，match pattern 只按主机名匹配。 */
const foreign = makeServer();

app.on('window-all-closed', () => {
  // 刻意空实现：AC#4c 会销毁全部窗口，默认 handler 会立刻 quit，结果就来不及写盘了。
  // 退出统一由 finish() 的 app.exit() 负责。
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 轮询等待条件成立。
 *
 * @param probe - 每次轮询求值的函数，返回真值即视为满足
 * @param timeoutMs - 上限，超时后返回最后一次取值而不抛
 * @returns 最后一次取值
 */
const waitFor = async (probe, timeoutMs, intervalMs = 400) => {
  const deadline = Date.now() + timeoutMs;
  let value = await probe();
  while (!value && Date.now() < deadline) {
    await sleep(intervalMs);
    value = await probe();
  }
  return value;
};

const finish = code => {
  writeFileSync(OUTPUT_PATH, JSON.stringify(findings, null, 2));
  authorized.server.close();
  foreign.server.close();
  app.exit(code);
};

/**
 * 读**主** tab 条（`.main-tabbed-pane`）的完整快照，深挖 shadow DOM。
 *
 * @remarks
 * DevTools 里同时存在三条 `.tabbed-pane-header-tabs`：主面板条、抽屉条（`.drawer-tabbed-pane`）、
 * Elements 侧边栏条。早先「按 DOM 序取第一个 `.selected`」的前提是主条最靠前 —— 但抽屉一旦打开，
 * 抽屉条在 DOM 里排在主条**之前**，选中项就恒读成抽屉里那个（本机 Electron 44 首启自动打开
 * 「新变化 / What's New」抽屉，于是 24 次按键读到的全是「新变化」）。这类误读的表征极具迷惑性：
 * AC2 报「一次都没选中 RxDB」，而同一次运行里 `panel.html` 帧已加载、四段中继也已跑通。
 *
 * 每个 tab 元素带稳定 id：内建面板形如 `tab-elements`，扩展面板形如
 * `tab-chrome-extension://<扩展 id><面板标题>`。判定扩展面板一律用 id 而不是标题 ——
 * 标题随 DevTools locale 变（CI 英文、本机中文），id 不变。
 */
const MAIN_TABS = `(() => {
  const seen = new Set();
  let bar = null;
  const walk = root => {
    if (seen.has(root) || bar) return; seen.add(root);
    for (const el of root.querySelectorAll('*')) {
      const host = el.getRootNode().host;
      if (el.classList.contains('tabbed-pane-header-tabs') && host?.classList.contains('main-tabbed-pane')) {
        bar = el;
        return;
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  const tabs = bar ? [...bar.querySelectorAll('.tabbed-pane-header-tab')] : [];
  return JSON.stringify({
    barFound: !!bar,
    tabs: tabs.map(tab => ({ title: (tab.textContent || '').trim(), id: tab.id, selected: tab.classList.contains('selected') }))
  });
})()`;

/** 扩展面板的 tab？看 id 前缀而非标题，避开 locale。 */
const isRxdbTab = tab => tab.id.startsWith('tab-chrome-extension://') && /rxdb/i.test(tab.id);

const readMainTabs = async devTools => JSON.parse(await devTools.executeJavaScript(MAIN_TABS));

/**
 * devtools_page 帧的运行状态。
 *
 * @remarks
 * 面板没登记时，这条把三种成因分开：脚本没跑完（`readyState` 停在 loading）、
 * `chrome.devtools` 没注入（API 表面问题）、帧还在树里但渲染进程已经没了（executeJavaScript 抛）。
 * 没有它，CI 上的红只剩「一次都没选中 RxDB」这一句，谁也说不出下一步该查什么。
 */
const DEVTOOLS_PAGE_STATE = `JSON.stringify({
  readyState: document.readyState,
  scripts: [...document.scripts].map(script => script.src.split('/').pop()),
  chromeDevtools: typeof chrome?.devtools,
  panelsCreate: typeof chrome?.devtools?.panels?.create,
  inspectedTabId: chrome?.devtools?.inspectedWindow?.tabId ?? null
})`;

const readDevtoolsPage = async frame => {
  if (!frame) return { error: 'devtools.html 帧不在帧树里' };
  try {
    return JSON.parse(await frame.executeJavaScript(DEVTOOLS_PAGE_STATE));
  } catch (error) {
    return { error: String(error) };
  }
};

/** DevTools「下一个面板」快捷键的修饰键：macOS 是 Cmd+]，其余平台 Ctrl+]。 */
const NEXT_PANEL_MODIFIER = process.platform === 'darwin' ? 'meta' : 'control';

/**
 * 循环切换面板，直到选中的 tab 是 RxDB —— 面板页只有被选中才实例化。
 *
 * @remarks
 * 走 `sendInputEvent` 而不是在 tab 条里合成指针事件，理由见文件头坑 2：RxDB 可能还没登记，
 * 也可能已被折进溢出菜单，两种情况下 DOM 里都找不到它。「下一个面板」遍历的是 `TabbedPane`
 * 的完整 tab 数组而非可见子集，所以折进溢出菜单的 tab 照样能选中（选中后会被挪回可见区）；
 * 循环本身又是轮询，登记晚一点也等得到。
 *
 * `sendInputEvent` 发的是经浏览器进程分发的真实输入事件，与用户按键无法区分；
 * 收敛条件仍是「选中的 tab 标题是 RxDB」，一次都没选中就返回 `selected: null` 让门禁红。
 *
 * @param devTools - DevTools 的 webContents
 * @returns 选中的 tab 标题、按了几次、途经哪些面板
 */
const selectRxdbTab = async devTools => {
  devTools.focus();
  const visited = [];
  // 上限取面板数的两倍有余：跑满即说明转了一整圈也没有 RxDB。
  for (let presses = 0; presses <= 24; presses++) {
    const { tabs } = await readMainTabs(devTools);
    const selected = tabs.find(tab => tab.selected) ?? null;
    if (selected && isRxdbTab(selected))
      return { selected: selected.title, presses, visited, tabIds: tabs.map(tab => tab.id) };
    if (selected) visited.push(selected.title);
    devTools.sendInputEvent({ type: 'keyDown', keyCode: ']', modifiers: [NEXT_PANEL_MODIFIER] });
    devTools.sendInputEvent({ type: 'keyUp', keyCode: ']', modifiers: [NEXT_PANEL_MODIFIER] });
    await sleep(600);
  }
  const { tabs } = await readMainTabs(devTools);
  return { selected: null, presses: 24, visited, tabIds: tabs.map(tab => tab.id) };
};

/**
 * 在扩展页面里建立真实 runtime Port 并向指定 tab 发 INIT。
 *
 * 正向链路的 INIT 由面板自己的 `InspectedPageAccessService` 发出（无 chrome.permissions
 * 的宿主按静态授权判 granted，见该服务 @remarks），探针不代劳。这里只剩负向用例在用：
 * 向**未授权 origin** 的 tab 发起 INIT，触发 background 的真实注入尝试并证其被拒。
 * INIT 之后的四段中继（background → `chrome.scripting` 注入 → bridge PING → 页面
 * HANDSHAKE → 面板协商机 HANDSHAKE_ACK）全部是扩展自身的真实实现。
 */
const relayScript = tabId => `(() => {
  window.__relay = { msgs: [], error: null };
  try {
    const port = chrome.runtime.connect({ name: 'rxdb-devtools-panel' });
    window.__relayPort = port;
    port.onMessage.addListener(message => window.__relay.msgs.push({ type: message && message.type }));
    port.postMessage({ source: '@aiao/rxdb-devtools', direction: 'devtools-to-page', type: 'INIT',
      payload: null, timestamp: Date.now(), sequence: 0, tabId: ${tabId} });
    return 'sent';
  } catch (error) { window.__relay.error = String(error); return String(error); }
})()`;

/** 枚举面板页里实际存在的 `chrome.*` 能力，用于定位 Electron 与 Chrome 的表面差异。 */
const CAPS = `JSON.stringify({
  runtimeConnect: typeof chrome?.runtime?.connect,
  devtools: typeof chrome?.devtools,
  panelsCreate: typeof chrome?.devtools?.panels?.create,
  inspectedWindowEval: typeof chrome?.devtools?.inspectedWindow?.eval,
  inspectedTabId: chrome?.devtools?.inspectedWindow?.tabId ?? null,
  networkOnNavigated: typeof chrome?.devtools?.network?.onNavigated?.addListener,
  permissions: typeof chrome?.permissions,
  permissionsContains: typeof chrome?.permissions?.contains,
  permissionsRequest: typeof chrome?.permissions?.request
})`;

const frameUrls = contents => contents.mainFrame.framesInSubtree.map(frame => frame.url.slice(0, 95));
const findFrame = (contents, needle) => contents.mainFrame.framesInSubtree.find(frame => frame.url.includes(needle));
const readPage = contents => contents.executeJavaScript('JSON.stringify(window.__probe)').then(JSON.parse);
const runningWorkers = ses => Object.values(ses.serviceWorkers.getAllRunning()).map(worker => worker.scriptUrl);

/** 面板连接守卫的 UI 状态：收到 HANDSHAKE 后守卫切到内容区，提示语随之消失。 */
const PANEL_STATE = `(() => {
  const bodyText = document.body.innerText.replace(/\\s+/g, ' ').slice(0, 300);
  return JSON.stringify({ bodyText, connected: !bodyText.includes('Waiting for RxDB connection') });
})()`;

const readPanelState = async frame => {
  try {
    return JSON.parse(await frame.executeJavaScript(PANEL_STATE));
  } catch (error) {
    return { bodyText: '', connected: false, error: String(error) };
  }
};

/** DevTools 前端（含扩展 devtools_page 子帧）的 error / warning：面板缺席时唯一能看到脚本报错的地方。 */
const devToolsConsole = [];

/** 打开 DevTools 并等扩展的 `devtools.html` 真正加载。 */
const openDevTools = async win => {
  const opened = new Promise(resolve => win.webContents.once('devtools-opened', resolve));
  win.webContents.openDevTools({ mode: 'bottom' }); // detach / undocked 下不注册扩展面板
  await opened;
  const devTools = win.webContents.devToolsWebContents;
  devTools.on('console-message', event => {
    if (event.level !== 'error' && event.level !== 'warning') return;
    if (devToolsConsole.length >= 40) return; // 前端自己也会刷噪声，够定位就行
    devToolsConsole.push({ level: event.level, source: event.sourceId, message: String(event.message).slice(0, 200) });
  });
  await waitFor(() => findFrame(devTools, '/devtools.html'), 20000);
  return devTools;
};

/**
 * 选中 RxDB tab 并等真实 `panel.html`（Angular 面板）挂载完成。
 *
 * @remarks
 * 先等登记再按键：`devtools.html` 帧进入帧树 ≠ 它的脚本已经执行完 `panels.create`，
 * 而按键循环只有 ~15 秒，登记稍慢就整轮扑空。等不到不算失败 —— tab 条放不下时尾部 tab 会被
 * 收进下拉菜单、从 DOM 里消失，那种情况只有按键循环能覆盖，所以超时后照常往下走。
 */
const activatePanel = async devTools => {
  const registered = !!(await waitFor(async () => (await readMainTabs(devTools)).tabs.some(isRxdbTab), 20000));
  const selection = await selectRxdbTab(devTools);
  const frame = await waitFor(() => findFrame(devTools, '/panel.html'), 30000);
  // 面板是 Angular 应用，帧出现 ≠ bootstrap 完成；给它一段固定时间跑起来。
  if (frame) await sleep(2500);
  return { registered, selection, frame: findFrame(devTools, '/panel.html') };
};

/**
 * 等 inspected page 完成一次真实往返，并读取页面与面板两侧的证据。
 *
 * 不再代发 INIT：面板在无 chrome.permissions 的宿主上按静态授权激活并真实 INIT
 * （见 `InspectedPageAccessService` @remarks），整条链路 —— INIT → 注入 → PING →
 * HANDSHAKE → 面板协商机 ACK —— 全部走生产代码。页面在私有端口上收到
 * `HANDSHAKE_ACK` 是往返完成的判据；面板侧的 HANDSHAKE 收据由连接守卫 UI
 * 离开「Waiting for RxDB connection」传递性证明 —— 协商机只在暂存了 legacy
 * HANDSHAKE 之后才发 ACK。
 *
 * 每次都从 `devTools` 重新解析 panel 帧：`WebFrameMain` 句柄会随导航失效，
 * 缓存住的话执行脚本时会抛 "Render frame was disposed"。
 */
const driveRoundTrip = async (devTools, pageContents) => {
  await waitFor(async () => (await readPage(pageContents)).seen.includes('port:HANDSHAKE_ACK'), 20000);
  const after = findFrame(devTools, '/panel.html');
  return {
    page: await readPage(pageContents),
    panel: after ? await readPanelState(after) : { bodyText: '', connected: false, error: 'panel 帧已消失' }
  };
};

app.whenReady().then(async () => {
  try {
    const authorizedPort = await authorized.listen('127.0.0.1');
    const foreignPort = await foreign.listen('localhost');
    const origin = `http://127.0.0.1:${authorizedPort}`;
    const foreignOrigin = `http://localhost:${foreignPort}`;

    record('versions', true, {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    });

    // ---------- 可容忍差异：只改构建产物的临时副本 ----------
    const stage = mkdtempSync(join(tmpdir(), 'us904-ext-'));
    cpSync(EXTENSION_DIST, stage, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(stage, 'manifest.json'), 'utf8'));
    const builtManifestBefore = {
      permissions: manifest.permissions,
      optional_host_permissions: manifest.optional_host_permissions,
      host_permissions: manifest.host_permissions ?? null
    };
    delete manifest.optional_host_permissions;
    manifest.host_permissions = [AUTHORIZED_PATTERN];
    writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));
    record('AC3.variance', true, {
      builtManifestBefore,
      fixtureManifestAfter: { permissions: manifest.permissions, host_permissions: manifest.host_permissions },
      authorizedOrigin: origin,
      foreignOrigin,
      note: '只改临时目录副本；生产 manifest.config.ts 与 dist/manifest.json 未改动'
    });

    const ses = session.defaultSession;
    const swLog = [];
    ses.serviceWorkers.on('console-message', (_event, details) => swLog.push(details.message));

    // ---------- AC#1：加载扩展 + MV3 service worker 启动 ----------
    let extension;
    try {
      // 用 session.extensions 而不是已废弃的 session.loadExtension —— 后者在 43 会打印弃用警告。
      extension = await ses.extensions.loadExtension(stage);
    } catch (error) {
      record('AC1', false, { error: String(error), stage });
      finish(1);
      return;
    }
    await waitFor(() => runningWorkers(ses).length > 0, 15000);
    const workers = Object.values(ses.serviceWorkers.getAllRunning());
    record('AC1', workers.length > 0, {
      extension: { id: extension.id, name: extension.name, manifestVersion: extension.manifest.manifest_version },
      serviceWorkers: workers.map(worker => ({ scriptUrl: worker.scriptUrl, scope: worker.scope }))
    });

    const win = new BrowserWindow({ width: 1500, height: 950, show: true });
    await win.loadURL(`${origin}/`);
    const foreignWin = new BrowserWindow({ width: 600, height: 400, show: false });
    await foreignWin.loadURL(`${foreignOrigin}/`);

    let devTools = await openDevTools(win);
    const extFrame = findFrame(devTools, '/devtools.html');
    if (!extFrame) {
      record('AC2', false, { reason: 'devtools_page 未加载', frames: frameUrls(devTools) });
      finish(1);
      return;
    }

    // ---------- AC#2：真实面板宿主 + 真实往返 ----------
    // 两个时刻都拍一次 tab 条：RxDB 可能还没登记，也可能已被折进溢出下拉、暂时不在 DOM 里，
    // 两种情况「before」里都没有它，选中后才回到可见区。判定用「选中的 tab 是不是 RxDB」，
    // 不用「tab 条里有没有 RxDB」—— 后者量的是窗口宽度与登记时机，不是被测能力。
    const tabsBeforeActivation = (await readMainTabs(devTools)).tabs.map(tab => tab.title);
    const activation = await activatePanel(devTools);
    const tabList = await readMainTabs(devTools);
    const rxdbTabSelected = !!activation.selection.selected;
    // 面板缺席时才有价值，但只能在这里采（后面 DevTools 会被关掉重开）：
    // 分开「扩展页没跑起来」与「跑起来了但 panels.create 没生效」两种成因。
    const devtoolsPageState = await readDevtoolsPage(findFrame(devTools, '/devtools.html'));

    // 关键发现：Electron 43 没有 chrome.permissions 命名空间。
    const panelCapabilities = activation.frame ? JSON.parse(await activation.frame.executeJavaScript(CAPS)) : null;
    const panelBodyText =
      activation.frame ?
        await activation.frame.executeJavaScript('document.body.innerText.replace(/\\s+/g," ").slice(0,200)')
      : null;
    const panelSelfActivated = (await readPage(win.webContents)).seen.length > 0;
    record('finding.chromePermissionsMissing', true, {
      panelCapabilities,
      panelSelfActivated,
      panelBodyText,
      consequence:
        'InspectedPageAccessService 在无 chrome.permissions 的宿主上按静态 host permission 判 granted 并真实 INIT（US-904 variance 的生产处理）；面板完成真实握手，不停在「DevTools 未连接」'
    });

    const first = activation.frame ? await driveRoundTrip(devTools, win.webContents) : null;
    const roundTrip =
      !!first &&
      first.page.seen.includes('PING') &&
      first.page.seen.includes('HANDSHAKE') &&
      first.page.seen.includes('port:HANDSHAKE_ACK') &&
      !!first.panel.connected;
    record('AC2', rxdbTabSelected && !!activation.frame && roundTrip, {
      devtoolsMode: 'bottom',
      tabs: tabList.tabs.map(tab => tab.title),
      tabIds: tabList.tabs.map(tab => tab.id),
      tabsBeforeActivation,
      rxdbTabSelected,
      panelRegisteredBeforeSelection: activation.registered,
      tabSelection: activation.selection,
      panelHtmlFrameLoaded: !!activation.frame,
      devtoolsPageState,
      devToolsConsole: [...devToolsConsole], // 拍快照：findings 到 finish() 才序列化，直接放引用会把后续步骤的日志也算进来
      framesInDevTools: frameUrls(devTools),
      initSentFrom: 'panel.html 的 PortService（无 chrome.permissions 时按静态授权激活）',
      panelUi: first?.panel ?? null,
      inspectedPage: first?.page ?? null,
      roundTripCompleted: roundTrip
    });

    // ---------- AC#3：注入只落在已授权 origin ----------
    record('AC3.injectAuthorized', roundTrip, {
      driver: '面板 PortService 的真实 INIT（静态授权 variance）→ background 的 chrome.scripting 真实注入',
      page: first?.page ?? null
    });

    await extFrame.executeJavaScript(relayScript(foreignWin.webContents.id));
    await sleep(4000); // 证否只能靠等：给注入足够时间发生，然后断言它没发生
    const foreignPage = await readPage(foreignWin.webContents);
    record('AC3.injectForeignOriginRejected', foreignPage.seen.length === 0 && foreignPage.ports === 0, {
      foreignOrigin,
      foreignTabId: foreignWin.webContents.id,
      page: foreignPage
    });

    // ---------- AC#4a：刷新 inspected page ----------
    await win.webContents.reload();
    await sleep(2000);
    const immediatelyAfterReload = await readPage(win.webContents);
    const afterReInit = (await driveRoundTrip(devTools, win.webContents))?.page ?? null;
    // 「旧连接不残留」由新通道的成立传递性证明：刷新时 content script 与旧页面一起销毁，
    // 旧 bridge 实例持有的旧私有端口无处可去；ACK 与面板命令只能落在刷新后新建的端口上，
    // 收到它们即说明 bridge 采纳的是新握手通道，旧连接已出局。快照 `immediatelyAfterReload`
    // 只作早期状态参考，不参与判据 —— 生产链路恢复多快取决于注入时序，不构成证据。
    const recovered =
      !!afterReInit?.seen.includes('port:HANDSHAKE_ACK') && !!afterReInit.seen.includes('port:GET_BRANCHES');
    record('AC4a.reloadInspectedPage', recovered, {
      immediatelyAfterReload,
      afterReInit,
      note: '刷新后页面计数归零（旧 connector 与私有 port 随页面释放）；面板随导航重新激活、真实 INIT，新握手走新私有端口完成往返，面板命令随之到达'
    });

    // ---------- AC#4b：关闭 DevTools 再开 ----------
    win.webContents.closeDevTools();
    await sleep(2500);
    const afterClose = {
      devToolsOpened: win.webContents.isDevToolsOpened(),
      contents: webContents.getAllWebContents().map(contents => ({ id: contents.id, type: contents.getType() })),
      serviceWorkers: runningWorkers(ses)
    };
    await win.webContents.reload(); // 清空页面计数，确保观察到的是重开后的新往返
    await sleep(1500);
    devTools = await openDevTools(win);
    const reopened = await activatePanel(devTools);
    const second = reopened.frame ? await driveRoundTrip(devTools, win.webContents) : null;
    record(
      'AC4b.devtoolsCloseReopen',
      !!second?.page.seen.includes('port:HANDSHAKE_ACK') && !!second?.panel.connected,
      {
        afterClose,
        panelUi: second?.panel ?? null,
        pageAfterReopen: second?.page ?? null,
        note: '重开后的新 panel 完成整条往返；ACK 经页面新建的私有端口到达，旧连接无处顶替'
      }
    );

    // ---------- AC#4c：销毁窗口 + service worker 空闲自停 ----------
    foreignWin.destroy();
    win.destroy();
    await sleep(2000);
    const serviceWorkersRightAfterDestroy = runningWorkers(ses);
    // MV3 service worker 空闲约 30 秒自停；轮询到停为止，别把上限当成实际耗时。
    await waitFor(() => runningWorkers(ses).length === 0, 60000, 2000);
    record('AC4c.teardown', webContents.getAllWebContents().length === 0, {
      remainingContents: webContents
        .getAllWebContents()
        .map(contents => ({ id: contents.id, type: contents.getType() })),
      serviceWorkersRightAfterDestroy,
      serviceWorkersAfterIdle: runningWorkers(ses),
      swLog
    });

    finish(0);
  } catch (error) {
    record('fatal', false, { error: String(error), stack: error?.stack });
    finish(1);
  }
});
