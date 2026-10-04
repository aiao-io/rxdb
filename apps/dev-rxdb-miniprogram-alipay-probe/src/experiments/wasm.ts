/**
 * @fileoverview 逻辑层 WASM：标准 `WebAssembly` 在不在、代码包里的 `.wasm` 用什么路径读得到、能不能实例化。
 *
 * 支付宝文档只写了 Worker 里的 `MYWebAssembly`；v2 探针在模拟器与 iOS 的逻辑层都实测到标准 `WebAssembly`，
 * 实验 host 走的就是它，字节按构建指纹从 `.wasm` 原文件或 base64 文本副本里选（见 `readCodePackageWasm`）。
 * 另外把 wa-sqlite.wasm 的二进制读与构建指纹对比：模拟器会把非法 UTF-8 序列改写成 `EF BF BD`，
 * iOS 真机调试读回的字节数与原文件一致（v3 实测），是否逐字节原样由指纹回答。
 */
import type { AlipayApi, StandardWasmApi } from '../alipay-api.js';
import type { AlipayProbeFileSystem } from '../alipay-fs.js';
import { createAlipayWasmRuntime, readCodePackageWasm, type WasmByteSource } from '../alipay-host.js';
import { probe, withTimeout, type Probe, type Skipped } from '../probe.js';
import { ADAPTER_DEFAULT_WASM_PATH } from '../vfs-classifiers.js';
import { matchesFingerprint, type WasmFingerprints } from '../wasm-fingerprint.js';

/** 探针自带的 `add(a, b)` 模块，相对代码包根。 */
export const ADD_WASM_PATH = 'wasm/add.wasm';

/** 读代码包文件的候选写法：相对、绝对，以及 adapter 默认的相对路径。 */
export const CODE_PACKAGE_READ_CANDIDATES = [ADD_WASM_PATH, `/${ADD_WASM_PATH}`, ADAPTER_DEFAULT_WASM_PATH] as const;

/** 记录选源结果的 wasm：探针自带的模块与 adapter 默认路径。 */
export const FINGERPRINTED_WASM_PATHS = [ADD_WASM_PATH, ADAPTER_DEFAULT_WASM_PATH] as const;

const INSTANTIATE_TIMEOUT_MS = 30_000;

/** wa-sqlite.wasm 的二进制读与构建指纹的对比。 */
export interface CodePackageBinaryReport {
  /** `readBinarySync` 读出的字节数。 */
  readonly binaryBytes: number;
  /** 构建指纹记下的字节数，即 wasm 的真实大小。 */
  readonly expectedBytes: number;
  /** 二进制读与构建指纹（字节数 + FNV-1a）一致。 */
  readonly bytesMatch: boolean;
}

/** 逻辑层 WASM 实验的结果。 */
export interface WasmReport {
  readonly standardAvailable: boolean;
  /** 每个候选写法读出的字节数。 */
  readonly codePackageReads: Readonly<Record<string, Probe<number>>>;
  /** 代码包的二进制读是否原样。 */
  readonly codePackageBinary: Probe<CodePackageBinaryReport>;
  /** 每个 wasm 按构建指纹选到的字节来源；核心实验的 wasm 运行时用的是同一规则。 */
  readonly sources: Readonly<Record<string, Probe<WasmByteSource>>>;
  /** 经实验 host 的 wasm 运行时实例化 `add.wasm` 后 `add(2, 3)` 的返回值。 */
  readonly add: Probe<unknown> | Skipped;
}

type Base64Decoder = Pick<AlipayApi, 'base64ToArrayBuffer'>;

function compareCodePackageBinary(
  fileSystem: AlipayProbeFileSystem,
  fingerprints: WasmFingerprints
): CodePackageBinaryReport {
  const expected = fingerprints[ADAPTER_DEFAULT_WASM_PATH];
  if (expected === undefined) throw new Error(`构建没给 ${ADAPTER_DEFAULT_WASM_PATH} 记指纹`);
  const binary = new Uint8Array(fileSystem.readBinarySync(ADAPTER_DEFAULT_WASM_PATH));
  return {
    binaryBytes: binary.byteLength,
    expectedBytes: expected.bytes,
    bytesMatch: matchesFingerprint(binary, expected)
  };
}

async function instantiateAdd(
  fileSystem: AlipayProbeFileSystem,
  wasm: StandardWasmApi,
  my: Base64Decoder,
  fingerprints: WasmFingerprints
): Promise<unknown> {
  const pending = createAlipayWasmRuntime(fileSystem, wasm, my, fingerprints).instantiate(ADD_WASM_PATH, {});
  const result = await withTimeout(pending, INSTANTIATE_TIMEOUT_MS, `instantiate(${ADD_WASM_PATH})`);
  const instance = 'instance' in result ? result.instance : result;
  const add: unknown = instance.exports['add'];
  if (typeof add !== 'function') throw new Error(`实例没有导出 add 函数：${typeof add}`);
  return add(2, 3) as unknown;
}

/**
 * 跑逻辑层 WASM 实验。
 *
 * @param fileSystem - 包装后的同步 FS
 * @param wasm - 逻辑层的标准 `WebAssembly`；`undefined` 表示没有
 * @param my - 支付宝全局 `my`，只用 `base64ToArrayBuffer`
 * @param fingerprints - 构建脚本记下的 wasm 指纹
 */
export async function runWasmExperiment(
  fileSystem: AlipayProbeFileSystem,
  wasm: StandardWasmApi | undefined,
  my: Base64Decoder,
  fingerprints: WasmFingerprints
): Promise<WasmReport> {
  const codePackageReads: Record<string, Probe<number>> = {};
  for (const path of CODE_PACKAGE_READ_CANDIDATES) {
    codePackageReads[path] = await probe(() => fileSystem.readBinarySync(path).byteLength);
  }
  const codePackageBinary = await probe(() => compareCodePackageBinary(fileSystem, fingerprints));
  const sources: Record<string, Probe<WasmByteSource>> = {};
  for (const path of FINGERPRINTED_WASM_PATHS) {
    sources[path] = await probe(() => readCodePackageWasm(fileSystem, my, fingerprints, path).source);
  }
  const add =
    wasm ?
      await probe(() => instantiateAdd(fileSystem, wasm, my, fingerprints))
    : { skipped: '逻辑层没有标准 WebAssembly' };
  return { standardAvailable: wasm !== undefined, codePackageReads, codePackageBinary, sources, add };
}
