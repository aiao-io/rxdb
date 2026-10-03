// 录制开关（US-909 阶段 C）：setup 静态引用这个文件，所以这里不能 import 录制插件或 rrweb——
// 开关关着时它们都不该进包（FR-022）。

/** 录制开关的 localStorage 键；值为 `'1'` 才录制，默认关。 */
export const REPLAY_ENABLED_KEY = 'rxdb-demo-replay-enabled';

/**
 * 录制开关是否打开。
 *
 * @param storage - 通常是 `window.localStorage`
 * @returns 键值恰为 `'1'` 时为 `true`
 */
export function isReplayEnabled(storage: Pick<Storage, 'getItem'>): boolean {
  return storage.getItem(REPLAY_ENABLED_KEY) === '1';
}

/**
 * 打开或关闭录制开关；生效要等下一次页面加载。
 *
 * @param storage - 通常是 `window.localStorage`
 * @param enabled - 打开写 `'1'`，关闭删键
 */
export function setReplayEnabled(storage: Pick<Storage, 'setItem' | 'removeItem'>, enabled: boolean): void {
  if (enabled) storage.setItem(REPLAY_ENABLED_KEY, '1');
  else storage.removeItem(REPLAY_ENABLED_KEY);
}

/**
 * 开关打开时才调用 `load`（通常是 `() => import('./replay-recording')`）。
 *
 * @param storage - 通常是 `window.localStorage`
 * @param load - 加载录制模块
 * @returns 开时是 `load()` 的 Promise，关时 `null`
 */
export function whenReplayEnabled<T>(storage: Pick<Storage, 'getItem'>, load: () => Promise<T>): Promise<T> | null {
  return isReplayEnabled(storage) ? load() : null;
}
