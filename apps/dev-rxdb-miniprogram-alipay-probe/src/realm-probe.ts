/**
 * @fileoverview 读取构建 banner 的真实全局对象探测结果。
 *
 * 支付宝模拟器的逻辑层里 `globalThis` 是 `undefined`（iOS 真机是对象），
 * adapter 是严格模式代码，拿不到非严格函数的 `this`。banner（见 `scripts/build.mjs`）
 * 试几条路找真实全局对象，找到就存进模块变量，页面包经 `host.runtimeGlobal` 交给 adapter。
 * 每条路的结果写进本模块所在包的模块级变量，这里读出来。
 */
import type { MiniProgramRuntimeGlobal } from '@aiao/rxdb-adapter-miniprogram/runtime';

/** banner 对一条候选路的检查结果；读取时抛错则只有 `error`。 */
export interface RealmProbeCandidate {
  readonly type?: string;
  /** 对象字面量 `{}` 的原型是候选对象的 `Object.prototype`，即它是本环境的真实全局对象。 */
  readonly isRealm?: boolean;
  /** 候选对象的 `Promise` 与自由变量 `Promise` 是同一个；抖音的包装函数换掉了 `Promise`，这一项为 false 不说明不是真实全局对象。 */
  readonly promiseMatchesFree?: boolean;
  readonly BigInt?: string;
  readonly queueMicrotask?: string;
  readonly error?: string;
}

/** 一个包的 banner 记录。 */
export interface RealmProbeRecord {
  /** 模块作用域里的 `typeof globalThis`；为 `'object'` 时不检查候选路，adapter 直接用 `globalThis`。 */
  readonly before: string;
  /**
   * 键为候选路：`sloppyThis`（非严格函数的 `this`）、`Function`（`Function('return this')()`）、`global`、
   * `objectPrototypeGetter`（`Object.prototype` 上临时 getter 返回的 `this`，自由变量查找时即全局对象）。
   */
  readonly candidates: Readonly<Record<string, RealmProbeCandidate>>;
  /** 选中的候选路；没有真实全局对象可用时为 `null`。 */
  readonly chosen: string | null;
}

/** 两个包各自的记录；`null` 表示没有 banner（源码级运行）或核心包没加载。 */
export interface RealmProbeReport {
  readonly page: RealmProbeRecord | null;
  readonly core: RealmProbeRecord | null;
}

// banner 在包顶部以 var 声明，名字必须与 scripts/build.mjs 的 REALM_PROBE_VAR / RUNTIME_GLOBAL_VAR 一致
declare const __aiaoSpikeRealmProbe: RealmProbeRecord | undefined;
declare const __aiaoSpikeRuntimeGlobal: MiniProgramRuntimeGlobal | undefined;

/** 读取本模块所在包的 banner 记录；源码级运行（没有 banner）时为 `null`。 */
export function readRealmProbe(): RealmProbeRecord | null {
  return typeof __aiaoSpikeRealmProbe === 'object' ? __aiaoSpikeRealmProbe : null;
}

/** banner 找到的真实全局对象；`globalThis` 本来就是对象、没找到或源码级运行时为 `undefined`。 */
export function readProbedRuntimeGlobal(): MiniProgramRuntimeGlobal | undefined {
  return typeof __aiaoSpikeRuntimeGlobal === 'object' ? __aiaoSpikeRuntimeGlobal : undefined;
}
