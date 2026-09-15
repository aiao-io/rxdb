/**
 * @fileoverview QueryCache 策略的适配器契约
 *
 * QueryCache 读引擎在 US-025 阶段 B 搬进 `@aiao/rxdb-plugin-querycache`，这些**契约**
 * 留在核心：它们与 `RxDBAdapterRemoteBase` 的 `fetchMetadata` / `findByIds` 两个 abstract
 * 原语同一性质 —— 适配器要照着实现的形状。搬走的是消费者（引擎），不是原语。
 *
 * 另有两处核心内消费者：`query-cache-outbox.ts` 要 {@link QueryCachePendingWriteIds}，
 * `query-options.interface.ts` 要 {@link SyncStats}。
 */

import type { Observable } from 'rxjs';
import type { EntityBaseType } from '../entity/entity.interface.js';
import type { QueryCacheEntityMetadata } from '../entity/metadata-options.interface.js';
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
   * 该 duck 不再被 `QueryCacheEngine` 调用：它返回的是裸行不是实体实例，
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
   * SWR 模式下**被吞掉的**远端校验失败的上报口。
   *
   * @remarks
   * 缓存已经发射后，远端错误会被吞成 `EMPTY`（消费者已经拿到数据，再终结它的订阅没有意义）。
   * 但「远端这次没校验成功」是内部记账必须知道的事实：不知道它，
   * 「刚同步过」的记忆就会把一次失败的校验记成成功，整个窗口内不再重试。
   * 本回调只上报，不改变流的行为。
   */
  onRemoteError?: (error: Error) => void;
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
  /** 孤儿数量（本地有远程无），已扣掉被出站队列占着、本轮没删的那些 */
  orphanCount: number;
  /**
   * 因为还压在出站队列里而被本轮跳过的行数。
   *
   * @remarks
   * 与 `missingCount` / `staleCount` / `orphanCount` 不重叠：那三个报的是**真的执行了**的
   * 动作数，被跳过的行只算进这里。持续不归零说明出站队列推不动 —— 那才是要看的问题。
   */
  heldCount: number;
  /** 实际拉取数量 */
  pulledCount: number;
  /** 耗时（毫秒） */
  durationMs: number;
}

/**
 * 查询出站队列此刻占着哪些实体 id。
 *
 * @returns 还没推回远端的那些实体 id
 *
 * @remarks
 * 生产实现是 `pendingQueryCacheWriteIds`；它读的是 `rxdb_change`，与出站队列重放的
 * 取行条件同源。本类只认这个函数，不认版本管理器 —— 缓存仓储不该反向依赖同步子系统。
 */
export type QueryCachePendingWriteIds = () => Promise<ReadonlySet<string>>;
