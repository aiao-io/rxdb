import { SQLITE_MISUSE } from 'wa-sqlite';
import type { WaSqliteEmscriptenModule } from './mini-program.interface.js';
import type { SQLiteAPI } from './wa-sqlite.interface.js';

/**
 * 判断句柄是否由 JS 层 prepare 出来。
 *
 * wa-sqlite 只把经它 prepare 的 statement 记进内部表，未登记的句柄会让任何带
 * `verifyStatement` 的访问器抛 `SQLITE_MISUSE`；`column_count` 同步、无副作用，
 * 正好用作归属探针。
 *
 * FTS5 这类虚拟表把自己的 prepared statement 缓存在 vtab 内部，
 * `sqlite3_next_stmt` 会把它们一并列出，但它们由 `sqlite3_close` 先走
 * `xDisconnect` 自行 finalize —— 我们抢先 finalize 就是二次释放，直接
 * `memory access out of bounds`。
 */
function isPreparedByJs(sqlite: SQLiteAPI, statement: number): boolean {
  try {
    sqlite.column_count(statement);
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === SQLITE_MISUSE) return false;
    throw error;
  }
}

/** 清理连接上所有仍由 JS 层持有的 prepared statement。 */
export async function finalizeWaSqliteOpenStatements(
  module: Pick<WaSqliteEmscriptenModule, '_sqlite3_next_stmt'>,
  sqlite: SQLiteAPI,
  database: number
): Promise<void> {
  let firstError: unknown;
  let statement = module._sqlite3_next_stmt(database, 0);
  while (statement !== 0) {
    const nextStatement = module._sqlite3_next_stmt(database, statement);
    if (isPreparedByJs(sqlite, statement)) {
      try {
        await sqlite.finalize(statement);
      } catch (error) {
        firstError ??= error;
      }
    }
    statement = nextStatement;
  }
  if (firstError !== undefined) throw firstError;
}
