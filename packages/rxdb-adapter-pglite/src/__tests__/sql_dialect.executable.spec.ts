/**
 * @fileoverview PGL-014：`PostgreSQLDialect` 生成的 SQL 必须真能在 PGlite 上执行
 *
 * `generateBatchUpdate` 原先固定生成 `FROM (VALUES ($1))`，别名列表却有 1+N 列，
 * 且更新列名未转义（`AS temp("id", name, age)`）—— 送进 PG 报 42P10。
 * 既有三条用例全是 `toContain` 快照，把不可执行的形态锁成了正确期望。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGliteClient } from '../PGliteClient.js';
import { pgDialect } from '../sql_dialect.js';

describe('PGL-014 PostgreSQLDialect 可执行性', () => {
  let client: PGliteClient;

  beforeAll(async () => {
    client = new PGliteClient();
    await client.init(`pglite-dialect-executable-${Date.now()}`, { store: 'memory' });
    await client.exec(`CREATE TABLE users (id text PRIMARY KEY, name text, age int)`);
    await client.exec(`INSERT INTO users VALUES ('u1', 'old-1', 1), ('u2', 'old-2', 2)`);
  });

  afterAll(async () => {
    if (client) await client.disconnect();
  });

  it('纯文本列无需 columnTypes 即可执行', async () => {
    const sql = pgDialect.generateBatchUpdate('users', 'id', ['name']);
    await client.query(sql, ['u2', 'text-only']);

    const row = await client.query<{ name: string }>(`SELECT name FROM users WHERE id = 'u2'`);
    expect(row.rows[0]).toEqual({ name: 'text-only' });
  });

  it('非法列类型必须拒绝，不得拼进 SQL', () => {
    expect(() => pgDialect.generateBatchUpdate('users', 'id', ['age'], 1, { age: 'int; DROP TABLE users' })).toThrow(
      /invalid column type/
    );
  });

  it('批量更新 SQL 的别名列必须全部转义', () => {
    const sql = pgDialect.generateBatchUpdate('users', 'id', ['name', 'age']);
    expect(sql).toContain('AS temp("id", "name", "age")');
  });

  it('占位符数量必须与「主键 + 更新列」× 行数一致', () => {
    const sql = pgDialect.generateBatchUpdate('users', 'id', ['name', 'age'], 2);
    expect(sql).toContain('VALUES ($1, $2, $3), ($4, $5, $6)');
  });

  it('单行批量更新可以真正执行', async () => {
    const sql = pgDialect.generateBatchUpdate('users', 'id', ['name', 'age'], 1, { age: 'int' });
    const result = await client.query<{ id: string }>(sql, ['u1', 'new-1', 11]);

    expect(result.rows).toHaveLength(1);
    const row = await client.query<{ name: string; age: number }>(`SELECT name, age FROM users WHERE id = 'u1'`);
    expect(row.rows[0]).toEqual({ name: 'new-1', age: 11 });
  });

  it('多行批量更新可以真正执行', async () => {
    const sql = pgDialect.generateBatchUpdate('users', 'id', ['name', 'age'], 2, { age: 'int' });
    await client.query(sql, ['u1', 'multi-1', 21, 'u2', 'multi-2', 22]);

    const rows = await client.query<{ id: string; name: string; age: number }>(
      `SELECT id, name, age FROM users ORDER BY id`
    );
    expect(rows.rows).toEqual([
      { id: 'u1', name: 'multi-1', age: 21 },
      { id: 'u2', name: 'multi-2', age: 22 }
    ]);
  });
});
