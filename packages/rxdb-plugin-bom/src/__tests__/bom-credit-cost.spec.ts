import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomItem } from '../entities.js';
import { rollupCost, type CostRollupContext } from '../quantity/cost.js';
import { loadHistory, type HistoryOccurrenceInput } from '../resolve/history-loader.js';
import { BomQuantityError } from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

const effectiveFrom = new Date('2026-01-01T00:00:00Z');
const context: CostRollupContext = {
  bomType: 'ebom',
  orgId: 'credit-cost',
  asOfDate: new Date('2026-06-01T00:00:00Z'),
  currency: 'CNY',
  rateDate: new Date('2026-06-01T00:00:00Z')
};

interface CreditFixtureOptions {
  item?: Partial<BomItem>;
  occurrence?: Partial<HistoryOccurrenceInput>;
  joint?: boolean;
}

const makeItem = async (adapter: BomTestAdapter, values: Partial<BomItem> = {}): Promise<BomItem> => {
  const item = adapter.rxdb.entityManager.instantiate(BomItem, {
    itemNo: crypto.randomUUID(),
    stockUom: 'kg',
    ...values
  });
  await item.save();
  return item;
};

const seedCredit = async (adapter: BomTestAdapter, options: CreditFixtureOptions = {}) => {
  const root = await makeItem(adapter);
  const raw = await makeItem(adapter, { unitPrice: '2', priceUom: 'kg', priceCurrency: 'CNY' });
  const side = await makeItem(adapter, { creditPrice: '0.5', priceCurrency: 'CNY', ...options.item });
  const coproduct = options.joint ? await makeItem(adapter) : null;
  const items = [root, raw, side, ...(coproduct === null ? [] : [coproduct])];
  const revisionIds = new Map(items.map(item => [item.id, crypto.randomUUID()]));
  await loadHistory(adapter, {
    batchNo: crypto.randomUUID(),
    revisions: items.map(item => ({ id: revisionIds.get(item.id), itemId: item.id, revisionNo: 'A', effectiveFrom })),
    headers: [
      {
        revisionIndex: 0,
        bomType: context.bomType,
        orgId: context.orgId,
        baseUom: 'kg',
        baseQty: '100',
        costLotQty: '100',
        jointCostShare: options.joint ? '0.6' : null,
        lines: [
          { lineNo: 10, occurrences: [{ childItemId: raw.id, qty: '110', uom: 'kg', effectiveFrom }] },
          {
            lineNo: 20,
            occurrences: [
              {
                childItemId: side.id,
                qty: '10',
                uom: 'kg',
                flowDirection: 'by_product',
                effectiveFrom,
                ...options.occurrence
              }
            ]
          },
          ...(coproduct === null ?
            []
          : [
              {
                lineNo: 30,
                occurrences: [
                  {
                    childItemId: coproduct.id,
                    childRevisionId: revisionIds.get(coproduct.id),
                    qty: '50',
                    uom: 'kg',
                    flowDirection: 'produce' as const,
                    jointCostShare: '0.4',
                    effectiveFrom
                  }
                ]
              }
            ])
        ]
      }
    ]
  });
  return { target: { parentItemId: root.id }, side };
};

describe.each(['wa-sqlite', 'pglite'] as const)('副产品抵减计价 [%s]', backend => {
  let adapter: BomTestAdapter;
  beforeAll(async () => {
    adapter = await createBomTestAdapter(backend);
  });
  afterAll(async () => {
    await disposeBomTestAdapter(adapter);
  });

  it('10kg 按 500 CNY/t 抵减 5，批成本 215，明细使用计价单位', async () => {
    const { target } = await seedCredit(adapter, { item: { creditPrice: '500', priceUom: 't' } });
    const result = await rollupCost(adapter, context, target);
    expect(result.root).toMatchObject({ batchCost: '215', unitCost: '2.15' });
    expect(result.root.credits).toEqual([
      expect.objectContaining({ outQty: '0.01', outUom: 't', creditPrice: '500', amount: '5' })
    ]);
  });

  it('库存件按盒计价只用物料换算率，不采信未用于第一跳的行级率', async () => {
    const { target } = await seedCredit(adapter, {
      item: { stockUom: 'pcs', priceUom: 'box', uomConversion: '10', creditPrice: '5' },
      occurrence: { uom: 'pcs', uomConversion: '2' }
    });
    const result = await rollupCost(adapter, context, target);
    expect(result.root).toMatchObject({ batchCost: '215', unitCost: '2.15' });
    expect(result.root.credits[0]).toMatchObject({ outQty: '1', outUom: 'box', amount: '5' });
  });

  it('先按行级率把 10m 换成 5kg，再按物料级率换成 1.25box 抵减 6.25', async () => {
    const { target } = await seedCredit(adapter, {
      item: { priceUom: 'box', uomConversion: '4', creditPrice: '5' },
      occurrence: { uom: 'm', uomConversion: '2' }
    });
    const result = await rollupCost(adapter, context, target);
    expect(result.root).toMatchObject({ batchCost: '213.75', unitCost: '2.1375' });
    expect(result.root.credits[0]).toMatchObject({ outQty: '1.25', outUom: 'box', amount: '6.25' });
  });

  it.each([
    { label: '缺少计价单位换算率', occurrence: { uom: 'kg' }, item: {} },
    { label: '物料率已用于行单位到库存单位，不得再次用于计价', occurrence: { uom: 'm' }, item: { uomConversion: '2' } }
  ])('$label', async ({ occurrence, item }) => {
    const { target } = await seedCredit(adapter, { item: { priceUom: 'box', ...item }, occurrence });
    await expect(rollupCost(adapter, context, target)).rejects.toMatchObject({
      name: 'BomCostError',
      cause: expect.any(BomQuantityError),
      message: expect.stringMatching(/kg.*box.*缺换算率/)
    });
  });

  it.each(['0', '0.5'])('CNY 卷算拒绝 USD 抵减价 %s', async creditPrice => {
    const { target, side } = await seedCredit(adapter, { item: { priceCurrency: 'USD', creditPrice } });
    await expect(rollupCost(adapter, context, target)).rejects.toMatchObject({
      name: 'BomCostError',
      subject: expect.stringContaining(side.id),
      message: expect.stringMatching(/USD.*CNY/)
    });
  });

  it('未声明币种和计价单位时保持库存单位计价', async () => {
    const { target } = await seedCredit(adapter, { item: { priceCurrency: null } });
    const result = await rollupCost(adapter, context, target);
    expect(result.root).toMatchObject({ batchCost: '215', unitCost: '2.15' });
    expect(result.root.credits[0]).toMatchObject({ outQty: '10', outUom: 'kg', creditPrice: '0.5', amount: '5' });
  });

  it('有真实投入时允许副产抵减超过材料成本，保留合法负净成本', async () => {
    const { target } = await seedCredit(adapter, { item: { creditPrice: '30' } });
    const result = await rollupCost(adapter, context, target);
    expect(result.root).toMatchObject({ batchCost: '-80', unitCost: '-0.8' });
  });

  it('显式零抵减价保留零金额明细', async () => {
    const { target } = await seedCredit(adapter, { item: { creditPrice: '0' } });
    const result = await rollupCost(adapter, context, target);
    expect(result.root.batchCost).toBe('220');
    expect(result.root.credits[0]).toMatchObject({ outQty: '10', outUom: 'kg', creditPrice: '0', amount: '0' });
  });

  it.each([
    { label: '未声明抵减价的副产品', item: { creditPrice: null }, occurrence: {} },
    { label: '不参与抵减的废料', item: { creditPrice: '500' }, occurrence: { flowDirection: 'scrap_out' as const } }
  ])('$label 不受未消费的价格单位和币种影响', async ({ item, occurrence }) => {
    const { target } = await seedCredit(adapter, {
      item: { priceCurrency: 'USD', priceUom: 'box', ...item },
      occurrence
    });
    const result = await rollupCost(adapter, context, target);
    expect(result.root.batchCost).toBe('220');
    expect(result.root.credits).toEqual([]);
  });

  it('联产先按正确计价单位抵减，再将净成本 215 分配为 129 和 86', async () => {
    const { target } = await seedCredit(adapter, { joint: true, item: { creditPrice: '500', priceUom: 't' } });
    const result = await rollupCost(adapter, context, target);
    expect(result.root).toMatchObject({ batchCost: '129', unitCost: '1.29' });
    expect(result.root.jointCost?.netCost).toBe('215');
    expect(result.root.jointCost?.outputs.map(output => [output.batchCost, output.unitCost])).toEqual([
      ['129', '1.29'],
      ['86', '1.72']
    ]);
    expect(result.root.credits[0]).toMatchObject({ outQty: '0.01', outUom: 't', amount: '5' });
  });
});
