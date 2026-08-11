import { AsyncQueueExecutor } from '@aiao/utils';

const IGNORED_STDERR_MESSAGES = [
  'sqlite3_wasm_extra_init()',
  'Ignoring inability to install OPFS sqlite3_vfs: The OPFS sqlite3_vfs cannot run in the main thread because it requires Atomics.wait().'
];

/**
 * `oo1` WASM 加载选项，所有 sqlite/sqliteai 适配器共享。
 *
 * `oo1` 指上游官方 SQLite WASM 的 **Object Oriented API v1**
 * （`sqlite3.oo1.DB`），不是 aiao 自创缩写；本文件只服务走该面的
 * `@sqlite.org/sqlite-wasm` / `@sqliteai/sqlite-wasm` 加载路径。
 *
 * - `opfs`：是否启用 OPFS 持久化（需要 Worker / Atomics 支持）
 * - `wasmPath`：手动指定 sqlite3.wasm URL，覆盖默认相对路径
 * - `opfsProxyPath`：OPFS proxy worker 脚本的自定义路径（用于 bundler 重写）
 * - `locateFile`：完全自定义资源解析逻辑，优先级最高
 * - `print` / `printErr`：覆盖默认日志通道
 * - `cacheSizeKb` / `batchTimeout`：透传给 SqliteClient 初始化
 */
export interface Oo1LoadOptions {
  opfs?: boolean;
  wasmPath?: string;
  opfsProxyPath?: string;
  locateFile?: (name: string) => string;
  print?: (msg: string) => void;
  printErr?: (msg: string) => void;
  cacheSizeKb?: number;
  batchTimeout?: number;
}

/**
 * 判断 SQLite 输出是否属于已知可忽略噪音（如 OPFS 主线程降级提示）。
 *
 * @param args - 任意 console 风格的参数列表
 * @returns 命中预定义模式则 true
 */
export function shouldIgnoreSqliteMessage(args: unknown[]): boolean {
  const message = args.map(arg => String(arg)).join(' ');
  return IGNORED_STDERR_MESSAGES.some(pattern => message.includes(pattern));
}

/** 默认 `printErr` 实现：过滤掉已知噪音后转发到 `console.error`。 */
export function defaultPrintErr(msg: string): void {
  if (shouldIgnoreSqliteMessage([msg])) return;
  console.error(msg);
}

/** 默认 warn 实现：过滤掉已知噪音后转发到 `console.warn`。 */
export function defaultWarn(...args: unknown[]): void {
  if (shouldIgnoreSqliteMessage(args)) return;
  console.warn(...args);
}

/**
 * 临时设置 `globalThis.sqlite3ApiConfig`，执行 `run` 后恢复原值。
 *
 * `@sqlite.org/sqlite-wasm` 通过全局变量传递初始化配置；
 * 此函数保证多个并发加载不互相覆盖配置。
 *
 * @param config - 要合并到现有配置中的字段
 * @param run - 在配置生效期间执行的异步函数
 * @returns `run` 的返回值
 */
export async function withSqliteApiConfig<T>(config: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  const globalObject = globalThis as typeof globalThis & { sqlite3ApiConfig?: Record<string, unknown> };
  const previousConfig = globalObject.sqlite3ApiConfig;
  globalObject.sqlite3ApiConfig = { ...(previousConfig ?? {}), ...config };

  try {
    return await run();
  } finally {
    if (previousConfig === undefined) {
      delete globalObject.sqlite3ApiConfig;
    } else {
      globalObject.sqlite3ApiConfig = previousConfig;
    }
  }
}

/**
 * 解析 Emscripten `locateFile` 钩子。
 *
 * 优先级：`locateFile` > `wasmPath`（包装成函数）> undefined（用默认相对路径）。
 *
 * @param options - 加载选项
 * @returns 可传给 Emscripten 的 `locateFile` 函数，或 undefined
 */
export function resolveLocateFile(options?: Oo1LoadOptions): ((name: string) => string) | undefined {
  if (options?.locateFile) return options.locateFile;
  if (options?.wasmPath) {
    return () => options.wasmPath as string;
  }
  return undefined;
}

function isOpfsProxyWorkerUrl(scriptUrl: string | URL): boolean {
  const urlValue = typeof scriptUrl === 'string' ? scriptUrl : scriptUrl.toString();
  if (urlValue.includes('sqlite3-opfs-async-proxy.js')) return true;

  try {
    const parsedUrl = new URL(urlValue, globalThis.location?.href ?? 'http://localhost');
    return /sqlite3-opfs-async-proxy(?:-[^/]+)?\.js$/.test(parsedUrl.pathname);
  } catch {
    return /sqlite3-opfs-async-proxy(?:-[^/]+)?\.js(?:$|[?#])/.test(urlValue);
  }
}

/**
 * 把 sqlite3 内置的 OPFS proxy worker URL 重写到用户提供的路径。
 *
 * 用于 bundler 把 worker 脚本输出到非默认位置的场景；非 proxy URL 原样返回。
 *
 * @param scriptUrl - 原始 worker URL（来自 sqlite3 内部 `new Worker(...)`）
 * @param opfsProxyPath - 用户指定的替代路径
 * @returns 替换后的 URL（若不匹配则返回原值）
 */
export function rewriteOpfsProxyWorkerUrl(scriptUrl: string | URL, opfsProxyPath: string): string | URL {
  if (!isOpfsProxyWorkerUrl(scriptUrl)) return scriptUrl;

  try {
    const originalUrl = new URL(scriptUrl.toString(), globalThis.location?.href ?? 'http://localhost');
    const rewrittenUrl = new URL(opfsProxyPath, originalUrl);
    // sqlite3 内部通过 `?vfs=opfs|opfs-wl` 告知 proxy worker 自己的 VFS 类型（见
    // @sqlite.org/sqlite-wasm 的 `new URL('sqlite3-opfs-async-proxy.js', import.meta.url)`）。
    // `new URL(opfsProxyPath, originalUrl)` 在 opfsProxyPath 本身不带 query 时会直接丢弃
    // originalUrl 的 search，导致 proxy worker 收不到 vfs 参数而抛错；这里显式补回缺失字段。
    originalUrl.searchParams.forEach((value, key) => {
      if (!rewrittenUrl.searchParams.has(key)) {
        rewrittenUrl.searchParams.set(key, value);
      }
    });
    return rewrittenUrl.toString();
  } catch {
    return opfsProxyPath;
  }
}

/**
 * 模块级全局加载锁（并发度 1）。
 *
 * oo1 模块加载会临时改写进程全局状态（`globalThis.Worker` 描述符、`globalThis.sqlite3ApiConfig`），
 * 多个适配器实例并发加载会相互覆盖。把整个「patch 全局 → init → 恢复」过程串行到唯一通道即可避免。
 */
const oo1LoadQueue = new AsyncQueueExecutor(1);

/**
 * 将一次完整的 oo1 模块加载串行化到全局唯一通道。
 *
 * 调用方应在最外层包裹整个加载（含 {@link withPatchedOpfsProxyWorker} 与 `withSqliteApiConfig`），
 * 使所有改写全局状态的步骤都落在锁内，杜绝跨实例并发覆盖。
 *
 * @param run - 执行实际加载的异步函数
 * @returns `run` 的返回值
 */
export async function withGlobalOo1LoadLock<T>(run: () => Promise<T>): Promise<T> {
  return oo1LoadQueue.addTask(run);
}

/**
 * 用 Proxy 临时替换 `globalThis.Worker`，把 OPFS proxy worker 的脚本 URL 重写到 `opfsProxyPath`。
 *
 * 仅在 `options.opfs && options.opfsProxyPath` 且环境支持 Worker 时生效；
 * `run` 完成后恢复原 `Worker` 构造器（包括属性描述符）。
 *
 * 并发安全：本函数对全局 `Worker` 的 patch/恢复不可重入，必须由外层的 {@link withGlobalOo1LoadLock}
 * 串行覆盖（加载入口已统一包裹）；脱离该锁单独并发调用仍不安全。
 *
 * @param options - 加载选项；缺失 opfs/opfsProxyPath 时直通 `run`
 * @param run - 在 Worker 被 patch 期间执行的异步加载函数
 * @returns `run` 的返回值
 */
export async function withPatchedOpfsProxyWorker<T>(
  options: Oo1LoadOptions | undefined,
  run: () => Promise<T>
): Promise<T> {
  if (!options?.opfs || !options.opfsProxyPath || typeof Worker === 'undefined') {
    return run();
  }

  const globalObject = globalThis as typeof globalThis & { Worker?: typeof Worker };
  const workerDescriptor = Object.getOwnPropertyDescriptor(globalObject, 'Worker');
  const originalWorker = globalObject.Worker;
  if (!originalWorker || (!workerDescriptor?.configurable && !workerDescriptor?.writable)) {
    return run();
  }

  const patchedWorker = new Proxy(originalWorker, {
    construct(target, argArray, newTarget) {
      const [scriptUrl, ...rest] = argArray as [string | URL, ...unknown[]];
      return Reflect.construct(
        target,
        [rewriteOpfsProxyWorkerUrl(scriptUrl, options.opfsProxyPath as string), ...rest],
        newTarget
      );
    }
  }) as typeof Worker;

  Object.defineProperty(globalObject, 'Worker', {
    configurable: true,
    writable: true,
    value: patchedWorker
  });

  try {
    return await run();
  } finally {
    if (workerDescriptor) {
      Object.defineProperty(globalObject, 'Worker', workerDescriptor);
    } else {
      delete (globalObject as { Worker?: typeof Worker }).Worker;
    }
  }
}

/**
 * 从 `Oo1LoadOptions` 构造 Emscripten 模块初始化对象（喂给 `sqlite3InitModule`）。
 *
 * 合并 `printErr` / `print` / `locateFile`，缺失时使用 defaultPrintErr。
 *
 * @param options - 加载选项
 * @returns 可直接传给 sqlite3 模块工厂的配置对象
 */
export function buildOo1InitOptions(options?: Oo1LoadOptions): Record<string, unknown> {
  const initOptions: Record<string, unknown> = {
    printErr: options?.printErr ?? defaultPrintErr
  };
  const locateFile = resolveLocateFile(options);
  if (locateFile) {
    initOptions['locateFile'] = locateFile;
  }
  if (options?.print) {
    initOptions['print'] = options.print;
  }
  return initOptions;
}

/**
 * 决定「加载到哪个 WASM 模块」的配置指纹。
 *
 * @remarks
 * SQLI-001 / SQLAI-001：两个官方适配器都用模块级单例缓存 `Oo1Static`，
 * 但缓存键只记「是否用过 OPFS proxy patch」——
 * 第一次用 `/a/sqlite.wasm` 初始化后，第二个 client 明确传 `/b/sqlite.wasm`
 * 也会**静默拿到第一个模块**；两个不同 proxy URL 只要都启用 patch 同样命中同一缓存。
 *
 * 这里只纳入**真正决定加载什么**的字段。`print` / `printErr` 是模块级日志通道，
 * 不影响加载哪个二进制，故不参与指纹（首次加载生效，后续调用传的会被忽略）。
 * `locateFile` 是函数、无法按值比较，只比较「有没有提供」——
 * 两个**不同实现**的 `locateFile` 无法区分，这是模块级缓存的固有限制，
 * 不做假装能测的兜底。
 */
export interface Oo1LoadFingerprint {
  readonly opfs: boolean;
  readonly wasmPath: string | undefined;
  readonly opfsProxyPath: string | undefined;
  readonly hasLocateFile: boolean;
}

/** 从加载选项算出 {@link Oo1LoadFingerprint}。 */
export function toOo1LoadFingerprint(options?: Oo1LoadOptions): Oo1LoadFingerprint {
  return {
    opfs: options?.opfs === true,
    wasmPath: options?.wasmPath,
    opfsProxyPath: options?.opfsProxyPath,
    hasLocateFile: options?.locateFile !== undefined
  };
}

/**
 * 两次加载是否指向同一个 WASM 模块。
 *
 * @param cached - 缓存模块对应的指纹
 * @param requested - 本次调用的指纹
 * @returns 相同则可复用缓存；不同则必须重新加载
 *
 * @remarks
 * 取「按指纹缓存」而不是「不兼容即报错」，是因为**重新加载本就是既有且被测试锁定的行为**：
 * 缓存模块未启用 OPFS proxy patch、而新调用需要它时，原实现就会重载一次。
 * 把 `wasmPath` / `opfsProxyPath` / `locateFile` 一并纳入指纹，
 * 等于把那条既有规则推广到全部「决定加载什么」的字段，语义一致且不破坏现有能力。
 */
export function isSameOo1LoadConfig(cached: Oo1LoadFingerprint, requested: Oo1LoadFingerprint): boolean {
  return (
    cached.opfs === requested.opfs &&
    cached.wasmPath === requested.wasmPath &&
    cached.opfsProxyPath === requested.opfsProxyPath &&
    cached.hasLocateFile === requested.hasLocateFile
  );
}
