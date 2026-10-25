/**
 * @fileoverview 七步数量展开回归测试（US-511 阶段 A/B1：AC#20 golden / #2 / #3 展开段 / #15 / #16 / #17 / #22 展开段）
 *
 * 双后端（wa-sqlite / pglite）同断言：golden 按「同一精度、同一顺序手算」位级对账。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomHeader, BomItem, BomLine, BomLineOccurrence } from '../entities.js';
import { BomCostError, rollupCost } from '../quantity/cost.js';
import { explodeBom, type RequirementLine } from '../quantity/explosion.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomQuantityError } from '../types.js';
import { writeBypassingGuards } from './guard-bypass.js';
import {
  BomTestAdapter,
  buildQuantityFixture,
  createBomTestAdapter,
  disposeBomTestAdapter,
  type BomTestBackend
} from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const CONTEXT = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: day('2026-01-01') };

/** 建物料（含库存单位）。 */
const makeItem = async (
  itemNo: string,
  stockUom = 'pcs',
  uomDecimals = 0,
  uomConversion: string | null = null
): Promise<BomItem> => {
  const item = new BomItem();
  item.itemNo = `${itemNo}-${Math.random().toString(36).slice(2, 6)}`;
  item.stockUom = stockUom;
  item.uomDecimals = uomDecimals;
  item.uomConversion = uomConversion;
  await item.save();
  return item;
};

interface FixtureHeader {
  item: BomItem;
  baseUom?: string;
  baseQty?: string;
  assemblyScrap?: string;
  assemblyScrapConvention?: 'additive' | 'yield';
  occurrences: {
    child: BomItem;
    qty?: string | null;
    qtyFormula?: string | null;
    isFixedQty?: boolean;
    uom?: string;
    componentScrap?: string;
    componentScrapConvention?: 'additive' | 'yield';
    componentScrapFixed?: string;
    uomConversion?: string | null;
    phantomOverride?: boolean | null;
  }[];
}

/** 经 loadHistory 装载一层结构（全部已发布修订与头）。 */
const buildFixture = async (adapter: BomTestAdapter, headers: FixtureHeader[]): Promise<void> => {
  // 同一子件可出现在多条边里：去重后建修订（部分唯一索引按 (itemId, effectiveFrom) 唯一）
  const allItems = [
    ...new Set(headers.flatMap(header => [header.item, ...header.occurrences.map(occurrence => occurrence.child)]))
  ];
  await loadHistory(adapter, {
    batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
    revisions: allItems.map(item => ({ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') })),
    headers: headers.map(header => ({
      revisionIndex: allItems.indexOf(header.item),
      bomType: 'ebom',
      orgId: 'org-x',
      baseUom: header.baseUom,
      baseQty: header.baseQty,
      assemblyScrap: header.assemblyScrap,
      assemblyScrapConvention: header.assemblyScrapConvention,
      lines: header.occurrences.map((occurrence, index) => ({
        lineNo: 10 + index,
        occurrences: [
          {
            childItemId: occurrence.child.id,
            qty: occurrence.qtyFormula ? null : (occurrence.qty ?? '1'),
            qtyFormula: occurrence.qtyFormula ?? null,
            formulaGrammarVersion: occurrence.qtyFormula ? '1' : null,
            isFixedQty: occurrence.isFixedQty ?? false,
            uom: occurrence.uom ?? 'pcs',
            componentScrap: occurrence.componentScrap ?? '0',
            componentScrapConvention: occurrence.componentScrapConvention ?? 'additive',
            componentScrapFixed: occurrence.componentScrapFixed ?? '0',
            uomConversion: occurrence.uomConversion ?? null,
            phantomOverride: occurrence.phantomOverride ?? null,
            effectiveFrom: day('2020-01-01')
          }
        ]
      }))
    }))
  });
};

const qtyOf = (lines: RequirementLine[], item: BomItem): string[] =>
  lines.filter(line => line.itemId === item.id).map(line => line.qty);

for (const backend of BACKENDS) {
  describe(`七步数量展开 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it('AC#20 全流程 golden：P=100、装配 5% 加成、组件 3% 良率 → 需求行 217', async () => {
      const finished = await makeItem('fin');
      const part = await makeItem('part');
      await buildFixture(adapter, [
        {
          item: finished,
          baseQty: '1',
          assemblyScrap: '0.05',
          assemblyScrapConvention: 'additive',
          occurrences: [{ child: part, qty: '2', componentScrap: '0.03', componentScrapConvention: 'yield' }]
        }
      ]);
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '100', uom: 'pcs' } }
      );
      expect(result.truncated).toBeNull();
      expect(result.requirementLines.length).toBe(1);
      // P'=105、G=210、G'=210÷0.97=216.4948453608247422680412371134021 → 需求行 217（小数位 0）
      expect(result.requirementLines[0].qty).toBe('217');
      expect(result.requirementLines[0].itemId).toBe(part.id);
      expect(result.requirementLines[0].uom).toBe('pcs');
      // 七步中间值（算式面板展示输入）：P=100 → P'=105 → G=210 → G'=216.4948453608247422680412371134021 → D 同 → 取整 217
      const steps = result.requirementLines[0].steps;
      expect(steps.planned).toEqual({ value: '100', uom: 'pcs' });
      expect(steps.assemblyScrapped).toEqual({ value: '105', uom: 'pcs' });
      expect(steps.gross).toEqual({ value: '210', uom: 'pcs' });
      expect(steps.componentScrapped).toEqual({ value: '216.4948453608247422680412371134021', uom: 'pcs' });
      expect(steps.converted).toEqual({ value: '216.4948453608247422680412371134021', uom: 'pcs' });
      expect(steps.phantom.value).toBe(false);
      // manifest：算法版本与换算记录
      expect(result.manifest.algorithmVersion).toBe('3');
      expect(result.manifest.parentItemId).toBe(finished.id);
    });

    it('AC#2 定量用量：父件数量变化该行用量不变', async () => {
      const finished = await makeItem('fixed-fin');
      const part = await makeItem('fixed-part');
      await buildFixture(adapter, [
        {
          item: finished,
          baseQty: '2',
          occurrences: [{ child: part, qty: '5', isFixedQty: true }]
        }
      ]);
      const small = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '100', uom: 'pcs' } }
      );
      const large = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '1000', uom: 'pcs' } }
      );
      expect(small.requirementLines[0].qty).toBe('5');
      expect(large.requirementLines[0].qty).toBe('5');
    });

    it('AC#15 定量行经两条路径出现：每条路径各计一次', async () => {
      const machine = await makeItem('path-m');
      const sub = await makeItem('path-s');
      await buildFixture(adapter, [
        {
          item: machine,
          occurrences: [
            { child: sub, qty: '5', isFixedQty: true },
            { child: sub, qty: '5', isFixedQty: true }
          ]
        }
      ]);
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: machine.id },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      expect(qtyOf(result.requirementLines, sub)).toEqual(['5', '5']);
    });

    it('AC#16 需求 10.0001 件、小数位 0 → 需求行 11；中间量不舍入', async () => {
      const finished = await makeItem('ceil-fin');
      const part = await makeItem('ceil-part');
      await buildFixture(adapter, [
        {
          item: finished,
          occurrences: [{ child: part, qty: '10.0001' }]
        }
      ]);
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      expect(result.requirementLines[0].qty).toBe('11');
    });

    it('AC#17 非虚拟子装配取整值下传：S 需求 3，C 按 P=3 计 6', async () => {
      const finished = await makeItem('round-fin');
      const sub = await makeItem('round-sub');
      const part = await makeItem('round-part');
      await buildFixture(adapter, [
        {
          item: finished,
          occurrences: [{ child: sub, qty: '2.5' }]
        },
        {
          item: sub,
          occurrences: [{ child: part, qty: '2' }]
        }
      ]);
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      expect(qtyOf(result.requirementLines, sub)).toEqual(['3']);
      expect(qtyOf(result.requirementLines, part)).toEqual(['6']);
    });

    it('AC#22 展开段：34 位有效数字的 qty 经展开后位级一致（库存单位 33 位小数）', async () => {
      const finished = await makeItem('sig-fin');
      const part = await makeItem('sig-part', 'pcs', 33);
      const qty = '1.000000000000000000000000000000001';
      await buildFixture(adapter, [
        {
          item: finished,
          occurrences: [{ child: part, qty }]
        }
      ]);
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      expect(result.requirementLines[0].qty).toBe(qty);
    });

    it('AC#3 展开段：公式行随参数求值，manifest 记公式参数与语法版本', async () => {
      const finished = await makeItem('formula-fin');
      const part = await makeItem('formula-part');
      await buildFixture(adapter, [
        {
          item: finished,
          occurrences: [{ child: part, qty: null, qtyFormula: '长*宽' }]
        }
      ]);
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        {
          plannedQty: { value: '1', uom: 'pcs' },
          params: { 长: '3', 宽: '4' }
        }
      );
      expect(result.requirementLines[0].qty).toBe('12');
      expect(result.manifest.formulaParams).toEqual({ 长: '3', 宽: '4' });
      expect(result.manifest.formulaGrammarVersion).toBe('1');
    });

    it('缺公式参数整次拒绝并点名（AC#14 展开段）', async () => {
      const finished = await makeItem('missing-fin');
      const part = await makeItem('missing-part');
      await buildFixture(adapter, [
        {
          item: finished,
          occurrences: [{ child: part, qty: null, qtyFormula: '长*宽' }]
        }
      ]);
      await expect(
        explodeBom(adapter, CONTEXT, { parentItemId: finished.id }, { plannedQty: { value: '1', uom: 'pcs' } })
      ).rejects.toThrow();
    });

    /**
     * 两跳都跨量纲（行 m → 库存 kg → 子头 件）：行级率（1 kg = 2 m）只服务第一跳，
     * 第二跳只剩物料级率（1 件 = 0.5 kg）。10 m → 5 kg → 10 件；复用行级率会得 5 ÷ 2 = 2.5。
     */
    const buildTwoHop = async (phantom: boolean, itemRate: string, lineRate: string | null) => {
      const finished = await makeItem('hop-fin');
      const sub = await makeItem('hop-sub', 'kg', 0, itemRate);
      const leaf = await makeItem('hop-leaf');
      await buildQuantityFixture(adapter, [
        { item: finished, occurrences: [{ child: sub, qty: '10', uom: 'm', uomConversion: lineRate }] },
        { item: sub, defaultPhantom: phantom, baseUom: 'pcs', baseQty: '1', occurrences: [{ child: leaf, qty: '1' }] }
      ]);
      return { finished, sub, leaf };
    };

    it('二次换算（穿透）：第二跳只用物料级率，manifest 记实际所用的率', async () => {
      const { finished, leaf } = await buildTwoHop(true, '0.5', '2');
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      expect(result.penetrations[0].converted).toEqual({ value: '5', uom: 'kg' });
      expect(result.penetrations[0].childPlanned).toEqual({ value: '10', uom: 'pcs' });
      expect(qtyOf(result.requirementLines, leaf)).toEqual(['10']);
      expect(result.manifest.conversions).toEqual([
        { from: 'm', to: 'kg', rate: '2' },
        { from: 'kg', to: 'pcs', rate: '0.5' }
      ]);
    });

    it('二次换算（非虚拟件下传）：取整后的 5 kg 按物料级率归一为 10 件', async () => {
      const { finished, sub, leaf } = await buildTwoHop(false, '0.5', '2');
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      expect(qtyOf(result.requirementLines, sub)).toEqual(['5']);
      expect(qtyOf(result.requirementLines, leaf)).toEqual(['10']);
    });

    it('物料级率已被第一跳消耗时第二跳缺率：拒绝，不把同一个率复用到另一对单位', async () => {
      const { finished } = await buildTwoHop(true, '2', null);
      const error = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '1', uom: 'pcs' } }
      ).then(
        () => null,
        (cause: unknown) => cause
      );
      expect(error).toBeInstanceOf(BomQuantityError);
      expect(String((error as Error).message)).toContain('从 kg 换算到 pcs 缺换算率');
    });

    it('换算率为 0：物料级 / 行级都在写入期拒绝；守卫上线前写入的存量 0 整次拒绝为 BomQuantityError 并点名单位对，不以裸除零错误逃逸', async () => {
      await expect(makeItem('zero-rate-new', 'kg', 0, '0')).rejects.toThrow(/uomConversion 换算率必须大于 0/);
      const fresh = await makeItem('zero-rate-new-part', 'kg');
      await expect(
        buildFixture(adapter, [
          {
            item: await makeItem('zero-rate-new-fin'),
            occurrences: [{ child: fresh, qty: '10', uom: 'm', uomConversion: '0' }]
          }
        ])
      ).rejects.toThrow(/uomConversion 换算率必须大于 0/);
      // 存量：按正数建好后绕过守卫直写 0（行级覆盖物料级，只改哪一级就点名哪一级）
      const tableRef = (name: string): string => (backend === 'wa-sqlite' ? `"bom$${name}"` : `"bom"."${name}"`);
      for (const [table, key, lineRate, level] of [
        ['item', 'id', null, '物料级'],
        ['bom_line_occurrence', 'childItemId', '2', '行级']
      ] as const) {
        const finished = await makeItem('zero-rate-fin');
        const part = await makeItem('zero-rate-part', 'kg', 0, '2');
        await buildFixture(adapter, [
          { item: finished, occurrences: [{ child: part, qty: '10', uom: 'm', uomConversion: lineRate }] }
        ]);
        await writeBypassingGuards(
          adapter,
          table,
          `UPDATE ${tableRef(table)} SET "uomConversion" = '0' WHERE "${key}" = '${part.id}'`
        );
        const error = await explodeBom(
          adapter,
          CONTEXT,
          { parentItemId: finished.id },
          { plannedQty: { value: '1', uom: 'pcs' } }
        ).then(
          () => null,
          (cause: unknown) => cause
        );
        expect(error, level).toBeInstanceOf(BomQuantityError);
        expect(String((error as Error).message), level).toContain(`从 m 换算到 kg 的${level}换算率为 0`);
      }
    });

    it('头基准量 base_qty 为 0：写入期拒绝；守卫上线前写入的存量 0 让按批缩放的数量与成本都拒绝并点名头基准量，不以裸除零错误逃逸', async () => {
      const finished = await makeItem('zero-base-fin');
      const part = await makeItem('zero-base-part');
      part.unitPrice = '1';
      part.priceCurrency = 'CNY';
      await part.save();
      const headerId = crypto.randomUUID();
      const load = (baseQty: string): Promise<void> =>
        loadHistory(adapter, {
          batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
          revisions: [{ itemId: finished.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
          headers: [
            {
              id: headerId,
              revisionIndex: 0,
              bomType: 'ebom',
              orgId: 'org-x',
              baseQty,
              costLotQty: '1',
              lines: [
                { lineNo: 10, occurrences: [{ childItemId: part.id, qty: '2', effectiveFrom: day('2020-01-01') }] }
              ]
            }
          ]
        });
      await expect(load('0')).rejects.toThrow(/baseQty 头基准量必须大于 0/);
      // 存量：按正数装载后绕过守卫直写 0
      await load('1');
      await writeBypassingGuards(
        adapter,
        'bom_header',
        `UPDATE ${backend === 'wa-sqlite' ? '"bom$bom_header"' : '"bom"."bom_header"'} SET "baseQty" = '0' WHERE "id" = '${headerId}'`
      );
      const quantity = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '1', uom: 'pcs' } }
      ).then(
        () => null,
        (cause: unknown) => cause
      );
      expect(quantity).toBeInstanceOf(BomQuantityError);
      expect(String((quantity as Error).message)).toContain('base_qty 为 0');
      const cost = await rollupCost(
        adapter,
        { ...CONTEXT, currency: 'CNY', rateDate: day('2026-01-01') },
        { parentItemId: finished.id }
      ).then(
        () => null,
        (cause: unknown) => cause
      );
      expect(cost).toBeInstanceOf(BomCostError);
      expect((cost as Error).cause).toBeInstanceOf(BomQuantityError);
      expect(String((cost as Error).message)).toContain('base_qty 为 0');
    });

    it('公式行语法版本不是当前版本：数量与成本都在求值前拒绝并点名发生项与版本', async () => {
      const finished = await makeItem('gv-fin');
      const part = await makeItem('gv-part');
      part.unitPrice = '1';
      part.priceCurrency = 'CNY';
      await part.save();
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: finished.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: []
      });
      const revisionTable = backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"';
      const revisionRows = (await adapter.rawQuery(
        `SELECT "id" FROM ${revisionTable} WHERE "itemId" = '${finished.id}'`
      )) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
      const header = new BomHeader();
      header.parentRevisionId = String(('results' in revisionRows ? revisionRows.results[0] : revisionRows).rows[0][0]);
      header.bomType = 'ebom';
      header.orgId = 'org-x';
      header.costLotQty = '1';
      await header.save();
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = 10;
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = part.id;
      occurrence.qty = null;
      occurrence.qtyFormula = '长*宽';
      occurrence.formulaGrammarVersion = '1';
      occurrence.effectiveFrom = day('2020-01-01');
      await occurrence.save();
      // 绕过入口（导入通道 / 直连 SQL 的形态）把语法版本写成未知的 9
      const occurrenceTable = backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"';
      await adapter.rawQuery(
        `UPDATE ${occurrenceTable} SET "formulaGrammarVersion" = '9' WHERE "id" = '${occurrence.id}'`
      );
      header.state = 'released';
      await header.save();
      const params = { 长: '3', 宽: '4' };
      const quantity = await explodeBom(
        adapter,
        CONTEXT,
        { parentRevisionId: header.parentRevisionId },
        { plannedQty: { value: '1', uom: 'pcs' }, params }
      ).then(
        () => null,
        (cause: unknown) => cause
      );
      expect(quantity).toBeInstanceOf(BomQuantityError);
      expect(String((quantity as Error).message)).toContain(occurrence.id);
      expect(String((quantity as Error).message)).toContain('语法版本「9」');
      const cost = await rollupCost(
        adapter,
        { ...CONTEXT, currency: 'CNY', rateDate: day('2026-01-01'), formulaParams: params },
        { parentRevisionId: header.parentRevisionId }
      ).then(
        () => null,
        (cause: unknown) => cause
      );
      expect(cost).toBeInstanceOf(BomCostError);
      expect(String((cost as Error).message)).toContain('语法版本「9」');
    });

    it('副产公式行（qty 为空、只有 qty_formula）按语法版本求值产出量，不以 0 兜底', async () => {
      const finished = await makeItem('bp-fin');
      const part = await makeItem('bp-part');
      const byproduct = await makeItem('bp-out');
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: finished.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: [
          {
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: 'org-x',
            baseQty: '2',
            lines: [
              { lineNo: 10, occurrences: [{ childItemId: part.id, qty: '1', effectiveFrom: day('2020-01-01') }] },
              {
                lineNo: 20,
                occurrences: [
                  {
                    childItemId: byproduct.id,
                    qty: null,
                    qtyFormula: '长*宽',
                    formulaGrammarVersion: '1',
                    flowDirection: 'by_product',
                    effectiveFrom: day('2020-01-01')
                  }
                ]
              }
            ]
          }
        ]
      });
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '10', uom: 'pcs' }, params: { 长: '3', 宽: '4' } }
      );
      // q = 3×4 = 12，按批缩放 12 × P′(10) ÷ base_qty(2) = 60
      expect(result.outputs.map(output => [output.itemId, output.direction, output.qty])).toEqual([
        [byproduct.id, 'by_product', '60']
      ]);
    });

    it('manifest 的换算记录：同量纲标准系数记 null，不记行上声明但未使用的率', async () => {
      const finished = await makeItem('rec-fin');
      const part = await makeItem('rec-part', 'kg', 3, '0.5');
      await buildFixture(adapter, [{ item: finished, occurrences: [{ child: part, qty: '500', uom: 'g' }] }]);
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      expect(qtyOf(result.requirementLines, part)).toEqual(['0.5']);
      expect(result.manifest.conversions).toEqual([{ from: 'g', to: 'kg', rate: null }]);
    });
  });
}
