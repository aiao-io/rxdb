/**
 * @fileoverview 逻辑层 WASM：标准 `WebAssembly` 在不在、代码包里的 `.wasm` 用什么路径读得到、能不能实例化。
 *
 * 支付宝文档只写了 Worker 里的 `MYWebAssembly`；v2 探针在模拟器与 iOS 的逻辑层都实测到标准 `WebAssembly`，
 * 实验 host 走的就是它（字节经同步 FS 从代码包里的 base64 文本副本读出）。另外对比 wa-sqlite.wasm 的
 * 二进制读与文本副本：模拟器的二进制读会把非法 UTF-8 序列改写成 `EF BF BD`，真机是否原样是待测项。
 */
import type { AlipayApi, StandardWasmApi } from '../alipay-api.js';
import type { AlipayProbeFileSystem } from '../alipay-fs.js';
import { createAlipayWasmRuntime, WASM_TEXT_SUFFIX } from '../alipay-host.js';
import { probe, withTimeout, type Probe, type Skipped } from '../probe.js';
import { ADAPTER_DEFAULT_WASM_PATH } from '../vfs-classifiers.js';

/** 探针自带的 `add(a, b)` 模块，相对代码包根。 */
export const ADD_WASM_PATH = 'wasm/add.wasm';

/** 读代码包文件的候选写法：相对、绝对，以及 adapter 默认的相对路径。 */
export const CODE_PACKAGE_READ_CANDIDATES = [ADD_WASM_PATH, `/${ADD_WASM_PATH}`, ADAPTER_DEFAULT_WASM_PATH] as const;

const INSTANTIATE_TIMEOUT_MS = 30_000;

/** wa-sqlite.wasm 的二进制读与 base64 文本副本的对比。 */
export interface CodePackageBinaryReport {
  /** `readBinarySync` 读出的字节数。 */
  readonly binaryBytes: number;
  /** 文本副本解码后的字节数，即 wasm 的真实大小。 */
  readonly textBytes: number;
  readonly bytesMatch: boolean;
}

/** 逻辑层 WASM 实验的结果。 */
export interface WasmReport {
  readonly standardAvailable: boolean;
  /** 每个候选写法读出的字节数。 */
  readonly codePackageReads: Readonly<Record<string, Probe<number>>>;
  /** 代码包的二进制读是否原样。 */
  readonly codePackageBinary: Probe<CodePackageBinaryReport>;
  /** 经实验 host 的 wasm 运行时实例化 `add.wasm` 后 `add(2, 3)` 的返回值。 */
  readonly add: Probe<unknown> | Skipped;
}

type Base64Decoder = Pick<AlipayApi, 'base64ToArrayBuffer'>;

function compareCodePackageBinary(fileSystem: AlipayProbeFileSystem, my: Base64Decoder): CodePackageBinaryReport {
  const binary = new Uint8Array(fileSystem.readBinarySync(ADAPTER_DEFAULT_WASM_PATH));
  const text = new Uint8Array(
    my.base64ToArrayBuffer(fileSystem.readTextSync(`${ADAPTER_DEFAULT_WASM_PATH}${WASM_TEXT_SUFFIX}`))
  );
  const bytesMatch = binary.byteLength === text.byteLength && binary.every((byte, index) => byte === text[index]);
  return { binaryBytes: binary.byteLength, textBytes: text.byteLength, bytesMatch };
}

async function instantiateAdd(
  fileSystem: AlipayProbeFileSystem,
  wasm: StandardWasmApi,
  my: Base64Decoder
): Promise<unknown> {
  const pending = createAlipayWasmRuntime(fileSystem, wasm, my).instantiate(ADD_WASM_PATH, {});
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
 */
export async function runWasmExperiment(
  fileSystem: AlipayProbeFileSystem,
  wasm: StandardWasmApi | undefined,
  my: Base64Decoder
): Promise<WasmReport> {
  const codePackageReads: Record<string, Probe<number>> = {};
  for (const path of CODE_PACKAGE_READ_CANDIDATES) {
    codePackageReads[path] = await probe(() => fileSystem.readBinarySync(path).byteLength);
  }
  const codePackageBinary = await probe(() => compareCodePackageBinary(fileSystem, my));
  const add =
    wasm ? await probe(() => instantiateAdd(fileSystem, wasm, my)) : { skipped: '逻辑层没有标准 WebAssembly' };
  return { standardAvailable: wasm !== undefined, codePackageReads, codePackageBinary, add };
}
