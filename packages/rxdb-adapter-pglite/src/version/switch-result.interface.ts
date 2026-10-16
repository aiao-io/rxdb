import { Results } from '@electric-sql/pglite';

import { EntityData, EntityMetadata, RxDBEntityId } from '@aiao/rxdb';

/**
 * 版本切换 SQL 操作项
 *
 * 表示单个实体表的切换操作（删除/插入/更新）
 */
export interface SwitchVersionSqlItem {
  /** 实体元数据 */
  metadata: EntityMetadata;

  /** 受影响的实体 ID 集合 */
  ids: Set<RxDBEntityId>;

  /** PostgreSQL SQL 语句 */
  sql: string;

  /** PostgreSQL 参数数组 */
  params: unknown[];

  /** SQL 执行结果 */
  successResults?: Results<Record<string, unknown>>;

  /**
   * 实体变更映射：key 为 entityId，value 为对应的 SwitchVersionChange
   * 用于事件发送时获取精准的 patch/inversePatch
   */
  changes: Map<RxDBEntityId, { patch: EntityData | null; inversePatch: EntityData | null }>;

  /**
   * 更新项是否排在全部插入之前执行（声明了区间排他的实体，US-030 AC#14）。
   * 语句已按「收窄类在前」排好，见核心 `orderExclusionUpdates`。
   */
  beforeInserts?: boolean;
}

/**
 * 版本切换 SQL 结果
 *
 * 包含所有需要执行的 SQL 操作，按操作类型分组
 */
export interface SwitchVersionSqlResult {
  /** 删除操作列表 */
  deletes: SwitchVersionSqlItem[];

  /** 插入操作列表 */
  inserts: SwitchVersionSqlItem[];

  /** 更新操作列表 */
  updates: SwitchVersionSqlItem[];
}
