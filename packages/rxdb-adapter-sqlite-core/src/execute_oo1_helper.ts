import { shouldUsePreparedStatementPath } from './execute-sql.utils.js';
import type { Oo1Database, Oo1PreparedStatement } from './oo1-types.js';
import type { SqliteData } from './sqlite-backend.interface.js';
import type { SQLiteCompatibleType, SqliteResult } from './sqlite-core.interface.js';
import { RxDBAdapterSqliteError } from './sqlite-core.utils.js';

/**
 * 本次执行改了多少行。
 *
 * @remarks
 * `db.changes()` 只在 INSERT / UPDATE / DELETE 之后有意义；SELECT、DDL 之后它原样留着**上一条写语句**的计数
 * （SQLC-030）。按 SQL 文本猜「纯读」会被字面量里的分号、`returning` 字样与 `WITH` 开头的读骗过，这里改看连接的
 * 累计变更数：执行前后没变，本次就没改任何行；变了才取 `db.changes()`——最近一条写语句的计数，多语句时以最后一条写
 * 为准，与原契约一致。累计数含触发器改的行，只拿它判「改没改」，不当计数用（Electron 的 node:sqlite 引擎同一判法）。
 */
const rowsAffectedSince = (db: Oo1Database, totalChangesBefore: number): number =>
  db.changes(true) === totalChangesBefore ? 0 : db.changes();

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
    const totalChangesBefore = db.changes(true);
    if (shouldUsePreparedStatementPath(sql) && typeof db.prepare === 'function') {
      const { columns, rows } = getPreparedColumns(clientName, db, sql, bindings);
      const results: SqliteData[] = [];
      if (columns.length) {
        results.push({ columns, rows });
      }

      return {
        sql,
        results,
        rowsAffected: rowsAffectedSince(db, totalChangesBefore),
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

    const rowsAffected = rowsAffectedSince(db, totalChangesBefore);

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
