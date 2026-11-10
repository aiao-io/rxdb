import type { EntityMetadata, RxDBEntityId, WorktreeTableSet } from '@aiao/rxdb';
import { primaryKeyColumnSql } from '../primary-key-column.js';
import { getTableNameByMetadata } from '../table-name-resolver.js';

/**
 * 生成删除单个实体的 SQL，按主键物理列定位行（主键属性 `id` 可被 `columnName` 改写）
 * @param metadata - 实体元数据
 * @param entity - 要删除的实体实例
 * @returns PostgreSQL 的 SQL 查询和参数
 */
export default (metadata: EntityMetadata, tableSet: WorktreeTableSet, entity: { id: RxDBEntityId }) => {
  const tableName = getTableNameByMetadata(metadata, tableSet);
  const params = [entity.id];
  return {
    sql: `DELETE FROM ${tableName} WHERE ${primaryKeyColumnSql(metadata)} = $1;`,
    params
  };
};
