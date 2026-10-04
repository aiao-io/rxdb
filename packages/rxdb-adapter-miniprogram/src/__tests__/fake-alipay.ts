/**
 * @fileoverview 支付宝全局 `my` 与随机数 Worker 的测试替身。**不是实验证据。**
 *
 * 形态取自 US-211 支付宝探针 v2–v6 的实测报告（开发者工具模拟器、iOS 真机）：
 *
 * - 同步 FS 失败时返回错误对象而不抛；`ios` 的错误对象多一个与 `errorMessage` 同文的 `message`；
 * - `simulator` 拒绝任何空写入（error 2「接口参数无效」）、父目录不存在时自动建出、单文件上限比的是传入的 base64 串长；
 * - 配额按文档 10028「单个超过 10M 或者文件夹超过 50M」建模，文件夹按整个用户目录算（**推断**）；
 * - 代码包文件只认相对路径；`simulator` 把代码包文件当 UTF-8 文本读，非法字节序列一律变成 `EF BF BD`，
 *   并且有构建脚本放的 `.base64.txt` 文本副本；`ios` 的代码包里没有文本副本（10022）。
 *
 * Worker 替身在 `node:vm` 里执行包里真实的 `alipay-random-worker.js`，消息经结构化复制、`setTimeout` 投递。
 */
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import type {
  AlipayFsFailure,
  AlipayRandomWorker,
  MiniProgramAlipayApi,
  MiniProgramAlipayRawFileSystem
} from '../hosts/alipay-api.js';
import { wasmBytes } from './subframe-wasm-factory.js';

/** 两端实测的用户目录。 */
export const FAKE_ALIPAY_USER_DATA_PATH = 'https://usr';

/** 构建脚本给代码包 wasm 放的 base64 文本副本的后缀。 */
const TEXT_COPY_SUFFIX = '.base64.txt';

const MIB = 1024 * 1024;

/** 包里真实的 Worker 脚本。 */
export const ALIPAY_RANDOM_WORKER_SOURCE = readFileSync(
  new URL('../workers/alipay-random-worker.js', import.meta.url),
  'utf8'
);

/** 替身的可调参数。 */
export interface FakeAlipayOptions {
  /** 按哪一端的实测形态建模，默认 `ios`。 */
  readonly mode?: 'ios' | 'simulator';
  /** 单个文件上限，默认按文档 10 MiB。 */
  readonly fileLimitBytes?: number;
  /** 用户目录总上限，默认按文档 50 MiB。 */
  readonly folderLimitBytes?: number;
  /** 代码包里的 wasm，键是相对代码包根的路径；默认只有 `wa-sqlite/wa-sqlite.wasm`。 */
  readonly codePackage?: ReadonlyMap<string, Uint8Array>;
}

/** 替身本体与可供断言的内部状态。 */
export interface FakeAlipay {
  readonly my: MiniProgramAlipayApi;
  readonly files: Map<string, Uint8Array>;
  readonly directories: Set<string>;
  /** 写入调用的原始参数，按顺序。 */
  readonly writes: { readonly path: string; readonly data: unknown; readonly encoding: unknown }[];
}

const SUCCESS = Object.freeze({ success: true });

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

class FakeRawFileSystem implements MiniProgramAlipayRawFileSystem {
  readonly files = new Map<string, Uint8Array>();
  readonly directories = new Set<string>([FAKE_ALIPAY_USER_DATA_PATH]);
  readonly writes: FakeAlipay['writes'] = [];

  constructor(
    private readonly mode: 'ios' | 'simulator',
    private readonly fileLimitBytes: number,
    private readonly folderLimitBytes: number,
    private readonly codePackage: ReadonlyMap<string, Uint8Array>
  ) {}

  accessSync(path: string): unknown {
    return this.exists(path) ? SUCCESS : this.fail(10022, '文件不存在');
  }

  mkdirSync(path: string, recursive?: boolean): unknown {
    if (this.exists(path)) return this.fail(10025, '有同名文件或目录');
    if (!recursive && !this.directories.has(parentOf(path))) return this.fail(10022, '目录不存在');
    for (let current = path; current.length > FAKE_ALIPAY_USER_DATA_PATH.length; current = parentOf(current)) {
      this.directories.add(current);
    }
    return SUCCESS;
  }

  readFileSync(path: string, encoding?: string): unknown {
    const bytes = this.files.get(path) ?? this.readCodePackage(path);
    if (!bytes) return this.fail(10022, '文件不存在');
    if (encoding === 'utf8') return { data: Buffer.from(bytes).toString('utf8'), success: true };
    return { data: toArrayBuffer(bytes), dataType: 'ArrayBuffer', success: true };
  }

  writeFileSync(path: string, data: unknown, encoding?: unknown): unknown {
    this.writes.push({ path, data, encoding });
    if (typeof data !== 'string' || encoding !== 'base64') return { errorCode: '90000', errorMessage: '内部错误' };
    const simulator = this.mode === 'simulator';
    if (simulator && data.length === 0) return this.fail(2, '接口参数无效');
    if (simulator) this.mkdirSync(parentOf(path), true);
    if (!this.directories.has(parentOf(path))) return this.fail(10022, '目录不存在');
    const next = Uint8Array.from(Buffer.from(data, 'base64'));
    const counted = simulator ? data.length : next.byteLength;
    const replaced = this.files.get(path)?.byteLength ?? 0;
    if (counted > this.fileLimitBytes || this.usedBytes() - replaced + next.byteLength > this.folderLimitBytes) {
      return this.fail(10028, '写入文件单个超过 10M 或者写入文件夹超过 50M');
    }
    this.files.set(path, next);
    return SUCCESS;
  }

  unlinkSync(path: string): unknown {
    if (this.directories.has(path)) return this.fail(10024, '不能删除目录');
    return this.files.delete(path) ? SUCCESS : this.fail(10022, '文件不存在');
  }

  private readCodePackage(path: string): Uint8Array | undefined {
    if (this.mode === 'ios') return this.codePackage.get(path);
    const binary = this.codePackage.get(path);
    if (binary) return Buffer.from(Buffer.from(binary).toString('utf8'));
    if (!path.endsWith(TEXT_COPY_SUFFIX)) return undefined;
    const source = this.codePackage.get(path.slice(0, -TEXT_COPY_SUFFIX.length));
    return source ? Buffer.from(Buffer.from(source).toString('base64')) : undefined;
  }

  private exists(path: string): boolean {
    return this.files.has(path) || this.directories.has(path);
  }

  private usedBytes(): number {
    let total = 0;
    for (const bytes of this.files.values()) total += bytes.byteLength;
    return total;
  }

  private fail(error: number, errorMessage: string): AlipayFsFailure {
    return this.mode === 'ios' ? { error, message: errorMessage, errorMessage } : { error, errorMessage };
  }
}

/** 造一个支付宝 `my` 替身。 */
export function createFakeAlipay(options: FakeAlipayOptions = {}): FakeAlipay {
  const fileSystem = new FakeRawFileSystem(
    options.mode ?? 'ios',
    options.fileLimitBytes ?? 10 * MIB,
    options.folderLimitBytes ?? 50 * MIB,
    options.codePackage ?? new Map([['wa-sqlite/wa-sqlite.wasm', wasmBytes]])
  );
  const my: MiniProgramAlipayApi = {
    env: { USER_DATA_PATH: FAKE_ALIPAY_USER_DATA_PATH },
    getFileSystemManager: () => fileSystem,
    arrayBufferToBase64: buffer => Buffer.from(buffer).toString('base64'),
    base64ToArrayBuffer: base64 => toArrayBuffer(Buffer.from(base64, 'base64'))
  };
  return { my, files: fileSystem.files, directories: fileSystem.directories, writes: fileSystem.writes };
}

/** Worker 替身的可调参数。 */
export interface FakeRandomWorkerOptions {
  /** Worker 里的 `crypto`；`null` 表示没有。默认 Node 的 webcrypto。 */
  readonly crypto?: { getRandomValues(array: Uint8Array): unknown } | null;
}

/** Worker 替身与它收到的请求。 */
export interface FakeRandomWorker extends AlipayRandomWorker {
  /** 页面发出的请求，按顺序。 */
  readonly requests: unknown[];
}

/** 在 `node:vm` 里跑包里真实的 Worker 脚本；Worker 的全局只有 `worker` 与（可选的）`crypto`。 */
export function createFakeRandomWorker(options: FakeRandomWorkerOptions = {}): FakeRandomWorker {
  let pageListener: ((message: unknown) => void) | undefined;
  let workerListener: ((message: unknown) => void) | undefined;
  const crypto = options.crypto === undefined ? webcrypto : options.crypto;
  const requests: unknown[] = [];
  const context = createContext({
    worker: {
      onMessage: (listener: (message: unknown) => void) => (workerListener = listener),
      postMessage: (message: object) => {
        const copy: unknown = structuredClone(message);
        setTimeout(() => pageListener?.(copy), 0);
      }
    },
    ...(crypto === null ? {} : { crypto })
  });
  runInContext(ALIPAY_RANDOM_WORKER_SOURCE, context);
  return {
    requests,
    postMessage(message) {
      requests.push(message);
      const copy: unknown = structuredClone(message);
      setTimeout(() => workerListener?.(copy), 0);
    },
    onMessage(listener) {
      pageListener = listener;
    }
  };
}
