/**
 * @fileoverview Node 侧的抖音 `tt` / `TTWebAssembly` 测试替身。**不是实验证据。**
 *
 * 错误码与 errMsg 模板取自抖音开放平台各同步方法的错误码表；模板里的两个 `%s` 按「方法名 路径」
 * 填（**推断**）。同步方法抛出值的形状文档没写，所以两种都支持：普通对象 `{ errMsg, errNo }`
 * 与带 `errNo` 的 `Error`。wasm 用真实的 `@subframe7536/sqlite-wasm` 字节。
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type {
  DouyinApi,
  DouyinFileSystemManager,
  DouyinStat,
  DouyinStatEntry,
  DouyinWasmRuntime
} from '../douyin-api.js';

/** 与真机一致的用户目录。 */
export const FAKE_USER_DATA_PATH = 'ttfile://user';

/** 文档原文：每个小程序的用户目录存储上限为 10M。 */
const DOCUMENTED_QUOTA_BYTES = 10 * 1024 * 1024;

/** 文档：`length` 取 1～1048576。 */
const DOCUMENTED_RANDOM_MAX_LENGTH = 1_048_576;

// 锚定在 adapter 包上解析：本 app 没有自己的 package.json，wasm 依赖挂在 adapter 名下
const adapterRequire = createRequire(
  new URL('../../../../packages/rxdb-adapter-miniprogram/package.json', import.meta.url)
);

/** 与 adapter 打包的 glue 同源的 wasm 字节。 */
export const wasmBytes = Uint8Array.from(readFileSync(adapterRequire.resolve('@subframe7536/sqlite-wasm/wasm')));

/** 替身的可调参数。 */
export interface FakeDouyinOptions {
  /** 用户目录配额，默认按文档 10 MiB。 */
  readonly quotaBytes?: number;
  /** 同步方法抛出值的形状。 */
  readonly errorShape?: 'plain' | 'error';
  /** `TTWebAssembly` 认可的路径写法，默认只认相对路径。 */
  readonly acceptedWasmPaths?: readonly string[];
  /** `getSystemInfoSync().SDKVersion`。 */
  readonly sdkVersion?: string;
  /** 不提供 `tt.getRandomValues`。 */
  readonly withoutRandomValues?: boolean;
}

/** 替身本体与可供断言的内部状态。 */
export interface FakeDouyin {
  readonly tt: DouyinApi;
  readonly wasm: DouyinWasmRuntime;
  readonly files: Map<string, Uint8Array>;
  readonly directories: Set<string>;
  readonly clipboard: string[];
}

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

function isUnder(path: string, directory: string): boolean {
  return path.startsWith(`${directory}/`);
}

function fileStat(size: number, directory: boolean): DouyinStat {
  return { size, isDirectory: () => directory, isFile: () => !directory };
}

class FakeFileSystem implements DouyinFileSystemManager {
  readonly files = new Map<string, Uint8Array>();
  readonly directories = new Set<string>([FAKE_USER_DATA_PATH]);

  constructor(
    private readonly quotaBytes: number,
    private readonly errorShape: 'plain' | 'error'
  ) {}

  accessSync(path: string): void {
    if (!this.exists(path)) this.fail(108802, 'no such file or directory', 'accessSync', path);
  }

  mkdirSync(path: string, recursive?: boolean): void {
    if (this.exists(path)) this.fail(108502, 'file already exists', 'mkdirSync', path);
    if (!recursive && !this.directories.has(parentOf(path))) {
      this.fail(108503, 'no such file or directory', 'mkdirSync', path);
    }
    for (let current = path; current.length > FAKE_USER_DATA_PATH.length; current = parentOf(current)) {
      this.directories.add(current);
    }
  }

  readFileSync(path: string): string {
    const bytes = this.files.get(path);
    if (!bytes) return this.fail(108303, 'no such file or directory', 'readFileSync', path);
    return Buffer.from(bytes).toString('base64');
  }

  unlinkSync(path: string): void {
    if (this.directories.has(path)) this.fail(108903, 'operation not permitted', 'unlinkSync', path);
    if (!this.files.delete(path)) this.fail(108902, 'no such file or directory', 'unlinkSync', path);
  }

  writeFileSync(path: string, data: ArrayBuffer): void {
    if (!this.directories.has(parentOf(path))) this.fail(108402, 'no such file or directory', 'writeFileSync', path);
    const next = new Uint8Array(data.slice(0));
    const used = this.usedBytes() - (this.files.get(path)?.byteLength ?? 0);
    if (used + next.byteLength > this.quotaBytes) this.failWith(108403, 'user dir saved file size limit exceeded');
    this.files.set(path, next);
  }

  rmdirSync(path: string, recursive?: boolean): void {
    if (!this.directories.has(path)) this.fail(108702, 'no such file or directory', 'rmdirSync', path);
    const children = [...this.files.keys(), ...this.directories].filter(entry => isUnder(entry, path));
    if (children.length > 0 && !recursive) this.failWith(108703, 'directory not empty');
    for (const child of children) {
      this.files.delete(child);
      this.directories.delete(child);
    }
    this.directories.delete(path);
  }

  statSync(path: string, recursive?: boolean): DouyinStat | readonly DouyinStatEntry[] {
    if (!this.exists(path)) this.fail(109002, 'no such file or directory', 'statSync', path);
    if (!this.directories.has(path)) return fileStat(this.files.get(path)?.byteLength ?? 0, false);
    if (!recursive) return fileStat(0, true);
    const entries: DouyinStatEntry[] = [{ path, stat: fileStat(0, true) }];
    for (const directory of this.directories) {
      if (isUnder(directory, path)) entries.push({ path: directory, stat: fileStat(0, true) });
    }
    for (const [file, bytes] of this.files) {
      if (isUnder(file, path)) entries.push({ path: file, stat: fileStat(bytes.byteLength, false) });
    }
    return entries;
  }

  private exists(path: string): boolean {
    return this.files.has(path) || this.directories.has(path);
  }

  private usedBytes(): number {
    let total = 0;
    for (const bytes of this.files.values()) total += bytes.byteLength;
    return total;
  }

  private fail(errNo: number, reason: string, method: string, path: string): never {
    return this.failWith(errNo, `${reason}, ${method} ${path}`);
  }

  private failWith(errNo: number, errMsg: string): never {
    if (this.errorShape === 'error') throw Object.assign(new Error(errMsg), { errNo });
    throw { errMsg, errNo };
  }
}

function createFakeWasm(accepted: readonly string[]): DouyinWasmRuntime {
  const assertAccepted = (method: string, path: string): Promise<void> =>
    accepted.includes(path) ? Promise.resolve() : Promise.reject({ errMsg: `${method}:fail ${path} not found` });
  return {
    async compile(path) {
      await assertAccepted('compile', path);
      return WebAssembly.compile(wasmBytes);
    },
    async instantiate(path, imports) {
      await assertAccepted('instantiate', path);
      const result = await WebAssembly.instantiate(wasmBytes, imports);
      return { instance: result.instance, module: result.module };
    }
  };
}

/** 造一个抖音替身；随机源与回调都走 `setTimeout`，模拟平台的异步分发。 */
export function createFakeDouyin(options: FakeDouyinOptions = {}): FakeDouyin {
  const fileSystem = new FakeFileSystem(options.quotaBytes ?? DOCUMENTED_QUOTA_BYTES, options.errorShape ?? 'plain');
  const clipboard: string[] = [];
  const tt: DouyinApi = {
    env: { USER_DATA_PATH: FAKE_USER_DATA_PATH },
    getFileSystemManager: () => fileSystem,
    getSystemInfoSync: () => ({
      SDKVersion: options.sdkVersion ?? '3.0.0',
      appName: 'Node 测试替身，非实验证据',
      platform: 'node'
    }),
    setClipboardData({ data, success }) {
      clipboard.push(data);
      setTimeout(() => success?.(), 0);
    }
  };
  if (!options.withoutRandomValues) {
    Object.assign(tt, {
      getRandomValues: ({ length, success, fail }: Parameters<NonNullable<DouyinApi['getRandomValues']>>[0]) => {
        setTimeout(() => {
          if (length < 1 || length > DOCUMENTED_RANDOM_MAX_LENGTH) {
            fail?.({ errMsg: `getRandomValues:fail invalid length ${length}` });
            return;
          }
          success?.({ randomValues: Uint8Array.from(randomBytes(length)).buffer });
        }, 0);
      }
    });
  }
  return {
    tt,
    wasm: createFakeWasm(options.acceptedWasmPaths ?? ['wa-sqlite/wa-sqlite.wasm']),
    files: fileSystem.files,
    directories: fileSystem.directories,
    clipboard
  };
}
