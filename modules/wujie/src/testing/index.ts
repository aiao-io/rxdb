/**
 * @fileoverview 无界协议的测试替身，供 wujie 模块自身与三端 demo / benchmarks 的 spec 共用。
 *
 * 单独开一个子路径而不并入 `@modules/wujie` 主入口：主入口会被 demo 应用和文档站打进产物，
 * 测试替身不该出现在那里。也因此 `package.json` 里这条 `exports` 直接指向 `src` 而非
 * `dist` —— 它不参与 lib build，只给 vitest 用。
 *
 * @module @modules/wujie/testing
 */

import type { WujieBus } from '../host-theme.js';

/** {@link createFakeWujieBus} 的返回值：`$on` / `$off` / `$emit` 都必然存在，spec 里无需可选链。 */
export interface FakeWujieBus extends WujieBus {
  $on(event: string, fn: (...args: unknown[]) => void): void;
  $off(event: string, fn: (...args: unknown[]) => void): void;
  $emit(event: string, ...args: unknown[]): void;
}

/**
 * 造一个内存版无界 `eventBus`。
 *
 * 同步派发，不做跨 iframe 序列化 —— 真实 bus 在同一个 JS 上下文里也是这么走的，
 * 断言可以紧跟在 `$emit` 之后，不必 flush microtask。
 *
 * @returns 每次调用都是互相隔离的新 bus
 */
export function createFakeWujieBus(): FakeWujieBus {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    $on(event: string, fn: (...args: unknown[]) => void) {
      const bucket = listeners.get(event) ?? new Set();
      bucket.add(fn);
      listeners.set(event, bucket);
    },
    $off(event: string, fn: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(fn);
    },
    $emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach(listener => listener(...args));
    }
  };
}
