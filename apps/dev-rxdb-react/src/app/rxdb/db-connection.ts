import type { RxDB } from '@aiao/rxdb';

/**
 * @fileoverview 本地数据库的连接：应用启动时与受守卫的路由共用一份，失败登记下来给应用壳显示（US-221）。
 *
 * @remarks
 * 连接失败时受守卫的路由不渲染；不登记的话，页面上只剩应用壳，看不到任何错误。
 * 三端同名移植（Angular / Vue 的 `rxdb/db-connection.ts`）；React 端用一个外部 store，由
 * {@link useDbConnectionError} 经 `useSyncExternalStore` 订阅。
 */

let current: string | null = null;
const listeners = new Set<() => void>();
const reported = new WeakSet<object>();

/** 最近一次连接失败的错误信息；没有失败时为 `null`。 */
export const getDbConnectionError = (): string | null => current;

/** 订阅连接失败信息的变化；返回退订函数。 */
export const subscribeDbConnectionError = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 改写连接失败信息并通知订阅者（`null` 为清空）。 */
export const setDbConnectionError = (message: string | null): void => {
  current = message;
  for (const listener of listeners) listener();
};

/** 这个错误是不是 {@link connectLocalAdapter} 登记过的连接失败（路由的错误元素据此留空，由应用壳显示）。 */
export const isReportedDbConnectionError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && reported.has(error);

/**
 * 连上配置的本地适配器；失败时登记错误信息，再原样抛出。
 *
 * @param db - 应用的 RxDB 实例
 * @throws 连接失败的原错误；`sync.local.adapter` 没配时抛配置错误
 */
export async function connectLocalAdapter(db: RxDB): Promise<void> {
  const adapterName = db.config.sync.local?.adapter;
  if (adapterName === undefined) throw new Error('[demo] sync.local.adapter is not configured');
  try {
    await db.connect(adapterName);
  } catch (error) {
    if (typeof error === 'object' && error !== null) reported.add(error);
    setDbConnectionError(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
