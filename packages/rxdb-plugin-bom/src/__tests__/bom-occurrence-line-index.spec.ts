import { RxDBMigration } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { loadBomViewFixture, type BomViewFixture } from '../testing/bom-view-fixture.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

const migrationName = '0002-bom-occurrence-line-index';

const readLineCandidates = async (adapter: BomTestAdapter, fixture: BomViewFixture) => {
  const dialect = bomSqlDialectFor(adapter.name);
  return adapter.transaction(async executor => {
    const line = await executor.query(
      `SELECT "lineId" FROM ${dialect.table('bom_line_occurrence')} WHERE "id" = ${dialect.placeholder(0)}`,
      [fixture.ids.occurrences.unitOld]
    );
    const sql = `SELECT "id" FROM ${dialect.table('bom_line_occurrence')} WHERE "lineId" = ${dialect.placeholder(0)}`;
    const params = [line.rows[0][0]];
    const candidates = await executor.query(sql, params);
    expect(candidates.rows.map(row => String(row[0])).sort()).toEqual(
      [fixture.ids.occurrences.unitOld, fixture.ids.occurrences.unitNew].sort()
    );
    const plan = await executor.query(
      adapter.name === 'pglite' ? `EXPLAIN (FORMAT JSON) ${sql}` : `EXPLAIN QUERY PLAN ${sql}`,
      params
    );
    return JSON.stringify(plan.rows);
  }, false);
};

const lineIndexes = (adapter: BomTestAdapter) =>
  adapter.transaction(
    executor =>
      executor.query(
        adapter.name === 'pglite' ?
          `SELECT indexname FROM pg_indexes WHERE schemaname = 'bom' AND tablename = 'bom_line_occurrence' AND indexdef LIKE '%("lineId")%'`
        : `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'bom$bom_line_occurrence' AND sql LIKE '%("lineId")%'`
      ),
    false
  );

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`发生项逻辑行候选索引 [${backend}]`, () => {
    it('按逻辑行读取使用索引，完整保留序列变化前后的两条真实候选', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const plan = await readLineCandidates(adapter, await loadBomViewFixture(adapter.rxdb));
        expect(plan).toMatch(/Index Scan|Bitmap Index Scan|USING (?:COVERING )?INDEX/);
        expect(plan).toContain('lineId');
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('旧版本库升级补齐逻辑行索引并记录迁移，发生项与未裁决候选保持原值', async () => {
      const dbName = `li-${crypto.randomUUID()}`;
      let adapter = await createBomTestAdapter(backend, undefined, { dbName, persistent: true });
      let fixture: BomViewFixture;
      try {
        fixture = await loadBomViewFixture(adapter.rxdb);
        const indexes = await lineIndexes(adapter);
        expect(indexes.rows).toHaveLength(1);
        const name = String(indexes.rows[0][0]).replaceAll('"', '""');
        await adapter.transaction(async executor => {
          await executor.query(`DROP INDEX ${backend === 'pglite' ? '"bom".' : ''}"${name}"`);
          await executor.query(
            `DELETE FROM ${executor.tableRef(RxDBMigration)} WHERE "name" = ${bomSqlDialectFor(backend).placeholder(0)}`,
            [migrationName]
          );
        }, false);
        expect((await lineIndexes(adapter)).rows).toEqual([]);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
      adapter = await createBomTestAdapter(backend, undefined, { dbName, persistent: true });
      try {
        expect((await lineIndexes(adapter)).rows).toHaveLength(1);
        await readLineCandidates(adapter, fixture!);
        const migrations = await adapter.transaction(
          executor =>
            executor.query(
              `SELECT "name" FROM ${executor.tableRef(RxDBMigration)} WHERE "name" = ${bomSqlDialectFor(backend).placeholder(0)}`,
              [migrationName]
            ),
          false
        );
        expect(migrations.rows).toEqual([[migrationName]]);
        const result = await adapter.rxdb.bom.whereUsed(fixture!.input.context, {
          childItemId: fixture!.ids.items.red
        });
        expect(result.unresolved?.some(group => group.reason === 'unit')).toBe(true);
        expect(result.unresolved?.flatMap(group => group.candidates).map(candidate => candidate.occurrenceId)).toEqual(
          expect.arrayContaining([fixture!.ids.occurrences.unitOld, fixture!.ids.occurrences.unitNew])
        );
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });
  });
}
