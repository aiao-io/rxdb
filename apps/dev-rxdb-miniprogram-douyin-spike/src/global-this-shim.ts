/**
 * @fileoverview 读取构建 banner 留下的 `globalThis` 垫片记录。
 *
 * 抖音开发者工具里页面模块的 `globalThis` 是 `undefined`，`global` 是对象但上面没有 `BigInt` / `Promise`，
 * 不是真实全局对象。adapter 全靠 `globalThis` 读写全局，不垫就测不到 ① ④。banner（见 `scripts/build.mjs`）
 * 试几条路拿真实全局对象，拿到才垫；每条路的结果、最后垫没垫都写进本模块所在包的模块级变量，这里读出来。
 */

/** banner 对一条候选路的检查结果；读取时抛错则只有 `error`。 */
export interface GlobalThisShimCandidate {
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
export interface GlobalThisShimRecord {
  /** 垫之前 `typeof globalThis`；为 `'object'` 时不检查候选路。 */
  readonly before: string;
  /** 键为候选路：`sloppyThis`（非严格函数的 `this`）、`Function`（`Function('return this')()`）、`global`。 */
  readonly candidates: Readonly<Record<string, GlobalThisShimCandidate>>;
  /** 换进 `globalThis` 的候选路；没有真实全局对象可用时为 `null`。 */
  readonly chosen: string | null;
  readonly applied: boolean;
  /** 赋值抛错时的错误文本。 */
  readonly error?: string;
}

/** 两个包各自的记录；`null` 表示没有 banner（源码级运行）或核心包没加载。 */
export interface GlobalThisShimReport {
  readonly page: GlobalThisShimRecord | null;
  readonly core: GlobalThisShimRecord | null;
}

// banner 在包顶部以 var 声明，名字必须与 scripts/build.mjs 的 GLOBAL_THIS_SHIM_VAR 一致
declare const __aiaoSpikeGlobalThisShim: GlobalThisShimRecord | undefined;

/** 读取本模块所在包的 banner 记录；源码级运行（没有 banner）时为 `null`。 */
export function readGlobalThisShim(): GlobalThisShimRecord | null {
  return typeof __aiaoSpikeGlobalThisShim === 'object' ? __aiaoSpikeGlobalThisShim : null;
}

/** 任一包垫过 `globalThis`。 */
export function shimApplied(report: GlobalThisShimReport): boolean {
  return report.page?.applied === true || report.core?.applied === true;
}
