import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomItem } from '../entities.js';
import { rollupCost } from '../quantity/cost.js';
import { loadHistory, type HistoryHeaderInput } from '../resolve/history-loader.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

const since = new Date('2026-01-01T00:00:00Z');
const context = {
  bomType: 'ebom' as const,
  orgId: 'joint-uom',
  asOfDate: new Date('2026-06-01T00:00:00Z'),
  currency: 'CNY',
  rateDate: new Date('2026-06-01T00:00:00Z')
};

interface FixtureOptions {
  stockUom?: string;
  outputUom?: string;
  outputQty?: string;
  lineRate?: string | null;
  itemRate?: string | null;
  demandQty?: string;
  demandUom?: string;
  demandRate?: string | null;
  wrapper?: boolean;
  zeroShare?: boolean;
}

const makeItem = async (adapter: BomTestAdapter, fields: Partial<BomItem> = {}) => {
  const item = adapter.rxdb.entityManager.instantiate(BomItem, {
    itemNo: crypto.randomUUID(),
    stockUom: 'kg',
    ...fields
  });
  await item.save();
  return item;
};

const seed = async (adapter: BomTestAdapter, options: FixtureOptions = {}) => {
  const primary = await makeItem(adapter);
  const output = await makeItem(adapter, {
    stockUom: options.stockUom ?? 'kg',
    uomConversion: options.itemRate ?? null
  });
  const raw = await makeItem(adapter, { unitPrice: '2', priceCurrency: 'CNY', priceUom: 'kg' });
  const consumer = await makeItem(adapter);
  const wrapper = await makeItem(adapter);
  const items = [primary, output, raw, consumer, wrapper];
  const revisions = items.map(() => crypto.randomUUID());
  const producerId = crypto.randomUUID();
  const headers: HistoryHeaderInput[] = [
    {
      id: producerId,
      revisionIndex: 0,
      bomType: context.bomType,
      orgId: context.orgId,
      baseUom: 'kg',
      baseQty: '100',
      costLotQty: '100',
      jointCostShare: options.zeroShare ? '1' : '0.6',
      lines: [
        { lineNo: 10, occurrences: [{ childItemId: raw.id, qty: '110', uom: 'kg', effectiveFrom: since }] },
        {
          lineNo: 20,
          occurrences: [
            {
              childItemId: output.id,
              childRevisionId: revisions[1],
              qty: options.outputQty ?? '50',
              uom: options.outputUom ?? 'm',
              uomConversion: options.lineRate === undefined ? '2' : options.lineRate,
              flowDirection: 'produce',
              jointCostShare: options.zeroShare ? '0' : '0.4',
              effectiveFrom: since
            }
          ]
        }
      ]
    },
    {
      revisionIndex: 3,
      bomType: context.bomType,
      orgId: context.orgId,
      baseUom: 'kg',
      baseQty: '1',
      costLotQty: '1',
      lines: [
        {
          lineNo: 10,
          occurrences: [
            {
              childItemId: output.id,
              childRevisionId: revisions[1],
              qty: options.demandQty ?? '10',
              uom: options.demandUom ?? options.stockUom ?? 'kg',
              uomConversion: options.demandRate ?? null,
              effectiveFrom: since
            }
          ]
        }
      ]
    }
  ];
  if (options.wrapper)
    headers.push({
      revisionIndex: 4,
      bomType: context.bomType,
      orgId: context.orgId,
      baseUom: 'kg',
      costLotQty: '1',
      lines: [
        {
          lineNo: 10,
          occurrences: [
            { childItemId: consumer.id, childRevisionId: revisions[3], qty: '3', uom: 'kg', effectiveFrom: since }
          ]
        }
      ]
    });
  await loadHistory(adapter, {
    batchNo: crypto.randomUUID(),
    revisions: items.map((item, index) => ({
      id: revisions[index],
      itemId: item.id,
      revisionNo: 'A',
      effectiveFrom: since
    })),
    headers
  });
  return {
    producerTarget: { parentRevisionId: revisions[0] },
    target: { parentRevisionId: revisions[options.wrapper ? 4 : 3] },
    selected: { ...context, jointCostSources: { [revisions[1]]: producerId } },
    producerId,
    outputRevisionId: revisions[1]
  };
};

describe.each(['wa-sqlite', 'pglite'] as const)('联产来源单位换算 [%s]', backend => {
  let adapter: BomTestAdapter;
  beforeAll(async () => {
    adapter = await createBomTestAdapter(backend);
  });
  afterAll(async () => {
    await disposeBomTestAdapter(adapter);
  });

  it.each([
    { label: '产出行率2', options: {}, demand: '20', amount: '35.2' },
    { label: '物料率3', options: { lineRate: null, itemRate: '3' }, demand: '30', amount: '52.8' },
    { label: '产出行率2覆盖物料率3', options: { lineRate: '2', itemRate: '3' }, demand: '20', amount: '35.2' },
    { label: '产出行率7直接反向相乘，不经过1/7舍入', options: { lineRate: '7' }, demand: '70', amount: '123.2' },
    { label: '10000g先转库存kg', options: { demandQty: '10000', demandUom: 'g' }, demand: '20', amount: '35.2' },
    {
      label: '消耗行率5只用于10m转2kg，产出行率2再转4m',
      options: { demandUom: 'm', demandRate: '5' },
      demand: '4',
      amount: '7.04'
    }
  ])('$label', async ({ options, demand, amount }) => {
    const fixture = await seed(adapter, options);
    const producer = await rollupCost(adapter, context, fixture.producerTarget);
    expect(producer.root.jointCost?.outputs[1]).toMatchObject({
      qty: '50',
      uom: 'm',
      batchCost: '88',
      unitCost: '1.76'
    });
    const result = await rollupCost(adapter, fixture.selected, fixture.target);
    expect(result.root).toMatchObject({ batchCost: amount, unitCost: amount });
    expect(result.root.material[0]).toMatchObject({ demand, demandUom: 'm', unitCost: '1.76', amount });
    expect(result.jointManifest?.sources).toEqual([
      expect.objectContaining({
        outputRevisionId: fixture.outputRevisionId,
        producerHeaderId: fixture.producerId,
        qty: '50',
        uom: 'm',
        share: '0.4'
      })
    ]);
  });

  it('产出同量纲g、库存kg时保留原输出计价单位，不采信额外换算率', async () => {
    const fixture = await seed(adapter, { outputUom: 'g', outputQty: '50000', lineRate: '7', itemRate: '3' });
    const result = await rollupCost(adapter, fixture.selected, fixture.target);
    expect(result.root.batchCost).toBe('17.6');
    expect(result.root.material[0]).toMatchObject({
      demand: '10000',
      demandUom: 'g',
      unitCost: '0.00176',
      amount: '17.6'
    });
  });

  it('产出min、库存h仍按时间标准系数换算，不受反向显式率影响', async () => {
    const fixture = await seed(adapter, { stockUom: 'h', outputUom: 'min', lineRate: '7' });
    const result = await rollupCost(adapter, fixture.selected, fixture.target);
    expect(result.root.batchCost).toBe('1056');
    expect(result.root.material[0]).toMatchObject({ demand: '600', demandUom: 'min', amount: '1056' });
  });

  it('跨量纲零份额输出仍有可追溯数量，成本为0', async () => {
    const fixture = await seed(adapter, { zeroShare: true });
    const result = await rollupCost(adapter, fixture.selected, fixture.target);
    expect(result.root).toMatchObject({ batchCost: '0', unitCost: '0' });
    expect(result.root.material[0]).toMatchObject({ demand: '20', demandUom: 'm', unitCost: '0', amount: '0' });
  });

  it('跨量纲联产品在普通子装配中计价时，父层按子装配标准单位成本卷算', async () => {
    const fixture = await seed(adapter, { wrapper: true });
    const result = await rollupCost(adapter, fixture.selected, fixture.target);
    expect(result.root).toMatchObject({ batchCost: '105.6', unitCost: '105.6' });
    expect(result.root.material[0]).toMatchObject({ demand: '3', unitCost: '35.2', amount: '105.6' });
    expect(result.root.children[0].material[0]).toMatchObject({ demand: '60', demandUom: 'm', amount: '105.6' });
  });
});
