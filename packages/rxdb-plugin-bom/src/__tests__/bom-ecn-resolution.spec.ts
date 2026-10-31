/**
 * @fileoverview ECN 可见性回归测试（US-508 AC#12/#16 + US-515 可见性规则）
 *
 * 双后端（wa-sqlite / pglite）同断言：挂 draft ECN 的发生项发布前不入解析结果、
 * 发布后按生效日入结果；指向未发布 ECN 的截止标记不截止；可见性只看 as_of_date
 * 与 ECN 状态，同评估日两次解析逐字相同（等价于「拨钟不变」——宿主当日不进 SQL）。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomEcn, BomHeader, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import { loadHistory } from '../resolve/history-loader.js';
import type { ResolutionContext } from '../resolve/resolution.js';
import { resolveBom } from '../resolve/resolver.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const context = (asOfDate: string): ResolutionContext => ({
  bomType: 'ebom',
  orgId: 'org-x',
  asOfDate: day(asOfDate)
});

for (const backend of BACKENDS) {
  describe(`ECN 可见性 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    const tableRef = (name: string): string => (backend === 'wa-sqlite' ? `"bom$${name}"` : `"bom"."${name}"`);

    /** 建已发布头（含一条 [2026-01-01, +∞) 的行发生项）；修订经 loadHistory 发布（过去生效日走审计通道）。 */
    const makeReleasedHeader = async (
      parent: BomItem,
      child: BomItem
    ): Promise<{ header: BomHeader; revision: BomItemRevision; line: BomLine; occurrence: BomLineOccurrence }> => {
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: parent.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: []
      });
      const rows = (await adapter.rawQuery(
        `SELECT "id" FROM ${tableRef('item_revision')} WHERE "itemId" = '${parent.id}'`
      )) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
      const shape = 'results' in rows ? rows.results[0] : rows;
      const revision = new BomItemRevision();
      (revision as unknown as { id: string }).id = String(shape.rows[0][0]);
      const header = new BomHeader();
      header.parentRevisionId = revision.id;
      header.bomType = 'ebom';
      header.orgId = 'org-x';
      await header.save();
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = 10;
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = child.id;
      occurrence.qty = '1';
      occurrence.uom = 'pcs';
      occurrence.effectiveFrom = day('2026-01-01');
      await occurrence.save();
      header.state = 'released';
      await header.save();
      return { header, revision, line, occurrence };
    };

    const makeItem = async (itemNo: string): Promise<BomItem> => {
      const item = new BomItem();
      item.itemNo = `${itemNo}-${Math.random().toString(36).slice(2, 8)}`;
      await item.save();
      return item;
    };

    const makeEcn = async (prefix: string, effectiveDate: string): Promise<BomEcn> => {
      const ecn = new BomEcn();
      ecn.ecnNo = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
      ecn.effectiveDate = day(effectiveDate);
      await ecn.save();
      return ecn;
    };

    it('US-508 AC#12 挂 draft ECN 的新发生项：发布前不入结果，发布后按生效日入结果', async () => {
      const parent = await makeItem('v12-p');
      const child = await makeItem('v12-c');
      const { header, revision } = await makeReleasedHeader(parent, child);
      const ecn = await makeEcn('v12', '2026-11-01');
      // 新逻辑行挂 draft ECN + 发生项
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = 20;
      line.ecnInId = ecn.id;
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = child.id;
      occurrence.qty = '2';
      occurrence.uom = 'pcs';
      occurrence.ecnInId = ecn.id;
      occurrence.effectiveFrom = day('2026-11-01');
      await occurrence.save();
      // 发布前按 2026-12-01 解析：看不到
      const before = await resolveBom(adapter, context('2026-12-01'), { parentRevisionId: revision.id });
      expect(before.occurrences).toHaveLength(1);
      expect(before.occurrences[0].qty).toBe('1');
      // 发布 ECN（T005 前直连转移；生效日在未来，追溯检查通过）
      await adapter.rawQuery(`UPDATE ${tableRef('ecn')} SET "state" = 'released' WHERE "id" = '${ecn.id}'`);
      // 发布后按 2026-12-01 解析：新发生项入结果
      const after = await resolveBom(adapter, context('2026-12-01'), { parentRevisionId: revision.id });
      expect(after.occurrences).toHaveLength(2);
      expect(after.occurrences.find(o => o.qty === '2')).toBeDefined();
      // 按 2026-10-15 解析：生效前仍只有旧发生项
      const past = await resolveBom(adapter, context('2026-10-15'), { parentRevisionId: revision.id });
      expect(past.occurrences).toHaveLength(1);
      expect(past.occurrences[0].qty).toBe('1');
    });

    it('US-508 AC#16 未发布 ECN 的截止不截止：截止标记不改变解析，同评估日两次解析逐字相同', async () => {
      const parent = await makeItem('v16-p');
      const child = await makeItem('v16-c');
      const { revision, occurrence } = await makeReleasedHeader(parent, child);
      const ecn = await makeEcn('v16', '2026-11-01');
      // draft ECN 打截止标记：存储区间收窄为 [2026-01-01, 2026-11-01)
      occurrence.ecnOutId = ecn.id;
      occurrence.effectiveTo = day('2026-11-01');
      await occurrence.save();
      // 截止未发布 → 不采信：按 2026-12-01 解析仍得旧发生项
      const result = await resolveBom(adapter, context('2026-12-01'), { parentRevisionId: revision.id });
      expect(result.occurrences).toHaveLength(1);
      expect(result.occurrences[0].occurrenceId).toBe(occurrence.id);
      // 同评估日两次解析逐字相同（可见性只看 as_of_date 与 ECN 状态，不读宿主当日）
      const again = await resolveBom(adapter, context('2026-12-01'), { parentRevisionId: revision.id });
      expect(JSON.stringify(again)).toBe(JSON.stringify(result));
      // 发布后截止采信：12-01 不再返回该发生项
      await adapter.rawQuery(`UPDATE ${tableRef('ecn')} SET "state" = 'released' WHERE "id" = '${ecn.id}'`);
      const released = await resolveBom(adapter, context('2026-12-01'), { parentRevisionId: revision.id });
      expect(released.occurrences).toHaveLength(0);
      // 10-15（截止日之前）仍可见
      const past = await resolveBom(adapter, context('2026-10-15'), { parentRevisionId: revision.id });
      expect(past.occurrences).toHaveLength(1);
    });

    it('US-515 AC#6 两个 ECN 先后生效：同一逻辑行按生效日形成不重叠的时间序列', async () => {
      const parent = await makeItem('v6-p');
      const child = await makeItem('v6-c');
      const { revision, line, occurrence } = await makeReleasedHeader(parent, child);
      // ECN A（2026-11-01）：o1 → o2
      const ecnA = await makeEcn('v6a', '2026-11-01');
      occurrence.ecnOutId = ecnA.id;
      occurrence.effectiveTo = day('2026-11-01');
      await occurrence.save();
      const o2 = new BomLineOccurrence();
      o2.lineId = line.id;
      o2.childItemId = child.id;
      o2.qty = '2';
      o2.uom = 'pcs';
      o2.ecnInId = ecnA.id;
      o2.effectiveFrom = day('2026-11-01');
      await o2.save();
      await adapter.rawQuery(`UPDATE ${tableRef('ecn')} SET "state" = 'released' WHERE "id" = '${ecnA.id}'`);
      // ECN B（2026-12-01）：o2 → o3
      const ecnB = await makeEcn('v6b', '2026-12-01');
      o2.ecnOutId = ecnB.id;
      o2.effectiveTo = day('2026-12-01');
      await o2.save();
      const o3 = new BomLineOccurrence();
      o3.lineId = line.id;
      o3.childItemId = child.id;
      o3.qty = '3';
      o3.uom = 'pcs';
      o3.ecnInId = ecnB.id;
      o3.effectiveFrom = day('2026-12-01');
      await o3.save();
      await adapter.rawQuery(`UPDATE ${tableRef('ecn')} SET "state" = 'released' WHERE "id" = '${ecnB.id}'`);
      // 三个评估日各得一段
      const at = async (iso: string): Promise<string | null> => {
        const result = await resolveBom(adapter, context(iso), { parentRevisionId: revision.id });
        return result.occurrences[0]?.qty ?? null;
      };
      expect(await at('2026-10-15')).toBe('1');
      expect(await at('2026-11-15')).toBe('2');
      expect(await at('2026-12-15')).toBe('3');
    });
  });
}
