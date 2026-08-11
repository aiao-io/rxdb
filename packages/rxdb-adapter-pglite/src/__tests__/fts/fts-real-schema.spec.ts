/**
 * @fileoverview PGL-007：FTS trigger 必须能在**适配器自己生成的 schema** 上执行
 *
 * 既有的 fts-integration.spec.ts 手写 `tags JSONB` 建表，而适配器对
 * `PropertyType.stringArray` 生成的是原生 `text[]`（pglite.utils.ts）。
 * trigger 里的 `jsonb_array_elements_text(NEW.tags)` 在真实表上是 42883。
 */
import { PropertyType } from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PGliteClient } from '../../PGliteClient.js';
import { buildFtsTriggersSql } from '../../fts/build-fts-triggers.js';
import { buildCreateFtsTableSql } from '../../fts/create-fts-table.js';
import { rxDBColumnTypeToPGliteType } from '../../pglite.utils.js';

describe('PGL-007 FTS trigger 对真实 schema 可执行', () => {
  let client: PGliteClient;

  // 列类型取自适配器自己的映射函数，而不是手写字面量 ——
  // 映射一旦变化，这个测试跟着走，不会继续测一个不存在的 schema
  const tagsColumnType = rxDBColumnTypeToPGliteType({
    name: 'tags',
    type: PropertyType.stringArray
  } as Parameters<typeof rxDBColumnTypeToPGliteType>[0]);

  beforeAll(async () => {
    client = new PGliteClient();
    await client.init(`pglite-fts-real-schema-${Date.now()}`, { store: 'memory' });
    await client.exec(`
      CREATE TABLE docs (
        id TEXT PRIMARY KEY,
        title TEXT,
        tags ${tagsColumnType}
      );
    `);
  });

  afterAll(async () => {
    if (client) await client.disconnect();
  });

  it('适配器把 stringArray 映射为 text[]（本用例的前提）', () => {
    expect(tagsColumnType).toBe('text[]');
  });

  it('trigger 能在 text[] 列上安装并写入 _fts', async () => {
    await client.exec(
      buildCreateFtsTableSql('docs', [
        { name: 'title', isArray: false },
        { name: 'tags', isArray: true }
      ])
    );
    await client.exec(
      buildFtsTriggersSql('docs', [
        { name: 'title', isArray: false },
        { name: 'tags', isArray: true }
      ])
    );

    // 写入侧同样按适配器的真实形态：JS 数组直接传，不做 ::jsonb
    await client.query(`INSERT INTO docs (id, title, tags) VALUES ($1, $2, $3)`, [
      'd1',
      'hello world',
      ['rust', 'wasm']
    ]);

    const row = await client.query<{ fts: string }>(`SELECT _fts::text AS fts FROM docs WHERE id = 'd1'`);
    expect(row.rows[0]?.fts).toContain('hello');
    expect(row.rows[0]?.fts).toContain('rust');
    expect(row.rows[0]?.fts).toContain('wasm');
  });

  it('NULL 与空数组不产生 NULL tsvector', async () => {
    await client.query(`INSERT INTO docs (id, title, tags) VALUES ($1, $2, $3)`, ['d2', null, null]);
    const nullRow = await client.query<{ fts: string }>(`SELECT _fts::text AS fts FROM docs WHERE id = 'd2'`);
    expect(nullRow.rows[0]?.fts).toBe('');

    await client.query(`INSERT INTO docs (id, title, tags) VALUES ($1, $2, $3)`, ['d3', 'only title', []]);
    const emptyRow = await client.query<{ fts: string }>(`SELECT _fts::text AS fts FROM docs WHERE id = 'd3'`);
    expect(emptyRow.rows[0]?.fts).toContain('only');
  });

  it('UPDATE 后 _fts 跟随数组变化', async () => {
    await client.query(`UPDATE docs SET tags = $1 WHERE id = $2`, [['zig'], 'd1']);
    const row = await client.query<{ fts: string }>(`SELECT _fts::text AS fts FROM docs WHERE id = 'd1'`);
    expect(row.rows[0]?.fts).toContain('zig');
    expect(row.rows[0]?.fts).not.toContain('rust');
  });
});
