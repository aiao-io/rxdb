/**
 * @fileoverview 以自由变量形式读取全局能力的 `typeof`。
 *
 * 抖音的页面模块里 `globalThis` 不是对象，`Reflect.get(globalThis, …)` 直接抛错；
 * 自由变量沿作用域链解析，不依赖 `globalThis`，打包后的代码直接写 `TextDecoder` 时看到的就是这一份。
 * 每一项都必须是字面量 `typeof`：没有可用的全局对象，就没法按名字动态查找。
 */

declare const tt: unknown;
declare const TTWebAssembly: unknown;
// Node 的 `global`、小程序常见的全局别名；只在这里声明，运行时按真实作用域链解析
declare const global: unknown;

/** 自由变量形式读取到的全局能力 `typeof`，键名与 `GLOBAL_NAMES` 对齐，另加全局对象的几个候选名。 */
export function captureFreeGlobals(): Record<string, string> {
  return {
    tt: typeof tt,
    TTWebAssembly: typeof TTWebAssembly,
    globalThis: typeof globalThis,
    global: typeof global,
    self: typeof self,
    window: typeof window,
    WebAssembly: typeof WebAssembly,
    crypto: typeof crypto,
    'crypto.getRandomValues': typeof crypto === 'undefined' ? 'undefined' : typeof crypto.getRandomValues,
    TextEncoder: typeof TextEncoder,
    TextDecoder: typeof TextDecoder,
    structuredClone: typeof structuredClone,
    performance: typeof performance,
    queueMicrotask: typeof queueMicrotask,
    BigInt: typeof BigInt,
    Promise: typeof Promise,
    atob: typeof atob,
    btoa: typeof btoa
  };
}
