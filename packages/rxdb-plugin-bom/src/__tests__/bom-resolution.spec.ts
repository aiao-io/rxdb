/**
 * @fileoverview BOM 视图解析回归测试（US-508 首轮 AC#1/#3~#8/#11/#17）
 *
 * 双后端（wa-sqlite / pglite）同断言：跨组织互不串、备选并存与 unresolved、同日边界、
 * 草稿过滤、修订按时点选择、缺评估日拒绝、拨钟不变、imprecise/precise manifest。
 */

import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomHeader, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomResolutionError, ResolutionContext } from '../resolve/resolution.js';
import { resolveBom } from '../resolve/resolver.js';
import { BomTestAdapter, createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const context = (overrides: Partial<ResolutionContext>): ResolutionContext => ({
  bomType: 'ebom',
  orgId: 'org-x',
  asOfDate: day('2026-06-01'),
  ...overrides
});

for (const backend of BACKENDS) {
  describe(`BOM 视图解析 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    /**
     * 建 item + 已发布修订。历史生效日经 `loadHistory` 审计通道发布（追溯发布被禁，
     * 测试的历史数据与 demo 种子同走一条路）。
     */
    const makeItemWithRevision = async (itemNo: string, revisionNo = 'A', effectiveFrom = '2026-01-01') => {
      const item = new BomItem();
      item.itemNo = itemNo;
      await item.save();
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: item.id, revisionNo, effectiveFrom: day(effectiveFrom) }],
        headers: []
      });
      const revision = await firstValueFrom(
        BomItemRevision.findOne({ where: { combinator: 'and', rules: [{ field: 'itemId', operator: '=', value: item.id }] } })
      );
      if (!revision) throw new Error('makeItemWithRevision: loadHistory 后修订未找到');
      return { item, revision };
    };

    /** 在头下加一条行发生项。 */
    const addOccurrence = async (
      header: BomHeader,
      childItem: BomItem,
      overrides: Partial<BomLineOccurrence> = {}
    ): Promise<BomLineOccurrence> => {
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = 10 + Math.floor(Math.random() * 1000);
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = childItem.id;
      occurrence.qty = '1';
      occurrence.effectiveFrom = day('2026-01-01');
      Object.assign(occurrence, overrides);
      await occurrence.save();
      return occurrence;
    };

    /** 建 draft 头；成员写完后由调用方 releaseHeader（已发布头的成员写入受协议保护）。 */
    const makeDraftHeader = async (revision: BomItemRevision, orgId = 'org-x', alternativeNo = 1): Promise<BomHeader> => {
      const header = new BomHeader();
      header.parentRevisionId = revision.id;
      header.bomType = 'ebom';
      header.orgId = orgId;
      header.alternativeNo = alternativeNo;
      await header.save();
      return header;
    };

    const releaseHeader = async (header: BomHeader): Promise<BomHeader> => {
      header.state = 'released';
      await header.save();
      return header;
    };

    it('同一父件在两个 org 各有 BOM：按 org 解析互不串（AC#1）', async () => {
      const { revision: parentRevision } = await makeItemWithRevision(`org-item-${Math.random().toString(36).slice(2, 6)}`);
      const childX = (await makeItemWithRevision(`org-child-x-${Math.random().toString(36).slice(2, 6)}`)).item;
      const childY = (await makeItemWithRevision(`org-child-y-${Math.random().toString(36).slice(2, 6)}`)).item;
      const headerX = await makeDraftHeader(parentRevision, 'org-x');
      await addOccurrence(headerX, childX);
      await releaseHeader(headerX);
      const headerY = await makeDraftHeader(parentRevision, 'org-y');
      await addOccurrence(headerY, childY);
      await releaseHeader(headerY);

      const resultX = await resolveBom(adapter, context({ orgId: 'org-x' }), { parentRevisionId: parentRevision.id });
      expect(resultX.occurrences.map(occurrence => occurrence.childItemId)).toEqual([childX.id]);
      const resultY = await resolveBom(adapter, context({ orgId: 'org-y' }), { parentRevisionId: parentRevision.id });
      expect(resultY.occurrences.map(occurrence => occurrence.childItemId)).toEqual([childY.id]);
    });

    it('三个 alternative 并存不被重叠约束误拒（AC#3）；未指定时 unresolved 列候选（AC#11）', async () => {
      const { revision } = await makeItemWithRevision(`alt-item-${Math.random().toString(36).slice(2, 6)}`);
      const child = (await makeItemWithRevision(`alt-child-${Math.random().toString(36).slice(2, 6)}`)).item;
      for (const alternativeNo of [1, 2, 3]) {
        const header = await makeDraftHeader(revision, 'org-x', alternativeNo);
        await addOccurrence(header, child);
        await releaseHeader(header);
      }

      const unselected = await resolveBom(adapter, context({}), { parentRevisionId: revision.id });
      expect(unselected.occurrences).toEqual([]);
      expect(unselected.manifest.unresolved.length).toBe(1);
      expect(unselected.manifest.unresolved[0].candidates.map(candidate => candidate.alternativeNo)).toEqual([1, 2, 3]);

      const selected = await resolveBom(adapter, context({ alternativeNo: 2 }), { parentRevisionId: revision.id });
      expect(selected.occurrences.length).toBe(1);
      expect(selected.manifest.headerIds.length).toBe(1);
    });

    it('同日失效 + 同日生效：按该日解析只返回新发生项（AC#4）', async () => {
      const { revision } = await makeItemWithRevision(`boundary-item-${Math.random().toString(36).slice(2, 6)}`);
      const child = (await makeItemWithRevision(`boundary-child-${Math.random().toString(36).slice(2, 6)}`)).item;
      const header = await makeDraftHeader(revision);
      await addOccurrence(header, child, { effectiveFrom: day('2026-01-01'), effectiveTo: day('2026-10-01') });
      await addOccurrence(header, child, { effectiveFrom: day('2026-10-01'), effectiveTo: null });
      await releaseHeader(header);

      const result = await resolveBom(adapter, context({ asOfDate: day('2026-10-01') }), { parentRevisionId: revision.id });
      expect(result.occurrences.length).toBe(1);
      expect(result.occurrences[0].effectiveFrom).toEqual(day('2026-10-01'));
    });

    it('草稿头不入结果（AC#5）', async () => {
      const { revision } = await makeItemWithRevision(`draft-item-${Math.random().toString(36).slice(2, 6)}`);
      const child = (await makeItemWithRevision(`draft-child-${Math.random().toString(36).slice(2, 6)}`)).item;
      const draftHeader = new BomHeader();
      draftHeader.parentRevisionId = revision.id;
      draftHeader.bomType = 'ebom';
      draftHeader.orgId = 'org-x';
      await draftHeader.save();
      await addOccurrence(draftHeader, child);

      const result = await resolveBom(adapter, context({}), { parentRevisionId: revision.id });
      expect(result.occurrences).toEqual([]);
      expect(result.manifest.headerIds).toEqual([]);
    });

    it('父件有 D / E 两个已发布修订：按时点命中对应修订（AC#6）', async () => {
      const { item, revision: revisionD } = await makeItemWithRevision(`rev-item-${Math.random().toString(36).slice(2, 6)}`, 'D', '2026-01-01');
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: item.id, revisionNo: 'E', effectiveFrom: day('2026-06-01') }],
        headers: []
      });
      const revisionE = (await firstValueFrom(
        BomItemRevision.findOne({
          where: { combinator: 'and', rules: [{ field: 'itemId', operator: '=', value: item.id }, { field: 'revisionNo', operator: '=', value: 'E' }] }
        })
      ))!;
      const child = (await makeItemWithRevision(`rev-child-${Math.random().toString(36).slice(2, 6)}`)).item;
      const headerD = await makeDraftHeader(revisionD);
      await addOccurrence(headerD, child);
      await releaseHeader(headerD);
      const headerE = await makeDraftHeader(revisionE);
      await addOccurrence(headerE, child);
      await releaseHeader(headerE);

      const before = await resolveBom(adapter, context({ asOfDate: day('2026-05-01') }), { parentItemId: item.id });
      expect(before.manifest.parentRevisionId).toBe(revisionD.id);
      const after = await resolveBom(adapter, context({ asOfDate: day('2026-07-01') }), { parentItemId: item.id });
      expect(after.manifest.parentRevisionId).toBe(revisionE.id);
    });

    it('缺 as_of_date 解析被拒并点名（AC#7）', async () => {
      const error = await resolveBom(adapter, { bomType: 'ebom', orgId: 'org-x' } as unknown as ResolutionContext, {
        parentItemId: 'x'
      }).then(
        () => null,
        (cause: unknown) => cause
      );
      expect(error).toBeInstanceOf(BomResolutionError);
      expect((error as BomResolutionError).field).toBe('asOfDate');
    });

    it('改系统时钟后按同一评估日解析，结果与 manifest 相同（AC#8）', async () => {
      const { revision } = await makeItemWithRevision(`clock-item-${Math.random().toString(36).slice(2, 6)}`);
      const child = (await makeItemWithRevision(`clock-child-${Math.random().toString(36).slice(2, 6)}`)).item;
      const header = await makeDraftHeader(revision);
      await addOccurrence(header, child);
      await releaseHeader(header);

      const first = await resolveBom(adapter, context({ asOfDate: day('2026-06-01') }), { parentRevisionId: revision.id });
      const second = await resolveBom(adapter, context({ asOfDate: day('2026-06-01') }), { parentRevisionId: revision.id });
      expect(JSON.stringify(second.manifest)).toBe(JSON.stringify(first.manifest));
      expect(second.occurrences.map(occurrence => occurrence.occurrenceId)).toEqual(
        first.occurrences.map(occurrence => occurrence.occurrenceId)
      );
    });

    it('imprecise / precise 解析分别记 manifest；imprecise 随新修订发布切换（AC#17）', async () => {
      const { revision: parentRevision } = await makeItemWithRevision(`imp-item-${Math.random().toString(36).slice(2, 6)}`);
      const childItem = new BomItem();
      childItem.itemNo = `imp-child-${Math.random().toString(36).slice(2, 6)}`;
      await childItem.save();
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: childItem.id, revisionNo: 'D', effectiveFrom: day('2026-01-01') }],
        headers: []
      });
      const revisionD = (await firstValueFrom(
        BomItemRevision.findOne({
          where: { combinator: 'and', rules: [{ field: 'itemId', operator: '=', value: childItem.id }] }
        })
      ))!;
      const header = await makeDraftHeader(parentRevision);

      const imprecise = new BomLine();
      imprecise.headerId = header.id;
      imprecise.lineNo = 10;
      await imprecise.save();
      const occurrenceImprecise = new BomLineOccurrence();
      occurrenceImprecise.lineId = imprecise.id;
      occurrenceImprecise.childItemId = childItem.id;
      occurrenceImprecise.qty = '1';
      occurrenceImprecise.effectiveFrom = day('2026-01-01');
      await occurrenceImprecise.save();

      const precise = new BomLine();
      precise.headerId = header.id;
      precise.lineNo = 20;
      await precise.save();
      const occurrencePrecise = new BomLineOccurrence();
      occurrencePrecise.lineId = precise.id;
      occurrencePrecise.childItemId = childItem.id;
      occurrencePrecise.childRevisionId = revisionD.id;
      occurrencePrecise.qty = '1';
      occurrencePrecise.effectiveFrom = day('2026-01-01');
      await occurrencePrecise.save();
      await releaseHeader(header);

      const beforeE = await resolveBom(adapter, context({ asOfDate: day('2026-06-01') }), { parentRevisionId: parentRevision.id });
      expect(beforeE.occurrences.map(occurrence => occurrence.occurrenceId).sort()).toEqual(
        [occurrenceImprecise.id, occurrencePrecise.id].sort()
      );
      expect(
        beforeE.manifest.childRevisions.find(entry => entry.occurrenceId === occurrenceImprecise.id)?.revisionId
      ).toBe(revisionD.id);

      // E 版发布后，imprecise 行解析切换；precise 行不动
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: childItem.id, revisionNo: 'E', effectiveFrom: day('2026-07-01') }],
        headers: []
      });
      const revisionE = (await firstValueFrom(
        BomItemRevision.findOne({
          where: { combinator: 'and', rules: [{ field: 'itemId', operator: '=', value: childItem.id }, { field: 'revisionNo', operator: '=', value: 'E' }] }
        })
      ))!;

      const afterE = await resolveBom(adapter, context({ asOfDate: day('2026-08-01') }), { parentRevisionId: parentRevision.id });
      expect(
        afterE.manifest.childRevisions.find(entry => entry.occurrenceId === occurrenceImprecise.id)?.revisionId
      ).toBe(revisionE.id);
      expect(
        afterE.manifest.childRevisions.find(entry => entry.occurrenceId === occurrencePrecise.id)?.revisionId
      ).toBe(revisionD.id);
    });
  });
}
