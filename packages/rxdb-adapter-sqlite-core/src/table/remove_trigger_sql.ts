import { EntityMetadata, getEntityMetadata } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { get_table_name_by_metadata, quote_sql_identifier } from '../sqlite-core.utils.js';

const remove_trigger_sql = (entityMetadata: EntityMetadata): string => {
  const tableName = get_table_name_by_metadata(entityMetadata);
  return `DROP TRIGGER IF EXISTS ${quote_sql_identifier(`${tableName}_insert`)};
DROP TRIGGER IF EXISTS ${quote_sql_identifier(`${tableName}_update`)};
DROP TRIGGER IF EXISTS ${quote_sql_identifier(`${tableName}_delete`)};`;
};

export const remove_all_triggers_sql = (adapter: RxDBAdapterSqliteBase): string => {
  let sql = '';
  adapter.rxdb.config.entities.forEach(EntityType => {
    const metadata = getEntityMetadata(EntityType);
    if (metadata.log !== false) {
      sql += remove_trigger_sql(metadata);
    }
  });
  return sql;
};
