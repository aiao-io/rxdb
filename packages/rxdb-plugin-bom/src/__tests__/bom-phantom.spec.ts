/**
 * @fileoverview 虚拟件穿透回归测试（US-511 阶段 C：AC#4 / #8 / #9 / #18）
 *
 * 双后端同断言：行级 phantom_override 覆盖修订级 default_phantom、单位换算在穿透之前
 * （1000 g → 1 kg → 恰好 2 件）、两级 phantom + 行级换算覆盖 golden、虚拟件无头整次拒绝。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomItem } from '../entities.js';
import { explodeBom } from '../quantity/explosion.js';
import { BomQuantityError } from '../types.js';
import {
  buildQuantityFixture,
  createBomTestAdapter,
  disposeBomTestAdapter,
  type BomTestAdapter,
  type BomTestBackend
} from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const CONTEXT = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: day('2026-01-01') };

const makeItem = async (itemNo: string, stockUom = 'pcs', uomDecimals = 0, uomConversion: string | null = null): Promise<BomItem> => {
  const item = new BomItem();
  item.itemNo = `${itemNo}-${Math.random().toString(36).slice(2, 6)}`;
  item.stockUom = stockUom;
  item.uomDecimals = uomDecimals;
  item.uomConversion = uomConversion;
  await item.save();
  return item;
};

for (const backend of BACKENDS) {
  describe(`虚拟件穿透 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it('AC#4 行级 phantom_override 覆盖修订级 default_phantom（两个方向）', async () => {
      const finished = await makeItem('ph-fin');
      const byLine = await makeItem('ph-line');
      const byRevision = await makeItem('ph-rev');
      const leaf = await makeItem('ph-leaf');
      // byLine 修订非 phantom、行级覆盖 true → 穿透（不产出需求行，产出 leaf 需求行）
      // byRevision 修订 phantom、行级覆盖 false → 不穿透（产出需求行）
      await buildQuantityFixture(adapter, [
        {
          item: finished,
          occurrences: [
            { child: byLine, phantomOverride: true },
            { child: byRevision, phantomOverride: false }
          ]
        },
        {
          item: byLine,
          occurrences: [{ child: leaf }]
        },
        {
          item: byRevision,
          defaultPhantom: true,
          occurrences: [{ child: leaf }]
        }
      ]);
      const result = await explodeBom(adapter, CONTEXT, { parentItemId: finished.id }, { plannedQty: { value: '1', uom: 'pcs' } });
      const byItem = (item: BomItem) => result.requirementLines.filter(line => line.itemId === item.id);
      expect(byItem(byLine).length).toBe(0);
      expect(byItem(byRevision).length).toBe(1);
      // leaf 经两条路径各一条需求：byLine 穿透直达 + byRevision 实体下钻
      expect(byItem(leaf).length).toBe(2);
    });

    it('AC#8 单位换算在穿透之前：1000 g phantom → 1 kg 基准 → 恰好 2 件 C', async () => {
      const finished = await makeItem('uom-fin', 'pcs');
      const phantom = await makeItem('uom-phantom', 'g');
      const part = await makeItem('uom-part');
      await buildQuantityFixture(adapter, [
        {
          item: finished,
          occurrences: [{ child: phantom, qty: '1000', uom: 'g' }]
        },
        {
          item: phantom,
          defaultPhantom: true,
          baseUom: 'kg',
          baseQty: '1',
          occurrences: [{ child: part, qty: '2' }]
        }
      ]);
      const result = await explodeBom(adapter, CONTEXT, { parentItemId: finished.id }, { plannedQty: { value: '1', uom: 'pcs' } });
      // D=1000g → 穿透归一 1kg → P=1 → G=2×1/1=2 件（不是 2000）
      expect(result.requirementLines.length).toBe(1);
      expect(result.requirementLines[0].itemId).toBe(part.id);
      expect(result.requirementLines[0].qty).toBe('2');
    });

    it('AC#9 两级 phantom + 行级换算覆盖 golden：C 归一 1 盒（物料级 0.4）、D 恰好 3 件', async () => {
      const finished = await makeItem('n9-fin', 'kg');
      const b = await makeItem('n9-b', 'kg');
      const c = await makeItem('n9-c', 'pcs', 0, '10');
      const d = await makeItem('n9-d', 'pcs');
      await buildQuantityFixture(adapter, [
        {
          item: finished,
          baseUom: 'kg',
          occurrences: [{ child: b, qty: '2', uom: 'kg' }]
        },
        {
          item: b,
          defaultPhantom: true,
          baseUom: 'kg',
          baseQty: '0.5',
          occurrences: [{ child: c, qty: '2', uom: 'pcs', uomConversion: '4' }]
        },
        {
          item: c,
          defaultPhantom: true,
          baseUom: '盒',
          baseQty: '1',
          occurrences: [{ child: d, qty: '3', uom: 'pcs' }]
        }
      ]);
      // plannedQty 0.5 kg → G_B=2×0.5/1=1 kg → P_B=1 kg → G_C=2×1/0.5=4 件
      // → 行级覆盖 1 盒=4 件 → P_C=1 盒（物料级 0.4 盒）→ G_D=3×1/1=3 件
      const result = await explodeBom(adapter, CONTEXT, { parentItemId: finished.id }, { plannedQty: { value: '0.5', uom: 'kg' } });
      expect(result.requirementLines.length).toBe(1);
      expect(result.requirementLines[0].itemId).toBe(d.id);
      expect(result.requirementLines[0].qty).toBe('3');
      expect(result.requirementLines[0].uom).toBe('pcs');
      // 穿透记录（算式面板第 7 步）：B 修订级、C 修订级；C 的行级覆盖归一为 1 盒
      expect(result.penetrations.length).toBe(2);
      const bPenetration = result.penetrations.find(entry => entry.childItemId === b.id);
      expect(bPenetration?.source).toBe('revision');
      expect(bPenetration?.converted).toEqual({ value: '1', uom: 'kg' });
      expect(bPenetration?.childPlanned).toEqual({ value: '1', uom: 'kg' });
      const cPenetration = result.penetrations.find(entry => entry.childItemId === c.id);
      expect(cPenetration?.source).toBe('revision');
      expect(cPenetration?.converted).toEqual({ value: '4', uom: 'pcs' });
      expect(cPenetration?.childPlanned).toEqual({ value: '1', uom: '盒' });
    });

    it('AC#10 展开期缺换算率：跨量纲（米 → 千克）且两级均未声明，整次拒绝不默认 1', async () => {
      const finished = await makeItem('norate-fin');
      const part = await makeItem('norate-part', 'kg');
      await buildQuantityFixture(adapter, [
        {
          item: finished,
          occurrences: [{ child: part, qty: '2', uom: 'm' }]
        }
      ]);
      try {
        await explodeBom(adapter, CONTEXT, { parentItemId: finished.id }, { plannedQty: { value: '1', uom: 'pcs' } });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(BomQuantityError);
        expect(String((error as Error).message)).toContain('缺换算率');
      }
      // 声明物料级换算率（1 kg = 2 m → 率 2：2 m ÷ 2 = 1 kg）后放行
      part.uomConversion = '2';
      await part.save();
      const converted = await explodeBom(adapter, CONTEXT, { parentItemId: finished.id }, { plannedQty: { value: '1', uom: 'pcs' } });
      expect(converted.requirementLines[0].qty).toBe('1');
      expect(converted.requirementLines[0].uom).toBe('kg');
    });

    it('AC#18 虚拟件在当前上下文下无已发布 BOM 头：整次拒绝并点名', async () => {
      const finished = await makeItem('nohead-fin');
      const phantom = await makeItem('nohead-phantom');
      await buildQuantityFixture(adapter, [
        {
          item: finished,
          occurrences: [{ child: phantom, phantomOverride: true }]
        }
      ]);
      try {
        await explodeBom(adapter, CONTEXT, { parentItemId: finished.id }, { plannedQty: { value: '1', uom: 'pcs' } });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(BomQuantityError);
        expect(String((error as Error).message)).toContain('没有已发布 BOM 头');
      }
    });
  });
}
