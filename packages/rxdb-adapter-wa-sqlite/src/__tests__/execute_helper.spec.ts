import { describe, expect, it, vi } from 'vitest';
import {
  SQLITE_BUSY,
  SQLITE_DELETE,
  SQLITE_DROP_TABLE,
  SQLITE_INSERT,
  SQLITE_OK,
  SQLITE_PRAGMA,
  SQLITE_ROW,
  SQLITE_SELECT,
  SQLITE_UPDATE,
  SQLiteError
} from 'wa-sqlite';
import { executeHelper } from '../execute_helper.js';
import type { SQLiteAPI } from '../wa-sqlite.interface.js';

type Authorizer = (
  userData: unknown,
  actionCode: number,
  param3: string | null,
  param4: string | null,
  param5: string | null,
  param6: string | null
) => number;

interface StatementFixture {
  readonly actionCodes?: readonly number[];
  readonly changes?: number;
  readonly columns?: readonly string[];
  readonly rows?: readonly (readonly (bigint | number | string | Uint8Array | number[] | null)[])[];
  readonly statement: number;
}

function createSqliteMock(fixtures: readonly StatementFixture[]): SQLiteAPI {
  let authorizer: Authorizer = () => SQLITE_OK;
  let currentFixture = fixtures[0];
  let rowIndex = 0;

  return {
    bind_collection: vi.fn(),
    changes: vi.fn(() => currentFixture.changes ?? 0),
    column_names: vi.fn(() => [...(currentFixture.columns ?? [])]),
    finalize: vi.fn().mockResolvedValue(SQLITE_OK),
    reset: vi.fn().mockResolvedValue(SQLITE_OK),
    row: vi.fn(() => [...(currentFixture.rows?.[rowIndex++] ?? [])]),
    set_authorizer: vi.fn((_db: number, callback: Authorizer) => {
      authorizer = callback;
      return SQLITE_OK;
    }),
    statements: vi.fn(async function* () {
      for (const fixture of fixtures) {
        currentFixture = fixture;
        rowIndex = 0;
        for (const actionCode of fixture.actionCodes ?? []) {
          authorizer(undefined, actionCode, null, null, null, null);
        }
        yield fixture.statement;
      }
    }),
    step: vi.fn(async () => (rowIndex < (currentFixture.rows?.length ?? 0) ? SQLITE_ROW : SQLITE_OK))
  } as unknown as SQLiteAPI;
}

describe('executeHelper', () => {
  it('返回 SELECT 行但不把上一次 DML 的 changes 计入 rowsAffected', async () => {
    const sqlite = createSqliteMock([
      {
        statement: 1,
        actionCodes: [SQLITE_SELECT],
        changes: 2,
        columns: ['id', 'name'],
        rows: [
          [1, 'Alice'],
          [2, 'Bob']
        ]
      }
    ]);

    const result = await executeHelper(sqlite, 1, 'SELECT id, name FROM users');

    expect(result.results).toEqual([
      {
        columns: ['id', 'name'],
        rows: [
          [1, 'Alice'],
          [2, 'Bob']
        ]
      }
    ]);
    expect(result.rowsAffected).toBe(0);
    expect(result.elapsed).toBeGreaterThanOrEqual(0);
  });

  it('绑定参数并统计 INSERT 影响行数', async () => {
    const sqlite = createSqliteMock([{ statement: 1, actionCodes: [SQLITE_INSERT], changes: 1 }]);
    const bindings = ['John', 30];

    const result = await executeHelper(sqlite, 1, 'INSERT INTO users (name, age) VALUES (?, ?)', bindings);

    expect(sqlite.reset).toHaveBeenCalledWith(1);
    expect(sqlite.bind_collection).toHaveBeenCalledWith(1, bindings);
    expect(result.rowsAffected).toBe(1);
  });

  it('先等 reset 落地再 bind_collection', async () => {
    // wa-sqlite 的 reset 声明为 `Promise<number>`：不 await 就 bind，
    // 绑定会落到尚未复位的语句上。
    const sqlite = createSqliteMock([{ statement: 1, actionCodes: [SQLITE_INSERT], changes: 1 }]);
    const calls: string[] = [];
    vi.mocked(sqlite.reset).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      calls.push('reset');
      return SQLITE_OK;
    });
    vi.mocked(sqlite.bind_collection).mockImplementation(() => {
      calls.push('bind');
      return SQLITE_OK;
    });

    await executeHelper(sqlite, 1, 'INSERT INTO users (name) VALUES (?)', ['John']);

    expect(calls).toEqual(['reset', 'bind']);
  });

  it('在执行前拒绝带 bindings 的多语句 SQL', async () => {
    const sqlite = createSqliteMock([
      { statement: 1, actionCodes: [SQLITE_UPDATE], changes: 1 },
      { statement: 2, actionCodes: [SQLITE_UPDATE], changes: 2 }
    ]);

    const execution = executeHelper(sqlite, 1, 'UPDATE users SET active = ?; UPDATE logs SET active = 1;', [1]);

    await expect(execution).rejects.toThrow('multi-statement SQL with bindings is not supported');
    expect(sqlite.bind_collection).not.toHaveBeenCalled();
    expect(sqlite.step).not.toHaveBeenCalled();
  });

  it('保留返回列但无数据行的结果集', async () => {
    const sqlite = createSqliteMock([
      { statement: 1, actionCodes: [SQLITE_SELECT], columns: ['id', 'name'], rows: [], changes: 7 }
    ]);

    const result = await executeHelper(sqlite, 1, 'SELECT id, name FROM users WHERE id = 999');

    expect(result.results).toEqual([{ columns: ['id', 'name'], rows: [] }]);
    expect(result.rowsAffected).toBe(0);
  });

  it('累计多条 DML 的 rowsAffected', async () => {
    const sqlite = createSqliteMock([
      { statement: 1, actionCodes: [SQLITE_UPDATE], changes: 3 },
      { statement: 2, actionCodes: [SQLITE_DELETE], changes: 5 }
    ]);

    const result = await executeHelper(sqlite, 1, 'UPDATE users SET active = 1; DELETE FROM logs WHERE old = 1;');

    expect(result.rowsAffected).toBe(8);
  });

  it('DDL 不会重复累计上一条 DML 的 rowsAffected', async () => {
    const sqlite = createSqliteMock([
      { statement: 1, actionCodes: [SQLITE_INSERT], changes: 3 },
      { statement: 2, actionCodes: [SQLITE_DROP_TABLE, SQLITE_DELETE], changes: 3 }
    ]);

    const result = await executeHelper(sqlite, 1, 'INSERT INTO items VALUES (1), (2), (3); DROP TABLE items;');

    expect(result.rowsAffected).toBe(3);
  });

  it('不会让 SELECT 或 PRAGMA 重复累计最近一次 DML', async () => {
    const sqlite = createSqliteMock([
      { statement: 1, actionCodes: [SQLITE_UPDATE], changes: 1 },
      { statement: 2, actionCodes: [SQLITE_SELECT], changes: 1, columns: ['id'], rows: [[1]] },
      { statement: 3, actionCodes: [SQLITE_PRAGMA], changes: 1, columns: ['user_version'], rows: [[0]] }
    ]);

    const result = await executeHelper(
      sqlite,
      1,
      'UPDATE users SET active = 1; SELECT id FROM users; PRAGMA user_version;'
    );

    expect(result.rowsAffected).toBe(1);
  });

  it('包装执行阶段的底层错误并保留 SQL', async () => {
    const sqlite = createSqliteMock([{ statement: 1, actionCodes: [SQLITE_SELECT] }]);
    vi.mocked(sqlite.step).mockRejectedValueOnce(new Error('step failed'));

    await expect(executeHelper(sqlite, 1, 'SELECT broken()')).rejects.toThrow(
      'wa-sqlite execute() failed for SQL "SELECT broken()": step failed'
    );
    expect(sqlite.finalize).toHaveBeenCalledWith(1);
  });

  it('无绑定参数也接管 statement 生命周期并等待 finalize', async () => {
    const sqlite = createSqliteMock([
      { statement: 1, actionCodes: [SQLITE_SELECT] },
      { statement: 2, actionCodes: [SQLITE_SELECT] }
    ]);
    const finalized: number[] = [];
    vi.mocked(sqlite.finalize).mockImplementation(async statement => {
      await Promise.resolve();
      finalized.push(statement);
      return SQLITE_OK;
    });
    vi.mocked(sqlite.statements).mockImplementation(async function* (_db, _sql, options) {
      expect(options).toEqual({ unscoped: true });
      yield 1;
      expect(finalized).toEqual([1]);
      yield 2;
    });

    await executeHelper(sqlite, 1, 'SELECT 1; SELECT 2;');

    expect(finalized).toEqual([1, 2]);
  });

  it('SQLITE_BUSY 会在有限次数内重试后成功', async () => {
    const sqlite = createSqliteMock([{ statement: 1, actionCodes: [SQLITE_INSERT], changes: 1 }]);
    vi.mocked(sqlite.step)
      .mockRejectedValueOnce(new SQLiteError('database is locked', SQLITE_BUSY))
      .mockRejectedValueOnce(new SQLiteError('database is locked', SQLITE_BUSY))
      .mockResolvedValueOnce(SQLITE_OK);

    const result = await executeHelper(sqlite, 1, 'INSERT INTO users (name) VALUES (?)', ['John']);

    expect(sqlite.step).toHaveBeenCalledTimes(3);
    expect(result.rowsAffected).toBe(1);
  });

  it('SQLITE_BUSY 超过重试上限后仍然抛出并保留 SQL', async () => {
    const sqlite = createSqliteMock([{ statement: 1, actionCodes: [SQLITE_INSERT] }]);
    vi.mocked(sqlite.step).mockRejectedValue(new SQLiteError('database is locked', SQLITE_BUSY));

    await expect(executeHelper(sqlite, 1, 'INSERT INTO users (name) VALUES (?)', ['John'])).rejects.toThrow(
      'wa-sqlite execute() failed for SQL "INSERT INTO users (name) VALUES (?)": database is locked'
    );
  });

  it('非 SQLITE_BUSY 错误不会重试，直接抛出', async () => {
    const sqlite = createSqliteMock([{ statement: 1, actionCodes: [SQLITE_SELECT] }]);
    vi.mocked(sqlite.step).mockRejectedValueOnce(new Error('step failed'));

    await executeHelper(sqlite, 1, 'SELECT broken()').catch(() => undefined);

    expect(sqlite.step).toHaveBeenCalledTimes(1);
  });
});
