/**
 * @fileoverview 主进程里几个**可独立判定**的策略：导航白名单、自定义协议的资源解析、开发端口解析。
 *
 * @remarks
 * 抽出来是为了能被单测覆盖 —— `main.ts` 直接 import `electron`，在 Node 测试环境里加载不了，
 * 于是这几条安全相关的判断长期没有任何用例（ELEC-01 / ELEC-03 / ELEC-22）。
 *
 * @module main.utils
 */
import path from 'node:path';

/**
 * 渲染进程使用的自定义协议名。
 *
 * @remarks
 * ELEC-22：生产入口原本是 `loadFile`，也就是 `file:`。实测下来 `file:` 同时踩中三堵墙：
 *
 * 1. **ES module 加载不了。** Angular 22 的产物入口是 `<script type="module">`，
 *    Chromium 对 `file:` 的模块脚本按跨域处理并直接拒绝：
 *    `Cross origin requests are only supported for protocol schemes: chrome, data, http, https`。
 *    连 `main-*.js` 都进不去，应用根本起不来。
 * 2. **`fetch()` 不可用。** emscripten 取 `.wasm` 走的就是 fetch，实测 `TypeError: Failed to fetch`；
 *    XHR 可用但那是 wa-sqlite 内部的事，应用侧改不了。`blob:` 也不行 ——
 *    页面创建的 blob URL 在专用 worker 里同样 fetch 失败。
 * 3. **origin 不透明。** OPFS/IndexedDB 虽能用，但没有稳定 origin 可依附。
 *
 * 注册成 `standard + secure + supportFetchAPI` 的自定义协议后，这三条同时消失：
 * 模块按同源加载、fetch 可用、origin 稳定为 {@link APP_ORIGIN}，CSP 里的 `'self'` 也有了确切所指。
 *
 * 已实测的旁证：同一份产物用 `http://` 静态服务打开，状态卡直接到「✅ 已连接」，
 * 控制台与失败请求均为空 —— 说明应用代码本身没有问题，卡住的只有 `file:` 这层。
 */
export const APP_SCHEME = 'app';

/**
 * 渲染进程的固定 origin。
 *
 * @remarks
 * host 取 `-`：它不是合法域名，永远不可能与真实站点撞车，是 Electron 社区对
 * 「这个自定义协议只有一个虚拟主机」的惯用写法。
 */
export const APP_ORIGIN = `${APP_SCHEME}://-`;

/** 生产模式下窗口加载的入口 URL。 */
export const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`;

/**
 * 把一次 {@link APP_SCHEME} 请求映射到磁盘上的真实文件路径。
 *
 * @param requestUrl - 请求 URL（`protocol.handle` 回调里的 `request.url`）
 * @param rootDir - 允许对外提供的根目录（生产为 `<resources>/browser`）
 * @returns 根目录内的绝对路径；协议不符、无法解析或越界时为 `null`
 *
 * @remarks
 * 这个 handler 会响应渲染进程发出的**任何** `app://` 请求，因此越界判定是安全边界而非防御性代码：
 * 放行 `rootDir` 之外的路径，等于把整个文件系统开成一个静态服务器。
 *
 * `new URL()` 自身会归一化明文 `..`，所以真正的攻击向量是**编码后**的 `..`
 *（`%2e%2e%2f`）—— 必须在 `decodeURIComponent` 之后再判一次前缀，顺序反了就漏。
 */
export const resolveAppAssetPath = (requestUrl: string, rootDir: string): string | null => {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:`) return null;

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  // NUL 会让下游的 fs 调用抛错；这里当作非法请求直接拒掉
  if (pathname.includes('\0')) return null;

  const relative = pathname.replace(/^\/+/, '');
  const root = path.resolve(rootDir);
  const target = path.resolve(root, relative.length === 0 ? 'index.html' : relative);

  return target === root || target.startsWith(root + path.sep) ? target : null;
};

/**
 * 判定一次 `will-navigate` 是否允许放行。
 *
 * @param targetUrl - 目标 URL
 * @param currentUrl - 当前窗口 URL；取不到时一律拒绝
 * @returns 允许导航则 `true`
 *
 * @remarks
 * ELEC-01：原实现是 `new URL(url).origin !== new URL(currentUrl).origin`。
 * 生产入口是 `loadFile`，而 WHATWG 规范下 **`file:` URL 的 origin 序列化恒为字符串 `"null"`**，
 * 于是 `"null" !== "null"` 恒为 false —— **任意 `file:` 地址都能通过白名单**，
 * 包括 `file:///etc/passwd` 这类应用目录之外的路径。
 * 另外原实现的 `new URL()` 在回调里没有 try/catch，非法 URL 会直接抛进 Electron 的事件循环。
 *
 * ELEC-22：生产入口改用 {@link APP_SCHEME} 后又踩了**同一个坑的翻版**。
 * `app:` 不在 WHATWG 的 special scheme 列表里，于是 Node 的
 * `new URL('app://evil.example/x').origin` 与 `new URL('app://-/x').origin` **都是 `"null"`**，
 * 照旧走 origin 比较就等于放行任意 `app://` 主机。
 * 渲染进程那侧 Chromium 因为注册了 `standard: true` 会算出真 origin，但主进程用的是 Node 的 URL，
 * 它不知道这件事 —— 所以这里必须显式比较 host。
 *
 * 因此这里改成：
 * - 解析失败 → 拒绝（不可解析的 URL 没有放行理由）；
 * - 协议不同 → 拒绝（`file:` ↔ `http:` 之间不存在"同源"）；
 * - `file:` → 比较**目录前缀**，只允许应用自身目录内的文档；
 * - `app:` → 比较 **host**，不能用 origin（见上）；
 * - 其余协议 → 仍按 origin 比较。
 */
export const isAllowedNavigation = (targetUrl: string, currentUrl: string | undefined): boolean => {
  if (!currentUrl) return false;

  let target: URL;
  let current: URL;
  try {
    target = new URL(targetUrl);
    current = new URL(currentUrl);
  } catch {
    return false;
  }

  if (target.protocol !== current.protocol) return false;

  if (target.protocol === 'file:') {
    const directory = current.pathname.slice(0, current.pathname.lastIndexOf('/') + 1);
    return directory.length > 0 && target.pathname.startsWith(directory);
  }

  if (target.protocol === `${APP_SCHEME}:`) return target.host === current.host;

  return target.origin === current.origin;
};

/** 端口取值范围（TCP 端口号，排除 0）。 */
const MIN_PORT = 1;
const MAX_PORT = 65535;

/**
 * 解析开发服务器端口。
 *
 * @param raw - 原始字符串（来自 `--port=` 或 `DEV_SERVER_PORT`）
 * @returns 合法端口号
 * @throws {@link RangeError} 非纯数字或超出 1..65535 时
 *
 * @remarks
 * ELEC-03：原实现是裸 `parseInt(...)`，`'4120junk'` 会被解析成 `4120`（静默截断），
 * 空值或非数字得到 `NaN` 并被直接拼进 `loadURL(\`http://localhost:NaN\`)`，
 * 报错发生在加载阶段、信息与真正的原因无关。这里改为严格校验并在解析处就报错。
 */
export const parseDevServerPort = (raw: string | undefined): number => {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new RangeError(`开发服务器端口必须是纯数字，收到：${String(raw)}`);
  }
  const port = Number(raw);
  if (port < MIN_PORT || port > MAX_PORT) {
    throw new RangeError(`开发服务器端口必须在 ${String(MIN_PORT)}..${String(MAX_PORT)} 之间，收到：${String(port)}`);
  }
  return port;
};

/**
 * 从命令行参数与环境变量解析端口。
 *
 * 优先级：`--port=` > `DEV_SERVER_PORT` > 默认 4120。
 *
 * @param args - `process.argv.slice(1)`
 * @param env - `process.env`
 */
export const resolveDevServerPort = (args: readonly string[], env: Record<string, string | undefined>): number => {
  const portArg = args.find(arg => arg.startsWith('--port='));
  // `split('=')[1]` 在 `--port=` 这种空值形态下是空串，交给 parseDevServerPort 统一拒绝
  if (portArg) return parseDevServerPort(portArg.slice('--port='.length));
  if (env['DEV_SERVER_PORT']) return parseDevServerPort(env['DEV_SERVER_PORT']);
  return 4120;
};
