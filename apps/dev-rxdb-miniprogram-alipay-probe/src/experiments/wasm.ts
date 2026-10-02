/**
 * @fileoverview 逻辑层 WASM：标准 `WebAssembly` 在不在、代码包里的 `.wasm` 用什么路径读得到、能不能实例化。
 *
 * 支付宝文档只写了 Worker 里的 `MYWebAssembly`；v2 探针在模拟器与 iOS 的逻辑层都实测到标准 `WebAssembly`，
 * 实验 host 走的就是它（字节经同步 FS 从代码包读出）。
 */
import type { StandardWasmApi } from '../alipay-api.js';
import type { AlipayProbeFileSystem } from '../alipay-fs.js';
import { createAlipayWasmRuntime } from '../alipay-host.js';
import { probe, withTimeout, type Probe, type Skipped } from '../probe.js';
import { ADAPTER_DEFAULT_WASM_PATH } from '../vfs-classifiers.js';

/** 探针自带的 `add(a, b)` 模块，相对代码包根。 */
export const ADD_WASM_PATH = 'wasm/add.wasm';

/** 读代码包文件的候选写法：相对、绝对，以及 adapter 默认的相对路径。 */
export const CODE_PACKAGE_READ_CANDIDATES = [ADD_WASM_PATH, `/${ADD_WASM_PATH}`, ADAPTER_DEFAULT_WASM_PATH] as const;

const INSTANTIATE_TIMEOUT_MS = 30_000;

/** 逻辑层 WASM 实验的结果。 */
export interface WasmReport {
  readonly standardAvailable: boolean;
  /** 每个候选写法读出的字节数。 */
  readonly codePackageReads: Readonly<Record<string, Probe<number>>>;
  /** 经实验 host 的 wasm 运行时实例化 `add.wasm` 后 `add(2, 3)` 的返回值。 */
  readonly add: Probe<unknown> | Skipped;
}

async function instantiateAdd(fileSystem: AlipayProbeFileSystem, wasm: StandardWasmApi): Promise<unknown> {
  const pending = createAlipayWasmRuntime(fileSystem, wasm).instantiate(ADD_WASM_PATH, {});
  const result = await withTimeout(pending, INSTANTIATE_TIMEOUT_MS, `instantiate(${ADD_WASM_PATH})`);
  const instance = 'instance' in result ? result.instance : result;
  const add: unknown = instance.exports['add'];
  if (typeof add !== 'function') throw new Error(`实例没有导出 add 函数：${typeof add}`);
  return add(2, 3) as unknown;
}

/** 跑逻辑层 WASM 实验；`wasm` 为 `undefined` 表示逻辑层没有标准 `WebAssembly`。 */
export async function runWasmExperiment(
  fileSystem: AlipayProbeFileSystem,
  wasm: StandardWasmApi | undefined
): Promise<WasmReport> {
  const codePackageReads: Record<string, Probe<number>> = {};
  for (const path of CODE_PACKAGE_READ_CANDIDATES) {
    codePackageReads[path] = await probe(() => fileSystem.readBinarySync(path).byteLength);
  }
  const add = wasm ? await probe(() => instantiateAdd(fileSystem, wasm)) : { skipped: '逻辑层没有标准 WebAssembly' };
  return { standardAvailable: wasm !== undefined, codePackageReads, add };
}
