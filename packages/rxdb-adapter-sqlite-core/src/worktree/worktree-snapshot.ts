/**
 * @fileoverview SQLite 系的只读检出位快照原语（US-313）：按 rowid 分页读出存储形态的行，原样写进快照库。
 *
 * @remarks
 * 读出来的是 SQLite 的原值（整数、实数、文本、BLOB、NULL），按原值绑定回去，中间不经 JS 类型转换；
 * 加密列在库里是信封文本，跟着原样搬。写入按快照表自己的列清单（`PRAGMA table_info`）取列：
 * 主库表上插件后加的列（快照实例没装那个插件）不搬，快照表有而主库页里没有的列直接报错。
 * 分页按 rowid：同一个事务里读，游标之后的行不会变。
 */

import type {
  EntityMetadata,
  EntityType,
  TransactionExecutor,
  WorktreeSnapshotCursor,
  WorktreeSnapshotPage,
  WorktreeSnapshotTable
} from '@aiao/rxdb';
import { getEntityMetadata } from '@aiao/rxdb';
import { chunkBySqliteBindLimit, quote_sql_identifier, RxDBAdapterSqliteError } from '../sqlite-core.utils.js';

/** 页里的行：列名与按列排的原值。 */
interface SqliteSnapshotRows {
  readonly columns: readonly string[];
  readonly values: readonly (readonly unknown[])[];
}

/** 读页时 rowid 的列名：不会与实体列撞名。 */
const ROWID_COLUMN = '__rxdb_worktree_rowid__';

/**
 * 读一页存储形态的行。
 *
 * @param executor - 主库事务的执行器
 * @param EntityType - 主实例上的实体类
 * @param after - 上一页最后一行的 rowid；`null` 从头读
 * @param limit - 本页最多几行
 * @returns 行是列名加原值，游标是本页最后一行的 rowid
 */
export const readSnapshotPage = async (
  executor: TransactionExecutor,
  EntityType: EntityType,
  after: WorktreeSnapshotCursor | null,
  limit: number
): Promise<WorktreeSnapshotPage> => {
  const where = after === null ? '' : ' WHERE rowid > ?';
  const params: unknown[] = after === null ? [limit] : [after, limit];
  const { columns, rows } = await executor.query(
    `SELECT rowid AS ${quote_sql_identifier(ROWID_COLUMN)}, * FROM ${executor.tableRef(EntityType)}${where} ORDER BY rowid LIMIT ?`,
    params
  );
  const last = rows.at(-1);
  const page: SqliteSnapshotRows = { columns: columns.slice(1), values: rows.map(row => row.slice(1)) };
  return {
    rows: page,
    count: rows.length,
    next: last === undefined || rows.length < limit ? null : (last[0] as WorktreeSnapshotCursor)
  };
};

const sqliteRowsOf = (page: WorktreeSnapshotPage, metadata: EntityMetadata): SqliteSnapshotRows => {
  const rows = page.rows as Partial<SqliteSnapshotRows> | null;
  if (rows && Array.isArray(rows.columns) && Array.isArray(rows.values)) return rows as SqliteSnapshotRows;
  throw new RxDBAdapterSqliteError(`${metadata.name} 的快照页不是 SQLite 系读出的形状：主库与快照库必须是同一种后端`);
};

/** 快照表每一列在页里的下标；页里缺快照表的列就是两边结构对不上。 */
const columnIndexesOf = (
  targetColumns: readonly string[],
  rows: SqliteSnapshotRows,
  metadata: EntityMetadata
): number[] =>
  targetColumns.map(column => {
    const index = rows.columns.indexOf(column);
    if (index === -1) {
      throw new RxDBAdapterSqliteError(`主库的 ${metadata.name} 表没有快照表的列 ${column}：两边的实体结构不一致`);
    }
    return index;
  });

/**
 * 把一张表的页原样插进快照库。
 *
 * @param executor - 快照库事务的执行器
 * @param table - 快照实例上的实体类与主库读出的页
 */
export const importSnapshotTable = async (
  executor: TransactionExecutor,
  table: WorktreeSnapshotTable
): Promise<void> => {
  const metadata = getEntityMetadata(table.EntityType);
  const tableRef = executor.tableRef(table.EntityType);
  const { rows: info } = await executor.query(`PRAGMA table_info(${tableRef})`);
  const targetColumns = info.map(row => String(row[1]));
  const columnList = targetColumns.map(quote_sql_identifier).join(', ');
  const group = `(${targetColumns.map(() => '?').join(', ')})`;
  for await (const page of table.pages) {
    if (page.count === 0) continue;
    const rows = sqliteRowsOf(page, metadata);
    const indexes = columnIndexesOf(targetColumns, rows, metadata);
    for (const chunk of chunkBySqliteBindLimit(rows.values, targetColumns.length)) {
      await executor.query(
        `INSERT INTO ${tableRef} (${columnList}) VALUES ${chunk.map(() => group).join(', ')}`,
        chunk.flatMap(row => indexes.map(index => row[index]))
      );
    }
  }
};
