import type { SQLiteCompatibleType, SqliteSuccessResult } from '../sqlite-core.interface.js';
import type { SqliteStatement } from './switch-result.utils.js';

/**
 * 「能执行 SQL 的东西」——`SqliteClientLike` 与 `SqliteTransactionExecutor` 都满足。
 *
 * @remarks
 * 这些 helper 只需要 `execute()`。声明成完整的 `SqliteClientLike` 会把 `disconnect` /
 * `version` / `addEventListener` 一并要求进来，导致事务作用域的 executor 传不进来 ——
 * 而事务里恰恰只能用 executor（C2：持有它才算在本事务内）。
 */
export interface SqlStatementSink {
  execute(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteSuccessResult>;
}

export const executeSqliteStatements = async (
  client: SqlStatementSink,
  statements: SqliteStatement[]
): Promise<void> => {
  for (const statement of statements) {
    await client.execute(statement.sql, statement.params);
  }
};

export const executeSqliteSelectStatements = async (
  client: SqlStatementSink,
  statements: SqliteStatement[] | undefined
): Promise<SqliteSuccessResult | undefined> => {
  if (!statements || statements.length === 0) return undefined;

  const results: SqliteSuccessResult[] = [];
  for (const statement of statements) {
    results.push(await client.execute(statement.sql, statement.params));
  }

  return {
    sql: results.map(result => result.sql).join('\n'),
    rowsAffected: results.reduce((total, result) => total + result.rowsAffected, 0),
    elapsed: results.reduce((total, result) => total + result.elapsed, 0),
    results: results.flatMap(result => result.results)
  };
};
