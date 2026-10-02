/**
 * @fileoverview 抖音页面模块里 `globalThis` 是 `undefined`（US-211 实验实测），adapter 要经 `host.runtimeGlobal`
 * 拿到真实全局对象。Taro 产物里只有入口 `app.js` 不是严格模式（`config/rxdb-packages-vite-plugin.ts` 构建期断言），
 * 入口在那里取非严格函数的 `this` 存进本模块，页面再取出来交给抖音 host。
 */
import type { MiniProgramRuntimeGlobal } from '@aiao/rxdb-adapter-miniprogram/runtime';

let captured: MiniProgramRuntimeGlobal | undefined;

/** 入口记下非严格函数的 `this`；它是不是真实全局对象由 adapter 按 realm 判据校验，这里不猜。 */
export function captureRuntimeGlobal(sloppyThis: unknown): void {
  captured =
    typeof sloppyThis === 'object' && sloppyThis !== null ? (sloppyThis as MiniProgramRuntimeGlobal) : undefined;
}

/** 入口记下的对象；入口没跑或 `this` 不是对象时为 `undefined`。 */
export function capturedRuntimeGlobal(): MiniProgramRuntimeGlobal | undefined {
  return captured;
}
