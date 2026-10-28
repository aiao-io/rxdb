/**
 * @fileoverview union_only 标记与判环触发器同作用域（评审 P1-7）
 *
 * 判环触发器只在被拒写入所在头的 `(bom_type, org_id)` 内、按 consume 边判环；union_only 的区间
 * 分析必须读同一张图：别的组织 / 类型的同物料对、非 consume 的反向物料流都不进边区间，闭合边的
 * 区间并集恒含被拒写入本身。双后端同断言。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomHeader, BomItem, BomLine, BomLineOccurrence } from '../entities.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomCycleError } from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

for (const backend of BACKENDS) {
  describe(`union_only 作用域 [${backend}]`, () => {
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

    /** 草稿头（判环对草稿头同样生效，已发布头的成员写入会先撞写入协议）。 */
    const draftHeader = async (item: BomItem, bomType: 'ebom' | 'mbom', orgId: string): Promise<BomHeader> => {
      const rows = (await adapter.rawQuery(
        `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${item.id}'`
      )) as unknown as { rows: unknown[][] };
      const header = new BomHeader();
      header.parentRevisionId = String(rows.rows[0][0]);
      header.bomType = bomType;
      header.orgId = orgId;
      await header.save();
      return header;
    };

    const addOccurrence = async (
      header: BomHeader,
      child: BomItem,
      overrides: Partial<BomLineOccurrence>
    ): Promise<BomLineOccurrence> => {
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = 10 + Math.floor(Math.random() * 100000);
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = child.id;
      occurrence.qty = '1';
      Object.assign(occurrence, overrides);
      await occurrence.save();
      return occurrence;
    };

    const rejectedCycle = async (write: Promise<unknown>): Promise<BomCycleError> => {
      const error = await write.then(
        () => undefined,
        (failure: unknown) => failure
      );
      expect(error).toBeInstanceOf(BomCycleError);
      return error as BomCycleError;
    };

    it('别的组织里同物料对的历史区间不顶替闭合边：真环不被误标 union_only', async () => {
      const a = await makeItem('uo-org-a');
      const b = await makeItem('uo-org-b');
      await addOccurrence(await draftHeader(a, 'ebom', 'org-x'), b, { effectiveFrom: day('2026-01-01') });
      // org-y 的 B→A 只在 2020 年生效（跨组织不判环，照常落库）
      await addOccurrence(await draftHeader(b, 'ebom', 'org-y'), a, {
        effectiveFrom: day('2020-01-01'),
        effectiveTo: day('2021-01-01')
      });
      const cycle = await rejectedCycle(
        addOccurrence(await draftHeader(b, 'ebom', 'org-x'), a, { effectiveFrom: day('2026-01-01') })
      );
      expect(cycle.path).toEqual([a.id, b.id]);
      expect(cycle.unionOnly).toBe(false);
    });

    it('别的类型里同物料对的区间不并入路径边：跨期互斥的并集环仍标 union_only', async () => {
      const a = await makeItem('uo-type-a');
      const b = await makeItem('uo-type-b');
      await addOccurrence(await draftHeader(a, 'ebom', 'org-x'), b, {
        effectiveFrom: day('2026-01-01'),
        effectiveTo: day('2026-06-01')
      });
      // MBOM 的 A→B 从 06-01 起接续（跨类型不判环）：若并入 EBOM 的边区间，会把 [01-01, 06-01) 补成无界
      await addOccurrence(await draftHeader(a, 'mbom', 'org-x'), b, { effectiveFrom: day('2026-06-01') });
      const cycle = await rejectedCycle(
        addOccurrence(await draftHeader(b, 'ebom', 'org-x'), a, { effectiveFrom: day('2026-07-01') })
      );
      expect(cycle.path).toEqual([a.id, b.id]);
      expect(cycle.unionOnly).toBe(true);
    });

    it('同头里非 consume 的反向物料流不进边区间：闭合边恒含被拒写入本身', async () => {
      const a = await makeItem('uo-flow-a');
      const b = await makeItem('uo-flow-b');
      await addOccurrence(await draftHeader(a, 'ebom', 'org-x'), b, { effectiveFrom: day('2026-01-01') });
      const headerB = await draftHeader(b, 'ebom', 'org-x');
      // B 头的副产 A 只在 2020 年（by_product 是反向物料流，不进并集图）
      await addOccurrence(headerB, a, {
        flowDirection: 'by_product',
        effectiveFrom: day('2020-01-01'),
        effectiveTo: day('2021-01-01')
      });
      const cycle = await rejectedCycle(addOccurrence(headerB, a, { effectiveFrom: day('2026-01-01') }));
      expect(cycle.path).toEqual([a.id, b.id]);
      expect(cycle.unionOnly).toBe(false);
    });
  });
}
