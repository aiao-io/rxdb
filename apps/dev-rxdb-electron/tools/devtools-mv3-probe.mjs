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
 * ## 四个踩过的坑（改动前先读）
 *
 * 1. **DevTools 必须 dock**：`mode: 'detach'` / `'undocked'` 的 DevTools 窗口不注册任何扩展
 *    面板（Lighthouse、Recorder 也一并消失），等多久都不出现。只有 `mode: 'bottom'` 会注册。
 * 2. **不能靠在 tab 条里找 RxDB**：tab 条放不下时，DevTools 会把尾部的 tab 折进「更多标签页」
 *    溢出菜单，而扩展面板永远排在最后 —— 于是 `.tabbed-pane-header-tab` 里根本没有 RxDB。
 *    这不是假设：CI（Xvfb 1280 宽 + 英文标签，标签比中文宽）就是这样红的，`tabs` 停在
 *    `Recorder`，`Elements` 侧边栏的最后一个 `Event Listeners` 也一并消失 —— 两条互不相干的
 *    tab 条同时丢掉尾项，正是溢出折叠的签名。而那个溢出菜单在 Electron 下是**原生菜单**
 *    （DevTools 的 ContextMenu 走 `showContextMenuAtPoint`），DOM 里查不到、脚本点不到。
 *    所以选中面板改用 DevTools 自己的「下一个面板」快捷键循环，见 `selectRxdbTab()`。
 * 3. **面板页惰性实例化**：`chrome.devtools.panels.create` 只登记 tab，`panel.html` 要等 tab
 *    被选中才加载 —— 所以「注册成功」和「面板真的跑起来」是两件事，本探针两件都验。
 * 4. **`window-all-closed` 默认退出应用**：AC#4c 销毁窗口后主进程会先于记录结果退出，
 *    必须注册空 listener 顶住。
 *
 * ## 唯一的可容忍差异
 *
 * Electron 43 **没有 `chrome.permissions` 命名空间**（见 `finding.chromePermissionsMissing`）。
 * 按故事「关键项与可容忍差异」，fixture 改用静态窄 host permission（只覆盖自身 origin），
 * 并且只改临时目录里的构建产物副本 —— 生产 `manifest.config.ts` 与 `dist/manifest.json`
 * 一个字节都不动。注入本身仍由 background 的真实 `chrome.scripting` 执行，未授权 origin
 * 的负向用例同样真实跑一遍。
 */

import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { app, BrowserWindow, session, webContents } = createRequire(import.meta.url)('electron');

// 按位置取参数会被 Chromium 开关打乱：spec 侧在 Linux 上要在脚本路径**之前**插
// `--no-sandbox`（原因见那一侧的注释），于是 `process.argv[2]` 从「扩展 dist」变成脚本自身。
// 剥掉所有 `--` 开头的项后，argv[1] 恒为本脚本路径，其后才是两个真正的位置参数。
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

/** 深挖 shadow DOM 收集 DevTools 的 tab 条。扩展面板藏在多层 shadow root 里。 */
const TABS = `(() => {
  const tabs = []; const hits = []; const seen = new Set();
  const walk = root => {
    if (seen.has(root)) return; seen.add(root);
    for (const el of root.querySelectorAll('*')) {
      if (el.classList && el.classList.contains('tabbed-pane-header-tab')) tabs.push((el.textContent || '').trim());
      const text = (el.textContent || '').trim();
      if (/rxdb/i.test(text) && text.length < 60) hits.push(text);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return JSON.stringify({ tabs, hits });
})()`;

/** 读当前选中的面板 tab 标题。DOM 序里主 tab 条先于 Elements 侧边栏，所以取第一个即可。 */
const SELECTED_TAB = `(() => {
  const seen = new Set();
  let selected = null;
  const walk = root => {
    if (seen.has(root) || selected) return; seen.add(root);
    for (const el of root.querySelectorAll('*')) {
      if (el.classList && el.classList.contains('tabbed-pane-header-tab') && el.classList.contains('selected')) {
        selected = (el.textContent || '').trim();
        return;
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return JSON.stringify({ selected });
})()`;

/** DevTools「下一个面板」快捷键的修饰键：macOS 是 Cmd+]，其余平台 Ctrl+]。 */
const NEXT_PANEL_MODIFIER = process.platform === 'darwin' ? 'meta' : 'control';

/**
 * 循环切换面板，直到选中的 tab 是 RxDB —— 面板页只有被选中才实例化。
 *
 * @remarks
 * 走 `sendInputEvent` 而不是在 tab 条里合成指针事件，理由见文件头坑 2：tab 条溢出时
 * RxDB 压根不在 DOM 里。「下一个面板」遍历的是 `TabbedPane` 的完整 tab 数组而非可见子集，
 * 所以被折进溢出菜单的 tab 照样能选中（选中后它会被挪回可见区）。
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
    const { selected } = JSON.parse(await devTools.executeJavaScript(SELECTED_TAB));
    if (selected && /rxdb/i.test(selected)) return { selected, presses, visited };
    if (selected) visited.push(selected);
    devTools.sendInputEvent({ type: 'keyDown', keyCode: ']', modifiers: [NEXT_PANEL_MODIFIER] });
    devTools.sendInputEvent({ type: 'keyUp', keyCode: ']', modifiers: [NEXT_PANEL_MODIFIER] });
    await sleep(600);
  }
  return { selected: null, presses: 24, visited };
};

/**
 * 在给定的扩展页面里建立真实 runtime Port 并发 INIT。
 *
 * 这是探针唯一"代劳"的一步，替的是**面板的授权 UI**，不是任何被测能力：
 * `InspectedPageAccessService` 依赖 `chrome.permissions`，在 Electron 43 里直接抛 TypeError，
 * `activateTab()` 永不触发。INIT 之后的四段中继（background → `chrome.scripting` 注入 →
 * bridge PING → 页面 HANDSHAKE → HANDSHAKE_ACK）全部是扩展自身的真实实现。
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
const readRelay = frame => frame.executeJavaScript('JSON.stringify(window.__relay)').then(JSON.parse);
const runningWorkers = ses => Object.values(ses.serviceWorkers.getAllRunning()).map(worker => worker.scriptUrl);

/** 打开 DevTools 并等扩展的 `devtools.html` 真正加载。 */
const openDevTools = async win => {
  const opened = new Promise(resolve => win.webContents.once('devtools-opened', resolve));
  win.webContents.openDevTools({ mode: 'bottom' }); // detach / undocked 下不注册扩展面板
  await opened;
  const devTools = win.webContents.devToolsWebContents;
  await waitFor(() => findFrame(devTools, '/devtools.html'), 20000);
  return devTools;
};

/** 选中 RxDB tab 并等真实 `panel.html`（Angular 面板）挂载完成。 */
const activatePanel = async devTools => {
  const selection = await selectRxdbTab(devTools);
  const frame = await waitFor(() => findFrame(devTools, '/panel.html'), 30000);
  // 面板是 Angular 应用，帧出现 ≠ bootstrap 完成；给它一段固定时间跑起来。
  if (frame) await sleep(2500);
  return { selection, frame: findFrame(devTools, '/panel.html') };
};

/**
 * 从面板页发 INIT，并等 inspected page 完成整条往返。
 *
 * 每次都从 `devTools` 重新解析 panel 帧：`WebFrameMain` 句柄会随导航失效，
 * 缓存住的话读 `__relay` 时会抛 "Render frame was disposed"。
 */
const driveRoundTrip = async (devTools, pageContents) => {
  const before = findFrame(devTools, '/panel.html');
  if (!before) return null;
  await before.executeJavaScript(relayScript(1));
  await waitFor(async () => (await readPage(pageContents)).seen.includes('port:HANDSHAKE_ACK'), 20000);
  const after = findFrame(devTools, '/panel.html');
  return {
    page: await readPage(pageContents),
    relay: after ? await readRelay(after) : { msgs: [], error: 'panel 帧已消失' }
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
    // 两个时刻都拍一次 tab 条：溢出时 RxDB 不在「before」里（CI 的常态），选中后才被挪回可见区。
    // 判定用「选中的 tab 是不是 RxDB」，不用「tab 条里有没有 RxDB」—— 后者量的是窗口宽度，不是能力。
    const tabsBeforeActivation = JSON.parse(await devTools.executeJavaScript(TABS)).tabs;
    const activation = await activatePanel(devTools);
    const tabList = JSON.parse(await devTools.executeJavaScript(TABS));
    const rxdbTabSelected = !!activation.selection.selected && /rxdb/i.test(activation.selection.selected);

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
        'InspectedPageAccessService.refresh() 抛 TypeError（未捕获 promise 拒绝），activateTab() 不执行，面板停在「DevTools 未连接」'
    });

    const first = activation.frame ? await driveRoundTrip(devTools, win.webContents) : null;
    const roundTrip =
      !!first &&
      first.page.seen.includes('PING') &&
      first.page.seen.includes('HANDSHAKE') &&
      first.page.seen.includes('port:HANDSHAKE_ACK') &&
      first.relay.msgs.some(message => message.type === 'HANDSHAKE');
    record('AC2', rxdbTabSelected && !!activation.frame && roundTrip, {
      devtoolsMode: 'bottom',
      tabs: tabList.tabs,
      tabsBeforeActivation,
      rxdbTabSelected,
      tabSelection: activation.selection,
      panelHtmlFrameLoaded: !!activation.frame,
      framesInDevTools: frameUrls(devTools),
      initSentFrom: 'panel.html（真实面板文档）',
      panelPortReceived: first?.relay.msgs ?? null,
      inspectedPage: first?.page ?? null,
      roundTripCompleted: roundTrip
    });

    // ---------- AC#3：注入只落在已授权 origin ----------
    record('AC3.injectAuthorized', roundTrip, {
      driver: '真实 panel.html 页内的 chrome.runtime.connect + INIT；注入由 background 的 chrome.scripting 真实执行',
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
    record(
      'AC4a.reloadInspectedPage',
      immediatelyAfterReload.seen.length === 0 && !!afterReInit?.seen.includes('port:HANDSHAKE_ACK'),
      {
        immediatelyAfterReload,
        afterReInit,
        note: '刷新后页面计数归零（旧 connector 与私有 port 随页面释放）；重新 INIT 后完整往返恢复'
      }
    );

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
      !!second?.page.seen.includes('port:HANDSHAKE_ACK') && !!second?.relay.msgs.length,
      {
        afterClose,
        freshPanelPortReceived: second?.relay.msgs ?? null,
        pageAfterReopen: second?.page ?? null,
        note: '重开后的新 panel port 拿到完整往返，说明没有残留旧连接顶替'
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
