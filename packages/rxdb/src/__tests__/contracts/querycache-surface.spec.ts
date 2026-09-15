/**
 * QueryCache 在核心公开面上的切线（US-025 阶段 B：B1）。
 *
 * 阶段 B 的判据是「核心不再导出读引擎实现」，而这件事**基线文件证明不了**：
 * `requirements/api-baseline/rxdb.json` 只记名字与 kind，一份把 `QueryCacheEngine`
 * 重新 `export * from` 回来的改动会让基线长回一条、`--check` 报一次 diff 就过去了。
 * 这里把切线钉成运行期断言：引擎的**值**导出一个都不许在 `index.js` 上出现。
 *
 * 另一半同样重要 —— 留下的**契约**不许跟着走。`QueryCacheRemoteAdapter` 等七个类型
 * 与 `RxDBAdapterRemoteBase` 的 `fetchMetadata` / `findByIds` 同一性质：适配器照着实现的
 * 形状。它们一旦搬进插件，所有适配器包就得反向依赖一个可选插件才能编译。
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { EntityBaseType, EntityType } from '../../entity/entity.interface.js';
import type {
  QueryCacheEngineFactory,
  QueryCacheEntity,
  QueryCacheFindOptions,
  QueryCacheLocalAdapter,
  QueryCacheLocalReader,
  QueryCachePendingWriteIds,
  QueryCachePrimary,
  QueryCacheRemoteAdapter,
  QueryCacheSession,
  QueryCacheSessionContext,
  SyncStats
} from '../../index.js';
import * as api from '../../index.js';

/** 搬去 `@aiao/rxdb-plugin-querycache` 的那批值导出 */
const MOVED_VALUE_EXPORTS = [
  'QueryCacheRepository',
  'QueryCacheEngine',
  'QueryCachePrimaryRepository',
  'createQueryCachePrimary',
  'QueryCacheSyncMemo',
  'queryCacheFingerprint',
  'DEFAULT_QUERY_CACHE_SYNC_STALE_TIME'
] as const;

describe('US-025 B1：QueryCache 读引擎不在核心公开面上', () => {
  it('引擎实现的值导出一个都不在 index 上', () => {
    const surface = new Set(Object.keys(api));

    expect(MOVED_VALUE_EXPORTS.filter(name => surface.has(name))).toEqual([]);
  });

  it('接缝与护栏留在核心：引擎槽与缺插件错误仍然导得出', () => {
    expect(api.RxDBMissingPluginError).toBeTypeOf('function');
    expect(api.RxDB.prototype.queryCacheEngine).toBeTypeOf('function');

    expectTypeOf<QueryCacheEngineFactory['createSession']>().toBeFunction();
    expectTypeOf<QueryCacheSession<EntityType>>().toHaveProperty('createPrimary');
    expectTypeOf<QueryCacheSessionContext<EntityType>>().toHaveProperty('pendingWriteIds');
    expectTypeOf<QueryCachePrimary<EntityType>>().toHaveProperty('invalidateInflight');
  });

  it('适配器契约留在核心：七个类型照旧从 index 取得到', () => {
    // 这几条的真正门禁是 `pnpm nx typecheck rxdb` —— 类型没导出时上面的 import 就编译不过
    expectTypeOf<QueryCacheEntity>().toExtend<{ id: string; updatedAt: string }>();
    expectTypeOf<QueryCacheRemoteAdapter>().toHaveProperty('fetchMetadata');
    expectTypeOf<QueryCacheLocalAdapter>().toHaveProperty('upsertMany');
    expectTypeOf<QueryCacheLocalReader<object>>().toHaveProperty('find');
    expectTypeOf<QueryCacheFindOptions<EntityBaseType>>().toHaveProperty('where');
    expectTypeOf<SyncStats>().toHaveProperty('heldCount');
    expectTypeOf<QueryCachePendingWriteIds>().toBeFunction();
  });

  it('引擎依赖的时间工具留在核心，而不是在插件里复制一份', () => {
    expect(api.isRemoteNewer('2026-08-02T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'spec')).toBe(true);
    expect(api.parseUpdatedAt('2026-08-01T00:00:00.000Z', 'spec')).toBeTypeOf('number');
  });
});
