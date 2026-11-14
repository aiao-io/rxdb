import { getEntityMetadata } from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPgBomTriggerDdl, buildSqliteBomTriggerDdl } from '../backend/bom-trigger-ddl.js';
import { BOM_ENTITIES, BomHeader, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { lotMatches, parseLotCodes } from '../resolve/unit-lot.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

interface DraftFixture {
  adapter: BomTestAdapter;
  backend: BomTestBackend;
  headerId: string;
  childId: string;
  nextLineNo: number;
}

const draftFixture = async (backend: BomTestBackend): Promise<DraftFixture> => {
  const adapter = await createBomTestAdapter(backend);
  const em = adapter.rxdb.entityManager;
  const parent = em.instantiate(BomItem, { itemNo: 'lot-parent' });
  const child = em.instantiate(BomItem, { itemNo: 'lot-child' });
  await em.saveMany([parent, child]);
  const revision = em.instantiate(BomItemRevision, { itemId: parent.id, revisionNo: 'A' });
  await revision.save();
  const header = em.instantiate(BomHeader, {
    parentRevisionId: revision.id,
    bomType: 'ebom',
    orgId: 'lot-write'
  });
  await header.save();
  return { adapter, backend, headerId: header.id, childId: child.id, nextLineNo: 10 };
};

const occurrenceOf = async (fixture: DraftFixture, lotCodes: string | null): Promise<BomLineOccurrence> => {
  const em = fixture.adapter.rxdb.entityManager;
  const line = em.instantiate(BomLine, { headerId: fixture.headerId, lineNo: fixture.nextLineNo++ });
  await line.save();
  return em.instantiate(BomLineOccurrence, {
    lineId: line.id,
    childItemId: fixture.childId,
    qty: '1',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    lotCodes
  });
};

const insertRaw = async (fixture: DraftFixture, lotCodes: string | null): Promise<string> => {
  const occurrence = await occurrenceOf(fixture, lotCodes);
  const dialect = bomSqlDialectFor(fixture.backend);
  const fields = ['id', 'lineId', 'childItemId', 'qty', 'effectiveFrom', 'createdAt', 'updatedAt', 'lotCodes'];
  const timestamp = '2026-01-01T00:00:00.000Z';
  const values = [occurrence.id, occurrence.lineId, fixture.childId, '1', timestamp, timestamp, timestamp, lotCodes];
  await fixture.adapter.rawQuery(
    `INSERT INTO ${dialect.table('bom_line_occurrence')} (${fields.map(field => `"${field}"`).join(', ')}) ` +
      `VALUES (${values.map((_, index) => dialect.placeholder(index)).join(', ')})`,
    values
  );
  return occurrence.id;
};

const readStored = async (fixture: DraftFixture, id: string): Promise<unknown[][]> => {
  const dialect = bomSqlDialectFor(fixture.backend);
  return (
    await fixture.adapter.rawQuery(
      `SELECT "lotCodes", "qty" FROM ${dialect.table('bom_line_occurrence')} WHERE "id" = ${dialect.placeholder(0)}`,
      [id]
    )
  ).rows;
};

const updateRaw = (fixture: DraftFixture, id: string, assignments: string): Promise<unknown> => {
  const dialect = bomSqlDialectFor(fixture.backend);
  return fixture.adapter.rawQuery(
    `UPDATE ${dialect.table('bom_line_occurrence')} SET ${assignments} WHERE "id" = ${dialect.placeholder(0)}`,
    [id]
  );
};

const restoreGuards = (fixture: DraftFixture): Promise<void> => {
  const build = fixture.backend === 'pglite' ? buildPgBomTriggerDdl : buildSqliteBomTriggerDdl;
  const statements = BOM_ENTITIES.flatMap(Entity => build(getEntityMetadata(Entity)));
  return fixture.adapter.bootstrapTransaction(async executor => {
    for (const statement of statements) await executor.query(statement);
  }, false);
};

describe.each<BomTestBackend>(['wa-sqlite', 'pglite'])('空批次集合写入 [ %s ]', backend => {
  let fixture: DraftFixture;

  beforeEach(async () => {
    fixture = await draftFixture(backend);
  });

  afterEach(async () => {
    await disposeBomTestAdapter(fixture.adapter);
  });

  it('AC#12：插件 API 拒绝新增及修改为空集合，NULL 与非空集合仍可保存', async () => {
    const empty = await occurrenceOf(fixture, '[]');
    await expect(empty.save()).rejects.toThrow(/lot_codes/);
    expect(await readStored(fixture, empty.id)).toEqual([]);
    const unrestricted = await occurrenceOf(fixture, null);
    await unrestricted.save();
    expect(await readStored(fixture, unrestricted.id)).toEqual([[null, '1']]);
    const specific = await occurrenceOf(fixture, '["B1"]');
    await specific.save();
    const repository = fixture.adapter.rxdb.entityManager.getRepository(BomLineOccurrence);
    await expect(repository.update(specific, { lotCodes: '[ ]' })).rejects.toThrow(/lot_codes/);
    expect(await readStored(fixture, specific.id)).toEqual([['["B1"]', '1']]);
  });

  it('AC#12：直连 SQL 拒绝不同空白格式的空集合插入和更新，失败不改原值', async () => {
    const id = await insertRaw(fixture, '["B1"]');
    for (const empty of ['[]', '[ ]', '[\n\t]']) {
      await expect(insertRaw(fixture, empty)).rejects.toThrow(/lot_codes/);
      await expect(updateRaw(fixture, id, `"lotCodes" = '${empty}'`)).rejects.toThrow(/lot_codes/);
      expect(await readStored(fixture, id)).toEqual([['["B1"]', '1']]);
    }
    const unrestricted = await insertRaw(fixture, null);
    expect(await readStored(fixture, unrestricted)).toEqual([[null, '1']]);
    await updateRaw(fixture, unrestricted, '"lotCodes" = \'["B2"]\'');
    expect(await readStored(fixture, unrestricted)).toEqual([['["B2"]', '1']]);
  });

  it('批量保存含空集合时整批回滚，合法发生项不会提前落库', async () => {
    const valid = await occurrenceOf(fixture, '["B1"]');
    const invalid = await occurrenceOf(fixture, '[]');
    await expect(fixture.adapter.rxdb.entityManager.saveMany([valid, invalid])).rejects.toThrow(/lot_codes/);
    expect(await readStored(fixture, valid.id)).toEqual([]);
    expect(await readStored(fixture, invalid.id)).toEqual([]);
  });

  it('升级守卫保留历史空集合的读取语义，后续写入必须显式修正批次', async () => {
    const id = await insertRaw(fixture, '["B1"]');
    const table = bomSqlDialectFor(backend).table('bom_line_occurrence');
    const dropStatements =
      backend === 'pglite' ?
        [`DROP TRIGGER IF EXISTS "bom_line_occurrence__lot_codes_trg" ON ${table}`]
      : [
          'DROP TRIGGER IF EXISTS "bom_line_occurrence_lot_codes_i"',
          'DROP TRIGGER IF EXISTS "bom_line_occurrence_lot_codes_u"'
        ];
    for (const statement of dropStatements) await fixture.adapter.rawQuery(statement);
    await updateRaw(fixture, id, '"lotCodes" = \'[]\'');
    await restoreGuards(fixture);
    expect(await readStored(fixture, id)).toEqual([['[]', '1']]);
    expect(lotMatches(parseLotCodes('[]'), 'B1')).toBe(false);
    await expect(updateRaw(fixture, id, '"qty" = \'2\'')).rejects.toThrow(/lot_codes/);
    expect(await readStored(fixture, id)).toEqual([['[]', '1']]);
    await updateRaw(fixture, id, '"lotCodes" = NULL');
    expect(await readStored(fixture, id)).toEqual([[null, '1']]);
  });
});
