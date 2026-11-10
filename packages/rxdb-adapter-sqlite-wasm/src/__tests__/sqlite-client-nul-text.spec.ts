import type { SqliteClientLike } from '@aiao/rxdb-adapter-sqlite-core';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteClient } from '../create_sqlite_client.js';

let client: SqliteClientLike;

beforeEach(async () => {
  client = await createSqliteClient(`nul-text-${Date.now()}-${Math.random().toString(36).slice(2)}`, {
    vfs: 'memory',
    batchTimeout: 1,
    wasmUrl: sqliteWasmUrl
  });
});

afterEach(async () => {
  await client.disconnect();
});

describe('含 NUL 的文本', () => {
  it('绑定参数含 NUL 直接拒绝，不在 NUL 处截断成另一个值写进库', async () => {
    await client.execute('CREATE TABLE nul_rows (id TEXT PRIMARY KEY)');

    await expect(client.execute('INSERT INTO nul_rows (id) VALUES (?)', ['id\0tail'])).rejects.toThrow(/NUL/);

    const result = await client.execute('SELECT count(*) FROM nul_rows');
    expect(result.results[0]?.rows[0]?.[0]).toBe(0);
  });

  it('内联字面量里的 NUL 经 char(0) 原样落库', async () => {
    await client.execute('CREATE TABLE nul_literals (id TEXT PRIMARY KEY)');
    await client.execute(`INSERT INTO nul_literals (id) VALUES (('id' || char(0) || 'tail'))`);

    const result = await client.execute('SELECT hex(id) FROM nul_literals');
    expect(result.results[0]?.rows).toEqual([['6964007461696C']]);
  });
});
