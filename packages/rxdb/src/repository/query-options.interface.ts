import { EntityType } from '../entity/entity.interface.js';
import type { SyncStats } from './query-cache.interface.js';
import { RuleGroup } from './query.interface.js';

/**
 * 排序
 */
export interface OrderBy<T extends string = string> {
  /**
   * 排序字段
   */
  field: T;

  /**
   * 排序方式
   */
  sort: 'asc' | 'desc';
}

/**
 * FindOne 查询选项
 */
export interface FindOneOptions<
  T extends EntityType = EntityType,
  U = RuleGroup<InstanceType<T>>,
  W extends string = string
> {
  where: U;
  orderBy?: OrderBy<W>[];
}

/**
 * FindOneOrFail 查询选项
 */
export interface FindOneOrFailOptions<
  T extends EntityType = EntityType,
  U = RuleGroup<InstanceType<T>>,
  W extends string = string
> {
  where: U;
  orderBy?: OrderBy<W>[];
}

/**
 * Find 查询选项
 */
export interface FindOptions<
  T extends EntityType = EntityType,
  U = RuleGroup<InstanceType<T>>,
  W extends string = string
> {
  where: U;
  orderBy?: OrderBy<W>[];
  /**
   * 分组字段列表（对应 SQL GROUP BY）
   * 数组元素为列名字符串，由适配器负责标识符转义
   */
  groupBy?: string[];
  /**
   * 投影字段列表（对应 SQL 列选择）
   * 指定需要返回的列名，缺省返回所有列（SELECT *）
   */
  projection?: string[];

  /**
   * 获取数据量
   * @default 100
   */
  limit?: number;

  /**
   * 分页偏离量
   * @default 0
   */
  offset?: number;

  /**
   * 本地缓存优先（stale-while-revalidate）
   *
   * @remarks
   * 仅对 `sync.type === SyncType.QueryCache` 的实体有效，其余同步策略忽略本字段。
   * 优先级：**调用 &gt; 配置（`sync.local.localCacheFirst`）&gt; `false`**。
   * 该值参与查询任务的缓存键，同一 `where` 的两种模式互不复用。
   */
  localCacheFirst?: boolean;

  /**
   * 离线降级
   *
   * @remarks
   * 仅对 `sync.type === SyncType.QueryCache` 的实体有效，其余同步策略忽略本字段。
   * 打开后**只有网络故障**（连不上远端）会降级成本地缓存，判据见 `isNetworkError`；
   * 远端给出的非 2xx 是「远端的回答」，照常上抛。本地也没有缓存时抛
   * {@link NetworkOfflineError}，而不是静默返回空集。
   * 该值参与查询任务的缓存键，同一 `where` 的两种模式互不复用。
   */
  offlineFallback?: boolean;

  /**
   * QueryCache 增量同步完成后的统计回调
   *
   * @remarks
   * 仅对 `sync.type === SyncType.QueryCache` 的实体有效。
   * 同步范围是整个 `where`，与 `limit` 无关，用 `remoteCount` / `pulledCount`
   * 观测拉取放大。
   *
   * 函数没有可靠的值身份，因此**不进**查询任务的缓存键：同一 `where` 的并发查询
   * 会复用同一个任务，此时只有先到的那次调用的回调会被触发。
   */
  onSyncStats?: (stats: SyncStats) => void;
}

/**
 * FindByCursor 查询选项
 */
export interface FindByCursorOptions<
  T extends EntityType = EntityType,
  U = RuleGroup<InstanceType<T>>,
  W extends string = string
> {
  where: U;

  /**
   * 排序条件
   * 指针查询的时候必须包含唯一值的排序例如: id 作为最后一个排序参数，不然无法定位指针
   * @example
   * ```ts
   * orderBy: [
   *   { field: 'createdAt', sort: 'DESC' },
   *   { field: 'id', sort: 'ASC' } // 必须包含唯一值排序
   * ]
   * ```
   */
  orderBy: OrderBy<W>[];

  /**
   * 获取这个实体之前的实体
   */
  before?: InstanceType<T>;

  /**
   * 获取这个实体之后的实体
   */
  after?: InstanceType<T>;

  /**
   * 获取数据量
   *
   * @remarks
   * 只约束**首次**结果（≤ limit）。之后这一页是活查询，条数和边界行会随变更变化，看走哪条合并路径：
   *
   * - **CREATE 的 JS 增量合并**（常规路径）：原有的行一条不裁。页已满时，落进窗口的新行让页涨过
   *   limit、边界行不动，落在边界行之外的新行属于相邻页、照常裁掉；页未满时新行先补到 limit，
   *   边界行可能外移。
   * - **回 SQL 重查**（UPDATE 命中页内行、让某行新满足 where 或改了排序键；CREATE / DELETE 命中关系
   *   where；CREATE 事件比实体缓存陈旧）：整页按 limit 重裁，只靠增量涨出来的行随之裁掉、离开的行
   *   由后面的补上，边界行内移外移都有可能。
   * - **DELETE 的 JS 过滤**（常规路径）：被删的行直接滤掉、不补位，页可以短于 limit——
   *   「条数 < limit」推不出「后面没有数据」。
   *
   * 相邻页不受牵连：每页的游标条件在调用时就按 `after` / `before` 实体的值固化，本页涨也好缩也好，
   * 下一页的起点都不动。反过来，链式分页的消费者必须在本页**边界行**（`after` 链是页尾、`before`
   * 链是页首）换成另一行时，用新的边界行重开相邻页，否则新旧边界之间的行会漏掉或重复。
   * 三端的 `useInfiniteScroll` / `InfiniteScrollingList` 都按此重锚。
   *
   * @default 100
   */
  limit?: number;
}

/**
 * FindAll 查询选项
 */
export interface FindAllOptions<
  T extends EntityType = EntityType,
  U = RuleGroup<InstanceType<T>>,
  W extends string = string
> {
  /**
   * 查询条件
   * 用于过滤查询结果
   * 支持组合查询
   * @example
   * ```ts
   * where: {
   *   combinator: 'and',
   *   rules: [
   *     { field: 'status', operator: '=', value: 'active' },
   *     { field: 'createdAt', operator: '>=', value: '2023-01-01' }
   *   ]
   * }
   * ```
   */
  where: U;

  /**
   * 排序条件
   * @example
   * ```ts
   * orderBy: [
   *   { field: 'createdAt', sort: 'desc' },
   *   { field: 'id', sort: 'asc' } // 必须包含唯一值排序
   * ]
   */
  orderBy?: OrderBy<W>[];
}

/**
 * Count 查询选项
 */
export interface CountOptions<T extends EntityType = EntityType, U = RuleGroup<InstanceType<T>>> {
  where: U;
  groupBy?: string[];
}
