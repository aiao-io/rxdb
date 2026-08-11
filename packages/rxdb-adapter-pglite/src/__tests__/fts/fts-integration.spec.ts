import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PGliteClient } from '../../PGliteClient.js';
import { buildFtsTriggersSql } from '../../fts/build-fts-triggers.js';
import { buildCreateFtsTableSql } from '../../fts/create-fts-table.js';

// 本套件刻意用 JSONB 列：它覆盖的是**调用方自建 JSONB 列**这条 opt-in 路径。
// 适配器自己建的表是 text[]，那条路径由 fts-real-schema.spec.ts 覆盖（PGL-007）。
describe('FTS integration with PGlite (jsonb 数组列，显式 opt-in)', () => {
  let client: PGliteClient;
  const dbName = `pglite-fts-test-${Date.now()}`;

  beforeAll(async () => {
    client = new PGliteClient();
    await client.init(dbName, { store: 'memory' });
    await client.exec(`
      CREATE TABLE docs (
        id TEXT PRIMARY KEY,
        title TEXT,
        body TEXT,
        tags JSONB
      );
    `);
  });

  afterAll(async () => {
    if (client) await client.disconnect();
  });

  it('runs ALTER + CREATE INDEX from buildCreateFtsTableSql without error', async () => {
    const sql = buildCreateFtsTableSql('docs', [
      { name: 'title', isArray: false },
      { name: 'body', isArray: false },
      { name: 'tags', isArray: true, arrayKind: 'jsonb' as const }
    ]);
    await client.exec(sql);

    const result = await client.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'docs' AND column_name = '_fts'`
    );
    expect(result.rows[0]?.data_type).toBe('tsvector');

    const idx = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'docs' AND indexname = 'docs__fts_idx'`
    );
    expect(idx.rows).toHaveLength(1);
  });

  it('installs trigger and populates _fts on INSERT', async () => {
    const sql = buildFtsTriggersSql('docs', [
      { name: 'title', isArray: false },
      { name: 'body', isArray: false },
      { name: 'tags', isArray: true, arrayKind: 'jsonb' as const }
    ]);
    await client.exec(sql);

    await client.query(`INSERT INTO docs (id, title, body, tags) VALUES ($1, $2, $3, $4::jsonb)`, [
      'd1',
      'hello world',
      'the quick brown fox',
      JSON.stringify(['rust', 'wasm'])
    ]);

    const row = await client.query<{ id: string; fts: string }>(
      `SELECT id, _fts::text AS fts FROM docs WHERE id = 'd1'`
    );
    expect(row.rows[0]?.fts).toBeTruthy();
    expect(row.rows[0]?.fts).toContain('hello');
    expect(row.rows[0]?.fts).toContain('fox');
    expect(row.rows[0]?.fts).toContain('rust');
    expect(row.rows[0]?.fts).toContain('wasm');
  });

  it('updates _fts on UPDATE', async () => {
    await client.query(`UPDATE docs SET title = $1 WHERE id = $2`, ['changed title', 'd1']);
    const row = await client.query<{ fts: string }>(`SELECT _fts::text AS fts FROM docs WHERE id = 'd1'`);
    expect(row.rows[0]?.fts).toContain('changed');
    expect(row.rows[0]?.fts).toContain('title');
  });

  it('supports plainto_tsquery search hitting the GIN index', async () => {
    await client.query(`INSERT INTO docs (id, title, body, tags) VALUES ($1, $2, $3, $4::jsonb)`, [
      'd2',
      'rust programming',
      'systems language',
      JSON.stringify(['lang'])
    ]);

    const found = await client.query<{ id: string }>(
      `SELECT id FROM docs WHERE _fts @@ plainto_tsquery('simple', $1) ORDER BY id`,
      ['rust']
    );
    const ids = found.rows.map(r => r.id);
    expect(ids).toContain('d2');
  });

  it('handles NULL fields gracefully (no NULL tsvector)', async () => {
    await client.query(`INSERT INTO docs (id, title, body, tags) VALUES ($1, $2, $3, $4)`, ['d3', null, null, null]);
    const row = await client.query<{ fts: string | null }>(`SELECT _fts::text AS fts FROM docs WHERE id = 'd3'`);
    expect(row.rows[0]?.fts).toBe('');
  });

  it('handles empty array tags', async () => {
    await client.query(`INSERT INTO docs (id, title, body, tags) VALUES ($1, $2, $3, $4::jsonb)`, [
      'd4',
      'only title',
      null,
      JSON.stringify([])
    ]);
    const row = await client.query<{ fts: string }>(`SELECT _fts::text AS fts FROM docs WHERE id = 'd4'`);
    expect(row.rows[0]?.fts).toContain('only');
    expect(row.rows[0]?.fts).toContain('title');
  });
});
