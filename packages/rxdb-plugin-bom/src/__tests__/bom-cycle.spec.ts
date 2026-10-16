/**
 * @fileoverview 判环下沉存储层回归测试（US-509 首轮 AC#1/#2/#3/#5/#9/#10/#14/#17）
 *
 * 双后端（wa-sqlite / pglite）同断言：真环与自环拒绝且带路径、深度上限报错、直连 SQL 拒绝、
 * 跨类型 / 跨组织放行、草稿头反向边拒绝、union_only 标记。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomHeader, BomItem, BomLine, BomLineOccurrence } from '../entities.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomCycleError } from '../types.js';
import { BomTestAdapter, createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const tableRef = (backend: BomTestBackend, table: string): string =>
  backend === 'wa-sqlite' ? `"bom$${table}"` : `"bom"."${table}"`;

const settled = <T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> =>
  promise.then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error })
  );

for (const backend of BACKENDS) {
  describe(`判环 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    const makeItem = async (itemNo: string): Promise<BomItem> => {
      const item = new BomItem();
      item.itemNo = itemNo;
      await item.save();
      return item;
    };

    /**
     * 建已发布修订（历史日期经 loadHistory）+ **draft** 头；调用方加行发生项后自行 release。
     * 成员写入协议只在已发布头上生效，行必须先于发布写入。
     */
    const makeDraftHeaderFor = async (
      item: BomItem,
      bomType: 'ebom' | 'mbom' = 'ebom',
      orgId = 'org-x'
    ): Promise<BomHeader> => {
      // 已发布修订复用（同一物料同 effectiveFrom 的第二个已发布修订被部分唯一索引拒绝）；
      // 否则经 loadHistory 装载历史修订
      const existing = (await adapter.rawQuery(
        `SELECT r."id" AS "revisionId" FROM ${tableRef(backend, 'item_revision')} r WHERE r."itemId" = '${item.id}' AND r."state" = 'released'`
      )) as { results: { columns: string[]; rows: unknown[][] }[] } | { columns: string[]; rows: unknown[][] };
      const existingShape = 'results' in existing ? existing.results[0] : existing;
      let revisionId: string;
      if (existingShape.rows.length > 0) {
        revisionId = String(existingShape.rows[0][existingShape.columns.indexOf('revisionId')]);
      } else {
        await loadHistory(adapter, {
          batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
          revisions: [{ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
          headers: []
        });
        const rows = (await adapter.rawQuery(
          `SELECT r."id" AS "revisionId" FROM ${tableRef(backend, 'item_revision')} r WHERE r."itemId" = '${item.id}'`
        )) as { results: { columns: string[]; rows: unknown[][] }[] } | { columns: string[]; rows: unknown[][] };
        const shape = 'results' in rows ? rows.results[0] : rows;
        revisionId = String(shape.rows[0][shape.columns.indexOf('revisionId')]);
      }
      const header = new BomHeader();
      header.parentRevisionId = revisionId;
      header.bomType = bomType;
      header.orgId = orgId;
      await header.save();
      return header;
    };

    const release = async (header: BomHeader): Promise<void> => {
      header.state = 'released';
      await header.save();
    };

    /** 建草稿头 + 行 + 发生项（返回未保存的发生项）。 */
    const draftOccurrence = async (
      header: BomHeader,
      child: BomItem,
      overrides: Partial<BomLineOccurrence> = {}
    ): Promise<BomLineOccurrence> => {
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = 10 + Math.floor(Math.random() * 1000);
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = child.id;
      occurrence.qty = '1';
      occurrence.effectiveFrom = day('2020-01-01');
      Object.assign(occurrence, overrides);
      await occurrence.save();
      return occurrence;
    };

    it('A→B→C 已存在时插入 C→A 被拒并携带环路径（AC#1）', async () => {
      const a = await makeItem(`cyc-a-${Math.random().toString(36).slice(2, 6)}`);
      const b = await makeItem(`cyc-b-${Math.random().toString(36).slice(2, 6)}`);
      const c = await makeItem(`cyc-c-${Math.random().toString(36).slice(2, 6)}`);
      const headerA = await makeDraftHeaderFor(a);
      const headerB = await makeDraftHeaderFor(b);
      await draftOccurrence(headerA, b);
      await release(headerA);
      await draftOccurrence(headerB, c);
      await release(headerB);

      const headerC = await makeDraftHeaderFor(c);
      // 插入边的那张头保持草稿：已发布头的成员写入先被协议拒绝，轮不到判环；
      // 草稿头在并集里（AC#17 同因），判环触发器对解析不可见的边同样生效
      const error = await settled(draftOccurrence(headerC, a));
      expect(error.ok).toBe(false);
      const cycle = (error as { error: BomCycleError }).error;
      expect(cycle).toBeInstanceOf(BomCycleError);
      expect(cycle.path).toEqual([a.id, b.id, c.id]);
      expect(cycle.unionOnly).toBe(false);
    });

    it('自环（child = parent）由同一触发器拒绝，路径为单个物料（AC#2）', async () => {
      const a = await makeItem(`self-a-${Math.random().toString(36).slice(2, 6)}`);
      // 插入边保持草稿（已发布头先撞协议）
      const header = await makeDraftHeaderFor(a);
      const result = await settled(draftOccurrence(header, a));
      expect(result.ok).toBe(false);
      expect((result as { error: BomCycleError }).error).toBeInstanceOf(BomCycleError);
      expect((result as { error: BomCycleError }).error.path).toEqual([a.id]);
    });

    it('深度上限触发时报错不静默通过（AC#3）', async () => {
      // 造 130 层链（i1→i2→…→i130），再从新父件 P 引用 i1：i1 的子树超出深度上限
      const chain: BomItem[] = [];
      for (let index = 0; index < 130; index++) {
        chain.push(await makeItem(`chain-${Math.random().toString(36).slice(2, 6)}-${index}`));
      }
      for (let index = 0; index < chain.length - 1; index++) {
        const header = await makeDraftHeaderFor(chain[index]);
        await draftOccurrence(header, chain[index + 1]);
        await release(header);
      }
      const parent = await makeItem(`chain-parent-${Math.random().toString(36).slice(2, 6)}`);
      const parentHeader = await makeDraftHeaderFor(parent);
      const result = await settled(draftOccurrence(parentHeader, chain[0]));
      expect(result.ok).toBe(false);
      expect((result as { error: BomCycleError }).error).toBeInstanceOf(BomCycleError);
      expect((result as { error: BomCycleError }).error.path).toEqual([]);
    });

    it('绕过 adapter 直连写库仍被拒（AC#5）', async () => {
      const a = await makeItem(`raw-a-${Math.random().toString(36).slice(2, 6)}`);
      const b = await makeItem(`raw-b-${Math.random().toString(36).slice(2, 6)}`);
      const headerA = await makeDraftHeaderFor(a);
      await draftOccurrence(headerA, b);
      await release(headerA);
      // 草稿头：直连插入绕不过判环触发器（已发布头会先撞协议，测不到环）
      const headerB = await makeDraftHeaderFor(b);
      const line = new BomLine();
      line.headerId = headerB.id;
      line.lineNo = 99;
      await line.save();
      const raw = await settled(
        adapter.rawQuery(
          // PG 的 id 列是 uuid 类型，假 id 必须也是合法 uuid，否则类型转换先于触发器报错
          `INSERT INTO ${tableRef(backend, 'bom_line_occurrence')} ("id", "lineId", "childItemId", "qty", "effectiveFrom", "createdAt", "updatedAt") VALUES ('${crypto.randomUUID()}', '${line.id}', '${a.id}', '1', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')`
        )
      );
      expect(raw.ok).toBe(false);
      expect(String((raw as { error: Error }).error.message)).toContain('rxdb:bom_cycle');
    });

    it('跨 bom_type 不判环（AC#10）、跨 org 不判环（AC#14 前提）', async () => {
      const a = await makeItem(`scope-a-${Math.random().toString(36).slice(2, 6)}`);
      const b = await makeItem(`scope-b-${Math.random().toString(36).slice(2, 6)}`);
      // org-x：EBOM A→B；org-y：EBOM B→A —— 均接受
      const headerAx = await makeDraftHeaderFor(a, 'ebom', 'org-x');
      await draftOccurrence(headerAx, b);
      await release(headerAx);
      const headerBy = await makeDraftHeaderFor(b, 'ebom', 'org-y');
      await expect(draftOccurrence(headerBy, a).then(() => undefined)).resolves.toBeUndefined();
      // EBOM A→B 与 MBOM B→A —— 接受（作用域是 (bom_type, org_id)）
      const headerBm = await makeDraftHeaderFor(b, 'mbom', 'org-x');
      await expect(draftOccurrence(headerBm, a).then(() => undefined)).resolves.toBeUndefined();
    });

    it('草稿头下的反向边同样被拒（AC#17）', async () => {
      const a = await makeItem(`draft-a-${Math.random().toString(36).slice(2, 6)}`);
      const b = await makeItem(`draft-b-${Math.random().toString(36).slice(2, 6)}`);
      const headerA = await makeDraftHeaderFor(a);
      await draftOccurrence(headerA, b);
      await release(headerA);
      // bHeader 本身就是草稿头：解析不可见但判环可见，B→A 被拒
      const bHeader = await makeDraftHeaderFor(b);
      const result = await settled(draftOccurrence(bHeader, a));
      expect(result.ok).toBe(false);
      expect((result as { error: BomCycleError }).error).toBeInstanceOf(BomCycleError);
    });

    it('union_only 分析合并多段区间：并集合并后仍无共同时点（AC#9 扩展）', async () => {
      const a = await makeItem(`uo2-a-${Math.random().toString(36).slice(2, 6)}`);
      const b = await makeItem(`uo2-b-${Math.random().toString(36).slice(2, 6)}`);
      const c = await makeItem(`uo2-c-${Math.random().toString(36).slice(2, 6)}`);
      // A→B 两段相邻窗口（同一逻辑行），B→C 两段重叠窗口（不同行，并集合并）
      const headerA = await makeDraftHeaderFor(a);
      const lineA = new BomLine();
      lineA.headerId = headerA.id;
      lineA.lineNo = 10;
      await lineA.save();
      const first = new BomLineOccurrence();
      first.lineId = lineA.id;
      first.childItemId = b.id;
      first.qty = '1';
      first.effectiveFrom = day('2026-01-01');
      first.effectiveTo = day('2026-06-01');
      await first.save();
      const second = new BomLineOccurrence();
      second.lineId = lineA.id;
      second.childItemId = b.id;
      second.qty = '1';
      second.effectiveFrom = day('2026-08-01');
      second.effectiveTo = null;
      await second.save();
      await release(headerA);
      const headerB = await makeDraftHeaderFor(b);
      await draftOccurrence(headerB, c, { effectiveFrom: day('2026-01-01'), effectiveTo: day('2026-03-01') });
      await draftOccurrence(headerB, c, { effectiveFrom: day('2026-02-01'), effectiveTo: null });
      await release(headerB);
      // C→A 落在 A→B 的窗口间隙 [06-01, 08-01)：任一时点都无环，并集有环
      const headerC = await makeDraftHeaderFor(c);
      const result = await settled(
        draftOccurrence(headerC, a, { effectiveFrom: day('2026-06-01'), effectiveTo: day('2026-08-01') })
      );
      expect(result.ok).toBe(false);
      const cycle = (result as { error: BomCycleError }).error;
      expect(cycle).toBeInstanceOf(BomCycleError);
      expect(cycle.unionOnly).toBe(true);
    });

    it('跨时段互斥的反向边被拒并附 union_only（AC#9）', async () => {
      const a = await makeItem(`uo-a-${Math.random().toString(36).slice(2, 6)}`);
      const b = await makeItem(`uo-b-${Math.random().toString(36).slice(2, 6)}`);
      const headerA = await makeDraftHeaderFor(a);
      await draftOccurrence(headerA, b, { effectiveFrom: day('2026-01-01'), effectiveTo: day('2026-10-01') });
      await release(headerA);
      const headerB = await makeDraftHeaderFor(b);
      const result = await settled(
        draftOccurrence(headerB, a, { effectiveFrom: day('2026-10-01'), effectiveTo: null })
      );
      expect(result.ok).toBe(false);
      const cycle = (result as { error: BomCycleError }).error;
      expect(cycle).toBeInstanceOf(BomCycleError);
      expect(cycle.unionOnly).toBe(true);
    });
  });
}
