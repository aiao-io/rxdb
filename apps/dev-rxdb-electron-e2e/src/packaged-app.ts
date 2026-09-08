import { expect } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

/**
 * Linux 上的沙箱前置检查：确认 `chrome-sandbox` 已配成 setuid root，否则带修复命令直接红。
 *
 * @param executable - Electron 可执行文件的绝对路径（`require('electron')` 那份，或打包产物那份）
 *
 * @remarks
 * **凡是要跑扩展 `devtools_page` 的用例都不能带 `--no-sandbox`，那个开关会让被测能力本身失效。**
 * Electron 44 上，非沙箱渲染进程走 `renderer_init`，它同步向主进程要 preload 列表；扩展的
 * `devtools_page` 拿回的是 `null`，于是整个 bundle 在
 *   Electron renderer.bundle.js script failed to run
 *   TypeError: object null is not iterable (cannot read property Symbol(Symbol.iterator))
 * 处中断 —— 页面自己的脚本一行都没执行，`chrome.devtools.panels.create` 从未被调用，
 * RxDB 面板压根不会进 tab 条。表征极具误导性：`chrome.devtools` / `panels.create` 在那个帧里
 * 探起来一切正常，只有 `devtoolsPageState.readyState` 停在 `loading`、`document.scripts` 为空
 * 露了馅。macOS 上加 `--no-sandbox` 能一比一复现同一组红，去掉就全绿 —— 与平台无关，就是这个开关。
 *
 * 而 npm/pnpm 解包置不了 setuid 位（只有 root 能置），`chrome-sandbox` 落地是 0755。
 * Chromium 见到「文件在但没配好」不会降级，直接 FATAL 中止：
 *   FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:166] The SUID sandbox helper
 *   binary was found, but is not configured correctly.
 * 那条只在 stderr，调用方看到的往往是一句无关的启动失败。所以这里先自查：缺就带着修复命令红，
 * **不退回 `--no-sandbox`** —— 那正是能力失效的原因，兜过去只会让用例报绿而什么都没验
 * （AGENTS.md：无 fallback 兜底）。
 *
 * ubuntu-24.04 默认禁掉非特权 user namespace，命名空间沙箱那条路也走不通，只剩 SUID 助手这一种。
 *
 * **配好之后不能再打包。** `electron-package-dir` 不是缓存目标（project.json 里没有
 * `cache: true`，nx.json 的 targetDefaults 里也没有它的条目），Nx 每次都会重跑它，
 * electron-builder 随之把整个 `linux-unpacked/` 重新解包 —— 配好的助手被一份普通用户属主、
 * 0755 的新拷贝覆盖。所以「chown/chmod 完直接 `nx e2e`」永远过不了这道自查：nx 会先重打包，
 * 再跑用例。打包产物那份的正确顺序是 打包 → 配置 → `--excludeTaskDependencies` 跑用例，
 * 下面的报错文案会按助手所在位置把这一条提出来。CI 侧同一顺序，见 ci-template.yml 的
 * `Build E2E dependencies` 步骤。
 */
export function assertSandboxUsable(executable: string): void {
  if (process.platform !== 'linux') return;

  const helper = join(dirname(executable), 'chrome-sandbox');
  const stats = existsSync(helper) ? statSync(helper) : null;
  // setuid 位 + root 属主，两者缺一不可：只 chmod 不 chown 一样过不了 Chromium 的检查。
  const usable = stats !== null && stats.uid === 0 && (stats.mode & 0o4000) !== 0;

  // 只对打包产物那份提「别再打包」：node_modules/electron 下的那份（MV3 门禁用）不会被
  // electron-package-dir 重写，对它说这句只会误导。
  const rewrittenByPackaging =
    helper.startsWith(RELEASE_DIR) ?
      '配好后必须带 --excludeTaskDependencies 跑：\n' +
      '  pnpm nx run dev-rxdb-electron-e2e:e2e --excludeTaskDependencies\n' +
      '不带这个开关时 nx 会先重跑 electron-package-dir，把整个 linux-unpacked/ 连同' +
      '刚配好的助手一起覆盖掉 —— 配了也白配，报错和现在一模一样。\n'
    : '';

  expect(
    usable,
    `Electron 的 SUID 沙箱助手未配置好：${helper}\n` +
      `请先执行：sudo chown root:root ${helper} && sudo chmod 4755 ${helper}\n` +
      rewrittenByPackaging +
      '（扩展 devtools_page 必须在真沙箱下跑：--no-sandbox 会让它的渲染进程初始化失败，' +
      '面板永远不会注册。详见 assertSandboxUsable 的 @remarks。）'
  ).toBe(true);
}

/**
 * 驱动 DevTools 扩展面板的用例必须在 Chromium **真沙箱**下启动打包产物。
 *
 * @returns 摊进 `electron.launch()` 的沙箱选项
 * @throws Linux 上 `chrome-sandbox` 未配成 setuid root 时，带修复命令直接红
 *
 * @remarks
 * Playwright 的 `electron.launch()` 在 Linux 上**默认插 `--no-sandbox`**
 * （`chromiumSandbox` 默认 `false`），而那个开关会让扩展 `devtools_page` 一行脚本都不执行，
 * 面板因此永远不进 tab 条 —— 见 {@link assertSandboxUsable} 的 @remarks。
 * macOS / Windows 上 Playwright 不插这个参数，`chromiumSandbox` 在那里是空操作，
 * 所以这条差异**只在 CI 上显形**：本地全绿、Linux 全红，且红在
 * `devtools-panel-driver.ts` 的「DevTools 里始终没有出现扩展面板 tab」，
 * 看上去像面板没登记，与真因（一个命令行开关）毫无关系。
 *
 * 不给 `electron-smoke` / `storage-persistence` / `desktop-persistence*` /
 * `devtools-extension-loading` 用：它们不跑扩展渲染进程
 * （最后一个只读 `session.getAllExtensions()`），加上只会平白多一条对 SUID 助手的依赖。
 */
export function realSandbox(): { chromiumSandbox: true } {
  assertSandboxUsable(resolveExecutable());
  return { chromiumSandbox: true };
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
