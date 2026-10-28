/**
 * @fileoverview 成本卷算回归测试（US-514：数值 oracle 全部手写）
 *
 * 双后端（wa-sqlite / pglite）同断言：材料（本层局部需求 × unit_cost，包装倍数与
 * 行级覆盖换算 AC#12~#14）、副产抵减（AC#17）、固定项不随批量放大（AC#9）、
 * 加工工时基数与 W_op 损耗（AC#15/#16/#18）、时间单位换算与量纲拒绝（AC#19）、
 * 缺成本/缺费率不以 0 兜底（AC#6）、币种不符（AC#10）、环检出（AC#4）、
 * 修订不串（AC#8）、定量行与 setup（AC#9）。
 */

import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BomActivityRate,
  BomActivityType,
  BomHeader,
  BomItem,
  BomItemRevision,
  BomRouting,
  BomRoutingOperation,
  BomWorkCenter
} from '../entities.js';
import { BomCostError, rollupCost, type CostRollupContext } from '../quantity/cost.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomQuantityError } from '../types.js';
import { writeBypassingGuards } from './guard-bypass.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** rawQuery 双形状归一。 */
const shapeRows = (result: unknown): unknown[][] => {
  const shaped = result as { results?: { rows: unknown[][] }[]; rows?: unknown[][] };
  if (Array.isArray(shaped.results)) return shaped.results[0].rows;
  return shaped.rows ?? [];
};

const COST_CTX: CostRollupContext = {
  bomType: 'ebom',
  orgId: 'org-x',
  asOfDate: day('2026-09-22'),
  currency: 'CNY',
  rateDate: day('2026-09-22')
};

for (const backend of BACKENDS) {
  describe(`成本卷算 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    /** 建物料（可选价格/换算）。 */
    const makeItem = async (
      key: string,
      options: {
        stockUom?: string;
        uomConversion?: string | null;
        unitPrice?: string | null;
        priceUom?: string | null;
        creditPrice?: string | null;
      } = {}
    ): Promise<BomItem> => {
      const item = new BomItem();
      item.itemNo = `${key}-${Math.random().toString(36).slice(2, 8)}`;
      item.stockUom = options.stockUom ?? 'pcs';
      item.uomConversion = options.uomConversion ?? null;
      item.unitPrice = options.unitPrice ?? null;
      item.priceUom = options.priceUom ?? null;
      item.priceCurrency = options.unitPrice !== null && options.unitPrice !== undefined ? 'CNY' : null;
      item.creditPrice = options.creditPrice ?? null;
      await item.save();
      return item;
    };

    /** 建修订 + 头（含行发生项；costLotQty 默认 '1'）。 */
    const makeHeader = async (
      parent: BomItem,
      lines: {
        child: BomItem;
        qty: string;
        uom?: string;
        uomConversion?: string | null;
        isFixedQty?: boolean;
        flowDirection?: 'consume' | 'by_product' | 'scrap_out';
      }[],
      options: {
        costLotQty?: string | null;
        baseUom?: string;
        baseQty?: string;
        assemblyScrap?: string;
        assemblyScrapConvention?: 'additive' | 'yield';
      } = {},
      release = true
    ): Promise<{ revision: BomItemRevision; header: BomHeader }> => {
      // 修订经 loadHistory 发布（过去生效日走审计通道，绕过追溯拒绝）
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: parent.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: []
      });
      const rows = (await adapter.rawQuery(
        `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${parent.id}'`
      )) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
      const shape = 'results' in rows ? rows.results[0] : rows;
      const revision = new BomItemRevision();
      (revision as unknown as { id: string }).id = String(shape.rows[0][0]);
      const header = new BomHeader();
      header.parentRevisionId = revision.id;
      header.bomType = 'ebom';
      header.orgId = 'org-x';
      header.baseUom = options.baseUom ?? 'pcs';
      header.baseQty = options.baseQty ?? '1';
      header.assemblyScrap = options.assemblyScrap ?? '0';
      header.assemblyScrapConvention = options.assemblyScrapConvention ?? 'additive';
      header.costLotQty = options.costLotQty ?? '1';
      await header.save();
      let lineNo = 10;
      for (const line of lines) {
        const { BomLine, BomLineOccurrence } = await import('../entities.js');
        const bomLine = new BomLine();
        bomLine.headerId = header.id;
        bomLine.lineNo = lineNo;
        await bomLine.save();
        const occurrence = new BomLineOccurrence();
        occurrence.lineId = bomLine.id;
        occurrence.childItemId = line.child.id;
        occurrence.qty = line.qty;
        occurrence.uom = line.uom ?? 'pcs';
        occurrence.uomConversion = line.uomConversion ?? null;
        occurrence.isFixedQty = line.isFixedQty ?? false;
        occurrence.flowDirection = line.flowDirection ?? 'consume';
        occurrence.effectiveFrom = day('2026-01-01');
        await occurrence.save();
        lineNo += 10;
      }
      if (release) {
        header.state = 'released';
        await header.save();
      }
      return { revision, header };
    };

    /** 发布头（attachRouting 需在发布前挂路由——已发布头字段不可改）。 */
    const releaseHeader = async (header: BomHeader): Promise<void> => {
      header.state = 'released';
      await header.save();
    };

    /** 建工作中心 + 作业类型 + 费率（默认 1/h）。 */
    const makeCenter = async (
      options: { rate?: string; rateUom?: string; overheadRate?: string | null; timeUom?: string } = {}
    ): Promise<BomWorkCenter> => {
      const center = new BomWorkCenter();
      center.code = `WC-${Math.random().toString(36).slice(2, 6)}`;
      center.orgId = 'org-x';
      center.overheadRate = options.overheadRate ?? null;
      center.overheadCurrency = options.overheadRate !== undefined && options.overheadRate !== null ? 'CNY' : null;
      await center.save();
      const type = new BomActivityType();
      type.code = 'RUN';
      type.workCenterId = center.id;
      await type.save();
      const rate = new BomActivityRate();
      rate.workCenterId = center.id;
      rate.activityTypeId = type.id;
      rate.validFrom = day('2026-01-01');
      rate.rate = options.rate ?? '1';
      rate.currency = 'CNY';
      rate.rateUom = options.rateUom ?? options.timeUom ?? 'h';
      await rate.save();
      return center;
    };

    /** 给头挂路线（工序 10 无损耗）。 */
    const attachRouting = async (
      header: BomHeader,
      center: BomWorkCenter,
      operations: {
        seq: number;
        setup?: string;
        run?: string;
        fixed?: string;
        timeUom?: string;
        scrap?: string;
        convention?: 'additive' | 'yield';
      }[]
    ): Promise<void> => {
      const routing = new BomRouting();
      routing.parentRevisionId = header.parentRevisionId;
      routing.bomType = 'ebom';
      routing.orgId = 'org-x';
      routing.validFrom = day('2020-01-01');
      await routing.save();
      for (const op of operations) {
        const operation = new BomRoutingOperation();
        operation.routingId = routing.id;
        operation.operationSeq = op.seq;
        operation.workCenterId = center.id;
        operation.setupTime = op.setup ?? '0';
        operation.runTime = op.run ?? '0';
        operation.fixedTime = op.fixed ?? '0';
        operation.timeUom = op.timeUom ?? 'h';
        operation.operationScrap = op.scrap ?? '0';
        operation.scrapConvention = op.convention ?? 'additive';
        await operation.save();
      }
      header.routingId = routing.id;
      await header.save();
    };

    it.each([false, true])('混合工作中心的制费理由不随工序顺序改变：%s', reverse => runMixedCenters(reverse));

    const runMixedCenters = async (reverse: boolean): Promise<void> => {
      const raw = await makeItem('mixed-overhead-raw', { unitPrice: '1' });
      const root = await makeItem('mixed-overhead-root');
      const { header } = await makeHeader(root, [{ child: raw, qty: '1' }], {}, false);
      const withOverhead = await makeCenter({ overheadRate: '2.5' });
      const withoutOverhead = await makeCenter();
      await attachRouting(header, withOverhead, [
        { seq: 10, run: '1' },
        { seq: 20, run: '1' }
      ]);
      const operations = await firstValueFrom(
        adapter.rxdb.entityManager.getRepository(BomRoutingOperation).find({
          where: { combinator: 'and', rules: [{ field: 'routingId', operator: '=', value: header.routingId! }] }
        })
      );
      const changed = operations.find(op => op.operationSeq === (reverse ? 10 : 20))!;
      changed.workCenterId = withoutOverhead.id;
      await changed.save();
      await releaseHeader(header);
      const result = await rollupCost(adapter, COST_CTX, { parentItemId: root.id });
      expect(result.root.overhead).toBe('2.5');
      expect(result.root.overheadReason).toBe('按工时计');
    };

    it('AC#7 A 用 2B、B 用 3C、C 单价 1：A 材料恰为 6（不是双计数 12）', async () => {
      const c = await makeItem('c7', { unitPrice: '1' });
      const b = await makeItem('b7');
      const a = await makeItem('a7');
      await makeHeader(b, [{ child: c, qty: '3' }]);
      const { header: headerA } = await makeHeader(a, [{ child: b, qty: '2' }]);
      await releaseHeader(headerA);
      const result = await rollupCost(adapter, COST_CTX, { parentRevisionId: headerA.parentRevisionId });
      expect(result.root.material[0].amount).toBe('6');
      expect(result.root.batchCost).toBe('6');
      expect(result.root.unitCost).toBe('6');
    });

    it('AC#12 包装倍数：C 库存件、头盒（1盒=10件）、批成本 20；A 用 2 件 → 材料 0.2盒×20 = 4', async () => {
      const c = await makeItem('c12', { stockUom: 'pcs', uomConversion: '10' });
      const b = await makeItem('b12');
      const a = await makeItem('a12');
      // C 头：base_uom 盒、cost_lot_qty 1 盒、批成本 20 → unit_cost = 20 / 盒
      await makeHeader(b, [{ child: c, qty: '2', uom: 'pcs' }], { baseUom: 'box', costLotQty: '1' });
      // 批成本 20 / 盒：用装配损耗造不出来——直接用子件链：B 头（盒）材料 1 件 C？简化：
      // B 的批成本 = 材料（B 用 2 件 C，C 外购 10/件）= 20
      // 改 C 单价为 10：
      const cItem = new BomItem();
      cItem.itemNo = `c12b-${Math.random().toString(36).slice(2, 8)}`;
      cItem.stockUom = 'pcs';
      cItem.uomConversion = '10';
      cItem.unitPrice = '10';
      cItem.priceUom = 'pcs';
      cItem.priceCurrency = 'CNY';
      await cItem.save();
      const b2 = await makeItem('b12x', { uomConversion: '10' });
      await makeHeader(b2, [{ child: cItem, qty: '2', uom: 'pcs' }], { baseUom: 'box', costLotQty: '1' });
      const { header: headerA } = await makeHeader(a, [{ child: b2, qty: '2', uom: 'pcs' }]);
      await releaseHeader(headerA);
      const result = await rollupCost(adapter, COST_CTX, { parentRevisionId: headerA.parentRevisionId });
      // B unit_cost = 20 / 盒；A 用 2 件 = 0.2 盒 → 4
      expect(result.root.material[0].demand).toBe('0.2');
      expect(result.root.material[0].demandUom).toBe('box');
      expect(result.root.material[0].amount).toBe('4');
    });

    it('AC#13 g→kg：子件头基准 kg、unit 30/kg；父件用 500g → 材料 0.5kg×30 = 15', async () => {
      const a = await makeItem('a13');
      const b = await makeItem('b13', { stockUom: 'g' });
      // B 头：base kg、lot 1kg、材料 1500g 单价 0.02/g = 30 → unit 30/kg
      const c2 = await makeItem('c13x', { stockUom: 'g', unitPrice: '0.02', priceUom: 'g' });
      await makeHeader(b, [{ child: c2, qty: '1500', uom: 'g' }], { baseUom: 'kg', costLotQty: '1' });
      const { header: headerA } = await makeHeader(a, [{ child: b, qty: '500', uom: 'g' }]);
      await releaseHeader(headerA);
      const result = await rollupCost(adapter, COST_CTX, { parentRevisionId: headerA.parentRevisionId });
      expect(result.root.material[0].demand).toBe('0.5');
      expect(result.root.material[0].demandUom).toBe('kg');
      expect(result.root.material[0].amount).toBe('15');
    });

    it('二次换算：子头基准只用物料级率（行级率已服务行 → 库存），10 m → 5 kg → 10 件', async () => {
      const leaf = await makeItem('hop-c', { unitPrice: '1' });
      const sub = await makeItem('hop-b', { stockUom: 'kg', uomConversion: '0.5' });
      const root = await makeItem('hop-a');
      await makeHeader(sub, [{ child: leaf, qty: '1' }], { baseUom: 'pcs', costLotQty: '1' });
      const { header } = await makeHeader(root, [{ child: sub, qty: '10', uom: 'm', uomConversion: '2' }]);
      const result = await rollupCost(adapter, COST_CTX, { parentRevisionId: header.parentRevisionId });
      expect(result.root.material[0]).toMatchObject({ demand: '10', demandUom: 'pcs', amount: '10' });
      expect(result.root.children[0].batchQty).toBe('10');
    });

    it('二次换算：物料级率已被行 → 库存消耗时，计价单位换算缺率即拒绝（不复用同一个率）', async () => {
      const leaf = await makeItem('hop-p', { stockUom: 'kg', uomConversion: '2', unitPrice: '1', priceUom: 'pcs' });
      const root = await makeItem('hop-q');
      const { header } = await makeHeader(root, [{ child: leaf, qty: '10', uom: 'm' }]);
      await expect(rollupCost(adapter, COST_CTX, { parentRevisionId: header.parentRevisionId })).rejects.toThrow(
        /从 kg 换算到 pcs 缺换算率/
      );
    });

    it('卷算拒绝统一为 BomCostError：数量违约（缺换算率）经 cause 保留 BomQuantityError', async () => {
      const leaf = await makeItem('wrap-c', { stockUom: 'kg', unitPrice: '1', priceUom: 'kg' });
      const root = await makeItem('wrap-a');
      const { header } = await makeHeader(root, [{ child: leaf, qty: '2', uom: 'm' }]);
      const error = await rollupCost(adapter, COST_CTX, { parentRevisionId: header.parentRevisionId }).then(
        () => null,
        (cause: unknown) => cause
      );
      expect(error).toBeInstanceOf(BomCostError);
      expect((error as Error).cause).toBeInstanceOf(BomQuantityError);
      expect(String((error as Error).message)).toContain('缺换算率');
    });

    it('卷算拒绝统一为 BomCostError：换算率为 0 写入期拒绝；守卫上线前写入的存量 0 经 cause 保留 BomQuantityError（不以裸除零错误透出）', async () => {
      await expect(makeItem('zero-rate-new', { stockUom: 'kg', uomConversion: '0' })).rejects.toThrow(
        /uomConversion 换算率必须大于 0/
      );
      const leaf = await makeItem('zero-rate-c', {
        stockUom: 'kg',
        uomConversion: '2',
        unitPrice: '1',
        priceUom: 'kg'
      });
      const root = await makeItem('zero-rate-a');
      const { header } = await makeHeader(root, [{ child: leaf, qty: '2', uom: 'm' }]);
      await writeBypassingGuards(
        adapter,
        'item',
        `UPDATE ${backend === 'wa-sqlite' ? '"bom$item"' : '"bom"."item"'} SET "uomConversion" = '0' WHERE "id" = '${leaf.id}'`
      );
      const error = await rollupCost(adapter, COST_CTX, { parentRevisionId: header.parentRevisionId }).then(
        () => null,
        (cause: unknown) => cause
      );
      expect(error).toBeInstanceOf(BomCostError);
      expect((error as Error).cause).toBeInstanceOf(BomQuantityError);
      expect(String((error as Error).message)).toContain('从 m 换算到 kg 的物料级换算率为 0');
    });

    it('卷算拒绝统一为 BomCostError：阶梯组无命中点名头与组号（不以裸 Error 透出）', async () => {
      const part = await makeItem('tier-c', { unitPrice: '1' });
      const root = await makeItem('tier-a');
      const headerId = crypto.randomUUID();
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: root.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: [
          {
            id: headerId,
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: 'org-x',
            costLotQty: '150',
            lines: [
              {
                lineNo: 10,
                occurrences: [
                  {
                    childItemId: part.id,
                    qty: '1',
                    tierGroupNo: 'g9',
                    lotsizeFrom: '0',
                    lotsizeTo: '100',
                    effectiveFrom: day('2026-01-01')
                  }
                ]
              }
            ]
          }
        ]
      });
      const error = await rollupCost(adapter, COST_CTX, { parentItemId: root.id }).then(
        () => null,
        (cause: unknown) => cause
      );
      expect(error).toBeInstanceOf(BomCostError);
      expect(String((error as Error).message)).toContain(headerId);
      expect(String((error as Error).message)).toContain('g9');
    });

    it('根头缺 cost_lot_qty：显式 batchQty 也替代不了（它是 unit_cost 的分母），卷算拒绝', async () => {
      const part = await makeItem('lot-c', { unitPrice: '1' });
      const root = await makeItem('lot-a');
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: root.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: [
          {
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: 'org-x',
            lines: [{ lineNo: 10, occurrences: [{ childItemId: part.id, qty: '1', effectiveFrom: day('2026-01-01') }] }]
          }
        ]
      });
      for (const batchQty of [undefined, { value: '5', uom: 'pcs' }]) {
        const error = await rollupCost(adapter, COST_CTX, { parentItemId: root.id }, batchQty).then(
          () => null,
          (cause: unknown) => cause
        );
        expect(error).toBeInstanceOf(BomCostError);
        expect(String((error as Error).message)).toContain('cost_lot_qty');
      }
    });

    it('cost_lot_qty 为 0：写入期拒绝；守卫上线前写入的存量 0 是 unit_cost 的分母，根头与子装配都拒绝为 BomCostError，不以裸除零错误透出', async () => {
      const leaf = await makeItem('zero-lot-c', { unitPrice: '1' });
      await expect(
        makeHeader(await makeItem('zero-lot-new'), [{ child: leaf, qty: '1' }], { costLotQty: '0' })
      ).rejects.toThrow(/costLotQty 标准成本批量必须大于 0/);
      const sub = await makeItem('zero-lot-b');
      const root = await makeItem('zero-lot-a');
      const { header: subHeader } = await makeHeader(sub, [{ child: leaf, qty: '1' }]);
      const { header: rootHeader } = await makeHeader(root, [{ child: sub, qty: '1' }]);
      await writeBypassingGuards(
        adapter,
        'bom_header',
        `UPDATE ${backend === 'wa-sqlite' ? '"bom$bom_header"' : '"bom"."bom_header"'} SET "costLotQty" = '0' WHERE "id" = '${subHeader.id}'`
      );
      for (const header of [subHeader, rootHeader]) {
        const error = await rollupCost(adapter, COST_CTX, { parentRevisionId: header.parentRevisionId }).then(
          () => null,
          (cause: unknown) => cause
        );
        expect(error).toBeInstanceOf(BomCostError);
        expect(String((error as Error).message)).toContain(`头 ${subHeader.id} 的 cost_lot_qty`);
        expect(String((error as Error).message)).toContain('为 0');
      }
    });

    it('副产公式行（qty 为空、只有 qty_formula）按语法版本求值后抵减，不以 0 兜底', async () => {
      const r = await makeItem('bpf-r', { unitPrice: '1' });
      const s = await makeItem('bpf-s', { creditPrice: '0.5' });
      const m = await makeItem('bpf-m');
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: m.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: [
          {
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: 'org-x',
            costLotQty: '1',
            lines: [
              { lineNo: 10, occurrences: [{ childItemId: r.id, qty: '10', effectiveFrom: day('2026-01-01') }] },
              {
                lineNo: 20,
                occurrences: [
                  {
                    childItemId: s.id,
                    qty: null,
                    qtyFormula: '长*宽',
                    formulaGrammarVersion: '1',
                    flowDirection: 'by_product',
                    effectiveFrom: day('2026-01-01')
                  }
                ]
              }
            ]
          }
        ]
      });
      const result = await rollupCost(
        adapter,
        { ...COST_CTX, formulaParams: { 长: '3', 宽: '4' } },
        { parentItemId: m.id }
      );
      // 材料 10×1 = 10；副产 3×4 = 12 件 × 0.5 = 6 → 批成本 4
      expect(result.root.credits.map(credit => [credit.childItemId, credit.outQty, credit.amount])).toEqual([
        [s.id, '12', '6']
      ]);
      expect(result.root.batchCost).toBe('4');
    });

    it('AC#17 副产抵减：M 批 100kg（R 110×2 + S 10×0.5）→ 215、unit 2.15/kg', async () => {
      const r = await makeItem('r17', { stockUom: 'kg', unitPrice: '2', priceUom: 'kg' });
      const s = await makeItem('s17', { stockUom: 'kg', creditPrice: '0.5' });
      const m = await makeItem('m17', { stockUom: 'kg' });
      const { header: headerM } = await makeHeader(
        m,
        [
          { child: r, qty: '110', uom: 'kg' },
          { child: s, qty: '10', uom: 'kg', flowDirection: 'by_product' }
        ],
        { baseUom: 'kg', baseQty: '100', costLotQty: '100' }
      );
      await releaseHeader(headerM);
      const result = await rollupCost(adapter, COST_CTX, { parentRevisionId: headerM.parentRevisionId });
      expect(result.root.batchCost).toBe('215');
      expect(result.root.unitCost).toBe('2.15');
      expect(result.root.credits[0].amount).toBe('5');
    });

    it('AC#9 定量行与 setup：batch(root, 10) 的固定项不随批量放大', async () => {
      const c = await makeItem('c9', { unitPrice: '1' });
      const a = await makeItem('a9');
      const { header: headerA } = await makeHeader(a, [{ child: c, qty: '1' }], {}, false);
      const center = await makeCenter();
      await attachRouting(headerA, center, [{ seq: 10, setup: '2', run: '1' }]);
      await releaseHeader(headerA);
      const at = async (batch: string): Promise<string> => {
        const result = await rollupCost(
          adapter,
          COST_CTX,
          { parentRevisionId: headerA.parentRevisionId },
          { value: batch, uom: 'pcs' }
        );
        return result.root.batchCost;
      };
      // L=1：材料 1 + 加工（2 + 1×1）= 4；L=10：材料 10 + 加工（2 + 1×10）= 22
      expect(await at('1')).toBe('4');
      expect(await at('10')).toBe('22');
      // unit_cost 恒按 cost_lot_qty = 1：4
      const byLot = await rollupCost(adapter, COST_CTX, { parentRevisionId: headerA.parentRevisionId });
      expect(byLot.root.unitCost).toBe('4');
    });

    it('AC#15 装配损耗下的加工量：加成制 run×110 + setup 2 = 112', async () => {
      const c = await makeItem('c15', { unitPrice: '0' });
      const a = await makeItem('a15');
      const { header: headerA } = await makeHeader(a, [{ child: c, qty: '1' }], { assemblyScrap: '0.1' }, false);
      const center = await makeCenter();
      await attachRouting(headerA, center, [{ seq: 10, setup: '2', run: '1' }]);
      await releaseHeader(headerA);
      const result = await rollupCost(
        adapter,
        COST_CTX,
        { parentRevisionId: headerA.parentRevisionId },
        { value: '100', uom: 'pcs' }
      );
      // 材料 110×0 = 0；加工 112 × 1 = 112
      expect(result.root.processing[0].hours).toBe('112');
      expect(result.root.batchCost).toBe('112');
    });

    it('AC#18 三种工时各自基数：setup 与 fixed 一批一次、run 随 L', async () => {
      const c = await makeItem('c18', { unitPrice: '0' });
      const a = await makeItem('a18');
      const { header: headerA } = await makeHeader(a, [{ child: c, qty: '1' }], {}, false);
      const center = await makeCenter();
      await attachRouting(headerA, center, [{ seq: 10, setup: '2', run: '1', fixed: '3' }]);
      await releaseHeader(headerA);
      const at = async (batch: string): Promise<string> => {
        const result = await rollupCost(
          adapter,
          COST_CTX,
          { parentRevisionId: headerA.parentRevisionId },
          { value: batch, uom: 'pcs' }
        );
        return result.root.processing[0].hours;
      };
      expect(await at('1')).toBe('6');
      expect(await at('10')).toBe('15');
    });

    it('AC#19 时间单位换算：min 工时 × h 费率 = 360；量纲不兼容拒绝', async () => {
      const c = await makeItem('c19', { unitPrice: '0' });
      const a = await makeItem('a19');
      const { header: headerA } = await makeHeader(a, [{ child: c, qty: '1' }], {}, false);
      const center = await makeCenter({ rate: '60', rateUom: 'h' });
      await attachRouting(headerA, center, [{ seq: 10, setup: '60', run: '30', timeUom: 'min' }]);
      await releaseHeader(headerA);
      const result = await rollupCost(
        adapter,
        COST_CTX,
        { parentRevisionId: headerA.parentRevisionId },
        { value: '10', uom: 'pcs' }
      );
      // (60 + 30×10) min = 360 min = 6 h；6 × 60 = 360
      expect(result.root.processing[0].rateHours).toBe('6');
      expect(result.root.processing[0].amount).toBe('360');
      expect(result.root.batchCost).toBe('360');
      // 量纲不兼容：费率计费单位「件」
      const a2 = await makeItem('a19b');
      const c2 = await makeItem('c19b', { unitPrice: '0' });
      const { header: headerA2 } = await makeHeader(a2, [{ child: c2, qty: '1' }], {}, false);
      const center2 = await makeCenter({ rate: '60', rateUom: 'pcs' });
      await attachRouting(headerA2, center2, [{ seq: 10, setup: '60', timeUom: 'min' }]);
      await releaseHeader(headerA2);
      await expect(rollupCost(adapter, COST_CTX, { parentRevisionId: headerA2.parentRevisionId })).rejects.toThrow(
        /量纲不兼容/
      );
    });

    it('AC#6 缺成本：外购叶子无价格报缺失，不以 0 兜底', async () => {
      const c = await makeItem('c6'); // 无 unitPrice
      const a = await makeItem('a6');
      const { header: headerA } = await makeHeader(a, [{ child: c, qty: '1' }]);
      await releaseHeader(headerA);
      await expect(rollupCost(adapter, COST_CTX, { parentRevisionId: headerA.parentRevisionId })).rejects.toThrow(
        /缺成本|BomCostError/
      );
      await expect(
        rollupCost(adapter, COST_CTX, { parentRevisionId: headerA.parentRevisionId })
      ).rejects.toBeInstanceOf(BomCostError);
    });

    it('AC#10 费率币种与上下文币种不同：拒绝并点名', async () => {
      const c = await makeItem('c10', { unitPrice: '0' });
      const a = await makeItem('a10');
      const { header: headerA } = await makeHeader(a, [{ child: c, qty: '1' }], {}, false);
      const center = await makeCenter();
      // 改费率币种为 USD
      const { BomActivityRate } = await import('../entities.js');
      const rates = await firstValueFrom(
        BomActivityRate.find({
          where: { combinator: 'and', rules: [{ field: 'workCenterId', operator: '=', value: center.id }] }
        })
      );
      for (const rate of rates) {
        rate.currency = 'USD';
        await rate.save();
      }
      await attachRouting(headerA, center, [{ seq: 10, run: '1' }]);
      await releaseHeader(headerA);
      await expect(rollupCost(adapter, COST_CTX, { parentRevisionId: headerA.parentRevisionId })).rejects.toThrow(
        /币种/
      );
    });

    it('AC#4 环检出：写入期约束被绕过时卷算报错不死循环', async () => {
      // 写入期判环本应拦住 B→A：先卸掉判环触发器，再在 draft 头下构造人为环
      if (backend === 'wa-sqlite') {
        await adapter.rawQuery(`DROP TRIGGER "bom_line_occurrence_cycle_i"`);
        await adapter.rawQuery(`DROP TRIGGER "bom_line_occurrence_cycle_u"`);
      } else {
        await adapter.rawQuery(`DROP TRIGGER "bom_line_occurrence__cycle_trg" ON "bom"."bom_line_occurrence"`);
      }
      const a = await makeItem('c4a', { unitPrice: '1' });
      const b = await makeItem('c4b', { unitPrice: '1' });
      const { header: headerA } = await makeHeader(a, [{ child: b, qty: '1' }], {}, false);
      const { header: headerB } = await makeHeader(b, [{ child: a, qty: '1' }], {}, false);
      const { BomLine, BomLineOccurrence } = await import('../entities.js');
      const line = new BomLine();
      line.headerId = headerB.id;
      line.lineNo = 20;
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = a.id;
      occurrence.qty = '1';
      occurrence.uom = 'pcs';
      occurrence.effectiveFrom = day('2026-01-01');
      await occurrence.save();
      await releaseHeader(headerA);
      await releaseHeader(headerB);
      // A→B 与 B→A 成环：卷算报错不死循环
      await expect(rollupCost(adapter, COST_CTX, { parentRevisionId: headerA.parentRevisionId })).rejects.toThrow(/环/);
    });
  });
}

describe('成本卷算扩展（AC#2/#8/#11/#16）', () => {
  for (const backend of BACKENDS) {
    describe(`[${backend}]`, () => {
      let adapter: BomTestAdapter;
      beforeAll(async () => {
        adapter = await createBomTestAdapter(backend);
      });
      afterAll(async () => {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      });

      const makeItem = async (key: string, options: { unitPrice?: string | null } = {}): Promise<BomItem> => {
        const item = new BomItem();
        item.itemNo = `${key}-${Math.random().toString(36).slice(2, 8)}`;
        item.unitPrice = options.unitPrice ?? null;
        item.priceUom = options.unitPrice !== undefined && options.unitPrice !== null ? 'pcs' : null;
        item.priceCurrency = options.unitPrice !== undefined && options.unitPrice !== null ? 'CNY' : null;
        await item.save();
        return item;
      };

      it('AC#2 proportional 替代组：按 usage_probability × equiv_qty 加权', async () => {
        const { BomSubstituteGroup } = await import('../entities.js');
        const primary = await makeItem('s2p', { unitPrice: '10' });
        const alt = await makeItem('s2a', { unitPrice: '20' });
        const a = await makeItem('s2root');
        // 组：primary 0.5（equiv 1）、substitute 0.5（equiv 2）
        const { header: draftHeader } = await (async () => {
          const rows = (await adapter.rawQuery(
            `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${a.id}'`
          )) as unknown as { results: { rows: unknown[][] }[] };
          void rows;
          // 建头 + 组（在发布前）
          await loadHistory(adapter, {
            batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
            revisions: [{ itemId: a.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
            headers: []
          });
          const header = new BomHeader();
          header.parentRevisionId = String(
            shapeRows(
              await adapter.rawQuery(
                `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${a.id}'`
              )
            )[0][0]
          );
          header.bomType = 'ebom';
          header.orgId = 'org-x';
          header.costLotQty = '1';
          await header.save();
          const group = new BomSubstituteGroup();
          group.headerId = header.id;
          group.code = `G-${Math.random().toString(36).slice(2, 6)}`;
          group.strategy = 'proportional';
          group.allowMix = true;
          await group.save();
          let lineNo = 10;
          for (const [child, role, probability, equivQty] of [
            [primary, 'primary', '0.5', '1'],
            [alt, 'substitute', '0.5', '2']
          ] as const) {
            const { BomLine, BomLineOccurrence } = await import('../entities.js');
            const bomLine = new BomLine();
            bomLine.headerId = header.id;
            bomLine.lineNo = lineNo;
            await bomLine.save();
            const occ = new BomLineOccurrence();
            occ.lineId = bomLine.id;
            occ.childItemId = child.id;
            occ.qty = '100';
            occ.uom = 'pcs';
            occ.effectiveFrom = day('2026-01-01');
            occ.substituteGroupId = group.id;
            occ.substituteRole = role;
            occ.usageProbability = probability;
            occ.equivQty = equivQty;
            await occ.save();
            lineNo += 10;
          }
          header.state = 'released';
          await header.save();
          return { header };
        })();
        // primary 需求 100：primary 承担 50 × 10 价 = 500；substitute 50 × equiv 2 = 100 件 × 20 = 2000 → 2500
        const result = await rollupCost(adapter, COST_CTX, { parentRevisionId: draftHeader.parentRevisionId });
        expect(result.root.batchCost).toBe('2500');
      });

      it('AC#8 precise/imprecise 两版不串：D、E 两个节点各算各的', async () => {
        // X 的 D 版（2026-01-01 生效）每件用 2 L、E 版（2026-06-01 生效）每件用 5 L，L 单价 1：
        // unit_cost(D) = 2、unit_cost(E) = 5。A 的 precise 行锁 D，imprecise 行按评估日 2026-09-22 解析到 E
        const leaf = await makeItem('x8-leaf', { unitPrice: '1' });
        const x = await makeItem('x8');
        const a = await makeItem('a8');
        const ids = {
          revisionD: crypto.randomUUID(),
          revisionE: crypto.randomUUID(),
          headerD: crypto.randomUUID(),
          headerE: crypto.randomUUID(),
          precise: crypto.randomUUID(),
          imprecise: crypto.randomUUID()
        };
        const leafLines = (qty: string) => [
          { lineNo: 10, occurrences: [{ childItemId: leaf.id, qty, effectiveFrom: day('2026-01-01') }] }
        ];
        await loadHistory(adapter, {
          batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
          revisions: [
            { id: ids.revisionD, itemId: x.id, revisionNo: 'D', effectiveFrom: day('2026-01-01') },
            { id: ids.revisionE, itemId: x.id, revisionNo: 'E', effectiveFrom: day('2026-06-01') },
            { itemId: a.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }
          ],
          headers: [
            {
              id: ids.headerD,
              revisionIndex: 0,
              bomType: 'ebom',
              orgId: 'org-x',
              costLotQty: '1',
              lines: leafLines('2')
            },
            {
              id: ids.headerE,
              revisionIndex: 1,
              bomType: 'ebom',
              orgId: 'org-x',
              costLotQty: '1',
              lines: leafLines('5')
            },
            {
              revisionIndex: 2,
              bomType: 'ebom',
              orgId: 'org-x',
              costLotQty: '1',
              lines: [
                {
                  lineNo: 10,
                  occurrences: [
                    {
                      id: ids.precise,
                      childItemId: x.id,
                      childRevisionId: ids.revisionD,
                      qty: '1',
                      effectiveFrom: day('2026-01-01')
                    }
                  ]
                },
                {
                  lineNo: 20,
                  occurrences: [{ id: ids.imprecise, childItemId: x.id, qty: '1', effectiveFrom: day('2026-01-01') }]
                }
              ]
            }
          ]
        });
        const result = await rollupCost(adapter, COST_CTX, { parentItemId: a.id });
        // 节点是已解析头：同一物料 X 的两个修订各自成节点、各取各的 unit_cost，缓存不按物料串用
        expect(
          result.root.material.map(line => [line.occurrenceId, line.childItemId, line.unitCost, line.amount])
        ).toEqual([
          [ids.precise, x.id, '2', '2'],
          [ids.imprecise, x.id, '5', '5']
        ]);
        expect(result.root.children.map(child => [child.headerId, child.itemId, child.unitCost])).toEqual([
          [ids.headerD, x.id, '2'],
          [ids.headerE, x.id, '5']
        ]);
        expect(result.root.batchCost).toBe('7');
      });

      it('AC#16 工序 10/20/30 各 run 1h、20 损耗 3%：加工量 103/103/100 → 306', async () => {
        const c = await makeItem('c16', { unitPrice: '0' });
        const a = await makeItem('a16');
        const center = new BomWorkCenter();
        center.code = `WC-${Math.random().toString(36).slice(2, 6)}`;
        center.orgId = 'org-x';
        await center.save();
        const type = new BomActivityType();
        type.code = 'RUN';
        type.workCenterId = center.id;
        await type.save();
        const rate = new BomActivityRate();
        rate.workCenterId = center.id;
        rate.activityTypeId = type.id;
        rate.validFrom = day('2026-01-01');
        rate.rate = '1';
        rate.currency = 'CNY';
        rate.rateUom = 'h';
        await rate.save();
        // 头（发布前挂路由）
        const { header } = await (async () => {
          await loadHistory(adapter, {
            batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
            revisions: [{ itemId: a.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
            headers: []
          });
          const header = new BomHeader();
          header.parentRevisionId = String(
            shapeRows(
              await adapter.rawQuery(
                `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${a.id}'`
              )
            )[0][0]
          );
          header.bomType = 'ebom';
          header.orgId = 'org-x';
          header.costLotQty = '1';
          await header.save();
          const { BomLine, BomLineOccurrence } = await import('../entities.js');
          const bomLine = new BomLine();
          bomLine.headerId = header.id;
          bomLine.lineNo = 10;
          await bomLine.save();
          const occ = new BomLineOccurrence();
          occ.lineId = bomLine.id;
          occ.childItemId = c.id;
          occ.qty = '1';
          occ.uom = 'pcs';
          occ.effectiveFrom = day('2026-01-01');
          await occ.save();
          const routing = new BomRouting();
          routing.parentRevisionId = header.parentRevisionId;
          routing.bomType = 'ebom';
          routing.orgId = 'org-x';
          routing.validFrom = day('2020-01-01');
          await routing.save();
          for (const [seq, scrap] of [
            [10, '0'],
            [20, '0.03'],
            [30, '0']
          ] as const) {
            const op = new BomRoutingOperation();
            op.routingId = routing.id;
            op.operationSeq = seq;
            op.workCenterId = center.id;
            op.runTime = '1';
            op.timeUom = 'h';
            op.operationScrap = scrap;
            op.scrapConvention = 'additive';
            await op.save();
          }
          header.routingId = routing.id;
          await header.save();
          header.state = 'released';
          await header.save();
          return { header };
        })();
        const result = await rollupCost(
          adapter,
          COST_CTX,
          { parentRevisionId: header.parentRevisionId },
          { value: '100', uom: 'pcs' }
        );
        expect(result.root.processing[0].rateHours).toBe('103');
        expect(result.root.processing[1].rateHours).toBe('103');
        expect(result.root.processing[2].rateHours).toBe('100');
        expect(result.root.batchCost).toBe('306');
      });

      it('AC#11 manual 替代组未给选择：卷算拒绝不按候选集任意一个计算', async () => {
        const primary = await makeItem('m11p', { unitPrice: '10' });
        const alt = await makeItem('m11a', { unitPrice: '20' });
        const a = await makeItem('m11root');
        const { header } = await (async () => {
          const { BomSubstituteGroup } = await import('../entities.js');
          await loadHistory(adapter, {
            batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
            revisions: [{ itemId: a.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
            headers: []
          });
          const header = new BomHeader();
          header.parentRevisionId = String(
            shapeRows(
              await adapter.rawQuery(
                `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${a.id}'`
              )
            )[0][0]
          );
          header.bomType = 'ebom';
          header.orgId = 'org-x';
          header.costLotQty = '1';
          await header.save();
          const group = new BomSubstituteGroup();
          group.headerId = header.id;
          group.code = `G-${Math.random().toString(36).slice(2, 6)}`;
          group.strategy = 'manual';
          group.allowMix = true;
          await group.save();
          let lineNo = 10;
          for (const [child, role] of [
            [primary, 'primary'],
            [alt, 'substitute']
          ] as const) {
            const { BomLine, BomLineOccurrence } = await import('../entities.js');
            const bomLine = new BomLine();
            bomLine.headerId = header.id;
            bomLine.lineNo = lineNo;
            await bomLine.save();
            const occ = new BomLineOccurrence();
            occ.lineId = bomLine.id;
            occ.childItemId = child.id;
            occ.qty = '100';
            occ.uom = 'pcs';
            occ.effectiveFrom = day('2026-01-01');
            occ.substituteGroupId = group.id;
            occ.substituteRole = role;
            occ.equivQty = '1';
            await occ.save();
            lineNo += 10;
          }
          header.state = 'released';
          await header.save();
          return { header };
        })();
        await expect(rollupCost(adapter, COST_CTX, { parentRevisionId: header.parentRevisionId })).rejects.toThrow();
      });
    });
  }
});
