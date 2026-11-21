/**
 * 在浏览器空闲时执行 `task`，最迟不超过 `timeout` 毫秒。
 *
 * Safari 18.4 之前没有 `requestIdleCallback`，直接调用会在桌面启动时抛 `ReferenceError`；
 * 没有这个 API 的浏览器退到定时器——这类预热只是优化，晚一点、早一点都不改变结果（`@aiao/rxdb` 的分片执行同样这样处理）。
 */
export function whenIdle(task: () => void, timeout: number): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(task, { timeout });
  else setTimeout(task, 0);
}
