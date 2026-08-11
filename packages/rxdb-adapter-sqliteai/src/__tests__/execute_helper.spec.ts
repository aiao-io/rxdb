import { executeOo1Helper, type Oo1Database, RxDBAdapterSqliteError } from '@aiao/rxdb-adapter-sqlite-core';
import { describe, expect, it, vi } from 'vitest';

const CLIENT = 'sqliteai';
const executeHelper = (db: Oo1Database, sql: string, bindings?: unknown[]) =>
  executeOo1Helper(CLIENT, db, sql, bindings as never);

describe('executeOo1Helper (sqliteai)', () => {
  function createMockDb(opts: { resultRows?: unknown[][]; columnNames?: string[]; changes?: number }) {
    const { resultRows = [], columnNames = [], changes = 0 } = opts;
    let rowIndex = 0;
    const execSpy = vi.fn((execOpts: { resultRows?: unknown[][]; columnNames?: string[] }) => {
      if (execOpts.resultRows) for (const row of resultRows) execOpts.resultRows.push(row);
      if (execOpts.columnNames) for (const col of columnNames) execOpts.columnNames.push(col);
      return db;
    });
    const bindSpy = vi.fn().mockReturnThis();
    const getColumnNamesSpy = vi.fn((target: string[] = []) => {
      target.push(...columnNames);
      return target;
    });
    const stepSpy = vi.fn(() => rowIndex < resultRows.length);
    const getSpy = vi.fn((target: unknown[] = []) => {
      target.push(...(resultRows[rowIndex++] ?? []));
      return target;
    });
    const finalizeSpy = vi.fn().mockReturnValue(0);
    const prepareSpy = vi.fn(() => ({
      bind: bindSpy,
      getColumnNames: getColumnNamesSpy,
      step: stepSpy,
      get: getSpy,
      finalize: finalizeSpy
    }));
    const db = {
      prepare: prepareSpy,
      exec: execSpy,
      close: vi.fn(),
      changes: vi.fn().mockReturnValue(changes),
      createFunction: vi.fn().mockReturnThis()
    } as unknown as Oo1Database;

    return { db, execSpy, prepareSpy, bindSpy, finalizeSpy };
  }

  it('应该执行 SQL 并返回带有列和行的结果', () => {
    const { db, execSpy, prepareSpy } = createMockDb({
      resultRows: [
        [1, 'Alice'],
        [2, 'Bob']
      ],
      columnNames: ['id', 'name'],
      // SQLC-030：这里的 changes 是**上一条写语句**的遗留计数。原用例把它设成 2
      // （恰好等于返回行数）并断言 rowsAffected===2，看似正确，实际是在锁定
      // 「SELECT 也报 changes()」这个错误行为。设成 9 让两者不再重合。
      changes: 9
    });
    const result = executeHelper(db, 'SELECT id, name FROM users');
    expect(result.results[0].rows).toEqual([
      [1, 'Alice'],
      [2, 'Bob']
    ]);
    // SELECT 不改行，rowsAffected 必须是 0，而不是上一条写语句遗留的 9
    expect(result.rowsAffected).toBe(0);
    expect(prepareSpy).toHaveBeenCalledWith('SELECT id, name FROM users');
    expect(execSpy).not.toHaveBeenCalled();
  });

  it('应该处理没有返回行的查询', () => {
    const { db, execSpy, prepareSpy } = createMockDb({ changes: 1 });
    const result = executeHelper(db, 'INSERT INTO users (name) VALUES (?)', ['John']);
    expect(result.results).toHaveLength(0);
    expect(result.rowsAffected).toBe(1);
    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(prepareSpy).not.toHaveBeenCalled();
  });

  it('SELECT 查询应该把绑定参数传给 prepared statement', () => {
    const { db, bindSpy, finalizeSpy } = createMockDb({
      columnNames: ['id'],
      resultRows: [[1]],
      changes: 0
    });
    const result = executeHelper(db, 'SELECT id FROM users WHERE id = ?', [1]);
    expect(result.results[0].rows).toEqual([[1]]);
    expect(bindSpy).toHaveBeenCalledWith([1]);
    expect(finalizeSpy).toHaveBeenCalledTimes(1);
  });

  it('多语句 SQL 不应该走 prepared statement 快路径', () => {
    const { db, execSpy, prepareSpy } = createMockDb({ columnNames: ['id'], resultRows: [[1]] });
    executeHelper(db, 'SELECT 1; SELECT 2;');
    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(prepareSpy).not.toHaveBeenCalled();
  });

  it('单语句 RETURNING 语句应该走 prepared statement 快路径', () => {
    const { db, execSpy, prepareSpy } = createMockDb({
      columnNames: ['id'],
      resultRows: [[1]],
      changes: 1
    });
    const result = executeHelper(db, 'INSERT INTO users (name) VALUES (?) RETURNING id;', ['Alice']);
    expect(result.results[0].rows).toEqual([[1]]);
    expect(prepareSpy).toHaveBeenCalledTimes(1);
    expect(execSpy).not.toHaveBeenCalled();
  });

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
    expect(() => executeHelper(db, 'INSERT INTO users (name) VALUES (?)', ['Alice'])).toThrow(RxDBAdapterSqliteError);
    expect(() => executeHelper(db, 'INSERT INTO users (name) VALUES (?)', ['Alice'])).toThrow('execute() failed');
  });
});
