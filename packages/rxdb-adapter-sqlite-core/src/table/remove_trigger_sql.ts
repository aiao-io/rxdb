import { EntityMetadata, type WorktreeTableSet } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { quote_sql_identifier } from '../sqlite-core.utils.js';
import { get_table_name_by_metadata } from '../table-name-resolver.js';
import { table_set_logged_metadata } from './trigger_sql.js';

const remove_trigger_sql = (entityMetadata: EntityMetadata, tableSet: WorktreeTableSet): string => {
  const tableName = get_table_name_by_metadata(entityMetadata, tableSet);
  return `DROP TRIGGER IF EXISTS ${quote_sql_identifier(`${tableName}_insert`)};
DROP TRIGGER IF EXISTS ${quote_sql_identifier(`${tableName}_update`)};
DROP TRIGGER IF EXISTS ${quote_sql_identifier(`${tableName}_delete`)};`;
};

/**
 * 删掉一套表的全部变更触发器。
 *
 * @param adapter - SQLite 适配器
 * @param tableSet - 删哪一套表的触发器
 * @returns `DROP TRIGGER IF EXISTS` 语句；这套表里没有记日志的实体时为空串
 *
 * @remarks
 * 实体按 {@link table_set_logged_metadata} 收窄：影子表集只删成员自己的触发器，主表集的一个都不碰。
 */
export const remove_all_triggers_sql = (adapter: RxDBAdapterSqliteBase, tableSet: WorktreeTableSet): string =>
  table_set_logged_metadata(adapter, tableSet)
    .map(metadata => remove_trigger_sql(metadata, tableSet))
    .join('');
