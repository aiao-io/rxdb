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
import { BomResolutionError } from '../resolve/resolution.js';
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

    /** 指定作用域的已发布头：每行一个或多个发生项（默认 qty 1、2026-01-01 起）。 */
    const scopedHeader = async (
      parent: BomItem,
      scope: { bomType: 'ebom' | 'mbom'; orgId: string },
      specs: { child: BomItem; occurrences?: Partial<BomLineOccurrence>[] }[]
    ): Promise<{ header: BomHeader; lines: BomLine[]; occurrences: BomLineOccurrence[][] }> => {
      const rows = (await adapter.rawQuery(
        `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${parent.id}'`
      )) as unknown as { rows: unknown[][] };
      const header = new BomHeader();
      header.parentRevisionId = String(rows.rows[0][0]);
      header.bomType = scope.bomType;
      header.orgId = scope.orgId;
      await header.save();
      const lines: BomLine[] = [];
      const occurrences: BomLineOccurrence[][] = [];
      for (const [index, spec] of specs.entries()) {
        const line = new BomLine();
        line.headerId = header.id;
        line.lineNo = (index + 1) * 10;
        await line.save();
        const saved: BomLineOccurrence[] = [];
        for (const overrides of spec.occurrences ?? [{}]) {
          const occurrence = new BomLineOccurrence();
          occurrence.lineId = line.id;
          occurrence.childItemId = spec.child.id;
          occurrence.qty = '1';
          occurrence.uom = 'pcs';
          occurrence.effectiveFrom = day('2026-01-01');
          Object.assign(occurrence, overrides);
          await occurrence.save();
          saved.push(occurrence);
        }
        lines.push(line);
        occurrences.push(saved);
      }
      header.state = 'released';
      await header.save();
      return { header, lines, occurrences };
    };

    /** 已发布 ECN：每条改动截止旧发生项、同逻辑行引入新发生项（区间与序列维沿用旧发生项）。 */
    const releasedEcn = async (
      effectiveDate: Date,
      changes: { occurrence: BomLineOccurrence; qty: string }[]
    ): Promise<BomEcn> => {
      const ecn = new BomEcn();
      ecn.ecnNo = `ECN-${Math.random().toString(36).slice(2, 8)}`;
      ecn.effectiveDate = effectiveDate;
      await ecn.save();
      for (const { occurrence, qty } of changes) {
        occurrence.ecnOutId = ecn.id;
        occurrence.effectiveTo = effectiveDate;
        await occurrence.save();
        const next = new BomLineOccurrence();
        next.lineId = occurrence.lineId;
        next.childItemId = occurrence.childItemId;
        next.qty = qty;
        next.uom = 'pcs';
        next.unitFrom = occurrence.unitFrom;
        next.unitTo = occurrence.unitTo;
        next.ecnInId = ecn.id;
        next.effectiveFrom = effectiveDate;
        await next.save();
      }
      ecn.state = 'released';
      await ecn.save();
      return ecn;
    };

    it('P1-6 影响面与差异按成员头自身的 (bomType, orgId) 作用域计算：多组织 / 多类型不串用 org-x EBOM', async () => {
      // B：org-x EBOM（T2 使用，不改）与 org-y MBOM（T 使用，ECN 改量 5→7）；D：org-x EBOM（T3 使用，ECN 改量 1→4）
      const t = await makeItem('sc-t');
      const t2 = await makeItem('sc-t2');
      const t3 = await makeItem('sc-t3');
      const b = await makeItem('sc-b');
      const d = await makeItem('sc-d');
      const c = await makeItem('sc-c');
      const orgY = { bomType: 'mbom' as const, orgId: 'org-y' };
      const orgX = { bomType: 'ebom' as const, orgId: 'org-x' };
      await scopedHeader(b, orgX, [{ child: c, occurrences: [{ qty: '2' }] }]);
      const bMbom = await scopedHeader(b, orgY, [{ child: c, occurrences: [{ qty: '5' }] }]);
      const dEbom = await scopedHeader(d, orgX, [{ child: c }]);
      await scopedHeader(t, orgY, [{ child: b }]);
      await scopedHeader(t2, orgX, [{ child: b }]);
      await scopedHeader(t3, orgX, [{ child: d }]);
      const ecn = await releasedEcn(day('2027-05-01'), [
        { occurrence: bMbom.occurrences[0][0], qty: '7' },
        { occurrence: dEbom.occurrences[0][0], qty: '4' }
      ]);

      const impact = await ecnImpact(adapter, ecn.id);
      expect([...impact.affectedItemIds].sort()).toEqual([b.id, d.id].sort());
      expect(impact.topItems.map(top => top.itemId).sort()).toEqual([t.id, t3.id].sort());

      const diff = await ecnDiff(adapter, ecn.id);
      const byHeader = new Map(
        diff.headers.map(header => [
          header.headerId,
          header.entries.map(entry => [entry.kind, entry.before?.qty, entry.after?.qty])
        ])
      );
      expect(byHeader.get(bMbom.header.id)).toEqual([['qty_changed', '5', '7']]);
      expect(byHeader.get(dEbom.header.id)).toEqual([['qty_changed', '1', '4']]);
      expect(diff.headers).toHaveLength(2);
    });

    it('P2-4 M7 差异涉及的逻辑行解析不出唯一发生项即拒绝；未改动的多候选行不影响其它行的差异', async () => {
      const parent = await makeItem('m7-p');
      const child = await makeItem('m7-c');
      const other = await makeItem('m7-o');
      const header = await scopedHeader(parent, { bomType: 'ebom', orgId: 'org-x' }, [
        { child, occurrences: [{ unitTo: 100 }, { unitFrom: 101 }] },
        { child: other, occurrences: [{ qty: '2' }] }
      ]);
      // 只改普通行：多候选行两侧候选集相同，差异照常给出
      const plain = await releasedEcn(day('2027-05-01'), [{ occurrence: header.occurrences[1][0], qty: '4' }]);
      const plainDiff = await ecnDiff(adapter, plain.id);
      expect(plainDiff.headers.flatMap(entry => entry.entries.map(row => [row.kind, row.lineId]))).toEqual([
        ['qty_changed', header.lines[1].id]
      ]);
      // 改序列分段行：生效前后候选集不同，差异无法按行对齐 → 拒绝并点名
      const split = await releasedEcn(day('2027-07-01'), [{ occurrence: header.occurrences[0][0], qty: '3' }]);
      await expect(ecnDiff(adapter, split.id)).rejects.toThrow(BomResolutionError);
      await expect(ecnDiff(adapter, split.id)).rejects.toThrow(header.lines[0].id);
    });

    it('P2-5 ECN 标识走绑定参数：注入串不读出别的 ECN', async () => {
      const injected = `' OR '1'='1`;
      const notFound = backend === 'wa-sqlite' ? /ECN 不存在/ : /uuid/i;
      await expect(ecnImpact(adapter, injected)).rejects.toThrow(notFound);
      await expect(ecnDiff(adapter, injected)).rejects.toThrow(notFound);
    });
  });
}
