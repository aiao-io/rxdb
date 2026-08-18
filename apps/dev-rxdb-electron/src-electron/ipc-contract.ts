/**
 * @fileoverview 主进程 ↔ 渲染进程之间的**唯一** IPC 契约来源。
 *
 * @remarks
 * ELEC-05：`DemoRequest` / `DemoResult` 曾在本文件与 renderer service 各写一遍，
 * `ElectronAPI` 在 preload 与 renderer service 各写一遍，通道名 `'demo:run'`
 * 也在 main 与 preload 各硬编码一次 —— 四处副本没有任何编译期约束，改一处不会让其余变红。
 * 现在三端一律从这里引用。
 *
 * @module ipc-contract
 */

/** `demo:run` 的 IPC 通道名；main 与 preload 共用，避免两处硬编码字符串。 */
export const DEMO_RUN_CHANNEL = 'demo:run';

/** 桌面 SQLite host 的请求/应答通道（renderer → main，`invoke`/`handle`）。 */
export const DESKTOP_HOST_REQUEST_CHANNEL = 'desktop-sqlite:request';

/** 桌面 SQLite host 的变更事件通道（main → renderer，`webContents.send`）。 */
export const DESKTOP_HOST_CHANGE_CHANNEL = 'desktop-sqlite:change';

/**
 * preload 把桌面传输层挂到 renderer 全局时使用的键。
 *
 * @remarks
 * 必须与 `@aiao/rxdb-adapter-electron` 的 `DESKTOP_HOST_TRANSPORT_KEY` 逐字相同——
 * 适配器就是按这个名字去 `globalThis` 上找桥接的。两者的一致性由
 * `desktop-sqlite-bridge.spec.ts` 钉住，而不是靠人记得。
 */
export const DESKTOP_HOST_BRIDGE_KEY = '__aiaoRxdbDesktopHost__';

/**
 * preload 暴露给 renderer 的桌面 SQLite 传输层。
 *
 * @remarks
 * 结构上等同于 `@aiao/rxdb-adapter-electron` 的 `DesktopHostTransport`，但在这里独立声明：
 * preload 在 `sandbox: true` 下不 bundle，连同目录的兄弟文件都 require 不到（ELEC-15），
 * 更不可能 require 一个 node_modules 里的 ESM 包。
 *
 * 两者会不会漂移由**渲染进程**兜底——`setup_rxdb_desktop.ts` 把 `window` 上的这个对象
 * 当成 `DesktopHostTransport` 用，形状对不上就是编译错误。
 */
export interface DesktopHostBridge {
  /** 发一条协议请求并等待应答。 */
  request(payload: unknown): Promise<unknown>;
  /** 订阅 host 推送的变更事件，返回取消订阅的函数。 */
  subscribe(listener: (message: unknown) => void): () => void;
}

/** 渲染进程通过 `contextBridge` 拿到的 API 形状。 */
export interface ElectronAPI {
  readonly platform: NodeJS.Platform;
  readonly versions: {
    readonly node: string;
    readonly chrome: string;
    readonly electron: string;
  };
  runDemo(request: DemoRequest): Promise<DemoResult>;
}

/** `demo:run` 的入参。`data` 长度限制见 {@link parseDemoRequest}。 */
export interface DemoRequest {
  readonly data: string;
}

/** `demo:run` 的返回值。 */
export interface DemoResult {
  /** 主进程处理该次调用的时刻（`Date.now()`）。 */
  readonly timestamp: number;
  /** 回显给渲染进程的文本。 */
  readonly message: string;
}

/**
 * 在主进程侧校验并收窄一次 `demo:run` 的入参。
 *
 * IPC 入参来自渲染进程，即便有 `contextIsolation` 也**不可信**，
 * 因此主进程必须自己验；类型标注在运行时是不存在的。
 *
 * @param value `ipcMain.handle` 收到的原始值
 * @returns 校验通过的入参
 * @throws {TypeError} 当不是对象、缺 `data`、`data` 非字符串、为空或超过 1000 字符时
 */
export function parseDemoRequest(value: unknown): DemoRequest {
  if (typeof value !== 'object' || value === null || !('data' in value)) {
    throw new TypeError('Invalid demo request');
  }
  const data = value.data;
  if (typeof data !== 'string' || data.length === 0 || data.length > 1_000) {
    throw new TypeError('Invalid demo request data');
  }
  return { data };
}
