import { app, BrowserWindow, ipcMain, net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEMO_RUN_CHANNEL, parseDemoRequest, type DemoResult } from './ipc-contract';
import {
  APP_ENTRY_URL,
  APP_SCHEME,
  isAllowedNavigation,
  resolveAppAssetPath,
  resolveDevServerPort
} from './main.utils';

let win: BrowserWindow | null = null;
const args = process.argv.slice(1);
const serve = args.some(val => val === '--serve');

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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
    // handler 必须先于 loadURL 注册，否则入口文档本身就 404
    if (!serve) serveRendererOverAppScheme();
    createWindow();
  })
  .catch(reportLoadFailure);

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
