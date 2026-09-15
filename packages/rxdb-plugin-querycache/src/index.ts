/**
 * @packageDocumentation
 * `@aiao/rxdb-plugin-querycache` —— `SyncType.QueryCache` 的读引擎。
 *
 * @remarks
 * 核心只保留 `SyncType.QueryCache` 这个枚举成员与五个适配器原语契约
 * （`QueryCacheRemoteAdapter` / `QueryCacheLocalAdapter` 等，仍从 `@aiao/rxdb` 导出）；
 * 「按 where 回源、对元数据、写回本地缓存」这条读路径在本包。
 *
 * @example
 * ```ts
 * import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
 *
 * rxdb.use(rxDBPluginQueryCache);
 * ```
 */
export * from './plugin.js';
export * from './query-cache-engine.factory.js';
export * from './query-cache-primary.js';
export * from './query-cache-sync-memo.js';
export * from './QueryCacheEngine.js';
