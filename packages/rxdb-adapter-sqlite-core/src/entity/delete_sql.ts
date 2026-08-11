import type { EntityMetadata, EntityType } from '@aiao/rxdb';
import { get_primary_key_column, get_table_name_by_metadata, quote_sql_identifier } from '../sqlite-core.utils.js';

/**
 * 生成删除实体的 sql 语句
 */
export const generate_entity_delete_sql = <T extends EntityType>(metadata: EntityMetadata, entity: InstanceType<T>) => {
  const tableName = get_table_name_by_metadata(metadata);
  const params = [entity.id];
  return {
    sql: `DELETE FROM ${quote_sql_identifier(tableName)} WHERE ${quote_sql_identifier(
      get_primary_key_column(metadata)
    )} = ?;`,
    params
  };
};
