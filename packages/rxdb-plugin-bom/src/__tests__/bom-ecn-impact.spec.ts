/**
 * @fileoverview ECN 影响面与差异查询回归测试（US-515 AC#1/#2）
 *
 * 双后端（wa-sqlite / pglite）同断言：一个 ECN 改 3 张 BOM 的 5 行（新增 1、截止删除 1、
 * 改量 1（qty 2→3）、改版 2（换子件）），3 张 BOM 经 where-used 分属 2 台整机——
 * 影响面列出 2 台整机与命中路径；差异返回生效前后发生项集对比，四类各就其位。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomEcn, BomHeader, BomItem, BomLine, BomLineOccurrence } from '../entities.js';
import { ecnDiff, ecnImpact } from '../resolve/ecn.js';
import { loadHistory } from '../resolve/history-loader.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

for (const backend of BACKENDS) {
  describe(`ECN 影响面与差异 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    const makeItem = async (prefix: string): Promise<BomItem> => {
      const item = new BomItem();
      item.itemNo = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
      await item.save();
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: []
      });
      return item;
    };

    /** 已发布头 + 一行发生项（qty 默认 1；挂 ECN 时区间按 ECN 生效日派生）。 */
    const addLine = async (
      header: BomHeader,
      child: BomItem,
      qty: string,
      ecn?: BomEcn
    ): Promise<BomLineOccurrence> => {
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = 10 + Math.floor(Math.random() * 10000);
      if (ecn) line.ecnInId = ecn.id;
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = child.id;
      occurrence.qty = qty;
      occurrence.uom = 'pcs';
      occurrence.effectiveFrom = ecn ? ecn.effectiveDate : day('2026-01-01');
      if (ecn) occurrence.ecnInId = ecn.id;
      await occurrence.save();
      return occurrence;
    };

    const makeHeader = async (parent: BomItem): Promise<BomHeader> => {
      const rows = (await adapter.rawQuery(
        `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${parent.id}'`
      )) as unknown as { rows: unknown[][] };
      const header = new BomHeader();
      header.parentRevisionId = String(rows.rows[0][0]);
      header.bomType = 'ebom';
      header.orgId = 'org-x';
      await header.save();
      return header;
    };

    it('AC#1/#2 一个 ECN 改 3 张 BOM 的 5 行：影响面 2 台整机，差异四类各就其位', async () => {
      // 结构：T1 → B → (C, F, G)；T2 → D → H；T2 → E → I
      const t1 = await makeItem('imp-t1');
      const t2 = await makeItem('imp-t2');
      const b = await makeItem('imp-b');
      const d = await makeItem('imp-d');
      const e = await makeItem('imp-e');
      const c = await makeItem('imp-c');
      const f = await makeItem('imp-f');
      const g = await makeItem('imp-g');
      const h = await makeItem('imp-h');
      const i = await makeItem('imp-i');
      void (await makeItem('imp-c2'));
      const f2 = await makeItem('imp-f2');
      const h2 = await makeItem('imp-h2');
      const headerT1 = await makeHeader(t1);
      await addLine(headerT1, b, '1');
      const headerT2 = await makeHeader(t2);
      await addLine(headerT2, d, '1');
      await addLine(headerT2, e, '1');
      const headerB = await makeHeader(b);
      const occC = await addLine(headerB, c, '2');
      const occF = await addLine(headerB, f, '1');
      const occG = await addLine(headerB, g, '1');
      const headerD = await makeHeader(d);
      const occH = await addLine(headerD, h, '1');
      const headerE = await makeHeader(e);
      for (const header of [headerT1, headerT2, headerB, headerD, headerE]) {
        header.state = 'released';
        await header.save();
      }
      // ECN-2026-014 改 3 张 BOM 的 5 行（生效日 2026-11-01）
      const ecn = new BomEcn();
      ecn.ecnNo = `ECN-${Math.random().toString(36).slice(2, 8)}`;
      ecn.effectiveDate = day('2026-11-01');
      await ecn.save();
      // 改量 1：B 头 C 行 qty 2→3（截止 + 同逻辑行引入）
      occC.ecnOutId = ecn.id;
      occC.effectiveTo = day('2026-11-01');
      await occC.save();
      const occC2 = new BomLineOccurrence();
      occC2.lineId = occC.lineId;
      occC2.childItemId = c.id;
      occC2.qty = '3';
      occC2.uom = 'pcs';
      occC2.ecnInId = ecn.id;
      occC2.effectiveFrom = day('2026-11-01');
      await occC2.save();
      // 改版 2：B 头 F→F2；D 头 H→H2
      occF.ecnOutId = ecn.id;
      occF.effectiveTo = day('2026-11-01');
      await occF.save();
      const occF2 = new BomLineOccurrence();
      occF2.lineId = occF.lineId;
      occF2.childItemId = f2.id;
      occF2.qty = '1';
      occF2.uom = 'pcs';
      occF2.ecnInId = ecn.id;
      occF2.effectiveFrom = day('2026-11-01');
      await occF2.save();
      occH.ecnOutId = ecn.id;
      occH.effectiveTo = day('2026-11-01');
      await occH.save();
      const occH2 = new BomLineOccurrence();
      occH2.lineId = occH.lineId;
      occH2.childItemId = h2.id;
      occH2.qty = '1';
      occH2.uom = 'pcs';
      occH2.ecnInId = ecn.id;
      occH2.effectiveFrom = day('2026-11-01');
      await occH2.save();
      // 截止删除 1：B 头 G 行
      occG.ecnOutId = ecn.id;
      occG.effectiveTo = day('2026-11-01');
      await occG.save();
      // 新增 1：E 头新行 I
      const lineI = new BomLine();
      lineI.headerId = headerE.id;
      lineI.lineNo = 20 + Math.floor(Math.random() * 10000);
      lineI.ecnInId = ecn.id;
      await lineI.save();
      const occI = new BomLineOccurrence();
      occI.lineId = lineI.id;
      occI.childItemId = i.id;
      occI.qty = '2';
      occI.uom = 'pcs';
      occI.ecnInId = ecn.id;
      occI.effectiveFrom = day('2026-11-01');
      await occI.save();
      // 发布 ECN
      ecn.state = 'released';
      await ecn.save();

      // AC#1：影响面 = 2 台整机（T1、T2），被改物料 = B/D/E
      const impact = await ecnImpact(adapter, ecn.id);
      expect(impact.affectedItemIds.sort()).toEqual([b.id, d.id, e.id].sort());
      expect(impact.topItems.map(top => top.itemId).sort()).toEqual([t1.id, t2.id].sort());
      // 每条命中路径非空（至少一跳）
      for (const top of impact.topItems) {
        expect(top.paths.length).toBeGreaterThan(0);
        expect(top.paths[0].length).toBeGreaterThan(0);
      }

      // AC#2：差异四类各就其位
      const diff = await ecnDiff(adapter, ecn.id);
      const kinds = diff.headers.flatMap(header => header.entries.map(entry => entry.kind));
      expect(kinds.filter(kind => kind === 'added')).toHaveLength(1);
      expect(kinds.filter(kind => kind === 'removed')).toHaveLength(1);
      expect(kinds.filter(kind => kind === 'qty_changed')).toHaveLength(1);
      expect(kinds.filter(kind => kind === 'child_changed')).toHaveLength(2);
      // 改量行：qty 2→3 两个值都在
      const qtyChanged = diff.headers.flatMap(header => header.entries).find(entry => entry.kind === 'qty_changed');
      expect(qtyChanged?.before?.qty).toBe('2');
      expect(qtyChanged?.after?.qty).toBe('3');
    });
  });
}
