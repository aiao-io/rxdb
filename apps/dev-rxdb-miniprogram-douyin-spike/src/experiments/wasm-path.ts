/**
 * @fileoverview WASM 路径写法探测：`TTWebAssembly.compile` 认相对路径还是绝对路径，文档没写。
 *
 * 只用 `compile`：`instantiate` 还要 import 对象，失败时分不清是路径错还是链接错。
 */
import type { DouyinWasmRuntime } from '../douyin-api.js';
import { probe, withTimeout, type Probe } from '../probe.js';
import { ADAPTER_DEFAULT_WASM_PATH } from '../vfs-classifiers.js';

/** 候选写法：adapter 默认的相对路径在前。 */
export const WASM_PATH_CANDIDATES = [ADAPTER_DEFAULT_WASM_PATH, `/${ADAPTER_DEFAULT_WASM_PATH}`] as const;

const COMPILE_TIMEOUT_MS = 30_000;

/** 探测结果。 */
export interface WasmPathReport {
  readonly runtimeAvailable: boolean;
  readonly compileAvailable: boolean;
  /** 每个候选写法 compile 的结果，成功值是产物的类型标签。 */
  readonly probes: Readonly<Record<string, Probe<string>>>;
  /** 第一个 compile 成功的写法。 */
  readonly workingPath?: string;
}

/** 逐个候选写法探测。 */
export async function runWasmPathExperiment(wasmRuntime: DouyinWasmRuntime | undefined): Promise<WasmPathReport> {
  const compile = wasmRuntime?.compile;
  if (!wasmRuntime || typeof compile !== 'function') {
    return { runtimeAvailable: !!wasmRuntime, compileAvailable: false, probes: {} };
  }
  const probes: Record<string, Probe<string>> = {};
  for (const path of WASM_PATH_CANDIDATES) {
    probes[path] = await probe(async () => {
      const compiled = await withTimeout(compile.call(wasmRuntime, path), COMPILE_TIMEOUT_MS, `compile(${path})`);
      return Object.prototype.toString.call(compiled);
    });
  }
  const workingPath = WASM_PATH_CANDIDATES.find(path => probes[path].ok);
  return { runtimeAvailable: true, compileAvailable: true, probes, workingPath };
}
