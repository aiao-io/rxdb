import type { RxDB } from '@aiao/rxdb';
import { signal } from '@angular/core';

/**
 * @fileoverview 本地数据库的连接：应用启动时与受守卫的路由共用一份，失败登记下来给应用壳显示（US-221）。
 *
 * @remarks
 * 连接失败时路由守卫拒绝导航、路由区什么都不渲染；不登记的话，页面上只剩应用壳，看不到任何错误。
 * 三端同名移植（React / Vue 的 `rxdb/db-connection.ts`）。
 */

/** 最近一次连接失败的错误信息；没有失败时为 `null`。 */
export const dbConnectionError = signal<string | null>(null);

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
    dbConnectionError.set(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
