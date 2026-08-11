/**
 * @fileoverview 真实 GC 触发器（测试专用）
 *
 * 验证「无人引用的对象会被回收」这类契约，只能靠真实 GC——没有别的观测手段。
 */

import { cdp } from 'vitest/browser';

/**
 * 反复触发真实 GC，直到 `isCollected()` 为真或尝试次数用尽
 *
 * @param isCollected - 判定目标是否已被回收，通常是 `() => ref.deref() === undefined`
 * @param attempts - 最大尝试次数。**反向断言（「还有人引用，不该被回收」）传 1**：
 *   重试只对「还没来得及回收」有意义，强引用再跑多少次结果都一样，而每一次都是一次
 *   完整 GC——整套 suite 跑起来时堆很大，白等几次就足以把用例拖过 5s 超时。
 * @returns `isCollected()` 的最终取值
 *
 * @remarks
 * 浏览器里没有标准的强制 GC 入口。`--expose-gc` 经 playwright `launchOptions.args`
 * 传进去后页面上下文里的 `globalThis.gc` 依然是 undefined；真正能跑一次完整 GC 的
 * 只有 CDP 的 `HeapProfiler.collectGarbage`，因此这里走 `cdp()`——**仅 chromium 可用**。
 *
 * 单次调用不保证回收：对象可能仍被压在栈上或写屏障队列里。所以这里循环重试，
 * 每轮之间让出一个宏任务给引擎收尾。调用方应当断言**返回值**，而不是
 * 「调用过就一定回收了」——后者会把一次侥幸的时序当成契约。
 */
export const collectGarbageUntil = async (isCollected: () => boolean, attempts = 20): Promise<boolean> => {
  const session = cdp();
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (isCollected()) return true;
    await session.send('HeapProfiler.collectGarbage');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return isCollected();
};
