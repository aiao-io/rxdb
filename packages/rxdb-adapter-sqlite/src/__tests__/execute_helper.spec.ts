import { executeOo1Helper, type Oo1Database, RxDBAdapterSqliteError } from '@aiao/rxdb-adapter-sqlite-core';
import { describe, expect, it, vi } from 'vitest';

const CLIENT = 'sqlite';
const executeHelper = (db: Oo1Database, sql: string, bindings?: unknown[]) =>
  executeOo1Helper(CLIENT, db, sql, bindings as never);

describe('executeOo1Helper (sqlite)', () => {
  function createMockDb() {
    const finalizeSpy = vi.fn();
    const statement = {
      bind: vi.fn(),
      getColumnNames: vi.fn(() => ['id']),
      step: vi.fn().mockReturnValue(false),
      get: vi.fn(() => []),
      finalize: finalizeSpy
    };
    const db = {
      prepare: vi.fn(() => statement),
      exec: vi.fn(),
      changes: vi.fn().mockReturnValue(0),
      close: vi.fn(),
      createFunction: vi.fn().mockReturnThis()
    } as unknown as Oo1Database;
    return { db, statement, finalizeSpy };
  }

  it('prepare 失败时应该包装成 RxDBAdapterSqliteError', () => {
    const db = {
      prepare: vi.fn(() => {
        throw new Error('prepare failed');
      }),
      exec: vi.fn(),
      changes: vi.fn().mockReturnValue(0),
      close: vi.fn(),
      createFunction: vi.fn().mockReturnThis()
    } as unknown as Oo1Database;
    expect(() => executeHelper(db, 'SELECT 1')).toThrow(RxDBAdapterSqliteError);
    expect(() => executeHelper(db, 'SELECT 1')).toThrow('prepare() failed');
  });

  it('exec 失败时应该包装成 RxDBAdapterSqliteError', () => {
    const db = {
      prepare: vi.fn(),
      exec: vi.fn(() => {
        throw new Error('exec failed');
      }),
      changes: vi.fn().mockReturnValue(0),
      close: vi.fn(),
      createFunction: vi.fn().mockReturnThis()
    } as unknown as Oo1Database;
    expect(() => executeHelper(db, 'INSERT INTO users VALUES (?)', ['Alice'])).toThrow(RxDBAdapterSqliteError);
    expect(() => executeHelper(db, 'INSERT INTO users VALUES (?)', ['Alice'])).toThrow('execute() failed');
  });

  it('prepared statement 出错时仍然应该 finalize', () => {
    const { db, statement, finalizeSpy } = createMockDb();
    statement.bind.mockImplementation(() => {
      throw new Error('bind failed');
    });
    expect(() => executeHelper(db, 'SELECT id FROM users WHERE id = ?', [1])).toThrow(RxDBAdapterSqliteError);
    expect(finalizeSpy).toHaveBeenCalledTimes(1);
  });
});
