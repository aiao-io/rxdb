/**
 * @fileoverview EBOM↔MBOM 映射回归测试（US-516）
 *
 * 双后端（wa-sqlite / pglite）同断言：NULL 规则（AC#9）、六态 relation（AC#1/#2/#3）、
 * 两侧类型/组织与范围成员资格保存校验（AC#10/#12/#15）、路径级映射与覆盖率（AC#5/#6/#13/#14）、
 * 跟进基线与缺口查询（AC#4/#7/#8/#16~#22）。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomEcn, BomHeader, BomItem, BomLine, BomLineOccurrence, BomMap, BomMapScope } from '../entities.js';
import {
  BomMapError,
  confirmMapping,
  mappingCoverage,
  mappingGaps,
  saveMapping,
  type MappingStep
} from '../resolve/bom-map.js';
import { loadHistory } from '../resolve/history-loader.js';
import type { ResolutionContext } from '../resolve/resolution.js';
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
    const makeHeader = async (
      itemKey: string,
      bomType: 'ebom' | 'mbom',
      children: BomItem[],
      revisionNo = 'A'
    ): Promise<{ item: BomItem; header: BomHeader; lines: BomLine[] }> => {
      const item = new BomItem();
      item.itemNo = `${itemKey}-${Math.random().toString(36).slice(2, 8)}`;
      await item.save();
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: item.id, revisionNo, effectiveFrom: day('2020-01-01') }],
        headers: []
      });
      const revisionId = String(
        shapeRows(
          await adapter.rawQuery(
            `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${item.id}' AND "revisionNo" = '${revisionNo}'`
          )
        )[0][0]
      );
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

describe('保存校验（AC#1/#10/#11/#12/#13/#15）', () => {
  for (const backend of BACKENDS) {
    describe(`[${backend}]`, () => {
      let adapter: BomTestAdapter;
      beforeAll(async () => {
        adapter = await createBomTestAdapter(backend);
      });
      afterAll(async () => {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      });

      const makeItemOnly = async (key: string): Promise<BomItem> => {
        const item = new BomItem();
        item.itemNo = `${key}-${Math.random().toString(36).slice(2, 8)}`;
        await item.save();
        return item;
      };

      /** 已发布头（类型指定、一行一子件；可带锁版）。 */
      const makeHeader = async (
        item: BomItem,
        bomType: 'ebom' | 'mbom',
        children: (BomItem | { child: BomItem; revisionNo: string })[]
      ): Promise<{ header: BomHeader; lines: BomLine[] }> => {
        const existing = shapeRows(
          await adapter.rawQuery(
            `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${item.id}'`
          )
        );
        if (existing.length === 0) {
          await loadHistory(adapter, {
            batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
            revisions: [{ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
            headers: []
          });
        }
        const revisionId = String(
          shapeRows(
            await adapter.rawQuery(
              `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${item.id}'`
            )
          )[0][0]
        );
        const header = new BomHeader();
        header.parentRevisionId = revisionId;
        header.bomType = bomType;
        header.orgId = 'org-x';
        await header.save();
        const lines: BomLine[] = [];
        let lineNo = 10;
        for (const entry of children) {
          const child = entry instanceof BomItem ? entry : entry.child;
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
          if (!(entry instanceof BomItem)) {
            // 锁版：childRevisionId 指向指定修订
            const revRows = shapeRows(
              await adapter.rawQuery(
                `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${child.id}' AND "revisionNo" = '${entry.revisionNo}'`
              )
            );
            occurrence.childRevisionId = String(revRows[0][0]);
          }
          await occurrence.save();
          lines.push(line);
          lineNo += 10;
        }
        header.state = 'released';
        await header.save();
        return { header, lines };
      };

      it('AC#1 split 双向可追溯：一条源行映射到两个目标行', async () => {
        const { saveMapping } = await import('../resolve/bom-map.js');
        const sheet = await makeItemOnly('s1');
        const ebomItem = await makeItemOnly('s1-e');
        const mbomItem = await makeItemOnly('s1-m');
        const ebom = await makeHeader(ebomItem, 'ebom', [sheet]);
        const mbom = await makeHeader(mbomItem, 'mbom', [sheet, sheet]);
        const scope = new BomMapScope();
        scope.orgId = 'org-x';
        scope.ebomRootHeaderId = ebom.header.id;
        scope.mbomRootHeaderId = mbom.header.id;
        await scope.save();
        await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'split',
          sourceLineId: ebom.lines[0].id,
          targetLineId: mbom.lines[0].id
        });
        await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'split',
          sourceLineId: ebom.lines[0].id,
          targetLineId: mbom.lines[1].id
        });
        // 双向可追溯：按源行 / 目标行都能查到映射
        const rows = shapeRows(
          await adapter.rawQuery(
            `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$bom_map"' : '"bom"."bom_map"'} WHERE "scopeId" = '${scope.id}'`
          )
        );
        expect(rows).toHaveLength(2);
      });

      it('AC#10 两侧类型不匹配或组织不符：拒绝并点名', async () => {
        const { saveMapping } = await import('../resolve/bom-map.js');
        const child = await makeItemOnly('s10');
        const ebomItem = await makeItemOnly('s10-e');
        const mbomItem = await makeItemOnly('s10-m');
        const ebom = await makeHeader(ebomItem, 'ebom', [child]);
        const mbom = await makeHeader(mbomItem, 'mbom', [child]);
        const scope = new BomMapScope();
        scope.orgId = 'org-x';
        scope.ebomRootHeaderId = ebom.header.id;
        scope.mbomRootHeaderId = mbom.header.id;
        await scope.save();
        // 源行属 MBOM 头 → 拒
        await expect(
          saveMapping(adapter, {
            scopeId: scope.id,
            relation: 'one_to_one',
            sourceLineId: mbom.lines[0].id,
            targetLineId: mbom.lines[0].id
          })
        ).rejects.toThrow(/EBOM|类型/);
      });

      it('AC#11 跨父层提升/下沉：即时父件不同不构成拒绝', async () => {
        const { saveMapping } = await import('../resolve/bom-map.js');
        const screw = await makeItemOnly('s11');
        const moduleItem = await makeItemOnly('s11-b');
        const machineItem = await makeItemOnly('s11-a');
        // EBOM：整机 A → 功能模块 B → 螺钉 C；MBOM 扁平：整机 A → 螺钉 C
        const ebomA = await makeHeader(machineItem, 'ebom', [moduleItem]);
        const ebomB = await makeHeader(moduleItem, 'ebom', [screw]);
        const mbomA = await makeHeader(machineItem, 'mbom', [screw]);
        const scope = new BomMapScope();
        scope.orgId = 'org-x';
        scope.ebomRootHeaderId = ebomA.header.id;
        scope.mbomRootHeaderId = mbomA.header.id;
        await scope.save();
        // C 的源行（父件 B）→ 目标行（父件 A）：即时父件不同，接受
        await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'one_to_one',
          sourceLineId: ebomB.lines[0].id,
          targetLineId: mbomA.lines[0].id
        });
        // 反向：下沉
        await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'one_to_one',
          sourceLineId: ebomA.lines[0].id,
          targetLineId: mbomA.lines[0].id
        });
      });

      it('AC#12 源行所在头不可由范围根件到达：拒绝', async () => {
        const { saveMapping } = await import('../resolve/bom-map.js');
        const child = await makeItemOnly('s12');
        const ebomItem = await makeItemOnly('s12-e');
        const mbomItem = await makeItemOnly('s12-m');
        const outsideItem = await makeItemOnly('s12-x');
        const ebom = await makeHeader(ebomItem, 'ebom', [child]);
        const mbom = await makeHeader(mbomItem, 'mbom', [child]);
        const outside = await makeHeader(outsideItem, 'ebom', [child]);
        const scope = new BomMapScope();
        scope.orgId = 'org-x';
        scope.ebomRootHeaderId = ebom.header.id;
        scope.mbomRootHeaderId = mbom.header.id;
        await scope.save();
        await expect(
          saveMapping(adapter, {
            scopeId: scope.id,
            relation: 'one_to_one',
            sourceLineId: outside.lines[0].id,
            targetLineId: mbom.lines[0].id
          })
        ).rejects.toThrow(/到达|成员/);
      });

      it('AC#13 路径级映射：末元素不等于 sourceLineId 或中间断开的路径拒绝', async () => {
        const { saveMapping } = await import('../resolve/bom-map.js');
        const child = await makeItemOnly('s13');
        const ebomItem = await makeItemOnly('s13-e');
        const mbomItem = await makeItemOnly('s13-m');
        const ebom = await makeHeader(ebomItem, 'ebom', [child]);
        const mbom = await makeHeader(mbomItem, 'mbom', [child]);
        const scope = new BomMapScope();
        scope.orgId = 'org-x';
        scope.ebomRootHeaderId = ebom.header.id;
        scope.mbomRootHeaderId = mbom.header.id;
        await scope.save();
        // 末元素不是 sourceLineId
        await expect(
          saveMapping(adapter, {
            scopeId: scope.id,
            relation: 'split',
            sourceLineId: ebom.lines[0].id,
            targetLineId: mbom.lines[0].id,
            sourceLinePath: [ebom.lines[0].id, mbom.lines[0].id]
          })
        ).rejects.toThrow(/末元素/);
      });
    });
  }
});

describe('覆盖率查询（AC#5/#6/#13/#14）', () => {
  for (const backend of BACKENDS) {
    describe(`[${backend}]`, () => {
      let adapter: BomTestAdapter;
      beforeAll(async () => {
        adapter = await createBomTestAdapter(backend);
      });
      afterAll(async () => {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      });

      const makeItemOnly = async (key: string): Promise<BomItem> => {
        const item = new BomItem();
        item.itemNo = `${key}-${Math.random().toString(36).slice(2, 8)}`;
        await item.save();
        return item;
      };

      const makeHeader = async (
        item: BomItem,
        bomType: 'ebom' | 'mbom',
        children: BomItem[]
      ): Promise<{ header: BomHeader; lines: BomLine[] }> => {
        const existing = shapeRows(
          await adapter.rawQuery(
            `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${item.id}'`
          )
        );
        if (existing.length === 0) {
          await loadHistory(adapter, {
            batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
            revisions: [{ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
            headers: []
          });
        }
        const revisionId = String(
          shapeRows(
            await adapter.rawQuery(
              `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${item.id}'`
            )
          )[0][0]
        );
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
        return { header, lines };
      };

      it('AC#6 某 EBOM 行无任何映射：覆盖率报未覆盖，不静默视作 removed', async () => {
        const { mappingCoverage, saveMapping } = await import('../resolve/bom-map.js');
        const a = await makeItemOnly('c6-a');
        const b = await makeItemOnly('c6-b');
        const rootItem = await makeItemOnly('c6-root');
        const mRoot = await makeItemOnly('c6-mroot');
        const ebom = await makeHeader(rootItem, 'ebom', [a, b]);
        const mbom = await makeHeader(mRoot, 'mbom', [a, b]);
        const scope = new BomMapScope();
        scope.orgId = 'org-x';
        scope.ebomRootHeaderId = ebom.header.id;
        scope.mbomRootHeaderId = mbom.header.id;
        await scope.save();
        // 只映射 a 行
        await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'one_to_one',
          sourceLineId: ebom.lines[0].id,
          targetLineId: mbom.lines[0].id
        });
        const coverage = await mappingCoverage(adapter, scope.id, {
          bomType: 'ebom',
          orgId: 'org-x',
          asOfDate: day('2026-09-22')
        });
        expect(coverage.covered).toHaveLength(1);
        expect(coverage.uncovered).toHaveLength(1);
        expect(coverage.uncovered[0].lineId).toBe(ebom.lines[1].id);
        expect(coverage.invalid).toHaveLength(0);
      });

      it('AC#5 两侧各自展开：层级结构不同且各自自洽（覆盖率不受 MBOM 层级影响）', async () => {
        const { mappingCoverage, saveMapping } = await import('../resolve/bom-map.js');
        const screw = await makeItemOnly('c5-s');
        const moduleItem = await makeItemOnly('c5-b');
        const machineItem = await makeItemOnly('c5-a');
        const ebomA = await makeHeader(machineItem, 'ebom', [moduleItem]);
        const ebomB = await makeHeader(moduleItem, 'ebom', [screw]);
        const mbomA = await makeHeader(machineItem, 'mbom', [screw]);
        const scope = new BomMapScope();
        scope.orgId = 'org-x';
        scope.ebomRootHeaderId = ebomA.header.id;
        scope.mbomRootHeaderId = mbomA.header.id;
        await scope.save();
        // EBOM 侧两条路径（根行 → B 行）全部覆盖：根行映射 + B 行映射
        await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'one_to_one',
          sourceLineId: ebomA.lines[0].id,
          targetLineId: mbomA.lines[0].id
        });
        await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'one_to_one',
          sourceLineId: ebomB.lines[0].id,
          targetLineId: mbomA.lines[0].id
        });
        const coverage = await mappingCoverage(adapter, scope.id, {
          bomType: 'ebom',
          orgId: 'org-x',
          asOfDate: day('2026-09-22')
        });
        // EBOM 层级：根行 + B 行都覆盖；MBOM 扁平只有一行
        expect(coverage.uncovered).toHaveLength(0);
        expect(coverage.covered).toHaveLength(2);
      });

      it('AC#13 共享子装配：路径级映射只覆盖 P1，P2 报未覆盖', async () => {
        const { mappingCoverage, saveMapping } = await import('../resolve/bom-map.js');
        const s = await makeItemOnly('c13-s');
        const p1Item = await makeItemOnly('c13-p1');
        const p2Item = await makeItemOnly('c13-p2');
        const rootItem = await makeItemOnly('c13-root');
        const mRoot = await makeItemOnly('c13-mroot');
        // EBOM 根用 P1、P2 各一行；共享子装配 S 头（同一批行经两条路径出现）
        const ebomRoot = await makeHeader(rootItem, 'ebom', [p1Item, p2Item]);
        const ebomP1 = await makeHeader(p1Item, 'ebom', [s]);
        await makeHeader(p2Item, 'ebom', [s]); // P2 头建出即达意：共享 S 行经两条路径出现（覆盖查询自行走头链）
        const sPart = await makeItemOnly('c13-sp');
        const ebomS = await makeHeader(s, 'ebom', [sPart]);
        const mbom = await makeHeader(mRoot, 'mbom', [s, s]);
        const scope = new BomMapScope();
        scope.orgId = 'org-x';
        scope.ebomRootHeaderId = ebomRoot.header.id;
        scope.mbomRootHeaderId = mbom.header.id;
        await scope.save();
        // 共享 S 头的行 = ebomS 的行（经 P1、P2 两条路径出现）
        // 为 P1 路径建 split 映射：sourceLinePath = 根行 → P1 行 → S 头行
        const p1Path = [ebomRoot.lines[0].id, ebomP1.lines[0].id, ebomS.lines[0].id];
        await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'split',
          sourceLineId: ebomS.lines[0].id,
          targetLineId: mbom.lines[0].id,
          sourceLinePath: p1Path
        });
        const coverage = await mappingCoverage(adapter, scope.id, {
          bomType: 'ebom',
          orgId: 'org-x',
          asOfDate: day('2026-09-22')
        });
        // 同一 S 行：P1 路径已覆盖、P2 路径报未覆盖（路径级映射只覆盖 P1）
        const sEntry = coverage.uncovered.find(entry => entry.lineId === ebomS.lines[0].id);
        expect(sEntry).toBeDefined();
        expect(sEntry!.paths.length).toBe(1);
        expect(sEntry!.paths[0].join('>')).toContain(ebomRoot.lines[1].id);
        expect(coverage.invalid).toHaveLength(0);
      });
    });
  }
});

describe('跟进基线与缺口（AC#4/#7/#8/#20）', () => {
  for (const backend of BACKENDS) {
    describe(`[${backend}]`, () => {
      let adapter: BomTestAdapter;
      beforeAll(async () => {
        adapter = await createBomTestAdapter(backend);
      });
      afterAll(async () => {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      });

      const makeItemOnly = async (key: string): Promise<BomItem> => {
        const item = new BomItem();
        item.itemNo = `${key}-${Math.random().toString(36).slice(2, 8)}`;
        await item.save();
        return item;
      };

      const makeHeader = async (
        item: BomItem,
        bomType: 'ebom' | 'mbom',
        children: BomItem[],
        qty = '1'
      ): Promise<{ header: BomHeader; lines: BomLine[] }> => {
        const existing = shapeRows(
          await adapter.rawQuery(
            `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${item.id}'`
          )
        );
        if (existing.length === 0) {
          await loadHistory(adapter, {
            batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
            revisions: [{ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
            headers: []
          });
        }
        const revisionId = String(
          shapeRows(
            await adapter.rawQuery(
              `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${item.id}'`
            )
          )[0][0]
        );
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
          occurrence.qty = qty;
          occurrence.uom = 'pcs';
          occurrence.effectiveFrom = day('2026-01-01');
          await occurrence.save();
          lines.push(line);
          lineNo += 10;
        }
        header.state = 'released';
        await header.save();
        return { header, lines };
      };

      it('AC#4/#7/#8 源行改量 → 缺口列出；确认跟进后消失；再改重现', async () => {
        const { confirmMapping, mappingGaps, saveMapping } = await import('../resolve/bom-map.js');
        const a = await makeItemOnly('g4-a');
        const b = await makeItemOnly('g4-b');
        const rootItem = await makeItemOnly('g4-root');
        const mRoot = await makeItemOnly('g4-mroot');
        const ebom = await makeHeader(rootItem, 'ebom', [a]);
        const ebomB = await makeHeader(a, 'ebom', [b]);
        const mbom = await makeHeader(mRoot, 'mbom', [b]);
        const scope = new BomMapScope();
        scope.orgId = 'org-x';
        scope.ebomRootHeaderId = ebom.header.id;
        scope.mbomRootHeaderId = mbom.header.id;
        await scope.save();
        const { mapId } = await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'one_to_one',
          sourceLineId: ebomB.lines[0].id,
          targetLineId: mbom.lines[0].id
        });
        const ctx = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: day('2026-09-22') };
        // 确认跟进（基线 = 当前解析依据）
        await confirmMapping(adapter, mapId, null, ctx);
        const clean = await mappingGaps(adapter, scope.id, ctx);
        expect(clean.gaps.find(gap => gap.mappingId === mapId)?.differences).toHaveLength(0);
        // AC#4：ECN 改量（qty 2→3）——ECN 生效日 2026-11-01（未来、可发布），
        // 基线仍指旧发生项；按生效后评估日（2026-12-01）查缺口 → 列出
        const { BomEcn, BomLineOccurrence } = await import('../entities.js');
        const ecn = new BomEcn();
        ecn.ecnNo = `G-ECN-${Math.random().toString(36).slice(2, 8)}`;
        ecn.effectiveDate = day('2026-11-01');
        await ecn.save();
        const oldOccurrenceRows = shapeRows(
          await adapter.rawQuery(
            `SELECT occ."id" FROM ${backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"'} occ WHERE occ."lineId" = '${ebomB.lines[0].id}'`
          )
        );
        const oldOccurrenceId = String(oldOccurrenceRows[0][0]);
        await adapter.rawQuery(
          `UPDATE ${backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"'} SET "ecnOutId" = '${ecn.id}', "effectiveTo" = '2026-11-01T00:00:00.000Z' WHERE "id" = '${oldOccurrenceId}'`
        );
        const newOccurrence = new BomLineOccurrence();
        newOccurrence.lineId = ebomB.lines[0].id;
        newOccurrence.childItemId = b.id;
        newOccurrence.qty = '3';
        newOccurrence.uom = 'pcs';
        newOccurrence.ecnInId = ecn.id;
        newOccurrence.effectiveFrom = day('2026-11-01');
        await newOccurrence.save();
        ecn.state = 'released';
        await ecn.save();
        const afterCtx = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: day('2026-12-01') };
        const gapped = await mappingGaps(adapter, scope.id, afterCtx);
        const gap = gapped.gaps.find(entry => entry.mappingId === mapId);
        expect(gap).toBeDefined();
        expect(gap!.differences.length).toBeGreaterThan(0);
        // AC#7：确认跟进（基线推进到新发生项）→ 缺口消失
        await confirmMapping(adapter, mapId, null, afterCtx);
        const cleared = await mappingGaps(adapter, scope.id, afterCtx);
        expect(cleared.gaps.find(entry => entry.mappingId === mapId)?.differences).toHaveLength(0);
        // AC#8：再改一次（同发生项换 qty 无法——已发布头 UPDATE 拒绝；用第二个 ECN 再改量）
        const ecn2 = new BomEcn();
        ecn2.ecnNo = `G-ECN2-${Math.random().toString(36).slice(2, 8)}`;
        ecn2.effectiveDate = day('2027-01-01');
        await ecn2.save();
        await adapter.rawQuery(
          `UPDATE ${backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"'} SET "ecnOutId" = '${ecn2.id}', "effectiveTo" = '2027-01-01T00:00:00.000Z' WHERE "id" = '${newOccurrence.id}'`
        );
        const third = new BomLineOccurrence();
        third.lineId = ebomB.lines[0].id;
        third.childItemId = b.id;
        third.qty = '4';
        third.uom = 'pcs';
        third.ecnInId = ecn2.id;
        third.effectiveFrom = day('2027-01-01');
        await third.save();
        ecn2.state = 'released';
        await ecn2.save();
        const reappeared = await mappingGaps(adapter, scope.id, { ...afterCtx, asOfDate: day('2027-02-01') });
        expect(reappeared.gaps.find(entry => entry.mappingId === mapId)?.differences.length).toBeGreaterThan(0);
      });

      it('AC#20 同一份数据同一评估日重复查询逐字相同；两个评估日之间无结构变化时都无缺口', async () => {
        const { confirmMapping, mappingGaps, saveMapping } = await import('../resolve/bom-map.js');
        const a = await makeItemOnly('g20-a');
        const b = await makeItemOnly('g20-b');
        const rootItem = await makeItemOnly('g20-root');
        const mRoot = await makeItemOnly('g20-mroot');
        const ebom = await makeHeader(rootItem, 'ebom', [a]);
        const ebomB = await makeHeader(a, 'ebom', [b]);
        const mbom = await makeHeader(mRoot, 'mbom', [b]);
        const scope = new BomMapScope();
        scope.orgId = 'org-x';
        scope.ebomRootHeaderId = ebom.header.id;
        scope.mbomRootHeaderId = mbom.header.id;
        await scope.save();
        const { mapId } = await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'one_to_one',
          sourceLineId: ebomB.lines[0].id,
          targetLineId: mbom.lines[0].id
        });
        const ctx = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: day('2026-09-22') };
        await confirmMapping(adapter, mapId, null, ctx);
        const first = await mappingGaps(adapter, scope.id, ctx);
        const second = await mappingGaps(adapter, scope.id, ctx);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        // 另一个评估日（结构无变化）也无缺口
        const otherDay = await mappingGaps(adapter, scope.id, { ...ctx, asOfDate: day('2026-09-15') });
        expect(otherDay.gaps.find(entry => entry.mappingId === mapId)?.differences).toHaveLength(0);
      });
    });
  }
});

describe('评审修复：完整性守卫 / 基线收集 / 参数绑定（P1-4 / P2-4 / P2-5）', () => {
  for (const backend of BACKENDS) {
    describe(`[${backend}]`, () => {
      let adapter: BomTestAdapter;
      beforeAll(async () => {
        adapter = await createBomTestAdapter(backend);
      });
      afterAll(async () => {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      });

      const rand = (): string => Math.random().toString(36).slice(2, 10);
      const table = (name: string): string => (backend === 'wa-sqlite' ? `"bom$${name}"` : `"bom"."${name}"`);
      const ctx = (asOf: string, extra: Partial<ResolutionContext> = {}): ResolutionContext => ({
        bomType: 'ebom',
        orgId: 'org-x',
        asOfDate: day(asOf),
        ...extra
      });

      const itemOnly = async (key: string): Promise<BomItem> => {
        const item = new BomItem();
        item.itemNo = `${key}-${rand()}`;
        await item.save();
        return item;
      };

      /** 物料指定修订号的修订 id（缺则经历史通道装载为已发布修订）。 */
      const revisionOf = async (
        item: BomItem,
        revisionNo = 'A',
        effectiveFrom = day('2020-01-01')
      ): Promise<string> => {
        const find = async (): Promise<unknown[][]> =>
          shapeRows(
            await adapter.rawQuery(
              `SELECT "id" FROM ${table('item_revision')} WHERE "itemId" = '${item.id}' AND "revisionNo" = '${revisionNo}'`
            )
          );
        if ((await find()).length === 0) {
          await loadHistory(adapter, {
            batchNo: `batch-${rand()}`,
            revisions: [{ itemId: item.id, revisionNo, effectiveFrom }],
            headers: []
          });
        }
        return String((await find())[0][0]);
      };

      /** 已发布头：每行默认一个发生项（qty 1、2026-01-01 起），可按行给多个发生项覆盖。 */
      const releasedHeader = async (
        revisionId: string,
        bomType: 'ebom' | 'mbom',
        specs: { child: BomItem; occurrences?: Partial<BomLineOccurrence>[] }[],
        alternativeNo = 1
      ): Promise<{ header: BomHeader; lines: BomLine[]; occurrences: BomLineOccurrence[][] }> => {
        const header = new BomHeader();
        header.parentRevisionId = revisionId;
        header.bomType = bomType;
        header.orgId = 'org-x';
        header.alternativeNo = alternativeNo;
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

      const scopeOf = async (ebomHeader: BomHeader, mbomHeader: BomHeader): Promise<BomMapScope> => {
        const scope = new BomMapScope();
        scope.orgId = 'org-x';
        scope.ebomRootHeaderId = ebomHeader.id;
        scope.mbomRootHeaderId = mbomHeader.id;
        await scope.save();
        return scope;
      };

      /** 经 ECN 改量：截止旧发生项，同逻辑行引入新发生项。 */
      const ecnChangeQty = async (
        effectiveDate: Date,
        changes: { occurrence: BomLineOccurrence; qty: string }[]
      ): Promise<void> => {
        const ecn = new BomEcn();
        ecn.ecnNo = `R-ECN-${rand()}`;
        ecn.effectiveDate = effectiveDate;
        await ecn.save();
        for (const { occurrence, qty } of changes) {
          occurrence.ecnOutId = ecn.id;
          occurrence.effectiveTo = effectiveDate;
          await occurrence.save();
          const next = new BomLineOccurrence();
          next.lineId = occurrence.lineId;
          next.childItemId = occurrence.childItemId;
          next.childRevisionId = occurrence.childRevisionId;
          next.qty = qty;
          next.uom = 'pcs';
          next.ecnInId = ecn.id;
          next.effectiveFrom = effectiveDate;
          await next.save();
        }
        ecn.state = 'released';
        await ecn.save();
      };

      const baselineOf = async (mapId: string): Promise<string | null> => {
        const rows = shapeRows(
          await adapter.rawQuery(`SELECT "baselineSteps" FROM ${table('bom_map')} WHERE "id" = '${mapId}'`)
        );
        return rows[0][0] === null ? null : String(rows[0][0]);
      };

      /** 根行按序列分两段（[1,100] → A、[101,∞) → A2）的范围 + 根行的行级映射。 */
      const unitSplitFixture = async () => {
        const a = await itemOnly('u-a');
        const a2 = await itemOnly('u-a2');
        const ebom = await releasedHeader(await revisionOf(await itemOnly('u-root')), 'ebom', [
          { child: a, occurrences: [{ unitTo: 100 }, { childItemId: a2.id, unitFrom: 101 }] }
        ]);
        const mbom = await releasedHeader(await revisionOf(await itemOnly('u-mroot')), 'mbom', [{ child: a }]);
        const scope = await scopeOf(ebom.header, mbom.header);
        const { mapId } = await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'one_to_one',
          sourceLineId: ebom.lines[0].id,
          targetLineId: mbom.lines[0].id
        });
        return { ebom, scope, mapId };
      };

      it('P1-4 序列多候选（unresolved）：覆盖率与确认跟进拒绝、缺口标无法判定，基线不被部分展开改写', async () => {
        const { ebom, scope, mapId } = await unitSplitFixture();
        expect((await mappingCoverage(adapter, scope.id, ctx('2026-09-22', { unit: 50 }))).covered).toHaveLength(1);
        await confirmMapping(adapter, mapId, null, ctx('2026-09-22', { unit: 50 }));
        const baseline = await baselineOf(mapId);
        await expect(mappingCoverage(adapter, scope.id, ctx('2026-09-22'))).rejects.toThrow(BomMapError);
        await expect(mappingCoverage(adapter, scope.id, ctx('2026-09-22'))).rejects.toThrow(/unit/);
        await expect(confirmMapping(adapter, mapId, null, ctx('2026-09-22'))).rejects.toThrow(BomMapError);
        await expect(confirmMapping(adapter, mapId, null, ctx('2026-09-22'))).rejects.toThrow(/unit/);
        expect(await baselineOf(mapId)).toBe(baseline);
        const gap = (await mappingGaps(adapter, scope.id, ctx('2026-09-22'))).gaps.find(
          entry => entry.mappingId === mapId
        );
        expect(gap?.undecidable?.reason).toMatch(/unit/);
        expect(gap?.undecidable?.reason).toContain(ebom.lines[0].id);
        expect(gap?.differences).toEqual([]);
        expect(gap?.appeared).toEqual([]);
      });

      it('P2-4 M6 根头行步骤同样经序列 / 批次 / 配置过滤：基线只含上下文下的有效发生项', async () => {
        const { ebom, scope, mapId } = await unitSplitFixture();
        await confirmMapping(adapter, mapId, null, ctx('2026-09-22', { unit: 50 }));
        const steps = JSON.parse(String(await baselineOf(mapId))) as MappingStep[];
        expect(steps.map(step => step.occurrenceId)).toEqual([ebom.occurrences[0][0].id]);
        const gap = (await mappingGaps(adapter, scope.id, ctx('2026-09-22', { unit: 150 }))).gaps.find(
          entry => entry.mappingId === mapId
        );
        expect(gap?.differences.map(change => [change.baseline.occurrenceId, change.current?.occurrenceId])).toEqual([
          [ebom.occurrences[0][0].id, ebom.occurrences[0][1].id]
        ]);
      });

      it('P2-4 M5 行级基线只收到源行为止：兄弟分支与源行以下的变更不产生假缺口，缺口附目标行', async () => {
        const a = await itemOnly('s-a');
        const ebom = await releasedHeader(await revisionOf(await itemOnly('s-root')), 'ebom', [
          { child: a },
          { child: await itemOnly('s-b') }
        ]);
        const ebomA = await releasedHeader(await revisionOf(a), 'ebom', [{ child: await itemOnly('s-x') }]);
        const mbom = await releasedHeader(await revisionOf(await itemOnly('s-mroot')), 'mbom', [{ child: a }]);
        const scope = await scopeOf(ebom.header, mbom.header);
        const { mapId } = await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'one_to_one',
          sourceLineId: ebom.lines[0].id,
          targetLineId: mbom.lines[0].id
        });
        await confirmMapping(adapter, mapId, null, ctx('2026-09-22'));
        await ecnChangeQty(day('2027-03-01'), [
          { occurrence: ebom.occurrences[1][0], qty: '2' },
          { occurrence: ebomA.occurrences[0][0], qty: '3' }
        ]);
        const gap = (await mappingGaps(adapter, scope.id, ctx('2027-04-01'))).gaps.find(
          entry => entry.mappingId === mapId
        );
        expect(gap?.targetLineId).toBe(mbom.lines[0].id);
        expect(gap?.undecidable).toBeNull();
        expect(gap?.differences).toEqual([]);
        expect(gap?.appeared).toEqual([]);
      });

      it('P2-4 M5 路径级基线含祖先步骤与解析修订：子件改版（AC#17）、祖先改量（AC#16）都列缺口', async () => {
        const c = await itemOnly('p-c');
        const p = await itemOnly('p-p');
        await revisionOf(c);
        const ebom = await releasedHeader(await revisionOf(await itemOnly('p-root')), 'ebom', [{ child: p }]);
        const ebomP = await releasedHeader(await revisionOf(p), 'ebom', [{ child: c }]);
        const mbom = await releasedHeader(await revisionOf(await itemOnly('p-mroot')), 'mbom', [{ child: c }]);
        const scope = await scopeOf(ebom.header, mbom.header);
        const { mapId } = await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'one_to_one',
          sourceLineId: ebomP.lines[0].id,
          targetLineId: mbom.lines[0].id,
          sourceLinePath: [ebom.lines[0].id, ebomP.lines[0].id]
        });
        const gapOf = async (asOf: string) =>
          (await mappingGaps(adapter, scope.id, ctx(asOf))).gaps.find(entry => entry.mappingId === mapId);
        await confirmMapping(adapter, mapId, null, ctx('2026-09-22'));
        expect((await gapOf('2026-09-22'))?.differences).toEqual([]);
        const revisionB = await revisionOf(c, 'B', day('2027-01-01'));
        expect(
          (await gapOf('2027-02-01'))?.differences.map(change => [change.baseline.lineId, change.current?.revisionId])
        ).toEqual([[ebomP.lines[0].id, revisionB]]);
        await confirmMapping(adapter, mapId, null, ctx('2027-02-01'));
        expect((await gapOf('2027-02-01'))?.differences).toEqual([]);
        await ecnChangeQty(day('2027-03-01'), [{ occurrence: ebom.occurrences[0][0], qty: '2' }]);
        expect((await gapOf('2027-04-01'))?.differences.map(change => change.baseline.lineId)).toEqual([
          ebom.lines[0].id
        ]);
      });

      it('上下文须与范围同类型同组织：EBOM 根头不随上下文重选', async () => {
        const { scope, mapId } = await unitSplitFixture();
        await expect(mappingCoverage(adapter, scope.id, ctx('2026-09-22', { bomType: 'mbom' }))).rejects.toThrow(
          BomMapError
        );
        await expect(confirmMapping(adapter, mapId, null, ctx('2026-09-22', { orgId: 'org-y' }))).rejects.toThrow(
          BomMapError
        );
        await expect(mappingGaps(adapter, scope.id, ctx('2026-09-22', { orgId: 'org-y' }))).rejects.toThrow(
          BomMapError
        );
      });

      it('根头由范围钉住：根修订另有已发布备选时只解析范围根头，上下文点名别的备选即拒绝', async () => {
        const root = await itemOnly('alt-root');
        const rootRevision = await revisionOf(root);
        const ebom = await releasedHeader(rootRevision, 'ebom', [{ child: await itemOnly('alt-a') }]);
        const other = await releasedHeader(rootRevision, 'ebom', [{ child: await itemOnly('alt-b') }], 2);
        const mbom = await releasedHeader(await revisionOf(await itemOnly('alt-mroot')), 'mbom', [
          { child: await itemOnly('alt-m') }
        ]);
        const scope = await scopeOf(ebom.header, mbom.header);
        const { mapId } = await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'one_to_one',
          sourceLineId: ebom.lines[0].id,
          targetLineId: mbom.lines[0].id
        });
        const coverage = await mappingCoverage(adapter, scope.id, ctx('2026-09-22'));
        expect(coverage.covered.map(entry => entry.lineId)).toEqual([ebom.lines[0].id]);
        expect(coverage.uncovered.flatMap(entry => entry.paths.flat())).not.toContain(other.lines[0].id);
        await confirmMapping(adapter, mapId, null, ctx('2026-09-22'));
        const gap = (await mappingGaps(adapter, scope.id, ctx('2026-09-22'))).gaps.find(
          entry => entry.mappingId === mapId
        );
        expect(gap?.undecidable).toBeNull();
        expect(gap?.differences).toEqual([]);
        await expect(mappingCoverage(adapter, scope.id, ctx('2026-09-22', { alternativeNo: 2 }))).rejects.toThrow(
          BomMapError
        );
      });

      it('AC#22 逐映射判定：未裁决子装配之下的映射无法判定并点名该修订，无关分支与其上方照常比较', async () => {
        const a = await itemOnly('pm-a');
        const b = await itemOnly('pm-b');
        const aRevision = await revisionOf(a);
        const ebom = await releasedHeader(await revisionOf(await itemOnly('pm-root')), 'ebom', [
          { child: a },
          { child: b }
        ]);
        const ebomA = await releasedHeader(aRevision, 'ebom', [{ child: await itemOnly('pm-x') }]);
        const ebomB = await releasedHeader(await revisionOf(b), 'ebom', [{ child: await itemOnly('pm-y') }]);
        const mbom = await releasedHeader(await revisionOf(await itemOnly('pm-mroot')), 'mbom', [{ child: a }]);
        const scope = await scopeOf(ebom.header, mbom.header);
        const save = async (sourceLineId: string): Promise<string> =>
          (
            await saveMapping(adapter, {
              scopeId: scope.id,
              relation: 'one_to_one',
              sourceLineId,
              targetLineId: mbom.lines[0].id
            })
          ).mapId;
        const underA = await save(ebomA.lines[0].id);
        const underB = await save(ebomB.lines[0].id);
        const aboveA = await save(ebom.lines[0].id);
        for (const mapId of [underA, underB, aboveA]) await confirmMapping(adapter, mapId, null, ctx('2026-09-22'));
        // A 出现第二个已发布备选头：展开对 A 标 unresolved、不下钻；B 分支经 ECN 改量
        await releasedHeader(aRevision, 'ebom', [{ child: await itemOnly('pm-z') }], 2);
        await ecnChangeQty(day('2027-03-01'), [{ occurrence: ebomB.occurrences[0][0], qty: '5' }]);
        const gapsAt = async (asOf: string) =>
          new Map((await mappingGaps(adapter, scope.id, ctx(asOf))).gaps.map(gap => [gap.mappingId, gap]));
        const gaps = await gapsAt('2027-04-01');
        expect(gaps.get(underA)?.undecidable?.reason).toContain(aRevision);
        expect(gaps.get(underA)?.differences).toEqual([]);
        expect(gaps.get(underB)?.undecidable).toBeNull();
        expect(gaps.get(underB)?.differences.map(change => change.baseline.lineId)).toEqual([ebomB.lines[0].id]);
        expect(gaps.get(aboveA)?.undecidable).toBeNull();
        expect(gaps.get(aboveA)?.differences).toEqual([]);
        // 确认跟进按同一判定：可判定的放行、被遮住的拒绝并点名；覆盖率要整棵结构仍拒绝
        await confirmMapping(adapter, underB, null, ctx('2027-04-01'));
        expect((await gapsAt('2027-04-01')).get(underB)?.differences).toEqual([]);
        await expect(confirmMapping(adapter, underA, null, ctx('2027-04-01'))).rejects.toThrow(aRevision);
        await expect(mappingCoverage(adapter, scope.id, ctx('2027-04-01'))).rejects.toThrow(aRevision);
      });

      it('AC#22 截断：路径级映射的整条路径节点在展开里即可判定，行级映射无法判定并点名触顶项', async () => {
        // 根 → c1 → … → c129：先装到 c128（最深节点深度 128，未触顶）确认两条映射，再接上 c129 触顶
        const chain: BomItem[] = [];
        for (let index = 0; index < 130; index++) chain.push(await itemOnly(`tc-${index}`));
        await loadHistory(adapter, {
          batchNo: `batch-${rand()}`,
          revisions: chain.map(item => ({ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') })),
          headers: chain.slice(0, 128).map((_, index) => ({
            revisionIndex: index,
            bomType: 'ebom' as const,
            orgId: 'org-x',
            lines: [
              {
                lineNo: 10,
                occurrences: [{ childItemId: chain[index + 1].id, qty: '1', effectiveFrom: day('2026-01-01') }]
              }
            ]
          }))
        });
        const lineOfItem = async (item: BomItem): Promise<{ headerId: string; lineId: string }> => {
          const rows = shapeRows(
            await adapter.rawQuery(
              `SELECT h."id" AS "headerId", l."id" AS "lineId" FROM ${table('bom_header')} h JOIN ${table('item_revision')} r ON r."id" = h."parentRevisionId" JOIN ${table('bom_line')} l ON l."headerId" = h."id" WHERE r."itemId" = '${item.id}'`
            )
          );
          return { headerId: String(rows[0][0]), lineId: String(rows[0][1]) };
        };
        const root = await lineOfItem(chain[0]);
        const first = await lineOfItem(chain[1]);
        const mbom = await releasedHeader(await revisionOf(await itemOnly('tc-mroot')), 'mbom', [{ child: chain[2] }]);
        const scope = new BomMapScope();
        scope.orgId = 'org-x';
        scope.ebomRootHeaderId = root.headerId;
        scope.mbomRootHeaderId = mbom.header.id;
        await scope.save();
        const base = { scopeId: scope.id, relation: 'one_to_one' as const, targetLineId: mbom.lines[0].id };
        const pathLevel = (
          await saveMapping(adapter, {
            ...base,
            sourceLineId: first.lineId,
            sourceLinePath: [root.lineId, first.lineId]
          })
        ).mapId;
        const lineLevel = (await saveMapping(adapter, { ...base, sourceLineId: first.lineId })).mapId;
        for (const mapId of [pathLevel, lineLevel]) await confirmMapping(adapter, mapId, null, ctx('2026-09-22'));
        await releasedHeader(await revisionOf(chain[128]), 'ebom', [{ child: chain[129] }]);
        const gaps = new Map(
          (await mappingGaps(adapter, scope.id, ctx('2026-09-22'))).gaps.map(gap => [gap.mappingId, gap])
        );
        expect(gaps.get(pathLevel)?.undecidable).toBeNull();
        expect(gaps.get(pathLevel)?.differences).toEqual([]);
        expect(gaps.get(lineLevel)?.undecidable?.reason).toMatch(/depth/);
        await confirmMapping(adapter, pathLevel, null, ctx('2026-09-22'));
        await expect(confirmMapping(adapter, lineLevel, null, ctx('2026-09-22'))).rejects.toThrow(/depth/);
      }, 120_000);

      it('范围成员资格的一跳只走同类型同组织的子件头：经 MBOM 头才可达的 EBOM 行不是成员', async () => {
        const a = await itemOnly('h-a');
        const b = await itemOnly('h-b');
        const ebom = await releasedHeader(await revisionOf(await itemOnly('h-root')), 'ebom', [{ child: a }]);
        await releasedHeader(await revisionOf(a), 'mbom', [{ child: b }]);
        const ebomB = await releasedHeader(await revisionOf(b), 'ebom', [{ child: await itemOnly('h-x') }]);
        const mbom = await releasedHeader(await revisionOf(await itemOnly('h-mroot')), 'mbom', [{ child: a }]);
        const scope = await scopeOf(ebom.header, mbom.header);
        await expect(
          saveMapping(adapter, {
            scopeId: scope.id,
            relation: 'one_to_one',
            sourceLineId: ebomB.lines[0].id,
            targetLineId: mbom.lines[0].id
          })
        ).rejects.toThrow(/成员/);
      });

      it('P2-4 M8 多实例并存：saveMapping 经实例的实体构造门面落库', async () => {
        const child = await itemOnly('mi-c');
        const ebom = await releasedHeader(await revisionOf(await itemOnly('mi-root')), 'ebom', [{ child }]);
        const mbom = await releasedHeader(await revisionOf(await itemOnly('mi-mroot')), 'mbom', [{ child }]);
        const scope = await scopeOf(ebom.header, mbom.header);
        const other = await createBomTestAdapter(backend);
        try {
          const { mapId } = await saveMapping(adapter, {
            scopeId: scope.id,
            relation: 'one_to_one',
            sourceLineId: ebom.lines[0].id,
            targetLineId: mbom.lines[0].id
          });
          expect(
            shapeRows(await adapter.rawQuery(`SELECT "scopeId" FROM ${table('bom_map')} WHERE "id" = '${mapId}'`))
          ).toEqual([[scope.id]]);
          expect(shapeRows(await other.rawQuery(`SELECT "id" FROM ${table('bom_map')}`))).toEqual([]);
        } finally {
          await disposeBomTestAdapter(other);
        }
      });

      it('P2-5 标识走绑定参数：注入串不改写查询语义（不读别的范围、不批量改写基线）', async () => {
        await unitSplitFixture();
        const injected = `' OR '1'='1`;
        const notFound = backend === 'wa-sqlite' ? /不存在/ : /uuid/i;
        await expect(mappingCoverage(adapter, injected, ctx('2026-09-22', { unit: 50 }))).rejects.toThrow(notFound);
        await expect(mappingGaps(adapter, injected, ctx('2026-09-22', { unit: 50 }))).rejects.toThrow(notFound);
        await expect(confirmMapping(adapter, injected, null, ctx('2026-09-22', { unit: 50 }))).rejects.toThrow(
          notFound
        );
      });
    });
  }
});
