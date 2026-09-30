/**
 * @fileoverview 测试全局 setup：打桩 happy-dom 缺失的浏览器 API。
 *
 * - `ResizeObserver`：实体表格初始化依赖，happy-dom 无实现；
 * - `BroadcastChannel`：RxDB 实例创建依赖（单 tab 测试不回环投递）。
 *
 * @internal 仅测试使用，不随库发布。
 */
import { vi } from 'vitest';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe(): void {
      // happy-dom 无 ResizeObserver
    }
    unobserve(): void {
      // no-op
    }
    disconnect(): void {
      // no-op
    }
  }
);

vi.stubGlobal(
  'BroadcastChannel',
  class {
    #listeners = new Set<(event: MessageEvent) => void>();
    addEventListener(_type: string, listener: (event: MessageEvent) => void): void {
      this.#listeners.add(listener);
    }
    removeEventListener(_type: string, listener: (event: MessageEvent) => void): void {
      this.#listeners.delete(listener);
    }
    postMessage(): void {
      // 单 tab 测试：不回环投递
    }
    close(): void {
      this.#listeners.clear();
    }
  }
);
