import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import type { SqliteBlankDatabase } from '../sqlite-core.types.js';
import { quote_sql_identifier } from '../sqlite-core.utils.js';
import {
  readSqliteBackupSchema,
  selectSqliteRows,
  sqliteRowLiteralBytes,
  sqliteTextValue,
  type SqliteBackupExecutor,
  type SqliteBackupPlan
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

/** 只用来比较行字面量：windows-1252 把 256 个字节一一映射到不同字符，两份字节相同当且仅当解码结果相同。 */
const bytewise = new TextDecoder('latin1');

interface SqliteDatabaseShape {
  readonly plan: SqliteBackupPlan;
  readonly shape: string;
}

/** 结构加每张表的行数：只数行不读行，行多的目标在这一步就能判出不同。 */
const readShape = async (executor: SqliteBackupExecutor): Promise<SqliteDatabaseShape> => {
  const plan = await readSqliteBackupSchema(executor);
  const counts: SQLiteCompatibleType[] = [];
  for (const dump of plan.dumps) {
    const table = quote_sql_identifier(plan.schema.tables[dump.table].name);
    const [[count]] = await selectSqliteRows(executor, `SELECT count(*) FROM ${table}`, undefined, 'io_error');
    counts.push(typeof count === 'bigint' ? Number(count) : count);
  }
  return { plan, shape: JSON.stringify({ schema: plan.schema, counts }) };
};

const readRows = async (executor: SqliteBackupExecutor, plan: SqliteBackupPlan): Promise<string> => {
  const rows: string[][] = [];
  for (const dump of plan.dumps) {
    // LIMIT -1 表示不限行数
    const page = await selectSqliteRows(executor, dump.firstPageSql, [-1], 'io_error');
    rows.push(page.map(row => bytewise.decode(sqliteRowLiteralBytes(row[0]))));
  }
  return JSON.stringify(rows);
};

/**
 * 描述一个库的结构与全部行，供恢复判断目标是否「恰好等于新建空库」。
 *
 * @remarks
 * 结构沿用备份读出的 {@link readSqliteBackupSchema}，行是转储用的整行字面量，
 * 所以两份描述相同就意味着备份两个库会得到相同的内容。库里有恢复标记时抛 `restore_incomplete`。
 *
 * @param executor - 客户端
 * @returns 对象列表、结构与行数、全部行
 */
export const describeSqliteDatabase = async (executor: SqliteBackupExecutor): Promise<SqliteBlankDatabase> => {
  const objects = await listSqliteObjects(executor);
  if (objects.length === 0) return { objects, shape: '', description: '' };
  const { plan, shape } = await readShape(executor);
  return { objects, shape, description: await readRows(executor, plan) };
};

/**
 * 库里的对象与行是否恰好等于 `blank`。
 *
 * @remarks
 * 先比结构与每张表的行数，相同才读行：目标的引擎表里可能攒了大量行，不能为了判「不空」把它们全读进内存。
 *
 * @param executor - 客户端
 * @param blank - 新建空库的描述
 * @returns 相同为 `true`
 */
export const matchesSqliteBlankDatabase = async (
  executor: SqliteBackupExecutor,
  blank: SqliteBlankDatabase
): Promise<boolean> => {
  const objects = await listSqliteObjects(executor);
  if (objects.join('\n') !== blank.objects.join('\n')) return false;
  if (objects.length === 0) return true;
  const { plan, shape } = await readShape(executor);
  return shape === blank.shape && (await readRows(executor, plan)) === blank.description;
};
