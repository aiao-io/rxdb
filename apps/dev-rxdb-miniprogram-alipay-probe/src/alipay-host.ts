/**
 * @fileoverview 实验专用的支付宝 host 与 wasm 运行时。**不是 adapter 的正式实现。**
 *
 * 支付宝已判 unsupported，不在 `MINI_PROGRAM_PLATFORM_IDS` 里，实验只能借用 `wechat` 平台 id 才能把 host
 * 交给 adapter 的公开 API；平台 id 在 adapter 里只做登记校验，不改变任何行为。走的是 adapter 真实的引导、
 * 文件 VFS 与 SQLite 路径，差别只在 FS 包装层（见 `alipay-fs.ts`）和随机源（经 Worker 桥接）。
 */
import type { MiniProgramWasmRuntime } from '@aiao/rxdb-adapter-miniprogram';
import type {
  MiniProgramFileLayout,
  MiniProgramHost,
  MiniProgramRuntimeGlobal
} from '@aiao/rxdb-adapter-miniprogram/runtime';
import type { AlipayApi, StandardWasmApi } from './alipay-api.js';
import type { AlipayProbeFileSystem } from './alipay-fs.js';
import { matchesFingerprint, type WasmFingerprint, type WasmFingerprints } from './wasm-fingerprint.js';

/**
 * 分块布局：支付宝没有局部写，每次 flush 都整文件重写；单文件 10M 上限也只有分块才碰不到。
 * 与抖音同取 64 KiB。
 */
const ALIPAY_FILE_LAYOUT: MiniProgramFileLayout = Object.freeze({ kind: 'chunked', chunkBytes: 64 * 1024 });

/**
 * 组装实验 host。
 *
 * 不设 `defaultWasmPath`：adapter 默认的相对路径 `wa-sqlite/wa-sqlite.wasm` 由 {@link createAlipayWasmRuntime}
 * 按代码包相对路径读（模拟器实测只有相对路径可读），按构建指纹选原文件或 base64 文本副本。
 *
 * @param my - 支付宝全局 `my`，只读 `env.USER_DATA_PATH`
 * @param fileSystem - 包装后的同步 FS
 * @param requestRandomValues - 随机源；逻辑层没有，实验经 Worker 桥接，失败原样 reject
 * @param runtimeGlobal - 构建 banner 找到的真实全局对象；`globalThis` 可用时不传
 */
export function createAlipayProbeHost(
  my: Pick<AlipayApi, 'env'>,
  fileSystem: AlipayProbeFileSystem,
  requestRandomValues: (length: number) => Promise<Uint8Array>,
  runtimeGlobal?: MiniProgramRuntimeGlobal
): MiniProgramHost {
  const userDataPath = my.env?.USER_DATA_PATH;
  return {
    platform: 'wechat',
    displayName: '支付宝小程序（实验）',
    shortName: '支付宝',
    wasmRuntimeName: 'WebAssembly',
    capabilityNames: { fileSystem: 'my.getFileSystemManager', userDataPath: 'my.env.USER_DATA_PATH' },
    // 与 adapter 的 usableUserDataPath 同义；它不从 runtime 导出
    userDataPath: typeof userDataPath === 'string' && userDataPath !== '' ? userDataPath : undefined,
    ...(runtimeGlobal === undefined ? {} : { runtimeGlobal }),
    fileLayout: ALIPAY_FILE_LAYOUT,
    getFileSystemManager: () => fileSystem,
    requestRandomValues
  };
}

/**
 * 构建脚本给代码包里每个 wasm 放的 base64 文本副本的后缀。
 *
 * 模拟器把代码包文件当 UTF-8 文本读，不论传什么编码，非法字节序列都变成 `EF BF BD`（CDP 直调实测：
 * 727646 字节的 wa-sqlite.wasm 读回 814795 字节）；base64 只含 ASCII，读回原样。
 * iOS 真机调试的代码包里没有这份副本（v3 探针实测 10022），`.wasm` 原文件读回 727646 字节；
 * 副本照样随包构建，只给模拟器用（带上副本 dist 约 2.07 MB，真机反正不收它）。
 */
export const WASM_TEXT_SUFFIX = '.base64.txt';

/** wasm 字节的来源：代码包里的 `.wasm` 原文件，或它的 base64 文本副本。 */
export type WasmByteSource = 'binary' | 'textCopy';

/** {@link readCodePackageWasm} 的结果。 */
export interface CodePackageWasm {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly source: WasmByteSource;
}

type Base64Decoder = Pick<AlipayApi, 'base64ToArrayBuffer'>;

function readTextCopy(
  fileSystem: AlipayProbeFileSystem,
  my: Base64Decoder,
  path: string,
  binaryBytes: number,
  expected: WasmFingerprint
): Uint8Array<ArrayBuffer> {
  try {
    return new Uint8Array(my.base64ToArrayBuffer(fileSystem.readTextSync(`${path}${WASM_TEXT_SUFFIX}`)));
  } catch (cause) {
    const sizes = `${String(binaryBytes)} / ${String(expected.bytes)} 字节`;
    throw new Error(`${path} 的二进制读与构建指纹不符（${sizes}），base64 文本副本也读不出`, { cause });
  }
}

/**
 * 按构建指纹从代码包读 wasm：先读 `.wasm` 原文件，与指纹一致就用；不一致（模拟器把二进制当 UTF-8 文本读）
 * 再读 base64 文本副本，副本也得与指纹一致。两者都不符就抛错，改写过的字节不交给 `WebAssembly`。
 *
 * @param fileSystem - 包装后的同步 FS
 * @param my - 支付宝全局 `my`，只用 `base64ToArrayBuffer`
 * @param fingerprints - 构建脚本记下的指纹
 * @param path - 相对代码包根的路径
 */
export function readCodePackageWasm(
  fileSystem: AlipayProbeFileSystem,
  my: Base64Decoder,
  fingerprints: WasmFingerprints,
  path: string
): CodePackageWasm {
  const expected = fingerprints[path];
  if (expected === undefined) throw new Error(`构建没给 ${path} 记指纹`);
  const binary = new Uint8Array(fileSystem.readBinarySync(path));
  if (matchesFingerprint(binary, expected)) return { bytes: binary, source: 'binary' };
  const copy = readTextCopy(fileSystem, my, path, binary.byteLength, expected);
  if (matchesFingerprint(copy, expected)) return { bytes: copy, source: 'textCopy' };
  const sizes = `${String(copy.byteLength)} / ${String(expected.bytes)} 字节`;
  throw new Error(`${path} 的 base64 文本副本解码后与构建指纹不符（${sizes}）`);
}

/**
 * 逻辑层的 wasm 运行时：按 {@link readCodePackageWasm} 取字节，交给标准 `WebAssembly.instantiate`。
 *
 * 支付宝文档只写了 Worker 里的 `MYWebAssembly`，逻辑层的标准 `WebAssembly` 是 v2 探针在模拟器与 iOS 上实测到的。
 *
 * @param fileSystem - 包装后的同步 FS
 * @param wasm - 逻辑层的标准 `WebAssembly`
 * @param my - 支付宝全局 `my`，只用 `base64ToArrayBuffer`
 * @param fingerprints - 构建脚本记下的指纹
 */
export function createAlipayWasmRuntime(
  fileSystem: AlipayProbeFileSystem,
  wasm: StandardWasmApi,
  my: Base64Decoder,
  fingerprints: WasmFingerprints
): MiniProgramWasmRuntime {
  return {
    instantiate: async (path, imports) =>
      wasm.instantiate(readCodePackageWasm(fileSystem, my, fingerprints, path).bytes, imports)
  };
}
