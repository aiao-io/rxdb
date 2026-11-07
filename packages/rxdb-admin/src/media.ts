import { Store, type ReadableStore } from './store.js';

/** `MediaQueryList` 的最小契约。 */
export interface MediaQueryLike {
  /** 当前是否匹配。 */
  readonly matches: boolean;
  /** 监听匹配状态变化。 */
  addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void;
  /** 移除监听。 */
  removeEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void;
}

/** 创建 `MediaQueryLike` 的函数，`window.matchMedia` 天然满足。 */
export type MatchMedia = (query: string) => MediaQueryLike;

/**
 * 把媒体查询的匹配状态做成响应式存储。
 * @param matchMedia - 宿主的 `matchMedia`；缺省（SSR / 测试）时恒为 `false`。
 * @param query - 媒体查询。
 * @returns 只读存储与停止监听函数。
 */
export function createMediaQueryStore(
  matchMedia: MatchMedia | undefined,
  query: string
): { store: ReadableStore<boolean>; stop: () => void } {
  const mql = matchMedia?.(query);
  const store = new Store(mql?.matches ?? false);
  const onChange = (event: { matches: boolean }): void => store.set(event.matches);
  mql?.addEventListener('change', onChange);
  return { store, stop: () => mql?.removeEventListener('change', onChange) };
}
