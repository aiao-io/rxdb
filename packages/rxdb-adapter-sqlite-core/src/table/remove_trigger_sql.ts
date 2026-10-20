import { EntityMetadata, getEntityMetadata, type WorktreeTableSet } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { quote_sql_identifier } from '../sqlite-core.utils.js';
import { get_table_name_by_metadata } from '../table-name-resolver.js';

const remove_trigger_sql = (entityMetadata: EntityMetadata, tableSet: WorktreeTableSet): string => {
  const tableName = get_table_name_by_metadata(entityMetadata, tableSet);
  return `DROP TRIGGER IF EXISTS ${quote_sql_identifier(`${tableName}_insert`)};
DROP TRIGGER IF EXISTS ${quote_sql_identifier(`${tableName}_update`)};
DROP TRIGGER IF EXISTS ${quote_sql_identifier(`${tableName}_delete`)};`;
};

export const remove_all_triggers_sql = (adapter: RxDBAdapterSqliteBase, tableSet: WorktreeTableSet): string => {
  let sql = '';
  adapter.rxdb.config.entities.forEach(EntityType => {
    const metadata = getEntityMetadata(EntityType);
    if (metadata.log !== false) {
      sql += remove_trigger_sql(metadata, tableSet);
    }
  });
  return sql;
};
