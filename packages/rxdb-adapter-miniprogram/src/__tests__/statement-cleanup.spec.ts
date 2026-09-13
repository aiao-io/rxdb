import { describe, expect, it, vi } from 'vitest';
import { SQLITE_MISUSE, SQLITE_OK, SQLiteError } from 'wa-sqlite';
import type { WaSqliteEmscriptenModule } from '../mini-program.interface.js';
import { finalizeWaSqliteOpenStatements } from '../statement-cleanup.js';
import type { SQLiteAPI } from '../wa-sqlite.interface.js';

/** 只认 `owned` 里的句柄，其余按 wa-sqlite 的行为抛 `SQLITE_MISUSE`。 */
function createSqlite(owned: Set<number>, finalize: SQLiteAPI['finalize']): SQLiteAPI {
  return {
    column_count: (statement: number) => {
      if (!owned.has(statement)) throw new SQLiteError('not a statement', SQLITE_MISUSE);
      return 1;
    },
    finalize
  } as unknown as SQLiteAPI;
}

describe('finalizeWaSqliteOpenStatements', () => {
  it('在 finalize 当前 statement 前取得下一个句柄并逐个等待清理', async () => {
    const calls: string[] = [];
    const nextStatement = new Map([
      [0, 11],
      [11, 22],
      [22, 0]
    ]);
    const module: Pick<WaSqliteEmscriptenModule, '_sqlite3_next_stmt'> = {
      _sqlite3_next_stmt: vi.fn((_database: number, statement: number) => {
        calls.push(`next:${statement}`);
        return nextStatement.get(statement) ?? 0;
      })
    };
    const finalize = vi.fn(async (statement: number) => {
      await Promise.resolve();
      calls.push(`finalize:${statement}`);
      return SQLITE_OK;
    }) as unknown as SQLiteAPI['finalize'];
    const sqlite = createSqlite(new Set([11, 22]), finalize);

    await finalizeWaSqliteOpenStatements(module, sqlite, 7);

    expect(calls).toEqual(['next:0', 'next:11', 'finalize:11', 'next:22', 'finalize:22']);
  });

  it('跳过虚拟表内部缓存的 statement，只清理 JS 层 prepare 出来的句柄', async () => {
    const nextStatement = new Map([
      [0, 11],
      [11, 22],
      [22, 33],
      [33, 0]
    ]);
    const module: Pick<WaSqliteEmscriptenModule, '_sqlite3_next_stmt'> = {
      _sqlite3_next_stmt: (_database, statement) => nextStatement.get(statement) ?? 0
    };
    const finalize = vi.fn(async () => SQLITE_OK) as unknown as SQLiteAPI['finalize'];
    const sqlite = createSqlite(new Set([11, 33]), finalize);

    await finalizeWaSqliteOpenStatements(module, sqlite, 7);

    expect(finalize).toHaveBeenNthCalledWith(1, 11);
    expect(finalize).toHaveBeenNthCalledWith(2, 33);
    expect(finalize).toHaveBeenCalledTimes(2);
  });

  it('归属探测抛出非 SQLITE_MISUSE 的错误时直接上报', async () => {
    const failure = new SQLiteError('disk I/O error', 10);
    const module: Pick<WaSqliteEmscriptenModule, '_sqlite3_next_stmt'> = {
      _sqlite3_next_stmt: (_database, statement) => (statement === 0 ? 11 : 0)
    };
    const finalize = vi.fn(async () => SQLITE_OK) as unknown as SQLiteAPI['finalize'];
    const sqlite = {
      column_count: () => {
        throw failure;
      },
      finalize
    } as unknown as SQLiteAPI;

    await expect(finalizeWaSqliteOpenStatements(module, sqlite, 7)).rejects.toBe(failure);
    expect(finalize).not.toHaveBeenCalled();
  });

  it('单个 finalize 失败时继续清理剩余句柄并保留首个错误', async () => {
    const failure = new Error('finalize failed');
    const module: Pick<WaSqliteEmscriptenModule, '_sqlite3_next_stmt'> = {
      _sqlite3_next_stmt: (_database, statement) =>
        statement === 0 ? 11
        : statement === 11 ? 22
        : 0
    };
    const finalize = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(SQLITE_OK);
    const sqlite = createSqlite(new Set([11, 22]), finalize as unknown as SQLiteAPI['finalize']);

    await expect(finalizeWaSqliteOpenStatements(module, sqlite, 7)).rejects.toBe(failure);
    expect(finalize).toHaveBeenNthCalledWith(1, 11);
    expect(finalize).toHaveBeenNthCalledWith(2, 22);
  });
});
