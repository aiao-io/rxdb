import { vi } from 'vitest';

import type { FakeRoot } from './angular';

/**
 * 给 Node 补上服务直接读的浏览器全局：视口宽高，以及从替身根元素读 CSS 变量的 `getComputedStyle`。
 * 用 `vi.stubGlobal` 安装，vitest 配置的 `unstubGlobals` 会在每个用例结束后还原。
 */
export function stubViewport(width: number, height: number): void {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
  vi.stubGlobal('getComputedStyle', (element: FakeRoot) => element.style);
}

/** 替身 `MediaQueryList`：`matches` 可变，`emit()` 触发已登记的 `change` 监听。 */
export class FakeMediaQuery {
  matches: boolean;
  readonly listeners = new Set<() => void>();

  constructor(matches = false) {
    this.matches = matches;
  }

  addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'change', listener: () => void): void {
    this.listeners.delete(listener);
  }

  emit(matches: boolean): void {
    this.matches = matches;
    this.listeners.forEach(listener => listener());
  }
}

/** 安装替身 `matchMedia`，所有查询共用同一个 {@link FakeMediaQuery}。 */
export function stubMatchMedia(query: FakeMediaQuery): void {
  vi.stubGlobal('matchMedia', () => query);
}

/** 安装不排队的 `navigator.locks`：磁盘卷用它做跨标签页独占，单测里直接执行任务。返回 `request` 的 spy。 */
export function stubLocks() {
  const request = vi.fn((_name: string, task: () => Promise<unknown>) => task());
  vi.stubGlobal('navigator', { locks: { request } });
  return request;
}
