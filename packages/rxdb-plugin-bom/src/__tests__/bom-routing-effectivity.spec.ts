import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BomActivityRate,
  BomActivityType,
  BomHeader,
  BomItem,
  BomLine,
  BomLineOccurrence,
  BomLineOperationSplit,
  BomRouting,
  BomRoutingOperation,
  BomWorkCenter
} from '../entities.js';
import { BomCostError, rollupCost, type CostRollupContext } from '../quantity/cost.js';
import { explodeBom } from '../quantity/explosion.js';
import { loadHistory } from '../resolve/history-loader.js';
import { exportBom } from '../resolve/integration.js';
import type { ResolutionContext } from '../resolve/resolution.js';
import { BomQuantityError } from '../types.js';
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

type RoutingMode = 'single' | 'split';

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

const saveOperation = async (
  routing: BomRouting,
  center: BomWorkCenter,
  operationSeq: number,
  operationScrap: string
): Promise<void> => {
  const operation = new BomRoutingOperation();
  operation.routingId = routing.id;
  operation.operationSeq = operationSeq;
  operation.workCenterId = center.id;
  operation.operationScrap = operationScrap;
  operation.scrapConvention = 'additive';
  operation.runTime = '1';
  operation.timeUom = 'h';
  await operation.save();
};

const attachRouting = async (header: BomHeader, mode: RoutingMode): Promise<BomRouting> => {
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
  await saveOperation(routing, center, 20, '0.1');
  if (mode === 'split') await saveOperation(routing, center, 40, '0');
  header.routingId = routing.id;
  await header.save();
  return routing;
};

const makeLayer = async (
  adapter: BomTestAdapter,
  child: BomItem,
  options: { routing?: RoutingMode; qty?: string } = {}
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
  const routing = options.routing === undefined ? null : await attachRouting(header, options.routing);
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
  occurrence.operationSeq = options.routing === 'single' ? 20 : null;
  await occurrence.save();
  if (options.routing === 'split') await saveSplits(occurrence);
  header.state = 'released';
  await header.save();
  return { parent, header, occurrence, routing };
};

const saveSplits = async (occurrence: BomLineOccurrence): Promise<void> => {
  for (const [operationSeq, ratio] of [
    [20, '0.6'],
    [40, '0.4']
  ] as const) {
    const split = new BomLineOperationSplit();
    split.occurrenceId = occurrence.id;
    split.operationSeq = operationSeq;
    split.ratio = ratio;
    await split.save();
  }
};

/** rawQuery 双形状归一（wa-sqlite 带 results 包装）。 */
const rowsOf = (result: unknown): unknown[][] => {
  const shaped = result as { results?: { rows: unknown[][] }[]; rows?: unknown[][] };
  return Array.isArray(shaped.results) ? shaped.results[0].rows : (shaped.rows ?? []);
};

const headerTable = (adapter: BomTestAdapter): string =>
  adapter.name === 'wa-sqlite' ? '"bom$bom_header"' : '"bom"."bom_header"';

/**
 * 把已发布头的路线摘掉，造出「行声明了投料工序、头未选路线」的不一致状态：存储层守卫正是拒绝这个状态，
 * 这里模拟迁移 / 直连绕过——头表触发器全部暂停后直连改写，再原样恢复（SQLite 无停用开关，删后按原文重建）。
 */
const detachRouting = async (adapter: BomTestAdapter, header: BomHeader): Promise<void> => {
  const update = `UPDATE ${headerTable(adapter)} SET "routingId" = NULL WHERE "id" = '${header.id}'`;
  if (adapter.name !== 'wa-sqlite') {
    await adapter.rawQuery(`ALTER TABLE "bom"."bom_header" DISABLE TRIGGER USER`);
    await adapter.rawQuery(update);
    await adapter.rawQuery(`ALTER TABLE "bom"."bom_header" ENABLE TRIGGER USER`);
    return;
  }
  const triggers = rowsOf(
    await adapter.rawQuery(
      `SELECT "name", "sql" FROM "sqlite_master" WHERE "type" = 'trigger' AND "tbl_name" = 'bom$bom_header' ORDER BY "rowid"`
    )
  );
  for (const [name] of triggers) await adapter.rawQuery(`DROP TRIGGER "${String(name)}"`);
  await adapter.rawQuery(update);
  for (const [, sql] of triggers) await adapter.rawQuery(String(sql));
};

const routingIdOf = async (adapter: BomTestAdapter, header: BomHeader): Promise<unknown> =>
  rowsOf(await adapter.rawQuery(`SELECT "routingId" FROM ${headerTable(adapter)} WHERE "id" = '${header.id}'`))[0][0];

/** 头未选路线而行声明了投料工序：与「路线未覆盖」同一错误类与口径，点名头与发生项，不按空工序链静默少算。 */
const expectRoutingMissing = async (
  result: Promise<unknown>,
  fixture: LayerFixture,
  errorType: typeof BomQuantityError | typeof BomCostError
): Promise<void> => {
  const error = await result.then(
    () => null,
    (failure: unknown) => failure
  );
  expect(error).toBeInstanceOf(errorType);
  expect(error).toHaveProperty('message', expect.stringContaining('路线未覆盖'));
  expect(error).toHaveProperty('message', expect.stringContaining('头未选路线'));
  expect(error).toHaveProperty('message', expect.stringContaining(fixture.header.id));
  expect(error).toHaveProperty('message', expect.stringContaining(fixture.occurrence.id));
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
    let split: LayerFixture;
    let nested: LayerFixture;
    let nestedSplit: LayerFixture;
    let noRouting: LayerFixture;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
      const child = await makeItem('2');
      routed = await makeLayer(adapter, child, { routing: 'single' });
      split = await makeLayer(adapter, child, { routing: 'split', qty: '100' });
      nested = await makeLayer(adapter, routed.parent, { qty: '2' });
      nestedSplit = await makeLayer(adapter, split.parent, { qty: '2' });
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
      const exported = await exportBom(adapter, contextAt(date), {
        parentRevisionId: routed.header.parentRevisionId
      });
      expect(exported.requirementLines).toMatchObject([{ qty: '11', uom: 'pcs' }]);
    });

    it.each(COVERED_DATES)('%s 路线有效，分摊数量、根层及子层成本和导出保留历史结果', async date => {
      const quantity = await explodeBom(
        adapter,
        contextAt(date),
        { parentRevisionId: split.header.parentRevisionId },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      expect(quantity.requirementLines).toMatchObject([
        { qty: '106', steps: { operationScrapped: { value: '106', uom: 'pcs' } } }
      ]);
      const cost = await rollupCost(adapter, costContextAt(date), {
        parentRevisionId: split.header.parentRevisionId
      });
      expect(cost.root.material[0].amount).toBe('212');
      expect(cost.root.processing).toMatchObject([
        { operationSeq: 20, amount: '1.1' },
        { operationSeq: 40, amount: '1' }
      ]);
      expect(cost.root.batchCost).toBe('214.1');
      const nestedCost = await rollupCost(adapter, costContextAt(date), {
        parentRevisionId: nestedSplit.header.parentRevisionId
      });
      expect(nestedCost.root.batchCost).toBe('428.2');
      const exported = await exportBom(adapter, contextAt(date), {
        parentRevisionId: split.header.parentRevisionId
      });
      expect(exported.requirementLines).toMatchObject([{ qty: '106', uom: 'pcs' }]);
      expect(exported.operationSplits).toHaveLength(2);
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

    it.each(UNCOVERED_DATES)('%s 分摊路线未覆盖，数量点名路线与发生项并拒绝整次计算', async date => {
      await expectUncovered(
        explodeBom(
          adapter,
          contextAt(date),
          { parentRevisionId: split.header.parentRevisionId },
          { plannedQty: { value: '1', uom: 'pcs' } }
        ),
        split
      );
    });

    it.each(UNCOVERED_DATES)('%s 分摊路线未覆盖，根层与递归成本均点名路线和发生项', async date => {
      await expectUncovered(
        rollupCost(adapter, costContextAt(date), { parentRevisionId: split.header.parentRevisionId }),
        split
      );
      await expectUncovered(
        rollupCost(adapter, costContextAt(date), { parentRevisionId: nestedSplit.header.parentRevisionId }),
        split
      );
    });

    it.each(UNCOVERED_DATES)('%s 单工序与分摊路线未覆盖，导出点名路线和发生项并拒绝', async date => {
      await expectUncovered(
        exportBom(adapter, contextAt(date), { parentRevisionId: routed.header.parentRevisionId }),
        routed
      );
      await expectUncovered(
        exportBom(adapter, contextAt(date), { parentRevisionId: split.header.parentRevisionId }),
        split
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
      const exported = await exportBom(adapter, contextAt(date), {
        parentRevisionId: noRouting.header.parentRevisionId
      });
      expect(exported.requirementLines).toMatchObject([{ qty: '10', uom: 'pcs' }]);
    });
  });

  describe(`头未选路线而行声明了投料工序（守卫被绕过）[${backend}]`, () => {
    const date = COVERED_DATES[0];
    let adapter: BomTestAdapter;
    let routed: LayerFixture;
    let split: LayerFixture;
    let nested: LayerFixture;
    let nestedSplit: LayerFixture;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
      const child = await makeItem('2');
      routed = await makeLayer(adapter, child, { routing: 'single' });
      split = await makeLayer(adapter, child, { routing: 'split', qty: '100' });
      nested = await makeLayer(adapter, routed.parent, { qty: '2' });
      nestedSplit = await makeLayer(adapter, split.parent, { qty: '2' });
      await detachRouting(adapter, routed.header);
      await detachRouting(adapter, split.header);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it('构造前提：两张已发布头的路线已摘掉，投料工序 / 分摊行仍在', async () => {
      expect(await routingIdOf(adapter, routed.header)).toBeNull();
      expect(await routingIdOf(adapter, split.header)).toBeNull();
      expect(routed.occurrence.operationSeq).toBe(20);
    });

    it('数量展开：投料工序与分摊行都拒绝整次计算（根层与子层），不按无工序损耗少算', async () => {
      for (const [fixture, target] of [
        [routed, routed],
        [split, split],
        [routed, nested],
        [split, nestedSplit]
      ] as const) {
        await expectRoutingMissing(
          explodeBom(
            adapter,
            contextAt(date),
            { parentRevisionId: target.header.parentRevisionId },
            { plannedQty: { value: '1', uom: 'pcs' } }
          ),
          fixture,
          BomQuantityError
        );
      }
    });

    it('导出经数量展开同样拒绝', async () => {
      await expectRoutingMissing(
        exportBom(adapter, contextAt(date), { parentRevisionId: routed.header.parentRevisionId }),
        routed,
        BomQuantityError
      );
    });

    it('成本卷算：根层明细与子装配单位成本都拒绝，不退化成无路线', async () => {
      for (const [fixture, target] of [
        [routed, routed],
        [split, split],
        [routed, nested],
        [split, nestedSplit]
      ] as const) {
        await expectRoutingMissing(
          rollupCost(adapter, costContextAt(date), { parentRevisionId: target.header.parentRevisionId }),
          fixture,
          BomCostError
        );
      }
    });
  });
}
