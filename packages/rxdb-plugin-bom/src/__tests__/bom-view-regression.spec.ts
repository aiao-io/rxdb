import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BomItem } from '../entities.js';
import { rollupCost } from '../quantity/cost.js';
import { explodeBom } from '../quantity/explosion.js';
import { expandBom, whereUsed } from '../resolve/expansion.js';
import { loadHistory, type HistoryHeaderInput } from '../resolve/history-loader.js';
import { viewCandidates } from '../view-projection.js';
import { createBomView } from '../view-state.js';
import { readBomViewSnapshot } from '../view.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

const effectiveFrom = new Date('2026-01-01T00:00:00Z');
const context = { bomType: 'ebom' as const, orgId: 'view-regression', asOfDate: new Date('2026-06-01T00:00:00Z') };
const plannedQty = { value: '1', uom: 'pcs' };

const load = async (adapter: BomTestAdapter, names: string[], headers: (items: BomItem[]) => HistoryHeaderInput[]) => {
  const items: BomItem[] = [];
  for (const itemNo of names) {
    const item = adapter.rxdb.entityManager.instantiate(BomItem, { itemNo, unitPrice: '1' });
    await item.save();
    items.push(item);
  }
  await loadHistory(adapter, {
    batchNo: `view-regression-${crypto.randomUUID()}`,
    revisions: items.map(item => ({ itemId: item.id, revisionNo: 'A', effectiveFrom })),
    headers: headers(items)
  });
  return items;
};

const line = (item: BomItem, lineNo: number) => ({
  lineNo,
  occurrences: [{ childItemId: item.id, qty: '1', effectiveFrom }]
});

const loadManualGroups = async (adapter: BomTestAdapter) => {
  const groupIds = [crypto.randomUUID(), crypto.randomUUID()];
  const items = await load(adapter, ['root', 'A', 'B', 'A1', 'A2', 'B1', 'B2'], rows => [
    { ...context, revisionIndex: 0, costLotQty: '1', lines: [line(rows[1], 10), line(rows[2], 20)] },
    ...[1, 2].map(index => ({
      ...context,
      revisionIndex: index,
      costLotQty: '1',
      lines: [line(rows[index * 2 + 1], 10), line(rows[index * 2 + 2], 20)],
      substituteGroups: [
        {
          id: groupIds[index - 1],
          code: 'G1',
          strategy: 'manual' as const,
          allowMix: false,
          members: [
            { occurrenceIndex: 0, role: 'primary' as const },
            { occurrenceIndex: 1, role: 'substitute' as const }
          ]
        }
      ]
    }))
  ]);
  return { items, groupIds, target: { parentItemId: items[0].id } };
};

describe.each(['wa-sqlite', 'pglite'] as const)('BOM 视图边界回归 [%s]', backend => {
  let adapter: BomTestAdapter;
  beforeEach(async () => {
    adapter = await createBomTestAdapter(backend);
  });
  afterEach(async () => {
    await disposeBomTestAdapter(adapter);
  });

  it('副产回流不进入结构层级和投入反查，共享视图可以完整计算', async () => {
    const items = await load(adapter, ['flow-A', 'flow-B', 'flow-C'], rows => [
      { ...context, revisionIndex: 0, lines: [line(rows[1], 10)] },
      {
        ...context,
        revisionIndex: 1,
        lines: [
          line(rows[2], 10),
          {
            lineNo: 20,
            occurrences: [{ childItemId: rows[0].id, qty: '1', effectiveFrom, flowDirection: 'by_product' }]
          }
        ]
      }
    ]);
    const target = { parentItemId: items[0].id };
    const exploded = await explodeBom(adapter, context, target, { plannedQty });
    expect(exploded.truncated).toBeNull();
    expect(exploded.outputs).toMatchObject([{ itemId: items[0].id, direction: 'by_product', qty: '1' }]);
    const expanded = await expandBom(adapter, context, target, { budgets: { depth: 4 } });
    expect(expanded.truncated).toBeNull();
    expect(expanded.nodes.map(row => row.itemId)).toEqual(items.map(item => item.id));
    const usage = await whereUsed(adapter, context, { childItemId: items[0].id }, { budgets: { depth: 3 } });
    expect(usage.truncated).toBeNull();
    expect(usage.nodes).toEqual([]);
    const view = createBomView(adapter.rxdb, { context, target, plannedQty });
    try {
      await expect(view.calculate()).resolves.toMatchObject({ truncated: null, outputs: exploded.outputs });
    } finally {
      view.destroy();
    }
  });

  it('同一逻辑行混合投入和产出候选时先裁决序列，再沿投入下钻', async () => {
    const items = await load(adapter, ['mixed-root', 'mixed-in', 'mixed-out', 'mixed-raw'], rows => [
      {
        ...context,
        revisionIndex: 0,
        lines: [
          {
            lineNo: 10,
            occurrences: [
              { childItemId: rows[1].id, qty: '1', effectiveFrom, unitFrom: 1, unitTo: 100 },
              {
                childItemId: rows[2].id,
                qty: '1',
                effectiveFrom,
                unitFrom: 101,
                unitTo: 200,
                flowDirection: 'by_product'
              }
            ]
          },
          line(rows[3], 20)
        ]
      }
    ]);
    const target = { parentItemId: items[0].id };
    const unresolved = await expandBom(adapter, context, target);
    expect(unresolved.unresolved).toMatchObject([
      { reason: 'unit', candidates: [{ childItemId: items[1].id }, { childItemId: items[2].id }] }
    ]);
    expect(unresolved.nodes.map(row => row.itemId)).toEqual([items[0].id, items[3].id]);
    const usage = await whereUsed(adapter, context, { childItemId: items[1].id });
    expect(usage.unresolved).toHaveLength(1);
    expect(usage.nodes).toEqual([]);
    const outputUsage = await whereUsed(adapter, context, { childItemId: items[2].id });
    expect(outputUsage.unresolved).toBeUndefined();
    expect(outputUsage.nodes).toEqual([]);
    const selected = await expandBom(adapter, { ...context, unit: 150 }, target);
    expect(selected.unresolved).toBeUndefined();
    expect(selected.nodes.map(row => row.itemId)).toEqual([items[0].id, items[3].id]);
  });

  it('不同子头的同名手动替代组保留独立身份与完整候选', async () => {
    const { items, groupIds, target } = await loadManualGroups(adapter);
    const snapshot = await readBomViewSnapshot(adapter.rxdb, { context, target, plannedQty });
    expect(snapshot.explosion?.unresolved).toHaveLength(2);
    const candidates = viewCandidates(snapshot);
    expect(candidates.map(group => group.key).sort()).toEqual(groupIds.map(id => `manual:${id}`).sort());
    expect(
      candidates
        .flatMap(group => group.candidates)
        .map(candidate => candidate.label)
        .sort()
    ).toEqual(
      items
        .slice(3)
        .map(item => item.itemNo)
        .sort()
    );
  });

  it('按组 ID 独立选择同名组，数量和成本使用同一选择', async () => {
    const { items, groupIds, target } = await loadManualGroups(adapter);
    items[6].unitPrice = '20';
    await items[6].save();
    const selected = {
      ...context,
      substituteSelections: {
        G1: { memberKey: 'legacy-selection' },
        [groupIds[0]]: { memberKey: items[3].id },
        [groupIds[1]]: { memberKey: items[6].id }
      }
    };
    const result = await explodeBom(adapter, selected, target, { plannedQty });
    expect(result.unresolved).toEqual([]);
    expect(
      result.requirementLines
        .filter(row => row.path.length === 2)
        .map(row => row.itemId)
        .sort()
    ).toEqual([items[3].id, items[6].id].sort());
    const cost = await rollupCost(
      adapter,
      { ...selected, currency: 'CNY', rateDate: context.asOfDate },
      target,
      plannedQty
    );
    expect(cost.root.batchCost).toBe('21');
  });
});
