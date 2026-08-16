/**
 * @fileoverview v2 协议的时间端口 —— 六道 deadline 的唯一注入点。
 *
 * @remarks
 * v2 一共有六个互相独立的时限：1,000 ms 协商窗口、15 s 非流式请求、15 s transfer idle、
 * 10 min transfer 总时长、60 s snapshot cursor 过期、15 s snapshot 端到端。
 * 它们**必须**全部走本模块注入的时钟，不能直接调 `globalThis.setTimeout`。
 *
 * 理由不是「方便写单测」：同一份 conformance suite 要被 US-904 阶段 C / D 与 US-905 的薄
 * driver 在真实 `chrome.runtime.Port`、Electron IPC 和 Tauri `invoke` 上复跑，那些 driver
 * 无法让 vitest 的 fake timers 接管宿主计时器。没有这个端口，与时限相关的验收在下游只能
 * 靠真实等待（十分钟级）或者干脆跳过——跳过就是假绿。
 *
 * @module @aiao/rxdb-devtools/v2/clock
 */

/**
 * 取消一个已登记的定时任务。
 *
 * @remarks
 * 必须幂等：重复调用、或在回调已经触发之后调用，都不得抛错或产生副作用。
 * 协议里到处是「先取消再进入终态」的写法，幂等是那些路径的前提。
 */
export type DevToolsCancelTimer = () => void;

/**
 * 协议时钟端口。
 *
 * @remarks
 * 只暴露两件事：读当前时刻、登记一次性延时回调。**刻意不提供 `setInterval`**——
 * 协议里没有任何周期性行为，多给一个原语只会诱导实现写出难以在下游 driver 上推进的轮询。
 */
export interface DevToolsClock {
  /**
   * 当前时刻，单位毫秒。
   *
   * @remarks
   * 只用于计算「已过去多久」，不得当作 wire 上的 `timestamp` 之外的身份来源。
   */
  now(): number;

  /**
   * 登记一次性延时回调。
   *
   * @param handler - 到期回调；实现不得吞掉它抛出的异常。
   * @param delayMs - 延时毫秒数，必须是非负 safe integer。
   * @returns 取消句柄。
   */
  setTimeout(handler: () => void, delayMs: number): DevToolsCancelTimer;
}

/**
 * 基于宿主 `Date.now` / `setTimeout` 的真实时钟。
 *
 * @remarks
 * 生产路径（`DevToolsConnector` 与 panel 协商端）的默认值。测试与 conformance driver
 * 应改用 `@aiao/rxdb-devtools/testing` 的 `createFakeClock()`。
 *
 * @returns 一个直接委托宿主计时器的 {@link DevToolsClock}。
 */
export function createSystemClock(): DevToolsClock {
  return {
    now: () => Date.now(),
    setTimeout: (handler, delayMs) => {
      const handle = globalThis.setTimeout(handler, delayMs);
      return () => globalThis.clearTimeout(handle);
    }
  };
}
