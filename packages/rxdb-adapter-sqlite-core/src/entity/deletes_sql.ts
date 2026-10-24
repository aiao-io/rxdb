import type { EntityMetadata, EntityType, WorktreeTableSet } from '@aiao/rxdb';
import { get_primary_key_column, get_sql_value, quote_sql_identifier } from '../sqlite-core.utils.js';
import { get_table_name_by_metadata } from '../table-name-resolver.js';

/**
 * 生成批量删除实体的 SQL 语句
 */
export const generate_entity_deletes_sql = <T extends EntityType>(
  metadata: EntityMetadata,
  tableSet: WorktreeTableSet,
  entities: InstanceType<T>[]
) => {
  const tableName = get_table_name_by_metadata(metadata, tableSet);
  const quotedTableName = quote_sql_identifier(tableName);
  if (entities.length === 0) return `DELETE FROM ${quotedTableName} WHERE 1 = 0;`;
  const ids = entities.map(e => get_sql_value(e.id)).join(',');
  return `DELETE FROM ${quotedTableName} WHERE ${quote_sql_identifier(get_primary_key_column(metadata))} in (${ids});`;
};
