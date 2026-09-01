import { isReadOnlyStatement, shouldUsePreparedStatementPath } from './execute-sql.utils.js';
import type { Oo1Database, Oo1PreparedStatement } from './oo1-types.js';
import type { SqliteData } from './sqlite-backend.interface.js';
import type { SQLiteCompatibleType, SqliteResult } from './sqlite-core.interface.js';
import { RxDBAdapterSqliteError } from './sqlite-core.utils.js';

function wrapExecutionError(clientName: string, sql: string, stage: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new RxDBAdapterSqliteError(`${clientName} ${stage} failed for SQL "${sql}": ${message}`, { cause: error });
}

function getPreparedColumns(
  clientName: string,
  db: Oo1Database,
  sql: string,
  bindings: SQLiteCompatibleType[] | undefined
) {
  let statement: Oo1PreparedStatement | undefined;

  try {
    statement = db.prepare?.(sql);
  } catch (error) {
    wrapExecutionError(clientName, sql, 'prepare()', error);
  }

  if (!statement) {
    wrapExecutionError(clientName, sql, 'prepare()', new Error(`${clientName} prepare() is unavailable`));
  }

  try {
    // 空数组与 undefined 一样都表示「无绑定参数」：OO1 的 `Stmt.bind()` 对
    // `parameterCount === 0` 的语句无条件抛「This statement has no bindable parameters」，
    // 即使绑定的是空数组。搜索引擎对无参数 count 查询会传 `[]`，必须在这里跳过 bind。
    if (bindings && bindings.length > 0) {
      try {
        statement.bind(bindings as unknown[]);
      } catch (error) {
        wrapExecutionError(clientName, sql, 'bind()', error);
      }
    }

    try {
      const columns = statement.getColumnNames([]);
      const rows: SQLiteCompatibleType[][] = [];
      while (statement.step()) {
        rows.push(statement.get([]) as SQLiteCompatibleType[]);
      }

      return { columns, rows };
    } catch (error) {
      wrapExecutionError(clientName, sql, 'step()', error);
    }
  } finally {
    statement.finalize();
  }
}

/**
 * 适用于任何 `oo1.DB` 风格运行时的 SQL 执行助手。
 *
 * `oo1` = 上游官方 SQLite WASM 的 Object Oriented API v1（`sqlite3.oo1.DB`），
 * 与 wa-sqlite 的 C 风格执行路径无关。
 *
 * - 当运行时暴露 `prepare()` 时，对单语句 SELECT / EXPLAIN / ... RETURNING ...
 *   使用 prepared statement 快速路径。
 * - 其他情况回退到 `db.exec()`。
 *
 * `@sqlite.org/sqlite-wasm` 与 `@sqliteai/sqlite-wasm` 都暴露同步的
 * `oo1.DB.exec()`，它在内部处理多语句 SQL，因此我们直接从它收集
 * `resultRows` 和 `columnNames`。
 */
export function executeOo1Helper(
  clientName: string,
  db: Oo1Database,
  sql: string,
  bindings?: SQLiteCompatibleType[]
): SqliteResult {
  const runStart = performance.now();

  try {
    if (shouldUsePreparedStatementPath(sql) && typeof db.prepare === 'function') {
      const { columns, rows } = getPreparedColumns(clientName, db, sql, bindings);
      const results: SqliteData[] = [];
      if (columns.length) {
        results.push({ columns, rows });
      }

      return {
        sql,
        results,
        // SELECT / EXPLAIN 不产生行变更，`db.changes()` 此时返回的是上一条写语句的遗留计数 ——
        // 当成本次查询的 rowsAffected 返回会误导调用方（SQLC-030）
        rowsAffected: isReadOnlyStatement(sql) ? 0 : db.changes(),
        elapsed: performance.now() - runStart
      };
    }

    const resultRows: unknown[][] = [];
    const columnNames: string[] = [];

    db.exec({
      sql,
      bind: bindings as unknown[],
      resultRows,
      columnNames,
      rowMode: 'array'
    });

    const rowsAffected = db.changes();

    const results: SqliteData[] = [];
    if (columnNames.length) {
      results.push({
        columns: columnNames,
        rows: resultRows as SQLiteCompatibleType[][]
      });
    }

    return {
      sql,
      results,
      rowsAffected,
      elapsed: performance.now() - runStart
    };
  } catch (error) {
    wrapExecutionError(clientName, sql, 'execute()', error);
  }
}
