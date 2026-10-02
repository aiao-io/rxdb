/**
 * @fileoverview 实验用到的支付宝小程序 API 子集。
 *
 * 签名照抄支付宝开放平台文档，再按 v2 探针在模拟器与 iOS 真机上的实测修正：同步 FS 方法失败时
 * **返回**错误对象而不是抛出，成功时返回 `{ success: true }` 一类的结果对象。文档没写的形状一律
 * 按 `unknown` 处理，交给包装层判断。
 */

/** 同步 FS 方法的失败返回：iOS 带数字 `error` 与 `message`，模拟器内部错误带字符串 `errorCode`。 */
export interface AlipayFsFailure {
  readonly error?: number;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly message?: string;
}

/** `statSync` 返回的 Stats。 */
export interface AlipayStats {
  readonly size: number;
  isDirectory(): boolean;
  isFile(): boolean;
}

/**
 * 支付宝同步文件系统的原始形态：每个方法都返回结果对象，失败不抛。
 *
 * 没有 `openSync` / `readSync` / `writeSync` / `truncateSync`，只能整文件读写（两端实测）。
 */
export interface AlipayRawFileSystem {
  accessSync(path: string): unknown;
  mkdirSync(path: string, recursive?: boolean): unknown;
  /** 不传 `encoding` 读二进制，成功时 `data` 是 `ArrayBuffer`（可能来自别的 realm）。 */
  readFileSync(path: string, encoding?: string): unknown;
  /** 只有「base64 串 + `'base64'`」两端字节一致；`ArrayBuffer` 模拟器存成 base64 文本，`Uint8Array` iOS 静默写 0 字节。 */
  writeFileSync(path: string, data: string | ArrayBuffer | Uint8Array, encoding?: string): unknown;
  unlinkSync(path: string): unknown;
  rmdirSync(path: string, recursive?: boolean): unknown;
  renameSync(oldPath: string, newPath: string): unknown;
  /** 成功时 `stats` 是 {@link AlipayStats}。 */
  statSync(path: string): unknown;
  /** 成功时 `files` 是文件名数组（**推断**，实验记录原始形态）。 */
  readdirSync(path: string): unknown;
}

/** `my.createWorker` 返回的 Worker；消息是普通对象。 */
export interface AlipayWorker {
  postMessage(message: object): void;
  onMessage(listener: (message: unknown) => void): void;
  terminate(): void;
}

/** `my.setClipboard` 参数。 */
export interface AlipayClipboardOptions {
  readonly text: string;
  readonly success?: () => void;
  readonly fail?: (error: unknown) => void;
}

/** 全局 `my` 里实验用到的部分；可选成员缺失本身就是实验结论。 */
export interface AlipayApi {
  readonly SDKVersion?: string;
  readonly env?: { readonly USER_DATA_PATH?: string };
  getFileSystemManager(): AlipayRawFileSystem;
  arrayBufferToBase64(buffer: ArrayBuffer): string;
  base64ToArrayBuffer(base64: string): ArrayBuffer;
  getSystemInfoSync?(): object;
  canIUse?(name: string): boolean;
  createWorker?(path: string, options: { readonly useExperimentalWorker: boolean }): AlipayWorker;
  setClipboard?(options: AlipayClipboardOptions): void;
  /** 文档里没有，实验核对它确实不存在。 */
  getRandomValues?: unknown;
}

/** 逻辑层与 Worker 里的标准 `WebAssembly` 子集：支付宝文档没写逻辑层有它，两端实测都有。 */
export interface StandardWasmApi {
  instantiate(
    bytes: ArrayBuffer | Uint8Array<ArrayBuffer>,
    imports: WebAssembly.Imports
  ): Promise<{ readonly instance: { readonly exports: WebAssembly.Exports }; readonly module?: unknown }>;
}

/** Worker 里的 `MYWebAssembly`：文档写只能按代码包路径实例化。 */
export interface AlipayWorkerWasmApi {
  instantiate(path: string, imports: WebAssembly.Imports): Promise<unknown>;
}
