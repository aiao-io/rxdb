/**
 * @fileoverview 跨调用者的 seed 互斥锁。
 *
 * search demo 页面挂载时的自动 seed 与 Playwright `reset()` 的显式重播 seed
 * 写的是同一批固定 ID 记录；两者若并发执行会交错触发 UNIQUE constraint 冲突。
 * 用同一个 key（通常是 RxDB 实例）把二者串行化即可消除该竞态。
 *
 * @module @aiao/rxdb-test/testing/seed-lock
 */

const seedLocks = new WeakMap<object, Promise<unknown>>();

/**
 * 以 `key` 为粒度串行化 `action`：若 key 上有前序调用未完成，本次调用排队等待其
 * 结束（无论成功或失败）后再执行，避免与前序调用并发写同一批数据。
 */
export function withSeedLock<T>(key: object, action: () => Promise<T>): Promise<T> {
  const previous = seedLocks.get(key) ?? Promise.resolve();
  const settled = previous.catch(() => undefined);
  const run = settled.then(action);
  seedLocks.set(
    key,
    run.catch(() => undefined)
  );
  return run;
}

/**
 * 生成一个绑定到 `db` 的 seed 函数：每次调用都通过 {@link withSeedLock} 以 `db`
 * 为 key 与其他持锁调用（例如 `installSearchDemoTestApi` 的 `reset()`）互斥。
 *
 * 仅用于页面挂载时的自动 seed 入口；不要在 `reset()` 自身的 `seedData` 回调内
 * 再次调用（回调已运行在同一把锁内，嵌套加锁会死锁）。
 */
export function createLockedSeeder<T extends object>(db: T, seedData: (db: T) => Promise<void>): () => Promise<void> {
  return () => withSeedLock(db, () => seedData(db));
}
