import type { SQLiteCompatibleType } from '@aiao/rxdb-adapter-sqlite-core';
import { RxDBAdapterSqliteError } from '@aiao/rxdb-adapter-sqlite-core';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { describe, expect, it, vi } from 'vitest';
import { createSqliteClient } from '../create_sqlite_client.js';
import { executeHelper } from '../execute_helper.js';
import type { SQLiteAPI } from '../sqlite-api.type.js';

const SQLITE_OK = 0;
const SQLITE_ROW = 100;
const SQLITE_DELETE = 9;
const SQLITE_DROP_TABLE = 11;
const SQLITE_INSERT = 18;
const SQLITE_PRAGMA = 19;
const SQLITE_SELECT = 21;
const SQLITE_UPDATE = 23;

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
  readonly rows?: readonly (readonly (SQLiteCompatibleType | null)[])[];
  readonly statement: number;
}

function createSqliteMock(fixtures: readonly StatementFixture[]): SQLiteAPI {
  const firstFixture = fixtures[0];
  if (!firstFixture) throw new Error('at least one statement fixture is required');

  let authorizer: Authorizer = () => SQLITE_OK;
  let currentFixture = firstFixture;
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
    // reset 声明为 `Promise<number>`：不 await 就 bind，绑定会落到尚未复位的语句上。
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

  it('SELECT 和 PRAGMA 不重复累计最近一次 DML', async () => {
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

  it('包装底层执行错误并保留 SQL', async () => {
    const sqlite = createSqliteMock([{ statement: 1, actionCodes: [SQLITE_SELECT] }]);
    vi.mocked(sqlite.step).mockRejectedValueOnce(new Error('step failed'));

    const execution = executeHelper(sqlite, 1, 'SELECT broken()');
    await expect(execution).rejects.toThrow(RxDBAdapterSqliteError);
    await expect(execution).rejects.toThrow('sqlite-wasm execute() failed for SQL "SELECT broken()": step failed');
  });

  it('真实 SQLite 混合 DML 与只读语句时只累计变更语句', async () => {
    const client = await createSqliteClient(`rows-affected-${Date.now()}`, {
      vfs: 'memory',
      wasmUrl: sqliteWasmUrl
    });

    try {
      await client.execute(`
        CREATE TABLE items (id INTEGER PRIMARY KEY, active INTEGER NOT NULL);
        INSERT INTO items VALUES (1, 0), (2, 0), (3, 0);
      `);

      const result = await client.execute(`
        UPDATE items SET active = 1 WHERE id <= 2;
        SELECT id FROM items WHERE active = 1;
        DELETE FROM items WHERE id = 3;
        PRAGMA user_version;
      `);

      expect(result.rowsAffected).toBe(3);
    } finally {
      await client.disconnect();
    }
  });

  it('真实 SQLite 的 DROP TABLE 不重复累计上一条 INSERT', async () => {
    const client = await createSqliteClient(`rows-affected-ddl-${Date.now()}`, {
      vfs: 'memory',
      wasmUrl: sqliteWasmUrl
    });

    try {
      const result = await client.execute(`
        CREATE TABLE dropped_rows (id INTEGER PRIMARY KEY);
        INSERT INTO dropped_rows VALUES (1), (2), (3);
        DROP TABLE dropped_rows;
      `);

      expect(result.rowsAffected).toBe(3);
    } finally {
      await client.disconnect();
    }
  });

  it('真实 SQLite 在首条写入前拒绝带 bindings 的多语句', async () => {
    const client = await createSqliteClient(`multi-bind-${Date.now()}`, {
      vfs: 'memory',
      wasmUrl: sqliteWasmUrl
    });

    try {
      await client.execute('CREATE TABLE bound_rows (value INTEGER NOT NULL)');
      await expect(
        client.execute('INSERT INTO bound_rows VALUES (?); INSERT INTO bound_rows VALUES (?);', [7])
      ).rejects.toThrow('multi-statement SQL with bindings is not supported');

      const result = await client.execute('SELECT count(*) FROM bound_rows');
      expect(result.results[0]?.rows[0]?.[0]).toBe(0);
    } finally {
      await client.disconnect();
    }
  });
});
