import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WaSqliteClient } from '../SqliteClient.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

let client: WaSqliteClient;

beforeEach(async () => {
  client = new WaSqliteClient();
  await client.init(`regression-${Date.now()}-${Math.random().toString(36).slice(2)}`, {
    vfs: 'MemoryAsyncVFS',
    async: true,
    wasmPath: asyncWasmPath
  });
});

afterEach(async () => {
  await client.disconnect();
});

describe('WaSqliteClient regressions', () => {
  it('SELECT 与 PRAGMA 不重复累计最近一次 DML 的 changes', async () => {
    await client.execute('CREATE TABLE rows_affected (id INTEGER PRIMARY KEY, active INTEGER NOT NULL)');
    await client.execute('INSERT INTO rows_affected (id, active) VALUES (1, 0), (2, 0)');

    const select = await client.execute('SELECT * FROM rows_affected');
    const mixed = await client.execute(
      'UPDATE rows_affected SET active = 1 WHERE id = 1; SELECT * FROM rows_affected; PRAGMA user_version;'
    );

    expect(select.rowsAffected).toBe(0);
    expect(mixed.rowsAffected).toBe(1);
  });

  it('DROP TABLE 不重复累计上一条 INSERT 的 changes', async () => {
    const result = await client.execute(`
      CREATE TABLE dropped_rows (id INTEGER PRIMARY KEY);
      INSERT INTO dropped_rows VALUES (1), (2), (3);
      DROP TABLE dropped_rows;
    `);

    expect(result.rowsAffected).toBe(3);
  });

  it('带 bindings 的多语句在首条写入前失败', async () => {
    await client.execute('CREATE TABLE bound_rows (value INTEGER NOT NULL)');

    await expect(
      client.execute('INSERT INTO bound_rows VALUES (?); INSERT INTO bound_rows VALUES (?);', [7])
    ).rejects.toThrow('multi-statement SQL with bindings is not supported');

    const result = await client.execute('SELECT count(*) FROM bound_rows');
    expect(result.results[0]?.rows[0]?.[0]).toBe(0);
  });

  it('识别 WITH 开头的 DML 并累计真实影响行数', async () => {
    await client.execute('CREATE TABLE cte_rows (id INTEGER PRIMARY KEY, active INTEGER NOT NULL)');
    await client.execute('INSERT INTO cte_rows (id, active) VALUES (1, 0), (2, 0)');

    const result = await client.execute(`
      WITH selected AS (SELECT id FROM cte_rows WHERE id = 2)
      UPDATE cte_rows SET active = 1 WHERE id IN (SELECT id FROM selected);
    `);

    expect(result.rowsAffected).toBe(1);
  });

  it('非法 regexp pattern 必须让 SQL 失败', async () => {
    await expect(client.execute('SELECT regexp(?, ?)', ['[', 'text'])).rejects.toThrow('execute() failed');
  });

  it('非法 regexp_replace flags 必须让 SQL 失败', async () => {
    await expect(client.execute('SELECT regexp_replace(?, ?, ?, ?)', ['a', 'a', 'b', 'z'])).rejects.toThrow(
      'execute() failed'
    );
  });

  it('regexp_replace 参数不足必须让 SQL 失败', async () => {
    await expect(client.execute('SELECT regexp_replace(?, ?)', ['a', 'a'])).rejects.toThrow('execute() failed');
  });

  it('合法 regexp 与 regexp_replace 保持原行为', async () => {
    const result = await client.execute('SELECT regexp(?, ?), regexp_replace(?, ?, ?, ?)', [
      '^a',
      'abc',
      '\\d',
      'a1b2',
      '-',
      'g'
    ]);

    expect(result.results[0]?.rows[0]).toEqual([1, 'a-b-']);
  });
});
