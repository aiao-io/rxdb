import { app, BrowserWindow, ipcMain, net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// ELEC-23：加载 esbuild 打出来的那份，不是 tsc 的逐文件产物 —— 后者留着一句
// `require("@aiao/rxdb-adapter-electron/host")`，而打包后的应用里没有 node_modules。
// 完整缘由与门禁见 desktop-sqlite-bridge.spec.ts。
import {
  createDatabasePathResolver,
  createDesktopHostBridge,
  createStorageRootResolver,
  resolvePgliteDataRoot,
  type DesktopHostBridge
} from './desktop-host-bridge.bundle.js';
import { DEMO_RUN_CHANNEL, DESKTOP_HOST_REQUEST_CHANNEL, parseDemoRequest, type DemoResult } from './ipc-contract';
import {
  APP_ENTRY_URL,
  APP_SCHEME,
  createWillQuitHandler,
  isAllowedNavigation,
  resolveAppAssetPath,
  resolveDevServerPort,
  shouldHideWindow
} from './main.utils';

let win: BrowserWindow | null = null;
const args = process.argv.slice(1);
const serve = args.some(val => val === '--serve');
/** e2e 专用：窗口照常创建与加载，只是不显示。见 {@link shouldHideWindow}。 */
const hideWindow = shouldHideWindow(process.env);

/**
 * 桌面 host（SQLite + 文件 + PGlite 三族），首次被 renderer 请求时才建。
 *
 * 惰性是有意的：`setupIPC()` 在 app ready 之前就跑，而库目录、文件根与 PGlite 数据根
 * 都挂在 `app.getPath('userData')` 下 —— 等到真有请求进来时，ready 早已完成。
 */
let desktopHost: DesktopHostBridge | null = null;

const requireDesktopHost = (): DesktopHostBridge =>
  (desktopHost ??= createDesktopHostBridge({
    resolveDatabasePath: createDatabasePathResolver(app.getPath('userData')),
    // US-504：文件内容与库文件同域，于是「拷一个 userData 目录」= 完整带走应用数据。
    resolveStorageRoot: createStorageRootResolver(app.getPath('userData')),
    // US-208：PGlite 的 WASM 在调用线程上同步跑完整条查询，放主进程里会把窗口一起堵住，
    // 因此单实例活在一条自己的 worker 线程上。入口同样是 esbuild 产物（ELEC-23）。
    pgliteDataRoot: resolvePgliteDataRoot(app.getPath('userData')),
    pgliteWorkerPath: path.join(__dirname, 'desktop-pglite-worker.bundle.js'),
    onDeliveryError: error => console.error('[dev-rxdb-electron] 数据库变更事件送达失败：', error)
  }));

/** 生产产物根目录：electron-builder 把 `browser/` 放进 Resources。 */
const rendererRoot = (): string => path.join(process.resourcesPath, 'browser');

// ELEC-22：必须在 app ready **之前**声明，且只能声明一次 —— 这是 Electron 对
// registerSchemesAsPrivileged 的硬性要求，放进 whenReady 里不生效。
// 三个权限缺一不可：
//   standard        —— 让 Chromium 按标准 URL 解析，才有真 origin，相对路径与 CSP 的 'self' 才成立；
//   secure          —— 归入 secure context，OPFS / crypto.subtle / Worker 才可用；
//   supportFetchAPI —— 放开 fetch()，emscripten 取 .wasm 走的就是它（file: 下正是这里失败的）。
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
]);

function setupIPC(): void {
  // ELEC-08：校验发起方。当前 handler 无副作用，但 `handle` 会响应**任何**渲染进程 frame
  // （含被 iframe 嵌入的第三方内容）——一旦将来加入有副作用的操作，缺这道校验就是提权入口。
  ipcMain.handle(DEMO_RUN_CHANNEL, (event, value: unknown): DemoResult => {
    if (event.senderFrame !== win?.webContents.mainFrame) {
      throw new Error(`[${DEMO_RUN_CHANNEL}] 拒绝来自非主 frame 的调用`);
    }
    const request = parseDemoRequest(value);
    return {
      timestamp: Date.now(),
      message: `Hello from main process! Received: ${request.data}`
    };
  });

  // US-207 / US-504：桌面 host。ELEC-08 那句「将来加入有副作用的操作」在这里兑现了 ——
  // 这条通道能读写真实库文件与用户文件，少了发起方校验就等于把它们开放给任意被嵌入的 frame。
  // 入参本身不在这里验：协议校验、SQL 与绑定值、文件路径的边界全在 host 内部完成。
  ipcMain.handle(DESKTOP_HOST_REQUEST_CHANNEL, (event, payload: unknown) => {
    if (event.senderFrame !== win?.webContents.mainFrame) {
      throw new Error(`[${DESKTOP_HOST_REQUEST_CHANNEL}] 拒绝来自非主 frame 的调用`);
    }
    return requireDesktopHost().handle(event.sender, payload);
  });
}

function reportLoadFailure(cause: unknown): void {
  console.error('[dev-rxdb-electron] 窗口加载失败：', cause);
}

/**
 * 注册 {@link APP_SCHEME} 的静态文件 handler。
 *
 * 越界判定全部在 {@link resolveAppAssetPath}（已被单测覆盖）；这里只负责读盘与错误码。
 */
function serveRendererOverAppScheme(): void {
  protocol.handle(APP_SCHEME, request => {
    const file = resolveAppAssetPath(request.url, rendererRoot());
    if (file === null) return new Response('Not Found', { status: 404 });
    // 交给 net.fetch 而不是自己 readFile：它会带上 Content-Type 推断与流式读取，
    // 大文件（wa-sqlite.wasm 约 600 KB）不必整份进内存。
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: 900,
    height: 670,
    // 隐藏模式下窗口从不 show()：渲染进程照常加载、照常跑，Playwright 走 CDP 也照常操作。
    show: !hideWindow,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 关掉后台节流是隐藏窗口的**必要条件**，不是顺手加的优化：
      // Chromium 把不可见的页面当后台页 —— rAF 完全停摆、定时器降到约 1s 一次。
      // Playwright 的可操作性检查（元素稳定性）就是靠 rAF 轮询的，停摆后
      // 每一次 click() 都只会等到超时，报出来的样子却像是应用挂了。
      // 置 false 后 Electron 让该窗口始终按「可见」对待，帧照常绘制与交换。
      backgroundThrottling: !hideWindow,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // ELEC-01：`file:` URL 的 origin 恒为 "null"，原来的 origin 比较在生产模式下形同虚设，
  // 判定逻辑连同其边界用例已抽到 main.utils.ts
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, win?.webContents.getURL())) event.preventDefault();
  });

  if (serve) {
    import('electron-debug').then(debug => {
      debug.default({ isEnabled: true, showDevTools: true });
    });

    import('electron-reloader').then(reloader => {
      if ('default' in reloader) {
        reloader.default(module);
      }
    });

    const port = resolveDevServerPort(args, process.env);
    // ELEC-04：加载 Promise 必须被消费。裸调用时，dev server 未起或路径错误只会变成
    // 一个无人处理的 rejection，窗口停在空白页而终端什么都不打印。
    void win.loadURL(`http://localhost:${port}`).catch(reportLoadFailure);
  } else {
    // ELEC-22：生产模式走自定义协议而不是 loadFile。`file:` 下 Angular 的
    // ESM 入口会被当跨域拒绝、fetch 不可用、origin 不透明 —— 详见 main.utils.ts 里
    // APP_SCHEME 的注释，那里记着三条实测。
    void win.loadURL(APP_ENTRY_URL).catch(reportLoadFailure);
  }

  // AC#7：窗口没了，它开的库句柄必须跟着放。留着的话文件一直被占，
  // 用户重开窗口会撞上另一份连接的 WAL 锁，症状看着却像「数据库坏了」。
  // US-504 起同一步还要回收文件会话：未提交的写入要连临时文件一起中止，
  // 它持有的路径锁要放掉，否则下一个窗口会永远等在一把没人放的锁上。
  // US-208 起还要回收 PGlite 的挂起事务：它独占那个唯一实例的连接，收不回来的表征是
  // 「重开窗口后整个应用不响应」，而不是某次报错。
  // 这里捕获 webContents 而不是读 `win`：'destroyed' 触发时 `win` 已被下面的 'closed' 置空。
  const contents = win.webContents;
  const releaseContents = (): void => {
    // void：两个事件源都不接受异步收尾，而回收失败只可能是 host 已经没了 ——
    // 那它名下的一切本来就随之消失了，没有可补救的动作。
    void desktopHost?.releaseTarget(contents);
  };
  contents.on('destroyed', releaseContents);
  // 'destroyed' 只在**正常**销毁时触发。渲染进程崩溃 / 被 OOM killer 干掉时它不来，
  // 于是那个窗口名下的会话与挂起事务永远留在 host 里 —— 而崩溃恰恰是最可能
  // 停在事务中间的一种死法（AC#3）。两个事件都挂上，回收本身按 sessionId 幂等。
  contents.on('render-process-gone', releaseContents);

  win.on('closed', () => {
    win = null;
  });

  return win;
}

setupIPC();

// ELEC-04：用 `whenReady()` 而不是 `ready` + 固定 400ms 延时 ——
// 魔法延时既可能过早（慢机器上 Electron 尚未就绪）也总是白等（快机器上多等 400ms），
// 且没有任何注释说明这 400 是怎么来的。
void app
  .whenReady()
  .then(() => {
    // 隐藏模式下连 Dock 图标一起收掉：macOS 上应用一启动就会切走焦点与菜单栏，
    // 哪怕窗口不可见 —— 对着 e2e 跑一整轮的人来说，这和弹窗一样打断输入。
    // 非 macOS 上 `app.dock` 是 undefined，可选链把它变成空操作。
    if (hideWindow) app.dock?.hide();
    // handler 必须先于 loadURL 注册，否则入口文档本身就 404
    if (!serve) serveRendererOverAppScheme();
    createWindow();
  })
  .catch(reportLoadFailure);

// 退出前把还开着的连接收干净：SQLite 的 WAL 需要一次 checkpoint 才算落定，
// 进程被直接杀掉会留下 -wal / -shm，下次启动多一轮恢复；
// 文件族则要把未提交写入的临时文件删掉，否则每次退出都在磁盘上留一份垃圾。
//
// 「按住退出 → 收尾 → 再退一次」的时序全在 createWillQuitHandler 里，连同那条
// 唯一致命的约束：重新 quit() 必须跨出当前微任务检查点，否则被 Electron 静默吞掉、
// 进程永远不退。缘由与实测症状见该函数的注释，回归用例在 main.utils.spec.ts。
const handleWillQuit = createWillQuitHandler({
  cleanup: async () => {
    await desktopHost?.closeAll();
  },
  quit: () => {
    app.quit();
  },
  onError: error => console.error('[dev-rxdb-electron] 退出前的清理失败：', error)
});

app.on('will-quit', event => {
  // host 从未被创建（renderer 一条请求都没发过）时无事可收，直接放行 ——
  // 没必要为一个空集合多绕一轮「按住再退」。
  if (!desktopHost) return;
  handleWillQuit(event);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});
