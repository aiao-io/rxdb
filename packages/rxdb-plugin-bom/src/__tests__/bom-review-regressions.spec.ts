import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomEcn, BomHeader, BomItem, BomLine, BomLineOccurrence, BomSubstituteGroup } from '../entities.js';
import { rollupCost } from '../quantity/cost.js';
import { explodeBom } from '../quantity/explosion.js';
import { expandBom, whereUsed } from '../resolve/expansion.js';
import { loadHistory } from '../resolve/history-loader.js';
import { exportBom } from '../resolve/integration.js';
import { resolveBom } from '../resolve/resolver.js';
import { writeBypassingGuards } from './guard-bypass.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const context = { bomType: 'ebom' as const, orgId: 'review-regressions', asOfDate: day('2099-06-01') };
const quantity = { plannedQty: { value: '1', uom: 'pcs' } };
const costContext = { ...context, currency: 'CNY', rateDate: context.asOfDate };

const makeItem = async (adapter: BomTestAdapter): Promise<BomItem> => {
  const item = adapter.rxdb.entityManager.instantiate(BomItem, {
    itemNo: crypto.randomUUID(),
    unitPrice: '1',
    creditPrice: '5'
  });
  await item.save();
  return item;
};

const draftHeader = async (adapter: BomTestAdapter) => {
  const root = await makeItem(adapter);
  const child = await makeItem(adapter);
  const revisionId = crypto.randomUUID();
  await loadHistory(adapter, {
    batchNo: crypto.randomUUID(),
    revisions: [{ id: revisionId, itemId: root.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
    headers: []
  });
  const header = adapter.rxdb.entityManager.instantiate(BomHeader, {
    parentRevisionId: revisionId,
    bomType: context.bomType,
    orgId: context.orgId,
    costLotQty: '1'
  });
  await header.save();
  return { root, child, header, target: { parentRevisionId: revisionId } };
};

const addOccurrence = async (
  adapter: BomTestAdapter,
  header: BomHeader,
  child: BomItem,
  lineNo: number,
  ecnInId: string | null = null,
  flowDirection: BomLineOccurrence['flowDirection'] = 'consume'
) => {
  const line = adapter.rxdb.entityManager.instantiate(BomLine, { headerId: header.id, lineNo, ecnInId });
  await line.save();
  const occurrence = adapter.rxdb.entityManager.instantiate(BomLineOccurrence, {
    lineId: line.id,
    childItemId: child.id,
    qty: '2',
    flowDirection,
    effectiveFrom: day('2020-01-01')
  });
  await occurrence.save();
  return { line, occurrence };
};

describe.each(['wa-sqlite', 'pglite'] as const)('评审边界回归 [%s]', backend => {
  let adapter: BomTestAdapter;
  beforeAll(async () => {
    adapter = await createBomTestAdapter(backend);
  });
  afterAll(async () => {
    await disposeBomTestAdapter(adapter);
  });

  const table = (name: string): string => (backend === 'wa-sqlite' ? `"bom$${name}"` : `"bom"."${name}"`);
  const hiddenLine = async () => {
    const fixture = await draftHeader(adapter);
    const ecn = adapter.rxdb.entityManager.instantiate(BomEcn, {
      ecnNo: crypto.randomUUID(),
      effectiveDate: day('2099-07-01')
    });
    await ecn.save();
    await addOccurrence(adapter, fixture.header, fixture.child, 10);
    const hidden = await addOccurrence(adapter, fixture.header, fixture.child, 20, ecn.id);
    return { ...fixture, ...hidden, ecn };
  };

  it('头发布拒绝未发布 ECN 的逻辑行与发生项归属不一致', async () => {
    const { header } = await hiddenLine();
    header.state = 'released';
    await expect(header.save()).rejects.toThrow(/ECN.*归属|归属.*ECN/);
  });

  it('头发布同样拒绝未发布替代组与成员发生项的 ECN 归属不一致', async () => {
    const { header, child } = await draftHeader(adapter);
    const ecn = adapter.rxdb.entityManager.instantiate(BomEcn, {
      ecnNo: crypto.randomUUID(),
      effectiveDate: day('2099-07-01')
    });
    await ecn.save();
    const group = adapter.rxdb.entityManager.instantiate(BomSubstituteGroup, {
      headerId: header.id,
      code: crypto.randomUUID(),
      strategy: 'manual',
      ecnInId: ecn.id
    });
    await group.save();
    const { occurrence } = await addOccurrence(adapter, header, child, 10);
    occurrence.substituteGroupId = group.id;
    occurrence.substituteRole = 'primary';
    await occurrence.save();
    header.state = 'released';
    await expect(header.save()).rejects.toThrow(/ECN.*归属|归属.*ECN/);
  });

  it('相同 ECN 的逻辑行与发生项可随头发布，按生效日显示并在取消后移除', async () => {
    const { header, child, target } = await draftHeader(adapter);
    await addOccurrence(adapter, header, child, 10);
    const ecn = adapter.rxdb.entityManager.instantiate(BomEcn, {
      ecnNo: crypto.randomUUID(),
      effectiveDate: day('2099-07-01')
    });
    await ecn.save();
    const line = adapter.rxdb.entityManager.instantiate(BomLine, {
      headerId: header.id,
      lineNo: 20,
      ecnInId: ecn.id
    });
    await line.save();
    const occurrence = adapter.rxdb.entityManager.instantiate(BomLineOccurrence, {
      lineId: line.id,
      childItemId: child.id,
      qty: '2',
      ecnInId: ecn.id,
      effectiveFrom: ecn.effectiveDate
    });
    await occurrence.save();
    header.state = 'released';
    await header.save();
    const future = { ...context, asOfDate: day('2099-07-01') };
    expect((await resolveBom(adapter, future, target)).occurrences).toHaveLength(1);
    ecn.state = 'released';
    await ecn.save();
    expect((await resolveBom(adapter, context, target)).occurrences).toHaveLength(1);
    expect((await resolveBom(adapter, future, target)).occurrences).toHaveLength(2);
    ecn.state = 'cancelled';
    await ecn.save();
    expect((await resolveBom(adapter, future, target)).occurrences).toHaveLength(1);
  });

  it('旧库的未发布逻辑行在解析、下钻、反查、数量、成本与导出中一致隐藏', async () => {
    const { header, target, child, occurrence, ecn } = await hiddenLine();
    await writeBypassingGuards(
      adapter,
      'bom_header',
      `UPDATE ${table('bom_header')} SET "state" = 'released' WHERE "id" = '${header.id}'`
    );
    expect((await resolveBom(adapter, context, target)).occurrences).toHaveLength(1);
    expect((await expandBom(adapter, context, target)).nodes).toHaveLength(2);
    expect((await whereUsed(adapter, context, { childItemId: child.id })).nodes).toHaveLength(1);
    expect((await explodeBom(adapter, context, target, quantity)).requirementLines).toHaveLength(1);
    expect((await rollupCost(adapter, costContext, target)).root.batchCost).toBe('2');
    expect((await exportBom(adapter, context, target, quantity)).manifest['occurrenceIds']).not.toContain(
      occurrence.id
    );
    ecn.state = 'released';
    await ecn.save();
    expect((await resolveBom(adapter, context, target)).occurrences).toHaveLength(1);
    expect((await resolveBom(adapter, { ...context, asOfDate: day('2099-07-01') }, target)).occurrences).toHaveLength(
      2
    );
  });

  it.each(['by_product', 'scrap_out'] as const)('只有 %s 的成本层级在默认与显式批量下都拒绝', async direction => {
    const { header, target, child } = await draftHeader(adapter);
    await addOccurrence(adapter, header, child, 10, null, direction);
    header.state = 'released';
    await header.save();
    await expect(rollupCost(adapter, costContext, target)).rejects.toThrow(/无投入/);
    await expect(rollupCost(adapter, costContext, target, { value: '2', uom: 'pcs' })).rejects.toThrow(/无投入/);
  });
});
