/**
 * @fileoverview QueryCacheRepository - QueryCache 同步策略仓库
 *
 * 实现 QueryCache 同步策略，特点：
 * - 读操作：元数据优先，按需拉取（省流量）
 * - 写操作：远程优先，成功后同步本地（保证一致性）
 * - 离线时：返回本地缓存数据
 *
 * 同步流程：
 * 1. 从远程获取元数据（id + updatedAt）
 * 2. 与本地元数据对比，得出 missing/stale/fresh 分类
 * 3. 只拉取 missing + stale 的完整数据
 * 4. 写入本地缓存
 * 5. 返回合并后的结果
 *
 * @example
 * ```typescript
 * // Entity 配置 syncType: 'querycache'
 * @Entity({ syncType: SyncType.QueryCache })
 * class Product { ... }
 *
 * // 使用方式与普通 Repository 一致
 * const products = await firstValueFrom(rxdb.getRepository(Product).find({ where: ... }));
 * ```
 */

import { concat, EMPTY, finalize, forkJoin, Observable, of, throwError } from 'rxjs';
import { catchError, filter, map, shareReplay, switchMap } from 'rxjs/operators';
import { EntityBaseType, EntityStaticType } from '../entity/entity.interface.js';
import type { QueryCacheEntityMetadata } from '../entity/metadata-options.interface.js';
import { isEntityMatchWhere } from '../query/query-matching.utils.js';
import { deterministicStringify } from '../rxdb-utils.js';
import { NetworkOfflineError } from '../RxDBError.js';
import { diffMetadata } from './diff-metadata.js';
import type { RuleGroup } from './query.interface.js';

/**
 * QueryCache 实体约束接口
 *
 * 所有使用 QueryCache 同步策略的实体必须包含这两个字段
 */
export interface QueryCacheEntity {
  /** 实体唯一标识 */
  id: string;
  /** 最后更新时间 (ISO 8601 格式) */
  updatedAt: string;
}

/**
 * QueryCache 适配器接口（远程）
 */
export interface QueryCacheRemoteAdapter {
  /** 获取满足查询条件的实体元数据 */
  fetchMetadata<TEntity>(entityName: string, query: RuleGroup<TEntity>): Observable<QueryCacheEntityMetadata[]>;
  /** 按 ID 批量获取完整数据 */
  findByIds<T>(entityName: string, ids: string[]): Observable<T[]>;
  /** 创建实体（可选 - 写操作需要） */
  create?<T>(entityName: string, data: T): Observable<T>;
  /** 更新实体（可选 - 写操作需要） */
  update?<T>(entityName: string, id: string, data: Partial<T>): Observable<T>;
  /** 删除实体（可选 - 写操作需要） */
  delete?(entityName: string, ids: string | string[]): Observable<void>;
}

/**
 * QueryCache 适配器接口（本地）
 */
export interface QueryCacheLocalAdapter {
  /** 获取指定 ID 的本地元数据 */
  getMetadataByIds(entityName: string, ids: string[]): Observable<Map<string, string>>;
  /** 批量写入/更新数据 */
  upsertMany<T>(entityName: string, data: T[]): Observable<void>;
  /** 批量删除数据 */
  deleteByIds(entityName: string, ids: string[]): Observable<void>;
  /** 按 ID 获取完整数据 */
  findByIds?<T>(entityName: string, ids: string[]): Observable<T[]>;
  /** 获取所有本地缓存数据（SWR 模式需要） */
  findAll?<T>(entityName: string): Observable<T[]>;
}

/**
 * 查询选项
 */
export interface QueryCacheFindOptions<T extends EntityBaseType> {
  /** 查询条件 */
  where: RuleGroup<InstanceType<T>>;
  /** 同步完成回调，用于获取性能统计信息 */
  onSyncStats?: (stats: SyncStats) => void;
  /**
   * 本地缓存优先模式 (Stale-While-Revalidate)
   *
   * 当设置为 true 时：
   * 1. 立即返回本地缓存数据（如果存在）
   * 2. 后台异步验证并更新
   * 3. 如果数据有变化，发射更新后的数据
   *
   * @default false
   */
  localCacheFirst?: boolean;
  /**
   * 离线降级模式
   *
   * 当设置为 true 时：
   * - 网络错误时返回本地缓存数据
   * - 如果没有本地缓存，抛出 NetworkOfflineError
   *
   * @default false
   */
  offlineFallback?: boolean;
}

/**
 * 同步统计信息
 */
export interface SyncStats {
  /** 远程元数据数量 */
  remoteCount: number;
  /** 缺失数量（需要拉取） */
  missingCount: number;
  /** 过时数量（需要更新） */
  staleCount: number;
  /** 新鲜数量（无需同步） */
  freshCount: number;
  /** 孤儿数量（本地有远程无） */
  orphanCount: number;
  /** 实际拉取数量 */
  pulledCount: number;
  /** 耗时（毫秒） */
  durationMs: number;
}

/**
 * QueryCache 同步策略仓库
 *
 * @typeParam T - 实体类型
 *
 * @example
 * ```typescript
 * const repo = new QueryCacheRepository('Product', remoteAdapter, localAdapter);
 *
 * // 查询 - 自动增量同步
 * const products = await firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] } }));
 *
 * // 单个查询
 * const product = await firstValueFrom(repo.findById('product-123'));
 * ```
 *
 * @remarks
 * 生产路径不直接 `new` 本类：`SyncType.QueryCache` 的实体由 {@link Repository} 经
 * `createQueryCachePrimary` 接入（US-020 阶段 A），本类只负责 metadata-diff 与增量 pull。
 *
 * @experimental
 * 以下降级行为尚未收口（US-020 阶段 B）：缺 `findByIds` 时 `#getLocalDataByIds` 降级成空数组、
 * offline fallback 会把业务错误一并吞成「离线」、算出了 `orphanCount` 却不删除本地孤儿。
 */
export class QueryCacheRepository<T extends EntityBaseType = EntityBaseType> {
  /** 并发查询去重缓存 - 使用查询指纹作为 key */
  #inflightQueries = new Map<string, Observable<InstanceType<T>[]>>();

  /** 实体名称 */
  readonly entityName: string;

  constructor(
    entityName: string,
    private readonly remoteAdapter: QueryCacheRemoteAdapter,
    private readonly localAdapter: QueryCacheLocalAdapter
  ) {
    this.entityName = entityName;
  }

  /**
   * 查询实体列表
   *
   * 执行 QueryCache 同步流程：
   * 1. fetchMetadata → 获取远程元数据
   * 2. getMetadataByIds → 获取本地元数据
   * 3. diffMetadata → 对比得出需要拉取的 ID
   * 4. findByIds → 只拉取 missing + stale
   * 5. upsertMany → 写入本地缓存
   * 6. 返回合并结果
   *
   * 当 `localCacheFirst: true` 时 (SWR 模式)：
   * 1. 立即返回本地缓存（如果有）
   * 2. 后台执行上述同步流程
   * 3. 如果数据有变化，发射更新后的结果
   *
   * @param options - 查询选项
   * @returns Observable<InstanceType<T>[]>
   *
   * @example
   * ```typescript
   * repo.find({ where: { combinator: 'and', rules: [{ field: 'status', operator: 'eq', value: 'active' }] } })
   *   .subscribe();
   *
   * // SWR 模式
   * repo.find({ where: { ... }, localCacheFirst: true })
   *   .subscribe(products => {
   *     // 第一次发射：本地缓存（立即）
   *     // 第二次发射：远程更新后数据（如果有变化）
   *   });
   * ```
   */
  find(options: QueryCacheFindOptions<T>): Observable<InstanceType<T>[]> {
    const fingerprint = this.#getQueryFingerprint(options);

    // 检查是否有正在进行的相同查询
    const inflight = this.#inflightQueries.get(fingerprint);
    if (inflight) {
      return inflight;
    }

    // 创建新的查询 Observable
    let query$: Observable<InstanceType<T>[]>;

    if (options.localCacheFirst) {
      // SWR 模式：先返回缓存，再验证更新
      query$ = this.#executeSWRQuery(options);
    } else {
      // 标准模式：直接执行远程同步
      query$ = this.#executeFindQuery(options);
    }

    // 如果启用离线降级，包装查询以处理网络错误
    if (options.offlineFallback) {
      query$ = this.#wrapWithOfflineFallback(query$, options.where);
    }

    // finalize 必须在 shareReplay 之前：
    // - 之前在 shareReplay 之后 = 每个 subscriber 退订都触发 delete，并发去重窗口被缩短到一次订阅
    // - shareReplay({ refCount: true }) 当所有 subscriber 退订时取消上游订阅，避免源 Observable 常驻泄漏
    const cached$ = query$.pipe(
      finalize(() => {
        this.#inflightQueries.delete(fingerprint);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // 缓存正在进行的查询
    this.#inflightQueries.set(fingerprint, cached$);

    return cached$;
  }

  /**
   * 按 ID 查询单个实体
   *
   * @param id - 实体 ID
   * @returns Observable<InstanceType<T> | null>
   *
   * @example
   * ```typescript
   * repo.findById('product-123')
   *   .subscribe();
   * ```
   */
  findById(id: EntityStaticType<T, 'idType'>): Observable<InstanceType<T> | null> {
    // 构造单 ID 查询
    const idFilter: RuleGroup<InstanceType<T>> = {
      combinator: 'and',
      rules: [{ field: 'id', operator: '=', value: id }]
    };

    // Step 1: 同时获取远程和本地元数据
    return forkJoin({
      remoteMetadata: this.remoteAdapter.fetchMetadata(this.entityName, idFilter),
      localMetadata: this.localAdapter.getMetadataByIds(this.entityName, [id])
    }).pipe(
      switchMap(({ remoteMetadata, localMetadata }) => {
        // 远程没有该实体
        if (remoteMetadata.length === 0) {
          return of(null);
        }

        const remoteUpdatedAt = remoteMetadata[0].updatedAt;
        const localUpdatedAt = localMetadata.get(id);

        // 本地有且是新鲜的
        if (localUpdatedAt && localUpdatedAt >= remoteUpdatedAt) {
          return this.#getLocalDataByIds([id]).pipe(map(data => data[0] || null));
        }

        // 需要从远程获取
        return this.remoteAdapter.findByIds<InstanceType<T>>(this.entityName, [id]).pipe(
          switchMap(remoteData => {
            if (remoteData.length === 0) {
              return of(null);
            }

            // 写入本地缓存
            return this.localAdapter.upsertMany(this.entityName, remoteData).pipe(map(() => remoteData[0]));
          })
        );
      })
    );
  }

  /**
   * 创建实体
   *
   * 执行远程优先写入策略：
   * 1. 写入远程数据库
   * 2. 远程成功后，将返回数据缓存到本地
   * 3. 返回服务器生成的完整实体（可能包含服务器生成的 id/updatedAt）
   *
   * @param data - 要创建的实体数据
   * @returns Observable<InstanceType<T>> - 创建成功的实体
   * @throws 远程写入失败时抛出错误，本地不写入
   *
   * @example
   * ```typescript
   * repo.create({ name: 'New Product', price: 99 })
   *   .subscribe();
   * ```
   */
  create(data: Partial<InstanceType<T>>): Observable<InstanceType<T>> {
    if (!this.remoteAdapter.create) {
      throw new Error(`Remote adapter does not support create operation for ${this.entityName}`);
    }

    // 远程优先：先写入远程
    return this.remoteAdapter.create<InstanceType<T>>(this.entityName, data as InstanceType<T>).pipe(
      switchMap(createdData => {
        // 远程成功后，缓存到本地
        return this.localAdapter.upsertMany(this.entityName, [createdData]).pipe(map(() => createdData));
      })
    );
  }

  /**
   * 更新实体
   *
   * 执行远程优先写入策略：
   * 1. 更新远程数据库
   * 2. 远程成功后，将返回数据缓存到本地（使用服务器返回的最新 updatedAt）
   * 3. 返回更新后的完整实体
   *
   * @param id - 实体 ID
   * @param data - 要更新的字段
   * @returns Observable<InstanceType<T>> - 更新成功的实体
   * @throws 远程更新失败时抛出错误，本地不更新
   *
   * @example
   * ```typescript
   * repo.update('product-123', { price: 199 })
   *   .subscribe();
   * ```
   */
  update(id: string, data: Partial<InstanceType<T>>): Observable<InstanceType<T>> {
    if (!this.remoteAdapter.update) {
      throw new Error(`Remote adapter does not support update operation for ${this.entityName}`);
    }

    // 远程优先：先更新远程
    return this.remoteAdapter.update<InstanceType<T>>(this.entityName, id, data).pipe(
      switchMap(updatedData => {
        // 远程成功后，缓存到本地
        return this.localAdapter.upsertMany(this.entityName, [updatedData]).pipe(map(() => updatedData));
      })
    );
  }

  /**
   * 删除实体
   *
   * 执行远程优先写入策略：
   * 1. 从远程数据库删除
   * 2. 远程成功后，从本地缓存删除
   *
   * @param ids - 要删除的实体 ID 或 ID 数组
   * @returns Observable<void>
   * @throws 远程删除失败时抛出错误，本地不删除
   *
   * @example
   * ```typescript
   * repo.delete('product-123').subscribe();
   * repo.delete(['p1', 'p2', 'p3']).subscribe();
   * ```
   */
  delete(ids: string | string[]): Observable<void> {
    if (!this.remoteAdapter.delete) {
      throw new Error(`Remote adapter does not support delete operation for ${this.entityName}`);
    }

    const idArray = Array.isArray(ids) ? ids : [ids];

    // 远程优先：先删除远程
    return this.remoteAdapter.delete(this.entityName, ids).pipe(
      switchMap(() => {
        // 远程成功后，删除本地缓存
        return this.localAdapter.deleteByIds(this.entityName, idArray);
      })
    );
  }

  /**
   * 执行 SWR (Stale-While-Revalidate) 查询
   *
   * 流程：
   * 1. 获取本地缓存
   * 2. 如果有缓存，立即发射
   * 3. 并行执行远程验证
   * 4. 如果远程数据有变化，再次发射
   */
  #executeSWRQuery(options: QueryCacheFindOptions<T>): Observable<InstanceType<T>[]> {
    // 获取本地缓存（按查询条件过滤，避免把全量缓存当成当前查询结果）
    //
    // 契约：本地缓存读失败降级为空缓存，不阻断远程验证。
    // 错误只写 `console.error`，**不**推给订阅者——SWR 语义下缓存是可选加速层，
    // 缓存挂掉不应让查询失败。订阅者因此看不到这类失败（可观测性缺口，非数据损坏）。
    const localCache$ = this.#getLocalCache(options.where).pipe(
      catchError((error: unknown) => {
        console.error(`[QueryCacheRepository] Local cache read failed for '${this.entityName}':`, error);
        return of([] as InstanceType<T>[]);
      })
    );

    // 跟踪是否已发射缓存
    let cacheEmitted = false;
    let cachedFingerprint = '';

    // 远程验证（标准同步流程）
    const remoteSync$ = this.#executeFindQuery(options).pipe(
      filter(data => {
        // 如果没有缓存发射，总是发射远程数据
        if (!cacheEmitted) return true;
        // 如果缓存已发射，只在数据变化时发射
        const newFingerprint = this.#computeDataFingerprint(data);
        return newFingerprint !== cachedFingerprint;
      }),
      catchError((error: unknown) => (cacheEmitted ? EMPTY : throwError(() => error)))
    );

    // 使用 concat：先发射缓存，再发射远程结果
    return concat(
      localCache$.pipe(
        filter(data => data.length > 0), // 只有有缓存时才发射
        map(data => {
          cacheEmitted = true;
          cachedFingerprint = this.#computeDataFingerprint(data);
          return data;
        })
      ),
      remoteSync$
    );
  }

  /**
   * 获取本地缓存数据
   *
   * SWR 模式要求本地适配器实现 findAll；无 findAll 时返回空缓存，
   * 不再用 findByIds([]) 这种"空数组=全部"的歧义语义兜底。
   *
   * @param where - 查询条件；提供时用与远程查询同一套 matcher 在内存中过滤，
   * 保证缓存发射的集合与查询语义一致
   */
  #getLocalCache(where?: RuleGroup<InstanceType<T>>): Observable<InstanceType<T>[]> {
    if (!this.localAdapter.findAll) {
      return of([]);
    }

    return this.localAdapter
      .findAll<InstanceType<T>>(this.entityName)
      .pipe(map(data => (where ? data.filter(entity => isEntityMatchWhere(entity, where)) : data)));
  }

  /**
   * 计算数据指纹用于变更检测
   *
   * 每条实体先做确定性序列化，再排序生成集合指纹。这样既不依赖返回顺序，
   * 也不会漏掉 id/updatedAt 相同但业务字段或删除标记不同的变化。
   */
  #computeDataFingerprint(data: InstanceType<T>[]): string {
    return JSON.stringify(data.map(entity => deterministicStringify(entity)).sort());
  }

  /**
   * 包装查询以支持离线降级
   *
   * 当网络错误发生时：
   * - 如果有本地缓存，返回缓存数据
   * - 如果没有本地缓存，抛出 NetworkOfflineError
   */
  #wrapWithOfflineFallback(
    query$: Observable<InstanceType<T>[]>,
    where?: RuleGroup<InstanceType<T>>
  ): Observable<InstanceType<T>[]> {
    return query$.pipe(
      catchError((error: Error) => {
        // 网络错误时尝试返回本地缓存（按查询条件过滤）
        return this.#getLocalCache(where).pipe(
          switchMap(cachedData => {
            if (cachedData.length > 0) {
              // 有缓存，返回缓存数据
              return of(cachedData);
            }
            // 无缓存，抛出 NetworkOfflineError
            throw new NetworkOfflineError(error);
          })
        );
      })
    );
  }

  /**
   * 执行实际的查询逻辑
   */
  #executeFindQuery(options: QueryCacheFindOptions<T>): Observable<InstanceType<T>[]> {
    const query = options.where;
    const startTime = Date.now();

    // Step 1: 获取远程元数据
    return this.remoteAdapter.fetchMetadata(this.entityName, query).pipe(
      switchMap(remoteMetadata => {
        if (remoteMetadata.length === 0) {
          // 报告空结果统计
          this.#reportSyncStats(options.onSyncStats, {
            remoteCount: 0,
            missingCount: 0,
            staleCount: 0,
            freshCount: 0,
            orphanCount: 0,
            pulledCount: 0,
            durationMs: Date.now() - startTime
          });
          return of([]);
        }

        // Step 2: 获取远程 ID 对应的本地元数据
        const remoteIds = remoteMetadata.map(m => m.id);
        return this.localAdapter.getMetadataByIds(this.entityName, remoteIds).pipe(
          switchMap(localMetadata => {
            // Step 3: 对比元数据
            const diff = diffMetadata(remoteMetadata, localMetadata);
            const idsToFetch = [...diff.missingIds, ...diff.staleIds];

            // Step 4: 根据需要拉取数据
            if (idsToFetch.length === 0) {
              // 所有数据都是新鲜的，直接从本地获取
              return this.#getLocalDataByIds(diff.freshIds).pipe(
                map(result => {
                  // 报告缓存命中统计
                  this.#reportSyncStats(options.onSyncStats, {
                    remoteCount: remoteMetadata.length,
                    missingCount: 0,
                    staleCount: 0,
                    freshCount: diff.freshIds.length,
                    orphanCount: diff.orphanIds.length,
                    pulledCount: 0,
                    durationMs: Date.now() - startTime
                  });
                  return result;
                })
              );
            }

            // 需要从远程拉取部分数据
            return this.remoteAdapter.findByIds<InstanceType<T>>(this.entityName, idsToFetch).pipe(
              switchMap(pulledData => {
                if (pulledData.length === 0) {
                  // 没有拉取到数据，返回本地新鲜数据
                  return this.#getLocalDataByIds(diff.freshIds).pipe(
                    map(result => {
                      this.#reportSyncStats(options.onSyncStats, {
                        remoteCount: remoteMetadata.length,
                        missingCount: diff.missingIds.length,
                        staleCount: diff.staleIds.length,
                        freshCount: diff.freshIds.length,
                        orphanCount: diff.orphanIds.length,
                        pulledCount: 0,
                        durationMs: Date.now() - startTime
                      });
                      return result;
                    })
                  );
                }

                // Step 5: 写入本地缓存
                return this.localAdapter.upsertMany(this.entityName, pulledData).pipe(
                  switchMap(() => {
                    // Step 6: 合并返回结果
                    if (diff.freshIds.length === 0) {
                      // 没有新鲜数据，直接返回拉取的数据
                      this.#reportSyncStats(options.onSyncStats, {
                        remoteCount: remoteMetadata.length,
                        missingCount: diff.missingIds.length,
                        staleCount: diff.staleIds.length,
                        freshCount: 0,
                        orphanCount: diff.orphanIds.length,
                        pulledCount: pulledData.length,
                        durationMs: Date.now() - startTime
                      });
                      return of(pulledData);
                    }

                    // 需要合并新鲜数据和拉取的数据
                    return this.#getLocalDataByIds(diff.freshIds).pipe(
                      map(freshData => {
                        this.#reportSyncStats(options.onSyncStats, {
                          remoteCount: remoteMetadata.length,
                          missingCount: diff.missingIds.length,
                          staleCount: diff.staleIds.length,
                          freshCount: diff.freshIds.length,
                          orphanCount: diff.orphanIds.length,
                          pulledCount: pulledData.length,
                          durationMs: Date.now() - startTime
                        });
                        return [...freshData, ...pulledData];
                      })
                    );
                  })
                );
              })
            );
          })
        );
      })
    );
  }

  /**
   * 报告同步统计信息
   */
  #reportSyncStats(callback: ((stats: SyncStats) => void) | undefined, stats: SyncStats): void {
    if (callback) {
      callback(stats);
    }
  }

  /**
   * 从本地获取指定 ID 的数据
   */
  #getLocalDataByIds(ids: string[]): Observable<InstanceType<T>[]> {
    if (ids.length === 0) {
      return of([]);
    }

    if (this.localAdapter.findByIds) {
      return this.localAdapter.findByIds<InstanceType<T>>(this.entityName, ids);
    }

    // 如果本地适配器没有 findByIds，返回空数组
    return of([]);
  }

  /**
   * 生成查询指纹（用于并发去重）
   *
   * @param options - 查询选项
   * @returns 查询指纹字符串
   *
   * @remarks
   * 指纹覆盖 `where` **加上两个模式开关**：三者决定的是不同的结果流形状
   * （SWR 会先发一次缓存，offlineFallback 会把网络错误换成缓存），只按 `where` 去重
   * 会让要 SWR 的调用拿到标准模式那条流，模式参数形同虚设（US-020 AC#13）。
   *
   * `onSyncStats` 不进指纹：函数没有可靠的值身份，`deterministicStringify` 明确拒绝函数值。
   * 归一化成布尔而不是原样带上，是为了让 `undefined` 与显式 `false` 命中同一个 key。
   */
  #getQueryFingerprint(options: QueryCacheFindOptions<T>): string {
    // 使用确定性序列化，保证键顺序不同但语义相同的查询得到同一指纹
    return deterministicStringify({
      where: options.where,
      localCacheFirst: options.localCacheFirst === true,
      offlineFallback: options.offlineFallback === true
    });
  }
}
