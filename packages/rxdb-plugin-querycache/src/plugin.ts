/**
 * @fileoverview RxDB QueryCache 插件
 * `SyncType.QueryCache` 的读引擎入口：把引擎工厂注册进核心开的运行期槽。
 *
 * @module rxdb-plugin-querycache
 */

import { IRxDBPlugin, Plugin, RxDB, RxDBPluginBase } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { RxDBQueryCacheEngineFactory } from './query-cache-engine.factory.js';

/** 本插件当前不接受任何选项 */
export type RxDBPluginQueryCacheOptions = object;

/**
 * QueryCache 读引擎插件。
 *
 * @remarks
 * **不声明 `inject`**：注册工厂是纯动作，不需要任何适配器就绪。声明了依赖反而会让安装
 * 排到 `connect()` 的启动护栏之后 —— 那道护栏专门检查「声明了 QueryCache 却没装引擎」，
 * 装得太晚就变成误报。
 */
export class RxDBPluginQueryCache extends RxDBPluginBase implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  name: Uncapitalize<string> = 'queryCache';

  install(scope: LifecycleScope) {
    // 传 scope：断开连接时这条注册跟着一起撤销，不留一个指向已拆纪元的引擎。
    this.rxdb.queryCacheEngine(new RxDBQueryCacheEngineFactory(), scope);
  }
}

// 这里**不做** `declare module '@aiao/rxdb'` 增强。history / sync 增强 `RxDB` 是因为它们真的
// `Object.defineProperty` 挂了实例槽位；本插件只往引擎槽里塞一个工厂，`rxdb` 上不多一个属性。
// 声明一个没人赋值的 `queryCache`，换来的是 `rxdb.queryCache.name` 编译通过、运行时炸在
// `undefined` —— 类型说了一句实现不打算兑现的话。要拿实例走 `getPlugins('queryCache')`。

/**
 * QueryCache 读引擎插件工厂。
 *
 * @param db - 宿主实例
 *
 * @example
 * ```ts
 * import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
 *
 * rxdb.use(rxDBPluginQueryCache);
 * ```
 */
export const rxDBPluginQueryCache: Plugin<RxDBPluginQueryCacheOptions> = (db: RxDB) => new RxDBPluginQueryCache(db);
