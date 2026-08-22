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

import { concat, defer, EMPTY, finalize, forkJoin, Observable, of, throwError } from 'rxjs';
import { catchError, filter, map, shareReplay, switchMap } from 'rxjs/operators';
import { EntityBaseType, EntityStaticType } from '../entity/entity.interface.js';
import type { QueryCacheEntityMetadata } from '../entity/metadata-options.interface.js';
import { deterministicStringify } from '../rxdb-utils.js';
import { NetworkOfflineError } from '../RxDBError.js';
import { diffMetadata } from './diff-metadata.js';
import { isNetworkError } from './network-error.js';
import { queryCacheFingerprint } from './query-cache-sync-memo.js';
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
  /**
   * 按 ID 获取完整数据
   *
   * @deprecated 本地读已改走 {@link QueryCacheLocalReader}（US-020 D8）。
   * 该 duck 不再被 `QueryCacheRepository` 调用：它返回的是裸行不是实体实例，
   * 且「适配器没实现就当查不到」的降级会把缓存故障伪装成「远端没有数据」。
   * 保留仅为不破坏已实现它的适配器，下一个大版本移除。
   */
  findByIds?<T>(entityName: string, ids: string[]): Observable<T[]>;
  /**
   * 获取所有本地缓存数据
   *
   * @deprecated 同 {@link QueryCacheLocalAdapter.findByIds}。SWR 的缓存首发现在由
   * {@link QueryCacheLocalReader} 按 `where` 下推读取，不再「全表进内存再 JS 过滤」。
   */
  findAll?<T>(entityName: string): Observable<T[]>;
}

/**
 * QueryCache 读侧的本地出口（US-020 D8）。
 *
 * @typeParam T - 实体实例类型
 *
 * @remarks
 * 生产实现就是该实体的本地 `IRepository`：`where` 下推成 SQL、返回实体实例。
 * 之所以在这里收窄成只有 `find` 的一个接口，而不是直接依赖 `IRepository`：
 * 本类按 `entityName` 工作，拿不到实体类，`IRepository<T extends EntityType>` 的
 * 类型参数在这一层无从填写。
 *
 * 契约里没有「读不到」这个分支 —— 读失败必须上抛。缓存读静默降级成空集合，
 * 对调用方看起来与「远端确实没有数据」完全一样，是最难查的一类故障。
 */
export interface QueryCacheLocalReader<T> {
  /**
   * 按查询条件读取本地行。
   *
   * @param options - 仅 `where`；`limit` / `offset` / `orderBy` 由上层门面负责
   * @returns 匹配的实体实例
   */
  find(options: { where: RuleGroup<T> }): Promise<T[]>;
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
 * 取一行的主键。
 *
 * @remarks
 * `EntityBaseType` 不在类型上保证 `id` / `updatedAt`，但 QueryCache 策略要求实体满足
 * {@link QueryCacheEntity}（配置该策略即为承诺）。这里把断言集中到两个函数里，
 * 而不是散在 diff 逻辑中间。
 */
const rowId = (entity: unknown): string => (entity as QueryCacheEntity).id;

/**
 * 取一行的 `updatedAt` 并归一成 ISO 8601 串，用于与远端元数据比对新鲜度。
 *
 * @remarks
 * 必须归一，因为本地出口换成 `IRepository` 之后（US-020 D8）读回来的是**实体实例**，
 * 而 `updatedAt` 在实体上是 `Date`（`PropertyType.date` 存 TEXT、读成 `Date`）。
 * {@link diffMetadata} 按 ISO 字典序比较，`'2026-08-09T…' > new Date(…)` 会先把两边
 * 按 number 提示取原始值 —— 字符串那侧转成 `NaN`，比较**恒为 false**，于是所有行都判 fresh、
 * 远端的更新永远拉不下来。这是静默的：查询照常返回，只是内容停在第一次同步的那一刻。
 */
const rowUpdatedAt = (entity: unknown): string => {
  const updatedAt = (entity as { updatedAt: unknown }).updatedAt;
  return updatedAt instanceof Date ? updatedAt.toISOString() : (updatedAt as QueryCacheEntity['updatedAt']);
};

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
 * 远端对 `where` 的答复是权威的：本次 `where` 的本地投影里、远端没有返回的行一律是孤儿，
 * 同步时删除（US-020 AC#11）。删除范围严格限定在该投影内 —— 不匹配 `where` 的本地行
 * 不在本次问题域里，不能因为「远端没提」就被清掉。
 */
export class QueryCacheRepository<T extends EntityBaseType = EntityBaseType> {
  /** 并发查询去重缓存 - 使用查询指纹作为 key */
  #inflightQueries = new Map<string, Observable<InstanceType<T>[]>>();

  /** 实体名称 */
  readonly entityName: string;

  /**
   * @param entityName - 实体名
   * @param remoteAdapter - 远端适配器
   * @param localAdapter - 本地适配器，负责写侧（upsert / delete）与单实体元数据
   * @param localReader - 本地行读取出口，通常是该实体的本地 `IRepository`（US-020 D8）
   */
  constructor(
    entityName: string,
    private readonly remoteAdapter: QueryCacheRemoteAdapter,
    private readonly localAdapter: QueryCacheLocalAdapter,
    private readonly localReader: QueryCacheLocalReader<InstanceType<T>>
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
          return this.#readLocalByIds([id]).pipe(map(data => data[0] ?? null));
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
    // 缓存首发：按查询条件下推读取，读到什么就是本次 `where` 的本地投影。
    //
    // 读失败**不**降级为空缓存：远程校验分支同样要读这一份投影（算孤儿、挑新鲜行），
    // 本地读挂了两条路都走不通，吞掉只会把「缓存坏了」显示成「远端没数据」（US-020 AC#15）。
    const localCache$ = this.#readLocal(options.where);

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
   * 读取 `where` 的本地投影。
   *
   * @param where - 查询条件，原样交给本地行仓储下推成 SQL
   * @returns 匹配的实体实例；读失败时上抛
   *
   * @remarks
   * `defer` 而不是直接 `from(promise)`：后者在 Observable 构造时就把查询发出去了，
   * 于是 `offlineFallback` 包出来的那条备用流会在主流程还没失败时抢跑一次本地读。
   */
  #readLocal(where: RuleGroup<InstanceType<T>>): Observable<InstanceType<T>[]> {
    return defer(() => this.localReader.find({ where }));
  }

  /**
   * 按 ID 集合读取本地行。
   *
   * @param ids - 目标 ID；空数组直接返回空结果，不发查询
   *
   * @remarks
   * 走 `id in (...)` 而不是 `findByIds` duck：同一个出口才拿得到实体实例，
   * 也才有 US-021 的 identity cache（同一 id 两次查询是同一个实例）。
   */
  #readLocalByIds(ids: string[]): Observable<InstanceType<T>[]> {
    if (ids.length === 0) {
      return of([]);
    }
    const idFilter = {
      combinator: 'and',
      rules: [{ field: 'id', operator: 'in', value: ids }]
    } as RuleGroup<InstanceType<T>>;
    return this.#readLocal(idFilter);
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
   * 包装查询以支持离线降级。
   *
   * @param query$ - 主查询流
   * @param where - 查询条件，降级读缓存时沿用
   *
   * @remarks
   * 只有 {@link isNetworkError} 认定的网络故障才降级（US-020 AC#16）：
   * - 网络故障 + 有缓存 → 发缓存
   * - 网络故障 + 无缓存 → {@link NetworkOfflineError}
   * - 其余错误（401、唯一键冲突、字段校验失败……）**原样上抛**
   *
   * 分类写成谓词而不是在这里就地判断，是为了和 US-212 的重试策略共用同一套口径。
   * 拿不准的错误一律算「不是网络错误」：把 401 静默换成陈旧缓存，比让离线查询失败更糟。
   */
  #wrapWithOfflineFallback(
    query$: Observable<InstanceType<T>[]>,
    where: RuleGroup<InstanceType<T>>
  ): Observable<InstanceType<T>[]> {
    return query$.pipe(
      catchError((error: unknown) => {
        if (!isNetworkError(error)) {
          return throwError(() => error);
        }
        return this.#readLocal(where).pipe(
          switchMap(cachedData =>
            cachedData.length > 0 ? of(cachedData) : throwError(() => new NetworkOfflineError(error as Error))
          )
        );
      })
    );
  }

  /**
   * 执行一次完整同步并返回该 `where` 的结果集。
   *
   * @remarks
   * 远端元数据与本地投影**并行**取（两者互不依赖），再一次性 diff：
   * 1. `fetchMetadata(where)` —— 远端权威的 id + updatedAt
   * 2. `localReader.find({ where })` —— 本次 `where` 的本地投影（行，非元数据）
   * 3. `diffMetadata` —— 分出 missing / stale / fresh / orphan
   * 4. 删孤儿 → 拉 missing + stale → 落本地 → 与 fresh 行合并
   *
   * 本地这一侧读行而不是读元数据，是因为孤儿只能从「本地投影」里看出来：
   * 只按远端 id 问本地（旧实现的 `getMetadataByIds(remoteIds)`）永远问不出
   * 「本地有、远端没有」的那批，`orphanIds` 结构性恒为空。顺带也省掉一次读 ——
   * fresh 行已经在手上，不必再回本地取一次。
   */
  #executeFindQuery(options: QueryCacheFindOptions<T>): Observable<InstanceType<T>[]> {
    const startTime = Date.now();

    return forkJoin({
      remoteMetadata: this.remoteAdapter.fetchMetadata(this.entityName, options.where),
      localRows: this.#readLocal(options.where)
    }).pipe(
      switchMap(({ remoteMetadata, localRows }) => this.#reconcile(options, remoteMetadata, localRows, startTime))
    );
  }

  /**
   * 按 diff 结果执行同步动作并汇总结果。
   *
   * @param options - 原始查询选项，取 `onSyncStats`
   * @param remoteMetadata - 远端元数据
   * @param localRows - 本次 `where` 的本地投影
   * @param startTime - 同步起始时刻，用于 `durationMs`
   */
  #reconcile(
    options: QueryCacheFindOptions<T>,
    remoteMetadata: QueryCacheEntityMetadata[],
    localRows: InstanceType<T>[],
    startTime: number
  ): Observable<InstanceType<T>[]> {
    const localMetadata = new Map(localRows.map(entity => [rowId(entity), rowUpdatedAt(entity)]));
    const diff = diffMetadata(remoteMetadata, localMetadata);
    const freshIds = new Set(diff.freshIds);
    const freshRows = localRows.filter(entity => freshIds.has(rowId(entity)));

    return this.#evictOrphans(diff.orphanIds).pipe(
      switchMap(() => this.#pull([...diff.missingIds, ...diff.staleIds])),
      map(pulledRows => {
        this.#reportSyncStats(options.onSyncStats, {
          remoteCount: remoteMetadata.length,
          missingCount: diff.missingIds.length,
          staleCount: diff.staleIds.length,
          freshCount: diff.freshIds.length,
          orphanCount: diff.orphanIds.length,
          pulledCount: pulledRows.length,
          durationMs: Date.now() - startTime
        });
        return [...freshRows, ...pulledRows];
      })
    );
  }

  /**
   * 删除本次 `where` 投影里远端已不再返回的行（US-020 AC#11 / AC#12）。
   *
   * @param ids - 孤儿 ID；为空时不发删除
   *
   * @remarks
   * 删的是缓存行，不产生 changelog —— QueryCache 的本地库是远端的投影，
   * 不是待推送的本地变更（US-020 AC#20）。
   */
  #evictOrphans(ids: string[]): Observable<void> {
    if (ids.length === 0) {
      return of(undefined);
    }
    return this.localAdapter.deleteByIds(this.entityName, ids);
  }

  /**
   * 从远端拉取缺失/过期的行并落本地缓存。
   *
   * @param ids - 待拉取 ID；为空时不发请求
   * @returns 实际拉到的行
   */
  #pull(ids: string[]): Observable<InstanceType<T>[]> {
    if (ids.length === 0) {
      return of([]);
    }
    return this.remoteAdapter
      .findByIds<InstanceType<T>>(this.entityName, ids)
      .pipe(
        switchMap(pulledRows =>
          pulledRows.length === 0 ?
            of(pulledRows)
          : this.localAdapter.upsertMany(this.entityName, pulledRows).pipe(map(() => pulledRows))
        )
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
    // 与 QueryCacheSyncMemo 共用同一把尺（US-020 D13）：并发去重与「刚同步过」的记忆
    // 一旦各算各的，同一个 `where` 会在两处得到不同的 key，行为无从对齐。
    return queryCacheFingerprint(options);
  }
}
