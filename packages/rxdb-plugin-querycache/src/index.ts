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

// ---------------------------------------------------------------------------
// 桶里只有插件本身与下面这一个类。
//
// 读路径的其余实现——`RxDBQueryCacheEngineFactory`、`QueryCachePrimaryRepository`、
// `createQueryCachePrimary`、`assertQueryCacheCapabilities`、`QueryCacheSyncMemo`、
// `queryCacheFingerprint`、`DEFAULT_QUERY_CACHE_SYNC_STALE_TIME` 与三个随行类型——
// 一律不出桶：它们是 `rxdb.use(rxDBPluginQueryCache)` 之后由插件自己装配的，
// 包内引用全走相对路径，外部一个消费者都没有。`export *` 把它们摆上公开面，
// 等于在 1.0 之前就替用户冻结了一批只会随读路径重构而改的内部形状——
// 到那时删一个名字就是 breaking change，得配迁移说明。
// 新增导出前先问「包外谁在用」，答不上来就别加。
// ---------------------------------------------------------------------------

/**
 * 直接 `new` 的读引擎。
 *
 * @experimental
 * 稳定面是 `SyncType.QueryCache` + `getRepository`（见 `requirements/versioning-policy.md`）；
 * 直接实例化属实验档，形状可能在 1.0 前改。`@aiao/rxdb-adapter-supabase` 的错误契约测试
 * 要 `new` 一个真的出来验证错误分类，替身会把要验的东西验掉，而两包之间只有 `dist` 一条路，
 * 所以这里是**类**导出而非类型导出。
 */
export { QueryCacheEngine } from './QueryCacheEngine.js';
