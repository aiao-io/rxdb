import type { WaSqliteEmscriptenModule } from './mini-program.interface.js';
import type { SQLiteAPI } from './wa-sqlite.interface.js';

/** 清理连接上所有仍由 SQLite 持有的 prepared statement。 */
export async function finalizeWaSqliteOpenStatements(
  module: Pick<WaSqliteEmscriptenModule, '_sqlite3_next_stmt'>,
  sqlite: SQLiteAPI,
  database: number
): Promise<void> {
  let firstError: unknown;
  let statement = module._sqlite3_next_stmt(database, 0);
  while (statement !== 0) {
    const nextStatement = module._sqlite3_next_stmt(database, statement);
    try {
      await sqlite.finalize(statement);
    } catch (error) {
      firstError ??= error;
    }
    statement = nextStatement;
  }
  if (firstError !== undefined) throw firstError;
}
