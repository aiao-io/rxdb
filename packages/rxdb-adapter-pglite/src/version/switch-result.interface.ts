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
