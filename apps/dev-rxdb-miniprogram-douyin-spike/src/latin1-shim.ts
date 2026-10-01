/**
 * @fileoverview 读取核心包构建 banner 留下的 latin1 垫片记录。
 *
 * iOS 真机没有原生 `TextDecoder`，adapter 的 polyfill 只认 utf-8 / utf-16le，而 sqlite-core 的
 * `sqlite-blank-database.ts` 在模块顶层 `new TextDecoder('latin1')`，核心包加载即 RangeError，① ④ 一条都跑不了。
 * 核心包构建时把模块体里的 `TextDecoder` 换成垫片（见 `scripts/build.mjs`）：委托拒绝 latin1 才顶上，
 * 其余一律原样交给委托。顶上过几次、委托的原始错误写进核心包的模块级变量，这里读出来。
 * 垫片只存在于本实验产物，adapter 的正式修法在阶段 B。
 */

/** 核心包 banner 的记录；随模块里每次构造实时更新。 */
export interface Latin1ShimRecord {
  /** 委托拒绝 latin1、由垫片顶上的次数。 */
  readonly engaged: number;
  /** 第一次被拒时委托抛出的错误文本；没顶上过为 `null`。 */
  readonly delegateError: string | null;
}

// banner 在包顶部以 var 声明，名字必须与 scripts/build.mjs 的 LATIN1_SHIM_VAR 一致
declare const __aiaoSpikeLatin1Shim: Latin1ShimRecord | undefined;

/** 读取本模块所在包的 banner 记录；源码级运行（没有 banner）时为 `null`。返回的是活引用，不是快照。 */
export function readLatin1Shim(): Latin1ShimRecord | null {
  return typeof __aiaoSpikeLatin1Shim === 'object' ? __aiaoSpikeLatin1Shim : null;
}

/** 垫片顶上过至少一次：经核心包得到的结论都以它为前提。 */
export function latin1ShimEngaged(record: Latin1ShimRecord | null): boolean {
  return record !== null && record.engaged > 0;
}
