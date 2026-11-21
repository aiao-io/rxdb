/**
 * @fileoverview US-523 AC#7：来源删除与 ECN 撤回、取消的双后端原子保护。
 */

import { getEntityMetadata, type EntityType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  BOM_ENTITIES,
  BomEcn,
  BomHeader,
  BomInstanceNode,
  BomItem,
  BomItemRevision,
  BomLine,
  BomLineDesignator,
  BomLineOccurrence,
  BomLineOperationSplit,
  BomRouting,
  BomRoutingOperation,
  BomSubstituteGroup,
  BomWorkCenter
} from '../entities.js';
import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { loadHistory } from '../resolve/history-loader.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];
const day = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const ALL_ROWS = { where: { combinator: 'and' as const, rules: [] } };
const SPLIT_ALLOCATIONS = [
  { operationSeq: 10, ratio: '0.5' },
  { operationSeq: 20, ratio: '0.5' }
];

interface SourceFixture {
  header: BomHeader;
  occurrence: BomLineOccurrence;
  actualRevisionId: string;
}

const withAdapter = async (
  backend: BomTestBackend,
  run: (adapter: BomTestAdapter) => Promise<void>,
  entities: readonly EntityType[] = BOM_ENTITIES
): Promise<void> => {
  const adapter = await createBomTestAdapter(backend, entities);
  try {
    await run(adapter);
  } finally {
    await disposeBomTestAdapter(adapter);
  }
};

const addChildren = async (
  occurrence: BomLineOccurrence,
  designator: string,
  allocations = SPLIT_ALLOCATIONS
): Promise<void> => {
  const position = new BomLineDesignator();
  position.occurrenceId = occurrence.id;
  position.designator = designator;
  await position.save();
  for (const { operationSeq, ratio } of allocations) {
    const split = new BomLineOperationSplit();
    split.occurrenceId = occurrence.id;
    split.operationSeq = operationSeq;
    split.ratio = ratio;
    await split.save();
  }
};

const createSource = async (
  adapter: BomTestAdapter,
  published = false,
  allocations = SPLIT_ALLOCATIONS
): Promise<SourceFixture> => {
  const parent = new BomItem();
  parent.itemNo = 'SOURCE-PARENT';
  await parent.save();
  const child = new BomItem();
  child.itemNo = 'SOURCE-CHILD';
  await child.save();
  await loadHistory(adapter, {
    batchNo: 'source-revisions',
    revisions: [parent, child].map(item => ({ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') })),
    headers: []
  });
  const revisions = await adapter.getRepository(BomItemRevision).find(ALL_ROWS);
  const header = new BomHeader();
  header.parentRevisionId = revisions.find(revision => revision.itemId === parent.id)!.id;
  header.bomType = 'ebom';
  header.orgId = 'org-source';
  await header.save();
  const center = new BomWorkCenter();
  center.code = 'SOURCE-WC';
  center.orgId = header.orgId;
  await center.save();
  const routing = new BomRouting();
  routing.parentRevisionId = header.parentRevisionId;
  routing.bomType = header.bomType;
  routing.orgId = header.orgId;
  routing.validFrom = day('2020-01-01');
  await routing.save();
  for (const { operationSeq } of allocations) {
    const operation = new BomRoutingOperation();
    operation.routingId = routing.id;
    operation.operationSeq = operationSeq;
    operation.workCenterId = center.id;
    await operation.save();
  }
  header.routingId = routing.id;
  await header.save();
  const line = new BomLine();
  line.headerId = header.id;
  line.lineNo = 10;
  await line.save();
  const occurrence = new BomLineOccurrence();
  occurrence.lineId = line.id;
  occurrence.childItemId = child.id;
  occurrence.qty = '1';
  occurrence.designatorManaged = true;
  occurrence.effectiveFrom = day('2020-01-01');
  await occurrence.save();
  await addChildren(occurrence, 'BASE-1', allocations);
  if (published) {
    header.state = 'released';
    await header.save();
  }
  return { header, occurrence, actualRevisionId: revisions.find(revision => revision.itemId === child.id)!.id };
};

const createEcnSource = async (
  adapter: BomTestAdapter,
  state: 'draft' | 'released'
): Promise<SourceFixture & { ecn: BomEcn }> => {
  const fixture = await createSource(adapter, true);
  const ecn = new BomEcn();
  ecn.ecnNo = 'SOURCE-ECN';
  ecn.effectiveDate = day('2099-01-01');
  await ecn.save();
  fixture.occurrence.ecnOutId = ecn.id;
  fixture.occurrence.effectiveTo = ecn.effectiveDate;
  await fixture.occurrence.save();
  const line = new BomLine();
  line.headerId = fixture.header.id;
  line.lineNo = 20;
  line.ecnInId = ecn.id;
  await line.save();
  const group = new BomSubstituteGroup();
  group.headerId = fixture.header.id;
  group.code = 'SOURCE-GROUP';
  group.strategy = 'priority';
  group.ecnInId = ecn.id;
  await group.save();
  const occurrence = new BomLineOccurrence();
  occurrence.lineId = line.id;
  occurrence.childItemId = fixture.occurrence.childItemId;
  occurrence.qty = '1';
  occurrence.effectiveFrom = ecn.effectiveDate;
  occurrence.ecnInId = ecn.id;
  occurrence.designatorManaged = true;
  occurrence.substituteGroupId = group.id;
  occurrence.substituteRole = 'primary';
  occurrence.substitutePriority = 1;
  occurrence.equivQty = '1';
  await occurrence.save();
  await addChildren(occurrence, 'ECN-1');
  if (state === 'released') {
    ecn.state = 'released';
    await ecn.save();
  }
  return { ...fixture, occurrence, ecn };
};

const referenceSource = async (fixture: SourceFixture, serial: string, historical = false): Promise<void> => {
  const node = new BomInstanceNode();
  node.itemRevisionId = fixture.actualRevisionId;
  node.parentInstanceId = null;
  node.sourceOccurrenceId = fixture.occurrence.id;
  node.serialNumber = serial;
  node.lotCode = 'SOURCE-LOT';
  node.installedAt = day('2026-01-01');
  node.removedAt = historical ? day('2026-02-01') : null;
  await node.save();
};

const snapshot = async (adapter: BomLocalAdapter): Promise<string> =>
  adapter.transaction(async executor => {
    const tables: Record<string, unknown[][]> = {};
    for (const Entity of BOM_ENTITIES) {
      const result = await executor.query(`SELECT * FROM ${executor.tableRef(Entity)} ORDER BY "id"`);
      tables[getEntityMetadata(Entity).tableName] = result.rows;
    }
    return JSON.stringify(tables);
  });

const expectSourceProtected = async (
  adapter: BomTestAdapter,
  occurrenceId: string,
  references: number,
  mutate: () => Promise<unknown>
): Promise<void> => {
  const before = await snapshot(adapter);
  const error = await mutate().then(
    () => undefined,
    (cause: unknown) => cause
  );
  expect(error).toBeInstanceOf(Error);
  expect(await snapshot(adapter)).toBe(before);
  const message = error instanceof Error ? error.message : String(error);
  expect(message).toContain(occurrenceId);
  expect(message).toContain(`${references} 个实例`);
};

const CANCEL_CASES = [
  { state: 'draft' as const, path: 'entity' },
  { state: 'draft' as const, path: 'sql' },
  { state: 'released' as const, path: 'entity' },
  { state: 'released' as const, path: 'sql' }
];

describe.each(BACKENDS)('US-523 来源保护 [%s]', backend => {
  it('单工序分摊1发布成功，规范整数比例与小数比例使用同一聚合口径', async () =>
    withAdapter(backend, async adapter => {
      const fixture = await createSource(adapter, true, [{ operationSeq: 10, ratio: '1' }]);
      expect(fixture.header.state).toBe('released');
    }));

  it('草稿发生项实体删除：已拆卸历史与当前实例都计入引用，所有表不变', async () =>
    withAdapter(backend, async adapter => {
      const fixture = await createSource(adapter);
      await referenceSource(fixture, 'SOURCE-CURRENT');
      await referenceSource(fixture, 'SOURCE-HISTORY', true);
      await expectSourceProtected(adapter, fixture.occurrence.id, 2, () => fixture.occurrence.remove());
    }));

  it('直连 SQL 删除草稿来源：点名发生项与引用数，子表不被级联擦除', async () =>
    withAdapter(backend, async adapter => {
      const fixture = await createSource(adapter);
      await referenceSource(fixture, 'SOURCE-RAW');
      const dialect = bomSqlDialectFor(backend);
      await expectSourceProtected(adapter, fixture.occurrence.id, 1, () =>
        adapter.rawQuery(`DELETE FROM ${dialect.table('bom_line_occurrence')} WHERE "id" = ${dialect.placeholder(0)}`, [
          fixture.occurrence.id
        ])
      );
    }));

  it.each(CANCEL_CASES)(
    '$state ECN 经 $path 撤回或取消：历史引用保护全部状态、子表及截止标记',
    async ({ state, path }) =>
      withAdapter(backend, async adapter => {
        const fixture = await createEcnSource(adapter, state);
        await referenceSource(fixture, 'SOURCE-ECN-HISTORY', true);
        const dialect = bomSqlDialectFor(backend);
        const mutate = (): Promise<unknown> => {
          if (path === 'sql')
            return adapter.rawQuery(
              `UPDATE ${dialect.table('ecn')} SET "state" = 'cancelled' WHERE "id" = ${dialect.placeholder(0)}`,
              [fixture.ecn.id]
            );
          fixture.ecn.state = 'cancelled';
          return fixture.ecn.save();
        };
        await expectSourceProtected(adapter, fixture.occurrence.id, 1, mutate);
      })
  );

  it('未注册实例实体时，原有草稿发生项删除与子表级联继续可用', async () =>
    withAdapter(
      backend,
      async adapter => {
        const fixture = await createSource(adapter);
        const dialect = bomSqlDialectFor(backend);
        await adapter.rawQuery(
          `DELETE FROM ${dialect.table('bom_line_operation_split')} WHERE "occurrenceId" = ${dialect.placeholder(0)}`,
          [fixture.occurrence.id]
        );
        await fixture.occurrence.remove();
        const result = await adapter.rawQuery(
          `SELECT COUNT(*) FROM ${dialect.table('bom_line_designator')} WHERE "occurrenceId" = ${dialect.placeholder(0)}`,
          [fixture.occurrence.id]
        );
        expect(Number(result.rows[0][0])).toBe(0);
      },
      BOM_ENTITIES.filter(Entity => Entity !== BomInstanceNode)
    ));
});
