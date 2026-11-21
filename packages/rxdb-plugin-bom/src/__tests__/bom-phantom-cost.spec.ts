import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomItem } from '../entities.js';
import { rollupCost, type CostRollupContext } from '../quantity/cost.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { loadHistory, type HistoryOccurrenceInput } from '../resolve/history-loader.js';
import { writeBypassingGuards } from './guard-bypass.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const at = new Date('2020-01-01T00:00:00.000Z');
const context: CostRollupContext = {
  bomType: 'ebom',
  orgId: 'phantom-cost-org',
  asOfDate: new Date('2026-01-01T00:00:00.000Z'),
  currency: 'CNY',
  rateDate: new Date('2026-01-01T00:00:00.000Z')
};
type CostOccurrence = Omit<HistoryOccurrenceInput, 'childItemId' | 'effectiveFrom'> & { child: BomItem };
interface CostHeader {
  item: BomItem;
  defaultPhantom?: boolean;
  baseUom?: string;
  baseQty?: string;
  costLotQty?: string | null;
  jointCostShare?: string;
  occurrences: CostOccurrence[];
}

const makeItem = async (key: string, values: Partial<BomItem> = {}): Promise<BomItem> => {
  const item = Object.assign(new BomItem(), {
    itemNo: `${key}-${crypto.randomUUID()}`,
    stockUom: 'pcs',
    unitPrice: null,
    priceCurrency: 'CNY',
    ...values
  });
  await item.save();
  return item;
};

const seed = async (adapter: BomTestAdapter, headers: CostHeader[]) => {
  const items = [...new Set(headers.flatMap(header => [header.item, ...header.occurrences.map(row => row.child)]))];
  const revisionIds = new Map(items.map(item => [item.id, crypto.randomUUID()]));
  const headerIds = new Map(headers.map(header => [header.item.id, crypto.randomUUID()]));
  await loadHistory(adapter, {
    batchNo: `phantom-cost-${crypto.randomUUID()}`,
    revisions: items.map(item => ({
      id: revisionIds.get(item.id),
      itemId: item.id,
      revisionNo: 'A',
      effectiveFrom: at,
      defaultPhantom: headers.find(header => header.item === item)?.defaultPhantom ?? false
    })),
    headers: headers.map(header => ({
      id: headerIds.get(header.item.id),
      revisionIndex: items.indexOf(header.item),
      bomType: 'ebom',
      orgId: context.orgId,
      baseUom: header.baseUom ?? 'pcs',
      baseQty: header.baseQty ?? '1',
      costLotQty: header.costLotQty === undefined ? '1' : header.costLotQty,
      jointCostShare: header.jointCostShare,
      lines: header.occurrences.map(({ child, ...row }, index) => ({
        lineNo: 10 + index,
        occurrences: [
          {
            qty: '1',
            uom: header.baseUom ?? 'pcs',
            ...row,
            childItemId: child.id,
            childRevisionId: row.flowDirection === 'produce' ? revisionIds.get(child.id) : undefined,
            effectiveFrom: at
          }
        ]
      }))
    }))
  });
  return { revisionIds, headerIds };
};

for (const backend of ['wa-sqlite', 'pglite'] satisfies BomTestBackend[]) {
  describe(`虚拟件按实际批量穿透成本 [${backend}]`, () => {
    let adapter: BomTestAdapter;
    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });
    afterAll(async () => {
      await disposeBomTestAdapter(adapter);
    });

    it('固定投入3件单价10，根用2个虚拟件只计30，且虚拟件不要求成本批量', async () => {
      const root = await makeItem('fixed-root');
      const phantom = await makeItem('fixed-phantom');
      const leaf = await makeItem('fixed-leaf', { unitPrice: '10' });
      await seed(adapter, [
        { item: root, occurrences: [{ child: phantom, qty: '2' }] },
        {
          item: phantom,
          defaultPhantom: true,
          costLotQty: null,
          occurrences: [{ child: leaf, qty: '3', isFixedQty: true }]
        }
      ]);
      const result = await rollupCost(adapter, context, { parentItemId: root.id });
      expect(result.root.batchCost).toBe('30');
      expect(result.root.unitCost).toBe('30');
      expect(result.root.material).toEqual([
        expect.objectContaining({ childItemId: leaf.id, demand: '3', amount: '30' })
      ]);
      expect(result.root.children).toEqual([]);
    });

    it('行级true覆盖非虚拟修订，行级false覆盖虚拟修订并保持普通子装配标准批量', async () => {
      const root = await makeItem('override-root');
      const byLine = await makeItem('override-true');
      const byRevision = await makeItem('override-false');
      const leaf = await makeItem('override-leaf', { unitPrice: '10' });
      await seed(adapter, [
        {
          item: root,
          occurrences: [
            { child: byLine, qty: '2', phantomOverride: true },
            { child: byRevision, qty: '4', phantomOverride: false }
          ]
        },
        { item: byLine, costLotQty: null, occurrences: [{ child: leaf, qty: '3', isFixedQty: true }] },
        {
          item: byRevision,
          defaultPhantom: true,
          costLotQty: '2',
          occurrences: [{ child: leaf, qty: '3', isFixedQty: true }]
        }
      ]);
      const result = await rollupCost(adapter, context, { parentItemId: root.id });
      expect(result.root.batchCost).toBe('90');
      expect(result.root.material.map(line => [line.childItemId, line.amount])).toEqual([
        [leaf.id, '30'],
        [byRevision.id, '60']
      ]);
      expect(result.root.children.map(node => node.itemId)).toEqual([byRevision.id]);
      expect(result.root.children[0].unitCost).toBe('15');
    });

    it('同一虚拟件经两条路径到达时，固定投入按路径各计一次', async () => {
      const root = await makeItem('paths-root');
      const phantom = await makeItem('paths-phantom');
      const leaf = await makeItem('paths-leaf', { unitPrice: '10' });
      await seed(adapter, [
        {
          item: root,
          occurrences: [
            { child: phantom, qty: '2' },
            { child: phantom, qty: '5' }
          ]
        },
        { item: phantom, defaultPhantom: true, occurrences: [{ child: leaf, qty: '3', isFixedQty: true }] }
      ]);
      const result = await rollupCost(adapter, context, { parentItemId: root.id });
      expect(result.root.batchCost).toBe('60');
      expect(result.root.material.map(line => [line.demand, line.amount])).toEqual([
        ['3', '30'],
        ['3', '30']
      ]);
      expect(result.root.children).toEqual([]);
    });

    it('固定组件损耗按虚拟件当前批量计一次，不按单位成本放大', async () => {
      const root = await makeItem('scrap-root');
      const phantom = await makeItem('scrap-phantom');
      const leaf = await makeItem('scrap-leaf', { unitPrice: '10' });
      await seed(adapter, [
        { item: root, occurrences: [{ child: phantom, qty: '2' }] },
        { item: phantom, defaultPhantom: true, occurrences: [{ child: leaf, qty: '1', componentScrapFixed: '3' }] }
      ]);
      const result = await rollupCost(adapter, context, { parentItemId: root.id });
      expect(result.root.batchCost).toBe('50');
      expect(result.root.material[0]).toMatchObject({ childItemId: leaf.id, demand: '5', amount: '50' });
    });

    it('阶梯按穿透后的实际批量选行，而非虚拟件成本批量', async () => {
      const root = await makeItem('tier-root');
      const phantom = await makeItem('tier-phantom');
      const leaf = await makeItem('tier-leaf', { unitPrice: '10' });
      await seed(adapter, [
        { item: root, occurrences: [{ child: phantom, qty: '10' }] },
        {
          item: phantom,
          defaultPhantom: true,
          occurrences: [
            { child: leaf, qty: '3', isFixedQty: true, tierGroupNo: 'T', lotsizeFrom: '0', lotsizeTo: '5' },
            { child: leaf, qty: '7', isFixedQty: true, tierGroupNo: 'T', lotsizeFrom: '5', lotsizeTo: null }
          ]
        }
      ]);
      const result = await rollupCost(adapter, context, { parentItemId: root.id });
      expect(result.root.batchCost).toBe('70');
      expect(result.root.material[0]).toMatchObject({ childItemId: leaf.id, demand: '7', amount: '70' });
    });

    it('单位换算先于穿透：1000g归一1kg后计算固定损耗', async () => {
      const root = await makeItem('uom-root');
      const phantom = await makeItem('uom-phantom', { stockUom: 'g' });
      const leaf = await makeItem('uom-leaf', { unitPrice: '10' });
      await seed(adapter, [
        { item: root, occurrences: [{ child: phantom, qty: '1000', uom: 'g' }] },
        {
          item: phantom,
          defaultPhantom: true,
          baseUom: 'kg',
          costLotQty: '2',
          occurrences: [{ child: leaf, qty: '2', uom: 'pcs', componentScrapFixed: '3' }]
        }
      ]);
      const result = await rollupCost(adapter, context, { parentItemId: root.id });
      expect(result.root.batchCost).toBe('50');
      expect(result.root.material[0]).toMatchObject({
        childItemId: leaf.id,
        demand: '5',
        demandUom: 'pcs',
        amount: '50'
      });
    });

    it('嵌套虚拟件穿透到普通子装配即停止，普通子装配仍按标准批量单位成本计价', async () => {
      const root = await makeItem('nested-root');
      const outer = await makeItem('nested-outer');
      const inner = await makeItem('nested-inner');
      const assembly = await makeItem('nested-assembly');
      const leaf = await makeItem('nested-leaf', { unitPrice: '10' });
      await seed(adapter, [
        { item: root, occurrences: [{ child: outer, qty: '2' }] },
        { item: outer, defaultPhantom: true, costLotQty: null, occurrences: [{ child: inner, qty: '3' }] },
        {
          item: inner,
          defaultPhantom: true,
          costLotQty: null,
          occurrences: [
            { child: assembly, qty: '2' },
            { child: leaf, qty: '3', isFixedQty: true }
          ]
        },
        { item: assembly, costLotQty: '2', occurrences: [{ child: leaf, qty: '3', isFixedQty: true }] }
      ]);
      const result = await rollupCost(adapter, context, { parentItemId: root.id });
      expect(result.root.batchCost).toBe('210');
      expect(result.root.material.map(line => [line.childItemId, line.demand, line.amount])).toEqual([
        [assembly.id, '12', '180'],
        [leaf.id, '3', '30']
      ]);
      expect(result.root.children.map(node => node.itemId)).toEqual([assembly.id]);
      expect(result.root.children[0].unitCost).toBe('15');
    });

    it('穿透后的联产输出保持显式生产头成本来源，固定投入不重复缩放', async () => {
      const root = await makeItem('joint-root');
      const phantom = await makeItem('joint-phantom');
      const primary = await makeItem('joint-primary', { stockUom: 'kg' });
      const output = await makeItem('joint-output', { stockUom: 'kg' });
      const raw = await makeItem('joint-raw', { stockUom: 'kg', unitPrice: '2' });
      const fixture = await seed(adapter, [
        { item: root, occurrences: [{ child: phantom, qty: '2' }] },
        {
          item: phantom,
          defaultPhantom: true,
          costLotQty: null,
          occurrences: [{ child: output, qty: '3', uom: 'kg', isFixedQty: true }]
        },
        {
          item: primary,
          baseUom: 'kg',
          baseQty: '100',
          costLotQty: '100',
          jointCostShare: '0.6',
          occurrences: [
            { child: raw, qty: '110', uom: 'kg' },
            { child: output, qty: '50', uom: 'kg', flowDirection: 'produce', jointCostShare: '0.4' }
          ]
        }
      ]);
      const outputRevisionId = fixture.revisionIds.get(output.id)!;
      const producerHeaderId = fixture.headerIds.get(primary.id)!;
      const result = await rollupCost(
        adapter,
        { ...context, jointCostSources: { [outputRevisionId]: producerHeaderId } },
        { parentItemId: root.id }
      );
      expect(result.root.batchCost).toBe('5.28');
      expect(result.root.material[0]).toMatchObject({
        childItemId: output.id,
        demand: '3',
        unitCost: '1.76',
        amount: '5.28'
      });
      expect(result.root.children).toEqual([]);
      expect(result.jointManifest?.sources).toEqual([expect.objectContaining({ outputRevisionId, producerHeaderId })]);
    });

    it('普通子装配仍要求声明标准成本批量', async () => {
      const root = await makeItem('required-root');
      const assembly = await makeItem('required-assembly');
      const leaf = await makeItem('required-leaf', { unitPrice: '10' });
      await seed(adapter, [
        { item: root, occurrences: [{ child: assembly, qty: '2' }] },
        { item: assembly, costLotQty: null, occurrences: [{ child: leaf, qty: '3', isFixedQty: true }] }
      ]);
      await expect(rollupCost(adapter, context, { parentItemId: root.id })).rejects.toThrow(/成本批量|cost_lot_qty/);
    });

    it('存量虚拟件环明确拒绝，不绕过成本节点环防护导致递归不终止', async () => {
      const root = await makeItem('cycle-root');
      const phantom = await makeItem('cycle-phantom');
      const leaf = await makeItem('cycle-leaf', { unitPrice: '10' });
      await seed(adapter, [
        { item: root, occurrences: [{ child: phantom }] },
        { item: phantom, defaultPhantom: true, occurrences: [{ child: leaf }] }
      ]);
      const dialect = bomSqlDialectFor(adapter.name);
      await writeBypassingGuards(
        adapter,
        'bom_line_occurrence',
        `UPDATE ${dialect.table('bom_line_occurrence')} SET "childItemId" = '${root.id}', "phantomOverride" = ${backend === 'wa-sqlite' ? '1' : 'TRUE'} WHERE "childItemId" = '${leaf.id}'`
      );
      await expect(rollupCost(adapter, context, { parentItemId: root.id })).rejects.toThrow(/环/);
    });
  });
}
