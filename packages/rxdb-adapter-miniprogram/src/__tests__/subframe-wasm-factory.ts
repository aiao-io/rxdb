/**
 * @fileoverview 集成 spec 共用的 `@subframe7536/sqlite-wasm` 装载物。
 *
 * 小程序没有 `fetch`，真机上 wasm 由 `WXWebAssembly.instantiate(path, imports)` 装载；
 * Node 侧用同签名的 {@link wasmRuntime} 顶替，其余链路与真机完全一致。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { MiniProgramWasmRuntime, WaSqliteModuleFactory } from '../mini-program.interface.js';
import { SUBFRAME_WASM_SUBPATH, loadSubframeModuleFactory } from '../subframe-glue.js';

const require = createRequire(import.meta.url);

/** subframe 构建的同步 wa-sqlite 模块工厂（编入了 FTS5）。 */
export const moduleFactory: WaSqliteModuleFactory = await loadSubframeModuleFactory();

/** 与 {@link moduleFactory} 同源的 wasm 字节；glue 与 wasm 跨构建混用会 `LinkError`。 */
export const wasmBytes = Uint8Array.from(readFileSync(require.resolve(SUBFRAME_WASM_SUBPATH)));

/** Node 侧顶替 `WXWebAssembly` 的运行时。 */
export const wasmRuntime: MiniProgramWasmRuntime = {
  async instantiate(_path, imports) {
    const result = await WebAssembly.instantiate(wasmBytes, imports);
    return { instance: result.instance, module: result.module };
  }
};
