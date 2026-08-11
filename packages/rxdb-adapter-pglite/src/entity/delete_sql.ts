import type { EntityMetadata, RxDBEntityId } from '@aiao/rxdb';
import { getTableNameByMetadata } from '../pglite.utils.js';

/**
 * 生成删除单个实体的 SQL
 * @param metadata - 实体元数据
 * @param entity - 要删除的实体实例
 * @returns PostgreSQL 的 SQL 查询和参数
 */
export default (metadata: EntityMetadata, entity: { id: RxDBEntityId }) => {
  const tableName = getTableNameByMetadata(metadata);
  const params = [entity.id];
  return {
    sql: `DELETE FROM ${tableName} WHERE id = $1;`,
    params
  };
};
