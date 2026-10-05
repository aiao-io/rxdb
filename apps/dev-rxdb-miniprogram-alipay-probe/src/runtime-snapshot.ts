/**
 * @fileoverview 引导前后对照真实全局对象，记下正式 host 的 `prepareRuntime` 补了哪些全局。
 *
 * 模拟器逻辑层同时缺 `BigInt` 与 `queueMicrotask`，iOS 真机只缺 `queueMicrotask`（v3–v6 探针实测）；
 * 补丁本身在 adapter 的 `hosts/alipay-runtime.ts`，探针只看结果。
 */
import type { MiniProgramRuntimeGlobal } from '@aiao/rxdb-adapter-miniprogram/runtime';

/** 正式 host 可能补上的全局，按补的顺序。 */
export const REPAIRABLE_GLOBALS = ['BigInt', 'queueMicrotask'] as const;

/** {@link REPAIRABLE_GLOBALS} 之一。 */
export type RepairableGlobal = (typeof REPAIRABLE_GLOBALS)[number];

/** 各可补全局的 `typeof`。 */
export type RepairableGlobals = Readonly<Record<RepairableGlobal, string>>;

/** 引导前后的对照。 */
export interface RuntimeSnapshot {
  /** 引导前真实全局对象上各全局的 `typeof`。 */
  readonly before: RepairableGlobals;
  /** 引导前不是函数、引导后是函数的全局。 */
  readonly installed: readonly RepairableGlobal[];
}

/**
 * 读真实全局对象上各可补全局的 `typeof`。
 *
 * @param runtimeGlobal - adapter 解析出的真实全局对象
 */
export function readRepairableGlobals(runtimeGlobal: MiniProgramRuntimeGlobal): RepairableGlobals {
  return { BigInt: typeof runtimeGlobal.BigInt, queueMicrotask: typeof runtimeGlobal.queueMicrotask };
}

/**
 * 对照引导前后，列出引导补上的全局。
 *
 * @param before - 引导前的 `typeof`
 * @param after - 引导后的 `typeof`
 */
export function installedGlobals(before: RepairableGlobals, after: RepairableGlobals): RepairableGlobal[] {
  return REPAIRABLE_GLOBALS.filter(name => before[name] !== 'function' && after[name] === 'function');
}
