/**
 * @packageDocumentation
 * 把本包的读引擎接到核心开的那个运行期槽上（US-025 阶段 B）。
 *
 * @remarks
 * 核心 `Repository` 只认 {@link QueryCacheEngineFactory} / {@link QueryCacheSession} 两个
 * 接口，不认 `QueryCacheEngine` 这个类。搬迁前那处 `new QueryCacheSyncMemo()` +
 * `createQueryCachePrimary()` 的直构造，现在落在本文件里 —— 也只落在这里。
 */
import {
  type EntityType,
  type QueryCacheEngineFactory,
  type QueryCachePrimary,
  type QueryCacheRemoteAdapter,
  type QueryCacheSession,
  type QueryCacheSessionContext
} from '@aiao/rxdb';
import { createQueryCachePrimary, type QueryCachePrimaryLocalAdapter } from './query-cache-primary.js';
import { QueryCacheSyncMemo } from './query-cache-sync-memo.js';

/**
 * 一个 QueryCache 实体一份的引擎会话。
 *
 * @typeParam T - 该会话服务的实体类型
 *
 * @remarks
 * 会话持有同步记忆表：主仓储每次适配器发射都会重建，记忆放在仓储里活不过一次 `find`。
 * `bindAdapters` 的「实例没换就不清表」语义由 {@link QueryCacheSyncMemo} 自己判定，
 * 因此本类只需在每次 {@link QueryCacheEngineSession.createPrimary} 里如实转达两侧实例。
 */
class QueryCacheEngineSession<T extends EntityType> implements QueryCacheSession<T> {
  readonly #memo: QueryCacheSyncMemo;
  readonly #context: QueryCacheSessionContext<T>;

  constructor(context: QueryCacheSessionContext<T>) {
    this.#context = context;
    // `syncStaleTime` 缺省时交给 QueryCacheSyncMemo 的默认窗口，不在这里代填一个数。
    this.#memo =
      context.syncStaleTime === undefined ? new QueryCacheSyncMemo() : new QueryCacheSyncMemo(context.syncStaleTime);
  }

  createPrimary(localAdapter: object, remoteAdapter: object): QueryCachePrimary<T> {
    this.#memo.bindAdapters(localAdapter, remoteAdapter);
    const context = this.#context;
    return createQueryCachePrimary<T>(
      context.entityName,
      context.EntityType,
      localAdapter as QueryCachePrimaryLocalAdapter<T>,
      remoteAdapter as QueryCacheRemoteAdapter,
      context.localCacheFirst,
      this.#memo,
      context.reachability,
      context.syncState,
      context.pendingWriteIds
    );
  }

  clear(): void {
    this.#memo.clear();
  }
}

/**
 * 本包提供的读引擎工厂，由 {@link RxDBPluginQueryCache} 注册进核心。
 *
 * @remarks
 * 无状态：会话之间不共享任何东西，同一个工厂实例可以服务任意多个实体。
 * 与 {@link QueryCacheEngine}（读引擎本体）分开两个名字：那个是一次查询的执行者，
 * 这个只负责按实体发会话。
 */
export class RxDBQueryCacheEngineFactory implements QueryCacheEngineFactory {
  createSession<T extends EntityType>(context: QueryCacheSessionContext<T>): QueryCacheSession<T> {
    return new QueryCacheEngineSession<T>(context);
  }
}
