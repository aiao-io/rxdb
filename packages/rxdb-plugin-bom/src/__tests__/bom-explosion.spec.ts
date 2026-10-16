/**
 * @fileoverview 七步数量展开回归测试（US-511 阶段 A/B1：AC#20 golden / #2 / #3 展开段 / #15 / #16 / #17 / #22 展开段）
 *
 * 双后端（wa-sqlite / pglite）同断言：golden 按「同一精度、同一顺序手算」位级对账。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomItem } from '../entities.js';
import { explodeBom, type RequirementLine } from '../quantity/explosion.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomTestAdapter, createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

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
      expect(result.manifest.algorithmVersion).toBe('2');
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
  });
}
