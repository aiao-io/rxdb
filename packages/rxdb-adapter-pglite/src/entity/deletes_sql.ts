import type { EntityMetadata, RxDBEntityId, WorktreeTableSet } from '@aiao/rxdb';
import { chunkByPgParamLimit, quoteIdentifier } from '../pglite.utils.js';
import { getTableNameByMetadata } from '../table-name-resolver.js';

interface DeleteStatement {
  sql: string;
  params: RxDBEntityId[];
}

/**
 * 生成批量删除实体的 SQL
 * 按 PostgreSQL 参数上限生成参数化删除语句
 * @param metadata - 实体元数据
 * @param entities - 要删除的实体实例数组
 * @returns 可依次执行的 SQL 语句
 */
export default (
  metadata: EntityMetadata,
  tableSet: WorktreeTableSet,
  entities: Array<{ id: RxDBEntityId }>
): DeleteStatement[] => {
  const tableName = getTableNameByMetadata(metadata, tableSet);
  const idColumn = quoteIdentifier(metadata.propertyMap.get('id')?.columnName ?? 'id');
  return chunkByPgParamLimit(entities, 1).map(chunk => {
    const params = chunk.map(entity => entity.id);
    const placeholders = params.map((_, index) => `$${index + 1}`).join(',');
    return { sql: `DELETE FROM ${tableName} WHERE ${idColumn} IN (${placeholders});`, params };
  });
};
