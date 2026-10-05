/**
 * @fileoverview Node 侧的支付宝 `my` / Worker 测试替身。**不是实验证据。**
 *
 * 形态取自 v2 探针的两份实测报告（小程序开发者工具 3.10.15 模拟器、iOS 真机调试）：同步 FS 失败时返回
 * 错误对象而不抛；`iOS` 模式的错误对象多一个与 `errorMessage` 同文的 `message`、写 `Uint8Array` 静默落盘
 * 0 字节、`renameSync` 覆盖已有目标；`simulator` 模式写 `ArrayBuffer` 落盘成 base64 文本、写 `Uint8Array`
 * 报 `90000`、`renameSync` 遇到已有目标报 10025。配额按文档 10028「单个超过 10M 或者文件夹超过 50M」建模，
 * 「文件夹」按整个用户目录算（**推断**，实验要测的正是这一条）。代码包文件只认相对路径（模拟器实测）；
 * `simulator` 模式把代码包文件当 UTF-8 文本读，非法字节序列一律变成 `EF BF BD`（CDP 直调实测）；
 * `ios` 模式的代码包里没有 `.base64.txt` 文本副本（v3 探针 iOS 真机调试实测 10022）。
 *
 * Worker 在 `node:vm` 里跑 adapter 包里的 `alipay-random-worker.js` 原文件，全局只给平台注入的 `worker`
 * 与 `crypto`（v2 探针实测 Worker 里没有 `my`），消息经结构化复制、`setTimeout` 投递。
 */
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import type {
  AlipayApi,
  AlipayFsFailure,
  AlipayRawFileSystem,
  AlipayStats,
  AlipayWorker,
  StandardWasmApi
} from '../alipay-api.js';
import { ALIPAY_WASM_TEXT_COPY_SUFFIX } from '../official-host.js';

/** 两端实测的用户目录。 */
export const FAKE_USER_DATA_PATH = 'https://usr';

const MIB = 1024 * 1024;

// 锚定在 adapter 包上解析：本 app 没有自己的 package.json，wasm 依赖挂在 adapter 名下
const adapterRequire = createRequire(
  new URL('../../../../packages/rxdb-adapter-miniprogram/package.json', import.meta.url)
);

/** 与 adapter 打包的 glue 同源的 wasm 字节。 */
export const wasmBytes = Uint8Array.from(readFileSync(adapterRequire.resolve('@subframe7536/sqlite-wasm/wasm')));

/** adapter 包里的 Worker 脚本原文，构建脚本原样拷进 `dist/workers/index.js`。 */
export const randomWorkerScript = readFileSync(
  adapterRequire.resolve('@aiao/rxdb-adapter-miniprogram/alipay-random-worker.js'),
  'utf8'
);

/** adapter 默认的代码包 wasm 路径。 */
const WA_SQLITE_PATH = 'wa-sqlite/wa-sqlite.wasm';

/** 替身的可调参数。 */
export interface FakeAlipayOptions {
  /** 按哪一端的实测形态建模，默认 `ios`。 */
  readonly mode?: 'ios' | 'simulator';
  /** 单个文件上限，默认按文档 10 MiB；iOS 真机调试实测单文件 12 MiB 都不拦，复现它传 `Number.POSITIVE_INFINITY`。 */
  readonly fileLimitBytes?: number;
  /** 用户目录总上限，默认按文档 50 MiB。 */
  readonly folderLimitBytes?: number;
  /** 文件夹上限算在哪：整个用户目录（默认），或只算被写文件的直接所在目录。 */
  readonly folderLimitScope?: 'user-dir' | 'direct-folder';
  /** 覆盖写时旧文件大小仍计入总上限。支付宝没有实测过，默认关闭。 */
  readonly overwriteCountsOldSize?: boolean;
  /** `my.SDKVersion`。 */
  readonly sdkVersion?: string;
  /** 逻辑层没有标准 `WebAssembly`。 */
  readonly withoutLogicWasm?: boolean;
  /** 没有 `my.createWorker`。 */
  readonly withoutWorker?: boolean;
  /** Worker 里没有 `crypto.getRandomValues`。 */
  readonly withoutWorkerCrypto?: boolean;
  /** 代码包里 `wa-sqlite/wa-sqlite.wasm` 的字节（文本副本随之生成），默认是锁定版本的原样字节。 */
  readonly codePackageWasm?: Uint8Array;
}

/** 替身本体与可供断言的内部状态。 */
export interface FakeAlipay {
  readonly my: AlipayApi;
  /** 逻辑层的标准 `WebAssembly`；`withoutLogicWasm` 时为 `undefined`。 */
  readonly wasm: StandardWasmApi | undefined;
  readonly files: Map<string, Uint8Array>;
  readonly directories: Set<string>;
  readonly clipboard: string[];
  /** 创建过、尚未 `terminate` 的 Worker 数。 */
  readonly liveWorkers: () => number;
}

function textCopy(bytes: Uint8Array): Uint8Array {
  return Buffer.from(Buffer.from(bytes).toString('base64'));
}

/** 代码包里的文件，键是相对代码包根的路径；模拟器的代码包里还有构建脚本放的 base64 文本副本。 */
function codePackage(mode: 'ios' | 'simulator', wasm: Uint8Array): ReadonlyMap<string, Uint8Array> {
  const files = new Map([[WA_SQLITE_PATH, wasm]]);
  if (mode === 'simulator') files.set(`${WA_SQLITE_PATH}${ALIPAY_WASM_TEXT_COPY_SUFFIX}`, textCopy(wasm));
  return files;
}

const SUCCESS = Object.freeze({ success: true });

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

function isUnder(path: string, directory: string): boolean {
  return path.startsWith(`${directory}/`);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function stats(size: number, directory: boolean): AlipayStats {
  return { size, isDirectory: () => directory, isFile: () => !directory };
}

class FakeRawFileSystem implements AlipayRawFileSystem {
  readonly files = new Map<string, Uint8Array>();
  readonly directories = new Set<string>([FAKE_USER_DATA_PATH]);

  constructor(
    private readonly mode: 'ios' | 'simulator',
    private readonly codePackage: ReadonlyMap<string, Uint8Array>,
    private readonly fileLimitBytes: number,
    private readonly folderLimitBytes: number,
    private readonly folderLimitScope: 'user-dir' | 'direct-folder',
    private readonly overwriteCountsOldSize: boolean
  ) {}

  accessSync(path: string): unknown {
    return this.exists(path) ? SUCCESS : this.fail(10022, '文件不存在');
  }

  mkdirSync(path: string, recursive?: boolean): unknown {
    if (this.exists(path)) return this.fail(10025, '有同名文件或目录');
    if (!recursive && !this.directories.has(parentOf(path))) return this.fail(10022, '目录不存在');
    for (let current = path; current.length > FAKE_USER_DATA_PATH.length; current = parentOf(current)) {
      this.directories.add(current);
    }
    return SUCCESS;
  }

  readFileSync(path: string, encoding?: string): unknown {
    const bytes = this.files.get(path) ?? this.readCodePackage(path);
    if (!bytes) return this.fail(10022, '文件不存在');
    if (encoding === 'utf8') return { data: Buffer.from(bytes).toString('utf8'), success: true };
    if (encoding === 'base64') return { data: Buffer.from(bytes).toString('base64'), success: true };
    return { data: toArrayBuffer(bytes), dataType: 'ArrayBuffer', success: true };
  }

  /**
   * 模拟器三处与 iOS 不同（v3 探针 + CDP 直调实测）：任何空数据（空串、空 `ArrayBuffer`）都报 error 2；
   * 父目录不存在时自动建出来；单文件上限比的是传入的串长——按 base64 串长计是**推断**，
   * 依据是实测「7 MiB 写得进、8 MiB 撞 10028」恰好落在 10 MiB 串长的两侧。
   */
  writeFileSync(path: string, data: string | ArrayBuffer | Uint8Array, encoding?: string): unknown {
    const simulator = this.mode === 'simulator';
    if (simulator && (typeof data === 'string' ? data.length : data.byteLength) === 0)
      return this.fail(2, '接口参数无效');
    if (simulator) this.mkdirSync(parentOf(path), true);
    if (!this.directories.has(parentOf(path))) return this.fail(10022, '目录不存在');
    const next = this.encode(data, encoding);
    if (next === undefined) return { errorCode: '90000', errorMessage: '内部错误' };
    const counted = simulator && typeof data === 'string' ? data.length : next.byteLength;
    if (counted > this.fileLimitBytes) return this.fail(10028, '写入文件单个超过 10M 或者写入文件夹超过 50M');
    const replaced = this.overwriteCountsOldSize ? 0 : (this.files.get(path)?.byteLength ?? 0);
    if (this.usedBytes(parentOf(path)) - replaced + next.byteLength > this.folderLimitBytes) {
      return this.fail(10028, '写入文件单个超过 10M 或者写入文件夹超过 50M');
    }
    this.files.set(path, next);
    return SUCCESS;
  }

  unlinkSync(path: string): unknown {
    if (this.directories.has(path)) return this.fail(10024, '不能删除目录');
    return this.files.delete(path) ? SUCCESS : this.fail(10022, '文件不存在');
  }

  rmdirSync(path: string, recursive?: boolean): unknown {
    if (!this.directories.has(path)) return this.fail(10022, '目录不存在');
    const children = [...this.files.keys(), ...this.directories].filter(entry => isUnder(entry, path));
    if (children.length > 0 && !recursive) return this.fail(10027, '目录不为空');
    for (const child of children) {
      this.files.delete(child);
      this.directories.delete(child);
    }
    this.directories.delete(path);
    return SUCCESS;
  }

  renameSync(oldPath: string, newPath: string): unknown {
    const bytes = this.files.get(oldPath);
    if (!bytes) return this.fail(10022, '文件不存在');
    if (this.mode === 'simulator' && this.exists(newPath)) return this.fail(10025, '有同名文件或目录');
    this.files.delete(oldPath);
    this.files.set(newPath, bytes);
    return SUCCESS;
  }

  statSync(path: string): unknown {
    if (this.directories.has(path)) return { stats: stats(0, true), success: true };
    const bytes = this.files.get(path);
    return bytes ? { stats: stats(bytes.byteLength, false), success: true } : this.fail(10022, '文件不存在');
  }

  readdirSync(path: string): unknown {
    if (!this.directories.has(path)) return this.fail(10022, '目录不存在');
    const entries = [...this.files.keys(), ...this.directories].filter(entry => parentOf(entry) === path);
    return { files: entries.map(entry => entry.slice(path.length + 1)), success: true };
  }

  private readCodePackage(path: string): Uint8Array | undefined {
    const bytes = this.codePackage.get(path);
    if (!bytes || this.mode === 'ios') return bytes;
    // 模拟器按 UTF-8 解码再编码回来：非法序列变成 U+FFFD
    return Buffer.from(Buffer.from(bytes).toString('utf8'));
  }

  /** 按两端实测的字节语义把写入数据变成落盘字节；模拟器拒收 `Uint8Array` 时返回 `undefined`。 */
  private encode(data: string | ArrayBuffer | Uint8Array, encoding?: string): Uint8Array | undefined {
    if (typeof data === 'string') return Uint8Array.from(Buffer.from(data, encoding === 'base64' ? 'base64' : 'utf8'));
    if (data instanceof Uint8Array) return this.mode === 'simulator' ? undefined : new Uint8Array(0);
    const bytes = new Uint8Array(data.slice(0));
    if (this.mode === 'ios') return bytes;
    return Uint8Array.from(Buffer.from(Buffer.from(bytes).toString('base64'), 'utf8'));
  }

  private exists(path: string): boolean {
    return this.files.has(path) || this.directories.has(path);
  }

  /** 计入文件夹上限的已用字节：`direct-folder` 只算 `folder` 的直接子文件。 */
  private usedBytes(folder: string): number {
    let total = 0;
    for (const [path, bytes] of this.files) {
      if (this.folderLimitScope === 'user-dir' || parentOf(path) === folder) total += bytes.byteLength;
    }
    return total;
  }

  private fail(error: number, errorMessage: string): AlipayFsFailure {
    return this.mode === 'ios' ? { error, message: errorMessage, errorMessage } : { error, errorMessage };
  }
}

interface WorkerGlobal {
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
}

/**
 * 在独立 realm 里跑包里的 Worker 脚本。消息双向结构化复制、经 `setTimeout` 投递，模拟跨线程分发；
 * `terminate` 之后两个方向的消息都丢弃。
 */
function startWorker(options: FakeAlipayOptions, onTerminate: () => void): AlipayWorker {
  let toLogic: ((message: unknown) => void) | undefined;
  let toWorker: ((message: unknown) => void) | undefined;
  let alive = true;
  const deliver = (listener: ((message: unknown) => void) | undefined, message: unknown) => {
    const copy: unknown = structuredClone(message);
    setTimeout(() => {
      if (alive) listener?.(copy);
    }, 0);
  };
  const worker: WorkerGlobal = {
    postMessage: message => deliver(toLogic, message),
    onMessage: listener => {
      toWorker = listener;
    }
  };
  const context = createContext(options.withoutWorkerCrypto ? { worker } : { worker, crypto: webcrypto });
  runInContext(randomWorkerScript, context, { filename: 'workers/index.js' });
  return {
    postMessage: message => deliver(toWorker, message),
    onMessage: listener => {
      toLogic = listener;
    },
    terminate() {
      if (alive) onTerminate();
      alive = false;
    }
  };
}

/** 造一个支付宝替身。 */
export function createFakeAlipay(options: FakeAlipayOptions = {}): FakeAlipay {
  const mode = options.mode ?? 'ios';
  const fileSystem = new FakeRawFileSystem(
    mode,
    codePackage(mode, options.codePackageWasm ?? wasmBytes),
    options.fileLimitBytes ?? 10 * MIB,
    options.folderLimitBytes ?? 50 * MIB,
    options.folderLimitScope ?? 'user-dir',
    options.overwriteCountsOldSize ?? false
  );
  const clipboard: string[] = [];
  let liveWorkers = 0;
  const my: AlipayApi = {
    SDKVersion: options.sdkVersion ?? '2.10.42',
    env: { USER_DATA_PATH: FAKE_USER_DATA_PATH },
    getFileSystemManager: () => fileSystem,
    arrayBufferToBase64: buffer => Buffer.from(buffer).toString('base64'),
    base64ToArrayBuffer: base64 => toArrayBuffer(Buffer.from(base64, 'base64')),
    getSystemInfoSync: () => ({ platform: 'node', app: 'Node 测试替身，非实验证据', version: '0.0.0' }),
    canIUse: name => name !== 'getRandomValues',
    setClipboard({ text, success }) {
      clipboard.push(text);
      setTimeout(() => success?.(), 0);
    }
  };
  if (!options.withoutWorker) {
    Object.assign(my, {
      createWorker: () => {
        liveWorkers++;
        return startWorker(options, () => liveWorkers--);
      }
    });
  }
  return {
    my,
    wasm: options.withoutLogicWasm ? undefined : WebAssembly,
    files: fileSystem.files,
    directories: fileSystem.directories,
    clipboard,
    liveWorkers: () => liveWorkers
  };
}
