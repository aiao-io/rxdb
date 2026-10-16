/**
 * @fileoverview 阶梯用量与损耗回归测试（US-511 阶段 A/B1：AC#6 / #19 / #11）
 *
 * 双后端同断言：阶梯按损耗前 P 恰好命中一行、普通行恒计入、P 越界整次拒绝；
 * 组件损耗加成制 120 / 良率制 125。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomHeader, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import { explodeBom } from '../quantity/explosion.js';
import { BomPublishValidationError, BomQuantityError } from '../types.js';
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

const makeItem = async (itemNo: string, stockUom = 'pcs', uomDecimals = 0): Promise<BomItem> => {
  const item = new BomItem();
  item.itemNo = `${itemNo}-${Math.random().toString(36).slice(2, 6)}`;
  item.stockUom = stockUom;
  item.uomDecimals = uomDecimals;
  await item.save();
  return item;
};

for (const backend of BACKENDS) {
  describe(`阶梯与损耗 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it('AC#6 阶梯按损耗前 P 恰好命中一行、普通行恒计入', async () => {
      const finished = await makeItem('tier-fin');
      const part = await makeItem('tier-part');
      // 装配损耗 20%（加成）：P=95 时 P'=114——若按损耗后选档会命中 [100,∞)
      await buildQuantityFixture(adapter, [
        {
          item: finished,
          assemblyScrap: '0.2',
          occurrences: [
            { child: part, tierGroupNo: 'g1', lotsizeFrom: '0', lotsizeTo: '100', qty: '1' },
            { child: part, tierGroupNo: 'g1', lotsizeFrom: '100', lotsizeTo: null, qty: '2' },
            { child: part, qty: '3' }
          ]
        }
      ]);
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '95', uom: 'pcs' } }
      );
      expect(result.truncated).toBeNull();
      // 阶梯命中 [0,100) 行：G=1×114/1=114；普通行：3×114=342
      const quantities = result.requirementLines.map(line => line.qty).sort();
      expect(quantities).toEqual(['114', '342']);
      // P=100 命中 [100,∞)：阶梯 G=2×120=240；普通行 3×120=360
      const atBoundary = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '100', uom: 'pcs' } }
      );
      expect(atBoundary.requirementLines.map(line => line.qty).sort()).toEqual(['240', '360']);
    });

    it('AC#19 阶梯组内 P 落在所有区间外：整次拒绝并点名组号', async () => {
      const finished = await makeItem('gap-fin');
      const part = await makeItem('gap-part');
      await buildQuantityFixture(adapter, [
        {
          item: finished,
          occurrences: [{ child: part, tierGroupNo: 'g9', lotsizeFrom: '0', lotsizeTo: '100', qty: '1' }]
        }
      ]);
      try {
        await explodeBom(adapter, CONTEXT, { parentItemId: finished.id }, { plannedQty: { value: '150', uom: 'pcs' } });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(BomQuantityError);
        expect(String((error as Error).message)).toContain('g9');
      }
    });

    it('AC#11 组件损耗：需求 100、20% 损耗，加成制 120 / 良率制 125', async () => {
      const finished = await makeItem('scrap-fin');
      const part = await makeItem('scrap-part');
      await buildQuantityFixture(adapter, [
        {
          item: finished,
          occurrences: [
            { child: part, qty: '100', componentScrap: '0.2', componentScrapConvention: 'additive' },
            { child: part, qty: '100', componentScrap: '0.2', componentScrapConvention: 'yield' }
          ]
        }
      ]);
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      expect(result.requirementLines.map(line => line.qty).sort()).toEqual(['120', '125']);
    });

    it('AC#24 发布期阶梯切片校验：同档跨期改量并存通过、日期段与批量段同时相交拒绝', async () => {
      const draftHeader = async (): Promise<BomHeader> => {
        const item = await makeItem('pub-item');
        const revision = new BomItemRevision();
        revision.revisionNo = 'A';
        revision.itemId = item.id;
        await revision.save();
        const header = new BomHeader();
        header.parentRevisionId = revision.id;
        header.bomType = 'ebom';
        header.orgId = 'org-x';
        await header.save();
        return header;
      };
      const addTier = async (
        header: BomHeader,
        tierGroupNo: string,
        lotsizeFrom: string,
        lotsizeTo: string | null,
        effectiveFrom: string,
        effectiveTo: string | null
      ): Promise<void> => {
        const child = await makeItem('pub-child');
        const line = new BomLine();
        line.headerId = header.id;
        line.lineNo = 10 + Math.floor(Math.random() * 1000);
        await line.save();
        const occurrence = new BomLineOccurrence();
        occurrence.lineId = line.id;
        occurrence.childItemId = child.id;
        occurrence.qty = '1';
        occurrence.tierGroupNo = tierGroupNo;
        occurrence.lotsizeFrom = lotsizeFrom;
        occurrence.lotsizeTo = lotsizeTo;
        occurrence.effectiveFrom = new Date(`${effectiveFrom}T00:00:00.000Z`);
        occurrence.effectiveTo = effectiveTo === null ? null : new Date(`${effectiveTo}T00:00:00.000Z`);
        await occurrence.save();
      };
      // 通过例：同档 [0,100) 两段生效域相邻不交
      const okHeader = await draftHeader();
      await addTier(okHeader, 'g1', '0', '100', '2026-01-01', '2026-11-01');
      await addTier(okHeader, 'g1', '0', '100', '2026-11-01', null);
      okHeader.state = 'released';
      await expect(okHeader.save()).resolves.toBeDefined();
      // 拒绝例：o1 [0,100) 生效 [01-01, 11-01)；o3 [50,150) 生效 [10-01, ∞)——日期与批量同时相交
      const badHeader = await draftHeader();
      await addTier(badHeader, 'g2', '0', '100', '2026-01-01', '2026-11-01');
      await addTier(badHeader, 'g2', '50', '150', '2026-10-01', null);
      badHeader.state = 'released';
      const rejected = await badHeader.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).toBeInstanceOf(BomPublishValidationError);
      expect(String((rejected as Error).message)).toContain('g2');
      expect(String((rejected as Error).message)).toContain('阶梯切片重叠');
    });

    it('固定损耗按行 UoM 计、不随父件缩放、不再被良率放大', async () => {
      const finished = await makeItem('fixscrap-fin');
      const part = await makeItem('fixscrap-part');
      await buildQuantityFixture(adapter, [
        {
          item: finished,
          occurrences: [
            {
              child: part,
              qty: '10',
              componentScrap: '0.5',
              componentScrapConvention: 'yield',
              componentScrapFixed: '1'
            }
          ]
        }
      ]);
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentItemId: finished.id },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      // G'=10÷0.5=20 + 1 = 21
      expect(result.requirementLines[0].qty).toBe('21');
    });
  });
}
