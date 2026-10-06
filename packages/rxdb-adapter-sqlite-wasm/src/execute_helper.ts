import type { SQLiteCompatibleType, SqliteData, SqliteResult } from '@aiao/rxdb-adapter-sqlite-core';
import { RxDBAdapterSqliteError } from '@aiao/rxdb-adapter-sqlite-core';
import {
  SQLITE_ALTER_TABLE,
  SQLITE_ANALYZE,
  SQLITE_CREATE_INDEX,
  SQLITE_CREATE_TABLE,
  SQLITE_CREATE_TEMP_INDEX,
  SQLITE_CREATE_TEMP_TABLE,
  SQLITE_CREATE_TEMP_TRIGGER,
  SQLITE_CREATE_TEMP_VIEW,
  SQLITE_CREATE_TRIGGER,
  SQLITE_CREATE_VIEW,
  SQLITE_CREATE_VTABLE,
  SQLITE_DELETE,
  SQLITE_DROP_INDEX,
  SQLITE_DROP_TABLE,
  SQLITE_DROP_TEMP_INDEX,
  SQLITE_DROP_TEMP_TABLE,
  SQLITE_DROP_TEMP_TRIGGER,
  SQLITE_DROP_TEMP_VIEW,
  SQLITE_DROP_TRIGGER,
  SQLITE_DROP_VIEW,
  SQLITE_DROP_VTABLE,
  SQLITE_INSERT,
  SQLITE_OK,
  SQLITE_REINDEX,
  SQLITE_ROW,
  SQLITE_UPDATE
} from '@subframe7536/sqlite-wasm/constant';
import type { SQLiteAPI } from './sqlite-api.type.js';

const MUTATION_ACTION_CODES = new Set<number>([SQLITE_DELETE, SQLITE_INSERT, SQLITE_UPDATE]);
const SCHEMA_ACTION_CODES = new Set<number>([
  SQLITE_CREATE_INDEX,
  SQLITE_CREATE_TABLE,
  SQLITE_CREATE_TEMP_INDEX,
  SQLITE_CREATE_TEMP_TABLE,
  SQLITE_CREATE_TEMP_TRIGGER,
  SQLITE_CREATE_TEMP_VIEW,
  SQLITE_CREATE_TRIGGER,
  SQLITE_CREATE_VIEW,
  SQLITE_DROP_INDEX,
  SQLITE_DROP_TABLE,
  SQLITE_DROP_TEMP_INDEX,
  SQLITE_DROP_TEMP_TABLE,
  SQLITE_DROP_TEMP_TRIGGER,
  SQLITE_DROP_TEMP_VIEW,
  SQLITE_DROP_TRIGGER,
  SQLITE_DROP_VIEW,
  SQLITE_ALTER_TABLE,
  SQLITE_REINDEX,
  SQLITE_ANALYZE,
  SQLITE_CREATE_VTABLE,
  SQLITE_DROP_VTABLE
]);

function wrapExecutionError(sql: string, stage: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new RxDBAdapterSqliteError(`sqlite-wasm ${stage} failed for SQL "${sql}": ${message}`, { cause: error });
}

/**
 * 执行带绑定的单条语句。`unscoped` 枚举把已取得句柄的 finalize 责任整体交给调用方——
 * 上游 `maybeFinalize` 对 `unscoped` 显式跳过自动回收。无论枚举中途第二条 prepare 抛错、
 * 拒绝多语句，还是正常执行完毕，都要把已经 yield 过的每个句柄逐一 finalize；一个句柄
 * finalize 失败也不能让后面的句柄漏收。原始 prepare/执行错误优先于 finalize 失败上抛，
 * 不被其掩盖（RV-065）。
 */
async function runBoundStatement(
  sqlite3: SQLiteAPI,
  db: number,
  sql: string,
  bindings: SQLiteCompatibleType[],
  runStatement: (stmt: number, statementBindings?: SQLiteCompatibleType[]) => Promise<void>
): Promise<void> {
  const statements: number[] = [];
  let primaryError: unknown;
  try {
    for await (const stmt of sqlite3.statements(db, sql, { unscoped: true })) {
      statements.push(stmt);
      if (statements.length === 2) break;
    }

    if (statements.length > 1) {
      throw new RxDBAdapterSqliteError(
        'multi-statement SQL with bindings is not supported; execute one statement per call'
      );
    }

    const statement = statements[0];
    if (statement !== undefined) await runStatement(statement, bindings);
  } catch (error) {
    primaryError = error;
  }

  // 逐个 finalize 且各自 try/catch：一个句柄 finalize 失败不能让后面的句柄漏收。
  const finalizeErrors: unknown[] = [];
  for (const stmt of statements) {
    try {
      await sqlite3.finalize(stmt);
    } catch (finalizeError) {
      finalizeErrors.push(finalizeError);
    }
  }

  // 无原始错误时至多只有 1 个句柄，finalizeErrors 不会多于 1 条。
  if (primaryError !== undefined) throw primaryError;
  if (finalizeErrors.length > 0) throw finalizeErrors[0];
}

/**
 * 执行 SQL 语句
 */
async function executeHelper(
  sqlite3: SQLiteAPI,
  db: number,
  sql: string,
  bindings?: SQLiteCompatibleType[]
): Promise<SqliteResult> {
  const runStart = performance.now();
  const results: SqliteData[] = [];
  let rowsAffected = 0;
  let statementMutates = false;
  let statementChangesAreReliable = true;

  const runStatement = async (stmt: number, statementBindings?: SQLiteCompatibleType[]): Promise<void> => {
    if (statementBindings) {
      // reset 返回 Promise：不 await 就 bind，绑定会落到尚未复位的语句上
      await sqlite3.reset(stmt);
      sqlite3.bind_collection(stmt, statementBindings);
    }

    const rows: SQLiteCompatibleType[][] = [];
    while ((await sqlite3.step(stmt)) === SQLITE_ROW) {
      rows.push(sqlite3.row(stmt));
    }

    const columns = sqlite3.column_names(stmt);
    if (columns.length) results.push({ columns, rows });
    if (statementMutates && statementChangesAreReliable) rowsAffected += sqlite3.changes(db);
    statementMutates = false;
    statementChangesAreReliable = true;
  };

  try {
    sqlite3.set_authorizer(
      db,
      (_userData, actionCode) => {
        if (SCHEMA_ACTION_CODES.has(actionCode)) statementChangesAreReliable = false;
        if (MUTATION_ACTION_CODES.has(actionCode)) statementMutates = true;
        return SQLITE_OK;
      },
      undefined
    );

    if (bindings?.length) {
      await runBoundStatement(sqlite3, db, sql, bindings, runStatement);
    } else {
      for await (const stmt of sqlite3.statements(db, sql)) {
        await runStatement(stmt);
      }
    }
  } catch (error) {
    wrapExecutionError(sql, 'execute()', error);
  }

  return {
    sql,
    results,
    rowsAffected,
    elapsed: performance.now() - runStart
  };
}

export { executeHelper };
