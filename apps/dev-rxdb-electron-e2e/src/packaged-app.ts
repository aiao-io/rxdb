import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `electron-builder --dir` 的产物根目录。
 *
 * 与 `apps/dev-rxdb-electron/electron-builder.json` 的 `directories.output` 一致。
 */
export const RELEASE_DIR = join(__dirname, '../../../dist/apps/dev-rxdb-electron/release');

/** `productName`，与 electron-builder.json / package.json 一致。 */
const PRODUCT_NAME = 'DevRxDBElectron';

/** 发布形态的扩展构建产物，与 `apps/rxdb-devtools-extension/vite.config.ts` 的默认 `outDir` 一致。 */
export const EXTENSION_DIST = join(__dirname, '../../rxdb-devtools-extension/dist');

/**
 * 桌面端调试专用的扩展构建产物（US-906 AC#1），与 vite.config 的 `DESKTOP_DEV_OUT_DIR` 一致。
 *
 * @remarks
 * 与发布产物**只差一条静态 `host_permissions: ['http://localhost/*']`**。桌面端非它不可：
 * Electron 没有 `chrome.permissions` 命名空间，`optional_host_permissions` 的授权集恒为空，
 * 运行时请求那条路根本不存在（US-904 阶段 D 实测）。
 *
 * 本套件曾在测试内 `cpSync` 一份 dist 副本再改写 manifest；US-906 AC#3 把那条路收敛掉了——
 * 开发者手上要有和 e2e **同一份**产物，否则「e2e 跑得通、我跑不通」永远解释不清。
 */
export const DESKTOP_DEV_EXTENSION_DIST = join(__dirname, '../../rxdb-devtools-extension/dist-desktop-dev');

/**
 * 解析桌面端调试用的扩展产物目录。
 *
 * @returns 该目录的绝对路径
 * @throws 产物不存在时抛出，并带上构建命令 —— 缺它的表征是面板恒停在「不支持扩展注入」，
 *   那句提示指向协议，跟「忘了构建」毫无关系，不点名就会往错误的方向排查。
 */
export function resolveDesktopDevExtension(): string {
  if (existsSync(DESKTOP_DEV_EXTENSION_DIST)) return DESKTOP_DEV_EXTENSION_DIST;
  throw new Error(
    [
      `找不到桌面端调试用的扩展产物：${DESKTOP_DEV_EXTENSION_DIST}`,
      '请先执行：pnpm nx run rxdb-devtools-extension:build-desktop-dev'
    ].join('\n')
  );
}

/**
 * 按平台列出可执行文件的候选路径。
 *
 * electron-builder 的目录名依 `--dir` 的目标平台与架构而变
 * （`mac-arm64` / `mac` / `linux-unpacked` / `win-unpacked`），
 * 且 linux 的可执行名取自 `package.json` 的 `name` 而非 `productName`，
 * 所以这里穷举而不是猜一个。
 */
function candidates(): string[] {
  switch (process.platform) {
    case 'darwin':
      return ['mac-arm64', 'mac', 'mac-universal'].map(dir =>
        join(RELEASE_DIR, dir, `${PRODUCT_NAME}.app`, 'Contents', 'MacOS', PRODUCT_NAME)
      );
    case 'win32':
      return [join(RELEASE_DIR, 'win-unpacked', `${PRODUCT_NAME}.exe`)];
    default:
      return [
        join(RELEASE_DIR, 'linux-unpacked', 'dev-rxdb-electron'),
        join(RELEASE_DIR, 'linux-unpacked', PRODUCT_NAME.toLowerCase()),
        join(RELEASE_DIR, 'linux-unpacked', PRODUCT_NAME)
      ];
  }
}

/**
 * 解析已打包应用的可执行文件路径。
 *
 * @returns 存在的可执行文件绝对路径
 * @throws 当产物不存在时抛出，并把找过的候选路径与补救命令一并列出 ——
 *   这是本套件最常见的失败原因（忘了先跑打包，或打包因网络失败）。
 */
export function resolveExecutable(): string {
  const tried = candidates();
  const found = tried.find(path => existsSync(path));
  if (found) return found;

  const listing = existsSync(RELEASE_DIR) ? readdirSync(RELEASE_DIR).join(', ') || '(空)' : '(目录不存在)';
  throw new Error(
    [
      '找不到已打包的 Electron 产物。',
      `release/ 实际内容：${listing}`,
      '找过的候选路径：',
      ...tried.map(path => `  - ${path}`),
      '',
      '请先执行：pnpm nx run dev-rxdb-electron:electron-package-dir',
      '（该命令需要下载 Electron 发行包；离线或网络受限时会以 ETIMEDOUT 失败。）'
    ].join('\n')
  );
}

/** renderer 构建产物目录，与 `apps/dev-rxdb-electron` 的 build outputPath 一致。 */
export const RENDERER_DIST = join(__dirname, '../../../dist/apps/dev-rxdb-electron/browser');

/** 静态服务的 MIME 表；`.wasm` 少一条就会让 SQLite 侧的实例化失败在一句无关的报错上。 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm'
};

/**
 * 把 renderer 构建产物用真实 http 服务出去。
 *
 * @param createServer - `node:http` 的 `createServer`，由调用方注入以免本模块把 http 拖进
 *   每一个 import 它的 spec。
 * @returns 端口与关闭函数
 * @throws 缺 renderer 产物时抛出
 *
 * @remarks
 * 存在的唯一理由是把 inspected page 的 scheme 从 `app:` 换成 `http:`：自定义 scheme 拿不到
 * 扩展 host permission（US-904 阶段 D 实测），桌面端要跑通四段 relay 只有这一条路。
 * 找不到的路径回落到 `index.html` —— 应用走的是 hash 路由，这只服务于深链接刷新。
 */
export async function serveRendererDist(
  createServer: typeof import('node:http').createServer
): Promise<{ port: number; close: () => Promise<void> }> {
  if (!existsSync(RENDERER_DIST)) {
    throw new Error(`缺 renderer 产物：${RENDERER_DIST}。先 pnpm nx run dev-rxdb-electron:electron-package-dir`);
  }
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const candidate = join(RENDERER_DIST, pathname);
    const file =
      pathname !== '/' && existsSync(candidate) && statSync(candidate).isFile() ?
        candidate
      : join(RENDERER_DIST, 'index.html');
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream'
    });
    response.end(readFileSync(file));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('拿不到静态服务端口');
  return { port: address.port, close: () => new Promise<void>(resolve => void server.close(() => resolve())) };
}

/**
 * 让主进程隐藏窗口的环境变量名，与 `main.utils.ts` 的 `HIDE_WINDOW_ENV` 一致。
 *
 * @remarks
 * 写死而不 import：本文件跑在打包产物之外的纯 Node 进程里，import 主进程模块要把
 * 整条 electron 依赖链拖进 e2e 的 tsconfig 里。名字漂移不会让用例变红，只会让窗口
 * 重新弹出来 —— 所以两侧各有一条钉字面量的用例：主进程侧在 `main.utils.spec.ts`，
 * 本侧在 `electron-smoke.spec.ts` 的「窗口不显示」。
 */
export const HIDE_WINDOW_ENV = 'DEV_RXDB_ELECTRON_HIDE_WINDOW';

/**
 * 启动打包产物时传给子进程的环境变量。
 *
 * @remarks
 * **窗口默认隐藏**：一轮 e2e 要把产物连开三次，每次都会在 macOS 上抢焦点、切菜单栏。
 * 隐藏后渲染进程照常加载，Playwright 走 CDP 也照常操作（主进程那侧同时关掉了
 * 后台节流，否则 rAF 停摆会让可操作性检查全部超时）。
 * 用 `??=` 而不是直接赋值：`DEV_RXDB_ELECTRON_HIDE_WINDOW=0 pnpm nx e2e dev-rxdb-electron-e2e`
 * 就是「这次我要看着窗口跑」的逃生口，排查失败用例时用得上。
 *
 * 必须显式传入，不能让 Playwright 继承 `process.env`：**任何 Electron 宿主都会给自己
 * 派生的子进程设 `ELECTRON_RUN_AS_NODE=1`**（VS Code 的集成终端、扩展宿主是最常见的一个）。
 * `_electron.launch()` 不过滤这个变量，于是打包产物以纯 Node 启动 —— 没有 BrowserWindow，
 * Chromium 参数被 Node 的命令行解析器拒绝，报出来的是
 * `bad option: --remote-debugging-port=0` / `bad option: --user-data-dir=...`，
 * 和真正的原因（"这个终端是 Electron 派生的"）毫无关系。
 *
 * 症状还有迷惑性：同一份产物在 VS Code 终端里 7 条全红、在系统终端里 7 条全绿，
 * 于是很容易被归因成打包产物本身有问题。剥掉这个变量，结论就不再取决于从哪里启动。
 *
 * @returns 去掉 `ELECTRON_RUN_AS_NODE`、补上隐藏窗口开关后的当前进程环境变量
 */
export function launchEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) env[key] = value;
  }
  env[HIDE_WINDOW_ENV] ??= '1';
  return env;
}
