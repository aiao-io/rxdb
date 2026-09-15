/**
 * @fileoverview RxDB QueryCache 插件
 * `SyncType.QueryCache` 的读引擎入口：把引擎工厂注册进核心开的运行期槽。
 *
 * @module rxdb-plugin-querycache
 */

import { IRxDBPlugin, Plugin, RxDB, RxDBPluginBase } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { RxDBQueryCacheEngineFactory } from './query-cache-engine.factory.js';

type RxDBPluginQueryCacheOptions = object;

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

declare module '@aiao/rxdb' {
  interface RxDB {
    queryCache: RxDBPluginQueryCache;
  }
}

export const rxDBPluginQueryCache: Plugin<RxDBPluginQueryCacheOptions> = (db: RxDB) => new RxDBPluginQueryCache(db);
