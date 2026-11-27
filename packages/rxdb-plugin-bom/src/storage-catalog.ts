import type { TransactionExecutor } from '@aiao/rxdb';

/** 一张表在目录中的列名与索引名；表不存在时两者皆空。 */
export interface TableCatalog {
  readonly columns: ReadonlySet<string>;
  readonly indexes: ReadonlySet<string>;
}

const namesOf = async (
  executor: TransactionExecutor,
  sql: string,
  column: number,
  params: readonly unknown[] = []
): Promise<ReadonlySet<string>> => new Set((await executor.query(sql, params)).rows.map(row => String(row[column])));

/**
 * 在迁移事务内读一张表的列名与索引名。
 *
 * @param executor - 迁移事务执行器
 * @param postgres - 是否 PostgreSQL 方言
 * @param tableRef - `executor.tableRef()` 给出的带引号表引用
 * @returns 列名与索引名；表总有主键列，列集为空即表不存在
 *
 * @remarks
 * 既有库的系统迁移与用户迁移都排在缺表补建之前：同一版本首次引入的实体此刻还没有表，
 * 迁移必须先查目录再读写。SQLite 的 PRAGMA 直接接受带引号的标识符、表缺失时返回空集；
 * PG 经 `to_regclass` 解析同一个表引用，缺失时为 NULL。
 */
export const readTableCatalog = async (
  executor: TransactionExecutor,
  postgres: boolean,
  tableRef: string
): Promise<TableCatalog> =>
  postgres ?
    {
      columns: await namesOf(
        executor,
        'SELECT attname FROM pg_attribute WHERE attrelid = to_regclass($1) AND attnum > 0 AND NOT attisdropped',
        0,
        [tableRef]
      ),
      indexes: await namesOf(
        executor,
        'SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = to_regclass($1)',
        0,
        [tableRef]
      )
    }
  : {
      columns: await namesOf(executor, `PRAGMA table_xinfo(${tableRef})`, 1),
      indexes: await namesOf(executor, `PRAGMA index_list(${tableRef})`, 1)
    };
