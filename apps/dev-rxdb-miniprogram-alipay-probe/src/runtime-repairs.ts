/**
 * @fileoverview 实验 host 在引导前给真实全局对象补上 adapter 前置检查要求、平台却没有的两个全局。
 *
 * 模拟器逻辑层同时缺 `BigInt` 与 `queueMicrotask`，iOS 真机只缺 `queueMicrotask`（v3 探针实测）。
 * 补丁只在缺失时装，已有的一律不动；装不上就如实抛错，不装半套。**这是实验 host 的做法，不是 adapter 的正式实现。**
 */
import type { MiniProgramRuntimeGlobal } from '@aiao/rxdb-adapter-miniprogram/runtime';
import type { StandardWasmApi } from './alipay-api.js';

/** 实验 host 可能补上的全局。 */
export type RepairedGlobal = 'BigInt' | 'queueMicrotask';

/** 补丁记录。 */
export interface RuntimeRepairs {
  /** 补之前目标对象上各全局的 `typeof`。 */
  readonly before: Readonly<Record<RepairedGlobal, string>>;
  /** 实际补上的全局，按补的顺序。 */
  readonly installed: readonly RepairedGlobal[];
}

/**
 * `(module (func (export "f") (result i64) i64.const 7))`。
 *
 * IDE 包装删掉了全局 `BigInt`，但引擎的 JS-BigInt 集成还在：wasm 返回的 i64 是原生 bigint，
 * 它的 `constructor` 就是被删掉的那个 `BigInt`（模拟器经 CDP 实测）。
 */
const I64_MODULE = Uint8Array.from([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 126, 3, 2, 1, 0, 7, 5, 1, 1, 102, 0, 0, 10, 6, 1, 4, 0, 66, 7, 11
]);

async function recoverBigInt(wasm: StandardWasmApi | undefined): Promise<BigIntConstructor> {
  if (!wasm) throw new Error('缺 BigInt，又没有 WebAssembly 可以从 i64 返回值取回它');
  const { instance } = await wasm.instantiate(I64_MODULE, {});
  const value: unknown = (instance.exports['f'] as () => unknown)();
  if (typeof value !== 'bigint')
    throw new Error(`wasm 的 i64 返回值是 ${typeof value}，不是 bigint：引擎没有 JS-BigInt 集成`);
  return Object(value).constructor as BigIntConstructor;
}

function install(target: MiniProgramRuntimeGlobal, name: RepairedGlobal, value: unknown): void {
  // 与原生全局同样不可枚举
  Object.defineProperty(target, name, { configurable: true, writable: true, value });
}

/**
 * 在 `target` 上补缺失的 `BigInt` 与 `queueMicrotask`。
 *
 * `BigInt` 先取回再统一安装，取不回时什么都不装。`queueMicrotask` 用目标对象自己的 `Promise` 排微任务。
 *
 * @param target - 交给 adapter 的真实全局对象
 * @param wasm - 逻辑层的标准 `WebAssembly`；只在缺 `BigInt` 时用
 * @returns 补之前的形态与实际补上的全局
 */
export async function repairRuntimeGlobal(
  target: MiniProgramRuntimeGlobal,
  wasm: StandardWasmApi | undefined
): Promise<RuntimeRepairs> {
  const before = { BigInt: typeof target.BigInt, queueMicrotask: typeof target.queueMicrotask };
  const bigInt = before.BigInt === 'function' ? undefined : await recoverBigInt(wasm);
  const installed: RepairedGlobal[] = [];
  if (bigInt) {
    install(target, 'BigInt', bigInt);
    installed.push('BigInt');
  }
  if (before.queueMicrotask !== 'function') {
    const promise = target.Promise;
    install(target, 'queueMicrotask', (callback: VoidFunction) => void promise.resolve().then(callback));
    installed.push('queueMicrotask');
  }
  return { before, installed };
}
