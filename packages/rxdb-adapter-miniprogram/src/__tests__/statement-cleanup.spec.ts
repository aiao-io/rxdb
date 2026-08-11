import { describe, expect, it, vi } from 'vitest';
import { SQLITE_OK } from 'wa-sqlite';
import type { WaSqliteEmscriptenModule } from '../mini-program.interface.js';
import { finalizeWaSqliteOpenStatements } from '../statement-cleanup.js';
import type { SQLiteAPI } from '../wa-sqlite.interface.js';

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
    const sqlite = {
      finalize: vi.fn(async (statement: number) => {
        await Promise.resolve();
        calls.push(`finalize:${statement}`);
        return SQLITE_OK;
      })
    } as unknown as SQLiteAPI;

    await finalizeWaSqliteOpenStatements(module, sqlite, 7);

    expect(calls).toEqual(['next:0', 'next:11', 'finalize:11', 'next:22', 'finalize:22']);
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
    const sqlite = { finalize } as unknown as SQLiteAPI;

    await expect(finalizeWaSqliteOpenStatements(module, sqlite, 7)).rejects.toBe(failure);
    expect(finalize).toHaveBeenNthCalledWith(1, 11);
    expect(finalize).toHaveBeenNthCalledWith(2, 22);
  });
});
