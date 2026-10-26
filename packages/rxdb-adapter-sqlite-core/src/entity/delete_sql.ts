import type { EntityMetadata, EntityType, WorktreeTableSet } from '@aiao/rxdb';
import { get_primary_key_column, quote_sql_identifier } from '../sqlite-core.utils.js';
import { get_table_name_by_metadata } from '../table-name-resolver.js';

/**
 * 生成删除实体的 sql 语句
 */
export const generate_entity_delete_sql = <T extends EntityType>(
  metadata: EntityMetadata,
  tableSet: WorktreeTableSet,
  entity: InstanceType<T>
) => {
  const tableName = get_table_name_by_metadata(metadata, tableSet);
  const params = [entity.id];
  return {
    sql: `DELETE FROM ${quote_sql_identifier(tableName)} WHERE ${quote_sql_identifier(
      get_primary_key_column(metadata)
    )} = ?;`,
    params
  };
};
