import type { SqliteBlankDatabase } from '../sqlite-core.types.js';
import {
  readSqliteBackupSchema,
  selectSqliteRows,
  sqliteTextValue,
  type SqliteBackupExecutor
} from './sqlite-backup-schema.js';

/** 用户可见对象（`sqlite_` 开头的内部对象除外）的 `type:name`，已排序。 */
const USER_OBJECTS = "SELECT type, name FROM sqlite_schema WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\'";

/**
 * 列出库里的用户对象。
 *
 * @param executor - 客户端
 * @returns `type:name`，按字典序
 */
export const listSqliteObjects = async (executor: SqliteBackupExecutor): Promise<string[]> => {
  const rows = await selectSqliteRows(executor, USER_OBJECTS, undefined, 'io_error');
  return rows
    .map(([type, name]) => `${sqliteTextValue(type, 'object type')}:${sqliteTextValue(name, 'object name')}`)
    .sort();
};

/**
 * 描述一个库的结构与全部行，供恢复判断目标是否「恰好等于新建空库」。
 *
 * @remarks
 * 结构沿用备份读出的 {@link readSqliteBackupSchema}，行是转储用的整行字面量，
 * 所以两份描述相同就意味着备份两个库会得到相同的内容。库里有恢复标记时抛 `restore_incomplete`。
 *
 * @param executor - 客户端
 * @returns 对象列表与描述
 */
export const describeSqliteDatabase = async (executor: SqliteBackupExecutor): Promise<SqliteBlankDatabase> => {
  const objects = await listSqliteObjects(executor);
  if (objects.length === 0) return { objects, description: '' };
  const { schema, dumps } = await readSqliteBackupSchema(executor);
  const rows: string[][] = [];
  for (const dump of dumps) {
    // LIMIT -1 表示不限行数
    const page = await selectSqliteRows(executor, dump.firstPageSql, [-1], 'io_error');
    rows.push(page.map(row => sqliteTextValue(row[0], 'row literal')));
  }
  return { objects, description: JSON.stringify({ schema, rows }) };
};
