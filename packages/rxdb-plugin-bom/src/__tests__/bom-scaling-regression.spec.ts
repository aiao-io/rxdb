import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomItem } from '../entities.js';
import { rollupCost } from '../quantity/cost.js';
import { explodeBom } from '../quantity/explosion.js';
import { loadHistory, type HistoryOccurrenceInput } from '../resolve/history-loader.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

const effectiveFrom = new Date('2026-01-01T00:00:00Z');
const context = { bomType: 'ebom' as const, orgId: 'scaling-regression', asOfDate: new Date('2026-06-01T00:00:00Z') };
const costContext = { ...context, currency: 'CNY', rateDate: context.asOfDate };

const makeItem = async (adapter: BomTestAdapter, fields: Partial<BomItem> = {}) => {
  const item = adapter.rxdb.entityManager.instantiate(BomItem, {
    itemNo: crypto.randomUUID(),
    stockUom: 'pcs',
    ...fields
  });
  await item.save();
  return item;
};

const seed = async (
  adapter: BomTestAdapter,
  options: {
    baseQty?: string;
    planned?: string;
    occurrence?: Partial<HistoryOccurrenceInput>;
    output?: 'by_product' | 'produce';
  } = {}
) => {
  const root = await makeItem(adapter);
  const raw = await makeItem(adapter, {
    unitPrice: '2',
    priceCurrency: 'CNY',
    uomDecimals: options.planned?.includes('.') ? 2 : 0
  });
  const output =
    options.output === undefined ? null : await makeItem(adapter, { creditPrice: '0.5', priceCurrency: 'CNY' });
  const items = [root, raw, ...(output === null ? [] : [output])];
  const revisionIds = items.map(() => crypto.randomUUID());
  const planned = options.planned ?? '9';
  await loadHistory(adapter, {
    batchNo: crypto.randomUUID(),
    revisions: items.map((item, index) => ({
      id: revisionIds[index],
      itemId: item.id,
      revisionNo: 'A',
      effectiveFrom
    })),
    headers: [
      {
        revisionIndex: 0,
        bomType: context.bomType,
        orgId: context.orgId,
        baseUom: 'pcs',
        baseQty: options.baseQty ?? '7',
        costLotQty: planned,
        jointCostShare: options.output === 'produce' ? '0.6' : null,
        lines: [
          {
            lineNo: 10,
            occurrences: [
              { childItemId: raw.id, qty: options.baseQty ?? '7', uom: 'pcs', effectiveFrom, ...options.occurrence }
            ]
          },
          ...(output === null ?
            []
          : [
              {
                lineNo: 20,
                occurrences: [
                  {
                    childItemId: output.id,
                    childRevisionId: revisionIds[2],
                    qty: options.baseQty ?? '7',
                    uom: 'pcs',
                    flowDirection: options.output,
                    jointCostShare: options.output === 'produce' ? '0.4' : null,
                    effectiveFrom
                  }
                ]
              }
            ])
        ]
      }
    ]
  });
  return { target: { parentItemId: root.id }, raw, output, plannedQty: { value: planned, uom: 'pcs' } };
};

describe.each(['wa-sqlite', 'pglite'] as const)('比例缩放精度回归 [%s]', backend => {
  let adapter: BomTestAdapter;
  beforeAll(async () => {
    adapter = await createBomTestAdapter(backend);
  });
  afterAll(async () => {
    await disposeBomTestAdapter(adapter);
  });

  it.each([
    { baseQty: '7', planned: '9' },
    { baseQty: '3', planned: '1' },
    { baseQty: '0.07', planned: '0.09' }
  ])('$baseQty × $planned ÷ $baseQty 精确抵消，不因循环比例多进位', async options => {
    const fixture = await seed(adapter, options);
    const result = await explodeBom(adapter, context, fixture.target, { plannedQty: fixture.plannedQty });
    expect(result.requirementLines[0].steps.gross.value).toBe(options.planned);
    expect(result.requirementLines[0].qty).toBe(options.planned);
    expect(result.manifest.algorithmVersion).toBe('3');
  });

  it('公式求值后的7件也按精确比例缩放，成本需求与数量一致', async () => {
    const fixture = await seed(adapter, { occurrence: { qty: null, qtyFormula: '7', formulaGrammarVersion: '1' } });
    const quantity = await explodeBom(adapter, context, fixture.target, { plannedQty: fixture.plannedQty });
    const cost = await rollupCost(adapter, costContext, fixture.target);
    expect(quantity.requirementLines[0].qty).toBe('9');
    expect(cost.root.material[0]).toMatchObject({ demand: '9', amount: '18' });
    expect(cost.root.batchCost).toBe('18');
  });

  it('定量行仍每批7件，不随计划量缩放', async () => {
    const fixture = await seed(adapter, { occurrence: { isFixedQty: true } });
    const quantity = await explodeBom(adapter, context, fixture.target, { plannedQty: fixture.plannedQty });
    const cost = await rollupCost(adapter, costContext, fixture.target);
    expect(quantity.requirementLines[0].qty).toBe('7');
    expect(cost.root.batchCost).toBe('14');
  });

  it('副产量与抵减明细都精确为9件，批成本13.5', async () => {
    const fixture = await seed(adapter, { output: 'by_product' });
    const quantity = await explodeBom(adapter, context, fixture.target, { plannedQty: fixture.plannedQty });
    const cost = await rollupCost(adapter, costContext, fixture.target);
    expect(quantity.outputs[0].qty).toBe('9');
    expect(cost.root.credits[0]).toMatchObject({ outQty: '9', amount: '4.5' });
    expect(cost.root.batchCost).toBe('13.5');
  });

  it('联产7件按计划9件缩放仍精确为9，净成本18按份额分为10.8与7.2', async () => {
    const fixture = await seed(adapter, { output: 'produce' });
    const quantity = await explodeBom(adapter, context, fixture.target, { plannedQty: fixture.plannedQty });
    const cost = await rollupCost(adapter, costContext, fixture.target);
    expect(quantity.outputs[0].qty).toBe('9');
    expect(cost.root.jointCost).toMatchObject({
      netCost: '18',
      outputs: [
        { qty: '9', batchCost: '10.8', unitCost: '1.2' },
        { qty: '9', batchCost: '7.2', unitCost: '0.8' }
      ]
    });
  });
});
