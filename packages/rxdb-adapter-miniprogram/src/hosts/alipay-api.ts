/**
 * @fileoverview 支付宝宿主用到的 `my` / Worker / `WebAssembly` 子集。
 *
 * 签名照抄支付宝开放平台文档，再按 US-211 支付宝探针 v2–v6（开发者工具模拟器、iOS 真机）的实测修正：
 * 同步 FS 方法失败时**返回**错误对象而不是抛出。文档没写的形状一律按 `unknown` 处理，交给包装层判断。
 * 只给 adapter 用到的成员；探针等调用方可以传入更宽的对象。
 */

/** 同步 FS 方法的失败返回：iOS 带数字 `error` 与 `message`，模拟器内部错误带字符串 `errorCode`。 */
export interface AlipayFsFailure {
  readonly error?: number;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly message?: string;
}

/**
 * 支付宝同步文件系统的原始形态：每个方法都返回结果对象，失败不抛。
 *
 * 没有 `openSync` / `readSync` / `writeSync` / `truncateSync`，只能整文件读写（两端实测）。
 */
export interface MiniProgramAlipayRawFileSystem {
  accessSync(path: string): unknown;
  mkdirSync(path: string, recursive?: boolean): unknown;
  /** 不传 `encoding` 读二进制，成功时 `data` 是 `ArrayBuffer`（可能来自别的 realm）；`'utf8'` 时是字符串。 */
  readFileSync(path: string, encoding?: string): unknown;
  /** 只有「base64 串 + `'base64'`」两端字节一致；`ArrayBuffer` 模拟器存成 base64 文本，`Uint8Array` iOS 静默写 0 字节。 */
  writeFileSync(path: string, data: string, encoding: 'base64'): unknown;
  unlinkSync(path: string): unknown;
}

/** 支付宝宿主需要的全局 `my` 成员。 */
export interface MiniProgramAlipayApi {
  readonly env?: { readonly USER_DATA_PATH?: string };
  getFileSystemManager(): MiniProgramAlipayRawFileSystem;
  arrayBufferToBase64(buffer: ArrayBuffer): string;
  base64ToArrayBuffer(base64: string): ArrayBuffer;
}

/**
 * `my.createWorker('workers/index.js', { useExperimentalWorker: true })` 返回的 Worker；消息是普通对象。
 *
 * Worker 脚本用包里的 `@aiao/rxdb-adapter-miniprogram/alipay-random-worker.js`。
 */
export interface AlipayRandomWorker {
  postMessage(message: object): void;
  onMessage(listener: (message: unknown) => void): void;
}

/**
 * 逻辑层的标准 `WebAssembly` 子集。
 *
 * 支付宝文档只写了 Worker 里的 `MYWebAssembly`（按代码包路径实例化），逻辑层的标准 `WebAssembly` 没有文档承诺，
 * 模拟器与 iOS 实测都有：可行性矩阵 `undocumented` 的 `logic-layer-webassembly`。
 */
export interface AlipayStandardWasmApi {
  instantiate(
    bytes: Uint8Array<ArrayBuffer>,
    imports: WebAssembly.Imports
  ): Promise<{ readonly instance: { readonly exports: WebAssembly.Exports }; readonly module?: unknown }>;
}
