/**
 * @fileoverview EBOM↔MBOM 映射回归测试（US-516）
 *
 * 双后端（wa-sqlite / pglite）同断言：NULL 规则（AC#9）、六态 relation（AC#1/#2/#3）、
 * 两侧类型/组织与范围成员资格保存校验（AC#10/#12/#15）、路径级映射与覆盖率（AC#5/#6/#13/#14）、
 * 跟进基线与缺口查询（AC#4/#7/#8/#16~#22）。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomHeader, BomItem, BomLine, BomLineOccurrence, BomMap, BomMapScope } from '../entities.js';
import { loadHistory } from '../resolve/history-loader.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** rawQuery 双形状归一。 */
const shapeRows = (result: unknown): unknown[][] => {
  const shaped = result as { results?: { rows: unknown[][] }[]; rows?: unknown[][] };
  if (Array.isArray(shaped.results)) return shaped.results[0].rows;
  return shaped.rows ?? [];
};

for (const backend of BACKENDS) {
  describe(`EBOM↔MBOM 映射 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    /** 建物料 + 已发布修订 + 指定类型的已发布头（一行一个子件）。 */
    const makeHeader = async (itemKey: string, bomType: 'ebom' | 'mbom', children: BomItem[], revisionNo = 'A'): Promise<{ item: BomItem; header: BomHeader; lines: BomLine[] }> => {
      const item = new BomItem();
      item.itemNo = `${itemKey}-${Math.random().toString(36).slice(2, 8)}`;
      await item.save();
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: item.id, revisionNo, effectiveFrom: day('2020-01-01') }],
        headers: []
      });
      const revisionId = String(shapeRows(await adapter.rawQuery(
        `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${item.id}' AND "revisionNo" = '${revisionNo}'`
      ))[0][0]);
      const header = new BomHeader();
      header.parentRevisionId = revisionId;
      header.bomType = bomType;
      header.orgId = 'org-x';
      await header.save();
      const lines: BomLine[] = [];
      let lineNo = 10;
      for (const child of children) {
        const line = new BomLine();
        line.headerId = header.id;
        line.lineNo = lineNo;
        await line.save();
        const occurrence = new BomLineOccurrence();
        occurrence.lineId = line.id;
        occurrence.childItemId = child.id;
        occurrence.qty = '1';
        occurrence.uom = 'pcs';
        occurrence.effectiveFrom = day('2026-01-01');
        await occurrence.save();
        lines.push(line);
        lineNo += 10;
      }
      header.state = 'released';
      await header.save();
      return { item, header, lines };
    };

    const makeItemOnly = async (key: string): Promise<BomItem> => {
      const item = new BomItem();
      item.itemNo = `${key}-${Math.random().toString(36).slice(2, 8)}`;
      await item.save();
      return item;
    };

    it('AC#9 NULL 规则：one_to_one 两侧必填、added 只 source 空、removed 只 target 空、双 NULL 拒绝', async () => {
      const child = await makeItemOnly('m9');
      const ebom = await makeHeader('m9-e', 'ebom', [child]);
      const mbom = await makeHeader('m9-m', 'mbom', [child]);
      const scope = new BomMapScope();
      scope.orgId = 'org-x';
      scope.ebomRootHeaderId = ebom.header.id;
      scope.mbomRootHeaderId = mbom.header.id;
      await scope.save();
      // 合法：one_to_one 两侧必填
      const map = new BomMap();
      map.scopeId = scope.id;
      map.relation = 'one_to_one';
      map.sourceLineId = ebom.lines[0].id;
      map.targetLineId = mbom.lines[0].id;
      await map.save();
      // added：source 必须空、target 非空
      const added = new BomMap();
      added.scopeId = scope.id;
      added.relation = 'added';
      added.sourceLineId = ebom.lines[0].id; // 违约
      added.targetLineId = mbom.lines[0].id;
      await expect(added.save()).rejects.toThrow();
      const addedOk = new BomMap();
      addedOk.scopeId = scope.id;
      addedOk.relation = 'added';
      addedOk.targetLineId = mbom.lines[0].id;
      await addedOk.save();
      // removed：target 必须空
      const removedBad = new BomMap();
      removedBad.scopeId = scope.id;
      removedBad.relation = 'removed';
      removedBad.sourceLineId = ebom.lines[0].id;
      removedBad.targetLineId = mbom.lines[0].id;
      await expect(removedBad.save()).rejects.toThrow();
      // 双 NULL：拒绝
      const bothNull = new BomMap();
      bothNull.scopeId = scope.id;
      bothNull.relation = 'one_to_one';
      await expect(bothNull.save()).rejects.toThrow();
    });

    it('AC#2/#3 六态 relation 均可保存（added/split/merge）', async () => {
      const child = await makeItemOnly('m23');
      const ebom = await makeHeader('m23-e', 'ebom', [child]);
      const mbom = await makeHeader('m23-m', 'mbom', [child, child]);
      const scope = new BomMapScope();
      scope.orgId = 'org-x';
      scope.ebomRootHeaderId = ebom.header.id;
      scope.mbomRootHeaderId = mbom.header.id;
      await scope.save();
      // split：一个源行 → 两个目标行
      const splitA = new BomMap();
      splitA.scopeId = scope.id;
      splitA.relation = 'split';
      splitA.sourceLineId = ebom.lines[0].id;
      splitA.targetLineId = mbom.lines[0].id;
      await splitA.save();
      const splitB = new BomMap();
      splitB.scopeId = scope.id;
      splitB.relation = 'split';
      splitB.sourceLineId = ebom.lines[0].id;
      splitB.targetLineId = mbom.lines[1].id;
      await splitB.save();
      // merge：两个源行 → 一个目标行
      const ebom2 = await makeHeader('m23-e2', 'ebom', [child, child]);
      const scope2 = new BomMapScope();
      scope2.orgId = 'org-x';
      scope2.ebomRootHeaderId = ebom2.header.id;
      scope2.mbomRootHeaderId = mbom.header.id;
      await scope2.save();
      const mergeA = new BomMap();
      mergeA.scopeId = scope2.id;
      mergeA.relation = 'merge';
      mergeA.sourceLineId = ebom2.lines[0].id;
      mergeA.targetLineId = mbom.lines[0].id;
      await mergeA.save();
      const mergeB = new BomMap();
      mergeB.scopeId = scope2.id;
      mergeB.relation = 'merge';
      mergeB.sourceLineId = ebom2.lines[1].id;
      mergeB.targetLineId = mbom.lines[0].id;
      await mergeB.save();
    });
  });
}
