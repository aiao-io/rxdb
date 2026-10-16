import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BomActivityRate,
  BomActivityType,
  BomHeader,
  BomItem,
  BomLine,
  BomLineOccurrence,
  BomRouting,
  BomRoutingOperation,
  BomWorkCenter
} from '../entities.js';
import { rollupCost, type CostRollupContext } from '../quantity/cost.js';
import { explodeBom } from '../quantity/explosion.js';
import { loadHistory } from '../resolve/history-loader.js';
import type { ResolutionContext } from '../resolve/resolution.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];
const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const COVERED_DATES = ['2026-02-01', '2026-11-30'];
const UNCOVERED_DATES = ['2026-01-31', '2026-12-01', '2026-12-02'];

interface LayerFixture {
  parent: BomItem;
  header: BomHeader;
  occurrence: BomLineOccurrence;
  routing: BomRouting | null;
}

const contextAt = (date: string): ResolutionContext => ({
  bomType: 'ebom',
  orgId: 'org-x',
  asOfDate: day(date)
});

const costContextAt = (date: string): CostRollupContext => ({
  ...contextAt(date),
  currency: 'CNY',
  rateDate: day('2026-09-22')
});

const makeItem = async (unitPrice: string | null = null): Promise<BomItem> => {
  const item = new BomItem();
  item.itemNo = `routing-effectivity-${crypto.randomUUID()}`;
  item.stockUom = 'pcs';
  item.uomDecimals = 0;
  item.unitPrice = unitPrice;
  item.priceUom = unitPrice === null ? null : 'pcs';
  item.priceCurrency = unitPrice === null ? null : 'CNY';
  await item.save();
  return item;
};

const attachRouting = async (header: BomHeader): Promise<BomRouting> => {
  const center = new BomWorkCenter();
  center.code = `routing-effectivity-${crypto.randomUUID()}`;
  center.orgId = 'org-x';
  await center.save();
  const activity = new BomActivityType();
  activity.code = 'RUN';
  activity.workCenterId = center.id;
  await activity.save();
  const rate = new BomActivityRate();
  rate.workCenterId = center.id;
  rate.activityTypeId = activity.id;
  rate.validFrom = day('2020-01-01');
  rate.rate = '1';
  rate.currency = 'CNY';
  rate.rateUom = 'h';
  await rate.save();
  const routing = new BomRouting();
  routing.parentRevisionId = header.parentRevisionId;
  routing.bomType = 'ebom';
  routing.orgId = 'org-x';
  routing.validFrom = day('2026-02-01');
  routing.disabledAt = day('2026-12-01');
  await routing.save();
  const operation = new BomRoutingOperation();
  operation.routingId = routing.id;
  operation.operationSeq = 20;
  operation.workCenterId = center.id;
  operation.operationScrap = '0.1';
  operation.scrapConvention = 'additive';
  operation.runTime = '1';
  operation.timeUom = 'h';
  await operation.save();
  header.routingId = routing.id;
  await header.save();
  return routing;
};

const makeLayer = async (
  adapter: BomTestAdapter,
  child: BomItem,
  options: { routed?: boolean; qty?: string } = {}
): Promise<LayerFixture> => {
  const parent = await makeItem();
  await loadHistory(adapter, {
    batchNo: `routing-effectivity-${crypto.randomUUID()}`,
    revisions: [{ itemId: parent.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
    headers: []
  });
  const table = adapter.name === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"';
  const result = (await adapter.rawQuery(`SELECT "id" FROM ${table} WHERE "itemId" = '${parent.id}'`)) as unknown as
    { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
  const rows = 'results' in result ? result.results[0].rows : result.rows;
  const header = new BomHeader();
  header.parentRevisionId = String(rows[0][0]);
  header.bomType = 'ebom';
  header.orgId = 'org-x';
  header.costLotQty = '1';
  await header.save();
  const routing = options.routed ? await attachRouting(header) : null;
  const line = new BomLine();
  line.headerId = header.id;
  line.lineNo = 10;
  await line.save();
  const occurrence = new BomLineOccurrence();
  occurrence.lineId = line.id;
  occurrence.childItemId = child.id;
  occurrence.qty = options.qty ?? '10';
  occurrence.uom = 'pcs';
  occurrence.effectiveFrom = day('2026-01-01');
  occurrence.operationSeq = routing === null ? null : 20;
  await occurrence.save();
  header.state = 'released';
  await header.save();
  return { parent, header, occurrence, routing };
};

const expectUncovered = async (result: Promise<unknown>, fixture: LayerFixture): Promise<void> => {
  const error = await result.then(
    () => null,
    (failure: unknown) => failure
  );
  expect(error).toBeInstanceOf(Error);
  expect(error).toHaveProperty('message', expect.stringContaining('未覆盖'));
  expect(error).toHaveProperty('message', expect.stringContaining(fixture.routing!.id));
  expect(error).toHaveProperty('message', expect.stringContaining(fixture.occurrence.id));
};

for (const backend of BACKENDS) {
  describe(`US-520 AC#11 / US-524 AC#7 路线有效期 [${backend}]`, () => {
    let adapter: BomTestAdapter;
    let routed: LayerFixture;
    let nested: LayerFixture;
    let noRouting: LayerFixture;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
      const child = await makeItem('2');
      routed = await makeLayer(adapter, child, { routed: true });
      nested = await makeLayer(adapter, routed.parent, { qty: '2' });
      noRouting = await makeLayer(adapter, child);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it.each(COVERED_DATES)('%s 位于 [validFrom, disabledAt)，数量与根层、子层成本沿用工序 20', async date => {
      const quantity = await explodeBom(
        adapter,
        contextAt(date),
        { parentRevisionId: routed.header.parentRevisionId },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      expect(quantity.requirementLines).toHaveLength(1);
      expect(quantity.requirementLines[0].qty).toBe('11');
      expect(quantity.requirementLines[0].steps.operationScrapped).toEqual({ value: '11', uom: 'pcs' });
      const cost = await rollupCost(adapter, costContextAt(date), {
        parentRevisionId: routed.header.parentRevisionId
      });
      expect(cost.root.material[0].amount).toBe('22');
      expect(cost.root.processing).toMatchObject([{ operationSeq: 20, amount: '1.1' }]);
      expect(cost.root.batchCost).toBe('23.1');
      const nestedCost = await rollupCost(adapter, costContextAt(date), {
        parentRevisionId: nested.header.parentRevisionId
      });
      expect(nestedCost.root.batchCost).toBe('46.2');
      expect(nestedCost.root.children[0].processing).toMatchObject([{ operationSeq: 20, amount: '2.2' }]);
    });

    it.each(UNCOVERED_DATES)('%s 路线未覆盖，数量展开点名路线与发生项并拒绝整次计算', async date => {
      await expectUncovered(
        explodeBom(
          adapter,
          contextAt(date),
          { parentRevisionId: routed.header.parentRevisionId },
          { plannedQty: { value: '1', uom: 'pcs' } }
        ),
        routed
      );
    });

    it.each(UNCOVERED_DATES)('%s 根路线未覆盖，成本不能继续使用工序或退化成无路线', async date => {
      await expectUncovered(
        rollupCost(adapter, costContextAt(date), { parentRevisionId: routed.header.parentRevisionId }),
        routed
      );
    });

    it.each(UNCOVERED_DATES)('%s 子装配路线未覆盖，递归单位成本同样拒绝', async date => {
      await expectUncovered(
        rollupCost(adapter, costContextAt(date), { parentRevisionId: nested.header.parentRevisionId }),
        routed
      );
    });

    it.each([...COVERED_DATES, ...UNCOVERED_DATES])('%s 未挂路线仍按无工序、无加工成本计算', async date => {
      const quantity = await explodeBom(
        adapter,
        contextAt(date),
        { parentRevisionId: noRouting.header.parentRevisionId },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      expect(quantity.requirementLines[0].qty).toBe('10');
      expect(quantity.requirementLines[0].steps.operationScrapped).toBeNull();
      const cost = await rollupCost(adapter, costContextAt(date), {
        parentRevisionId: noRouting.header.parentRevisionId
      });
      expect(cost.root.batchCost).toBe('20');
      expect(cost.root.processing).toEqual([]);
      expect(cost.root.overheadReason).toBe('无路线');
    });
  });
}
