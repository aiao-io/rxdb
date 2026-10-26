/**
 * @fileoverview PGlite 的只读检出位快照原语（US-313）：按页读出存储形态的行，原样写进快照库。
 *
 * @remarks
 * 行经 `to_jsonb(t)::text` 读、`jsonb_populate_recordset` 写：两头都由 Postgres 自己编解码，
 * 时间戳不丢微秒、bytea 与区间原样往返，JS 一侧只搬文本。加密列在库里本就是信封文本，跟着原样搬。
 * 分页按主键：同一个事务里读，游标之后的行不会变。
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
import { quoteIdentifier, RxdbAdapterPGliteError } from '../pglite.utils.js';

const primaryColumnOf = (metadata: EntityMetadata): string => {
  const column = metadata.propertyMap.get('id')?.columnName;
  if (column === undefined) throw new RxdbAdapterPGliteError(`实体 ${metadata.name} 没有主键 id`);
  return column;
};

/**
 * 读一页存储形态的行。
 *
 * @param executor - 主库事务的执行器
 * @param EntityType - 主实例上的实体类
 * @param after - 上一页最后一行的主键；`null` 从头读
 * @param limit - 本页最多几行
 * @returns 行是 `to_jsonb` 的文本，游标是本页最后一行的主键
 */
export const readSnapshotPage = async (
  executor: TransactionExecutor,
  EntityType: EntityType,
  after: WorktreeSnapshotCursor | null,
  limit: number
): Promise<WorktreeSnapshotPage> => {
  const key = quoteIdentifier(primaryColumnOf(getEntityMetadata(EntityType)));
  const params: unknown[] = after === null ? [limit] : [after, limit];
  const where = after === null ? '' : ` WHERE t.${key} > $1`;
  const { rows } = await executor.query(
    `SELECT to_jsonb(t)::text, t.${key} FROM ${executor.tableRef(EntityType)} t${where} ORDER BY t.${key} LIMIT $${params.length}`,
    params
  );
  const last = rows.at(-1);
  return {
    rows: rows.map(row => row[0]),
    count: rows.length,
    next: last === undefined || rows.length < limit ? null : (last[1] as WorktreeSnapshotCursor)
  };
};

const jsonRowsOf = (page: WorktreeSnapshotPage, metadata: EntityMetadata): string[] => {
  const { rows } = page;
  if (Array.isArray(rows) && rows.every(row => typeof row === 'string')) return rows;
  throw new RxdbAdapterPGliteError(`${metadata.name} 的快照页不是 PGlite 读出的形状：主库与快照库必须是同一种后端`);
};

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
  for await (const page of table.pages) {
    if (page.count === 0) continue;
    await executor.query(
      `INSERT INTO ${tableRef} SELECT * FROM jsonb_populate_recordset(NULL::${tableRef}, $1::jsonb)`,
      [`[${jsonRowsOf(page, metadata).join(',')}]`]
    );
  }
};
