import { createMediaQueryStore, type MatchMedia, type MediaQueryLike } from '../media.js';
import type { ReadableStore } from '../store.js';

export type { MatchMedia, MediaQueryLike };

/**
 * 观察系统是否处于深色模式。
 * @param matchMedia - 宿主的 `matchMedia`；缺省（SSR / 测试）时恒为浅色。
 * @returns 只读存储与停止函数。
 */
export function createSystemDarkStore(matchMedia: MatchMedia | undefined): {
  store: ReadableStore<boolean>;
  stop: () => void;
} {
  return createMediaQueryStore(matchMedia, '(prefers-color-scheme: dark)');
}
