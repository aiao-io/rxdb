/**
 * @fileoverview 同步选项类型定义
 *
 * 同步策略枚举、同步适配器配置、同步选项联合类型。
 * 本文件声明"**数据同步**"层面的形状：哪些数据该走哪条管道。
 * 不引用任何字段元数据，只依赖运行时 query DSL。
 */

import type { RuleGroup } from '../repository/query.interface.js';

/**
 * 同步适配器选项接口
 * 定义数据同步适配器的配置
 */
export interface SyncAdapterOptions {
  adapter: string;
}

/**
 * 同步类型枚举
 * 定义不同的数据同步策略，控制本地数据和远程数据之间的同步方式
 *
 * 支持三种同步策略:
 * - Full: 全量同步，同步所有数据
 * - Filter: 条件同步，根据过滤条件同步部分数据
 * - none: 不同步，可以配置为只使用本地数据或只使用远程数据
 */
export enum SyncType {
  /**
   * 全量同步
   */
  Full = 'full',

  /**
   * 根据过滤条件同步
   */
  Filter = 'filter',

  /**
   * 查询缓存同步模式：远端权威 + 本地行缓存，按查询 `where` 增量同步。
   *
   * @remarks
   * 读路径是「远端元数据 diff 本地投影 → 只拉 missing/stale → 从本地行仓储读结果」，
   * 写路径是 remote-then-local。因此这条策略下的数据**不进本地 changelog**，
   * 也没有版本化路径的冲突解决 —— 远端就是唯一事实源。
   *
   * 同步粒度是整个 `where`，与 `limit` 无关：适合用 `where` 收窄的有界结果集，
   * 靠 `limit` 收窄会造成拉取放大（用 `find` 的 `onSyncStats.remoteCount` 观测）。
   *
   * 两侧适配器需具备 QueryCache 能力（本地 `getMetadataByIds` / `upsertMany` / `deleteByIds`，
   * 远端 `fetchMetadata` / `findByIds`）；缺失时构造仓储即抛 `RxDBQueryCacheCapabilityError`。
   */
  QueryCache = 'QueryCache',

  /**
   * 不同步
   */
  None = 'none'
}

/**
 * 全量同步配置接口
 * 定义完整数据同步的配置
 */
interface SyncFull {
  type: SyncType.Full;
  local: SyncAdapterOptions;
  remote: SyncAdapterOptions;
}

/**
 * 远程数据配置接口
 * 定义只访问远程数据而不同步到本地的配置
 */
interface Remote {
  type: SyncType.None;
  local?: SyncAdapterOptions;
  remote: SyncAdapterOptions;
}

/**
 * 本地数据配置接口
 * 定义只访问本地数据而不同步到远程的配置
 */
interface Local {
  type: SyncType.None;
  local: SyncAdapterOptions;
  remote?: SyncAdapterOptions;
}

/**
 * 完全不参与同步的实体配置。
 *
 * @remarks
 * 适用于由插件自行选择持久化适配器的内部实体。它与省略 `sync` 不同：省略会继承
 * 数据库级同步配置，而本配置会显式阻止实体被推送或拉取。
 */
interface SyncDisabled {
  type: SyncType.None;
  local?: never;
  remote?: never;
}

interface SyncFilterRemoteAdapterOptions extends SyncAdapterOptions {
  /**
   * 同步过滤条件
   * 定义哪些数据需要被同步，例如最近 30天 的数据
   */
  filter: () => RuleGroup<Record<string, unknown>>;
}

/**
 * 条件同步配置接口（未实现）
 * 定义基于过滤条件的数据同步的配置
 */
interface SyncFilter {
  type: SyncType.Filter;
  local: SyncAdapterOptions;
  remote: SyncFilterRemoteAdapterOptions;
}

interface SyncQueryCacheLocalAdapterOptions extends SyncAdapterOptions {
  /**
   * 本地缓存优先
   * true 查询默认使用本地缓存
   */
  localCacheFirst?: boolean;

  /**
   * 「刚同步过」的记忆窗口（毫秒），默认 `1000`。
   *
   * @remarks
   * 同步的粒度是整个 `where`，翻页只改 `limit` / `offset`。窗口内对同一个 `where` 的重复读
   * 直接读本地投影，不再问远端 —— 一次翻页交互只发生一次同步。
   *
   * 窗口只推迟重新校验，不取消它：到期、本实体发生写、适配器重连三者任一都会立即失效。
   * 配 `0` 表示完全关闭记忆，回到「每次读都向远端校验」。
   */
  syncStaleTime?: number;
}

type SyncQueryCacheRemoteAdapterOptions = SyncAdapterOptions;

/**
 * 根据查询增量同步缓存配置接口（未实现）
 *
 * 1. 查询到的内容，返回数组 [{ id:'xxx', updatedAt: Date }]
 * 2. 根据这些 id 看本地是否有这个数据，没有就拉取完整数据，有就对比 updatedAt 决定是否拉取
 */
interface SyncQueryCache {
  type: SyncType.QueryCache;
  local: SyncQueryCacheLocalAdapterOptions;
  remote: SyncQueryCacheRemoteAdapterOptions;
}

/**
 * 实体元数据，用于 QueryCache 新鲜度比较
 *
 * 这是运行时类型，不对应物理表。用于元数据查询结果，
 * 通过比较本地和远程的 `updatedAt` 来判断数据是否需要更新。
 *
 * @example
 * ```typescript
 * const remoteMetadata: QueryCacheEntityMetadata[] = [
 *   { id: 'entity-1', updatedAt: '2026-01-12T10:00:00Z' },
 *   { id: 'entity-2', updatedAt: '2026-01-12T09:30:00Z' },
 * ];
 * ```
 */
export interface QueryCacheEntityMetadata {
  /** 实体唯一标识 */
  id: string;
  /** 最后更新时间 (ISO 8601 字符串) */
  updatedAt: string;
}

/**
 * 同步配置联合类型
 * 包含所有可能的同步配置类型
 */
export type SyncOptions = SyncFull | SyncFilter | SyncQueryCache | Remote | Local | SyncDisabled;
