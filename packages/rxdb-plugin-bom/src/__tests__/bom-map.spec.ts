/**
 * @fileoverview EBOM↔MBOM 映射回归测试（US-516）
 *
 * 双后端（wa-sqlite / pglite）同断言：NULL 规则（AC#9）、六态 relation（AC#1/#2/#3）、
 * 两侧类型/组织与范围成员资格保存校验（AC#10/#12/#15）、路径级映射与覆盖率（AC#5/#6/#13/#14）、
 * 跟进基线与缺口查询（AC#4/#7/#8/#16~#22）。变换范围的两根头一律挂在同一物料上（范围保存期校验，
 * 修订可以不同）。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomEcn, BomHeader, BomItem, BomLine, BomLineOccurrence, BomMap, BomMapScope } from '../entities.js';
import {
  BomMapError,
  confirmMapping,
  mappingCoverage,
  mappingGaps,
  saveMapping,
  type MappingSaveInput,
  type MappingStep
} from '../resolve/bom-map.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
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

    /**
     * 物料的指定修订（缺则经历史通道装载为已发布修订；同一物料的已发布修订生效日须互异）+
     * 指定类型的已发布头（一行一个子件）。变换范围的两根头挂同一物料（US-516）。
     */
    const makeHeader = async (
      item: BomItem,
      bomType: 'ebom' | 'mbom',
      children: BomItem[],
      revision = { revisionNo: 'A', effectiveFrom: day('2020-01-01') }
    ): Promise<{ header: BomHeader; lines: BomLine[] }> => {
      const findRevision = async (): Promise<unknown[][]> =>
        shapeRows(
          await adapter.rawQuery(
            `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${item.id}' AND "revisionNo" = '${revision.revisionNo}'`
          )
        );
      if ((await findRevision()).length === 0) {
        await loadHistory(adapter, {
          batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
          revisions: [{ itemId: item.id, ...revision }],
          headers: []
        });
      }
      const revisionId = String((await findRevision())[0][0]);
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

    const makeItemOnly = async (key: string): Promise<BomItem> => {
      const item = new BomItem();
      item.itemNo = `${key}-${Math.random().toString(36).slice(2, 8)}`;
      await item.save();
      return item;
    };

    it('AC#9 NULL 规则：one_to_one 两侧必填、added 只 source 空、removed 只 target 空、双 NULL 拒绝', async () => {
      const child = await makeItemOnly('m9');
      const root = await makeItemOnly('m9-root');
      const ebom = await makeHeader(root, 'ebom', [child]);
      const mbom = await makeHeader(root, 'mbom', [child]);
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
      const root = await makeItemOnly('m23-root');
      const ebom = await makeHeader(root, 'ebom', [child]);
      const mbom = await makeHeader(root, 'mbom', [child, child]);
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
      // merge：两个源行 → 一个目标行（同一父件的另一修订上的 EBOM 根头：两侧修订可以不同）
      const ebom2 = await makeHeader(root, 'ebom', [child, child], {
        revisionNo: 'B',
        effectiveFrom: day('2021-01-01')
      });
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
        const rootItem = await makeItemOnly('s1-root');
        const ebom = await makeHeader(rootItem, 'ebom', [sheet]);
        const mbom = await makeHeader(rootItem, 'mbom', [sheet, sheet]);
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
        const rootItem = await makeItemOnly('s10-root');
        const ebom = await makeHeader(rootItem, 'ebom', [child]);
        const mbom = await makeHeader(rootItem, 'mbom', [child]);
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
        const rootItem = await makeItemOnly('s12-root');
        const outsideItem = await makeItemOnly('s12-x');
        const ebom = await makeHeader(rootItem, 'ebom', [child]);
        const mbom = await makeHeader(rootItem, 'mbom', [child]);
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
        const rootItem = await makeItemOnly('s13-root');
        const ebom = await makeHeader(rootItem, 'ebom', [child]);
        const mbom = await makeHeader(rootItem, 'mbom', [child]);
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
        const ebom = await makeHeader(rootItem, 'ebom', [a, b]);
        const mbom = await makeHeader(rootItem, 'mbom', [a, b]);
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
        // EBOM 根用 P1、P2 各一行；共享子装配 S 头（同一批行经两条路径出现）
        const ebomRoot = await makeHeader(rootItem, 'ebom', [p1Item, p2Item]);
        const ebomP1 = await makeHeader(p1Item, 'ebom', [s]);
        await makeHeader(p2Item, 'ebom', [s]); // P2 头建出即达意：共享 S 行经两条路径出现（覆盖查询自行走头链）
        const sPart = await makeItemOnly('c13-sp');
        const ebomS = await makeHeader(s, 'ebom', [sPart]);
        const mbom = await makeHeader(rootItem, 'mbom', [s, s]);
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
        const ebom = await makeHeader(rootItem, 'ebom', [a]);
        const ebomB = await makeHeader(a, 'ebom', [b]);
        const mbom = await makeHeader(rootItem, 'mbom', [b]);
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
        const ebom = await makeHeader(rootItem, 'ebom', [a]);
        const ebomB = await makeHeader(a, 'ebom', [b]);
        const mbom = await makeHeader(rootItem, 'mbom', [b]);
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
        alternativeNo = 1,
        orgId = 'org-x'
      ): Promise<{ header: BomHeader; lines: BomLine[]; occurrences: BomLineOccurrence[][] }> => {
        const header = new BomHeader();
        header.parentRevisionId = revisionId;
        header.bomType = bomType;
        header.orgId = orgId;
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
        const rootRevision = await revisionOf(await itemOnly('u-root'));
        const ebom = await releasedHeader(rootRevision, 'ebom', [
          { child: a, occurrences: [{ unitTo: 100 }, { childItemId: a2.id, unitFrom: 101 }] }
        ]);
        const mbom = await releasedHeader(rootRevision, 'mbom', [{ child: a }]);
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
        const rootRevision = await revisionOf(await itemOnly('s-root'));
        const ebom = await releasedHeader(rootRevision, 'ebom', [{ child: a }, { child: await itemOnly('s-b') }]);
        const ebomA = await releasedHeader(await revisionOf(a), 'ebom', [{ child: await itemOnly('s-x') }]);
        const mbom = await releasedHeader(rootRevision, 'mbom', [{ child: a }]);
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
        const rootRevision = await revisionOf(await itemOnly('p-root'));
        const ebom = await releasedHeader(rootRevision, 'ebom', [{ child: p }]);
        const ebomP = await releasedHeader(await revisionOf(p), 'ebom', [{ child: c }]);
        const mbom = await releasedHeader(rootRevision, 'mbom', [{ child: c }]);
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
        const mbom = await releasedHeader(rootRevision, 'mbom', [{ child: await itemOnly('alt-m') }]);
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
        const rootRevision = await revisionOf(await itemOnly('pm-root'));
        const ebom = await releasedHeader(rootRevision, 'ebom', [{ child: a }, { child: b }]);
        const ebomA = await releasedHeader(aRevision, 'ebom', [{ child: await itemOnly('pm-x') }]);
        const ebomB = await releasedHeader(await revisionOf(b), 'ebom', [{ child: await itemOnly('pm-y') }]);
        const mbom = await releasedHeader(rootRevision, 'mbom', [{ child: a }]);
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
        const mbom = await releasedHeader(await revisionOf(chain[0]), 'mbom', [{ child: chain[2] }]);
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
        const rootRevision = await revisionOf(await itemOnly('h-root'));
        const ebom = await releasedHeader(rootRevision, 'ebom', [{ child: a }]);
        await releasedHeader(await revisionOf(a), 'mbom', [{ child: b }]);
        const ebomB = await releasedHeader(await revisionOf(b), 'ebom', [{ child: await itemOnly('h-x') }]);
        const mbom = await releasedHeader(rootRevision, 'mbom', [{ child: a }]);
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

      /**
       * 目标侧成员资格夹具（AC#12/#15 target 侧）：范围 MBOM 根头 = 根物料修订 A 的 MBOM 头，三行
       * a（imprecise）、c（precise 锁修订 A）、e（imprecise，e 只有 EBOM 头）；EBOM 根头一行 x。
       * 另建：a 的 MBOM 头（imprecise 下钻可达）、c 修订 A / B 的 MBOM 头（只有锁定的 A 可达）、根物料修订 B 的
       * MBOM 头与只挂在它下面的 y 的 MBOM 头、根修订 A 的备选 2 MBOM 头、e 的 EBOM 头之下 f 的 MBOM 头
       * （只经 EBOM 头可达）、范围外物料的 MBOM 头。
       */
      const targetScopeFixture = async () => {
        const items: BomItem[] = [];
        for (const key of ['t-root', 't-a', 't-c', 't-e', 't-f', 't-x', 't-y']) items.push(await itemOnly(key));
        const [root, a, c, e, f, x, y] = items;
        const rootRevision = await revisionOf(root);
        const cRevisionA = await revisionOf(c);
        const ebom = await releasedHeader(rootRevision, 'ebom', [{ child: x }]);
        const mbom = await releasedHeader(rootRevision, 'mbom', [
          { child: a },
          { child: c, occurrences: [{ childRevisionId: cRevisionA }] },
          { child: e }
        ]);
        const scope = await scopeOf(ebom.header, mbom.header);
        const leafHeader = async (revisionId: string, alternativeNo = 1) =>
          releasedHeader(revisionId, 'mbom', [{ child: await itemOnly('t-leaf') }], alternativeNo);
        const deep = await releasedHeader(await revisionOf(a), 'mbom', [{ child: x }]);
        const lockedRevision = await leafHeader(cRevisionA);
        const unlockedRevision = await leafHeader(await revisionOf(c, 'B', day('2021-01-01')));
        const otherRevisionRoot = await releasedHeader(await revisionOf(root, 'B', day('2021-01-01')), 'mbom', [
          { child: y }
        ]);
        const onlyViaOtherRevision = await leafHeader(await revisionOf(y));
        const otherAlternative = await leafHeader(rootRevision, 2);
        await releasedHeader(await revisionOf(e), 'ebom', [{ child: f }]);
        const onlyViaEbom = await leafHeader(await revisionOf(f));
        const outside = await leafHeader(await revisionOf(await itemOnly('t-out')));
        const outsiders: [string, { lines: BomLine[] }][] = [
          ['同物料另一修订的根行', otherRevisionRoot],
          ['同修订另一备选的根行', otherAlternative],
          ['仅另一修订可达', onlyViaOtherRevision],
          ['precise 未选中的修订', unlockedRevision],
          ['只经 EBOM 头可达', onlyViaEbom],
          ['范围外', outside]
        ];
        return { ebom, mbom, scope, deep, lockedRevision, outsiders };
      };

      const mappingIdsOf = async (scopeId: string): Promise<unknown[][]> =>
        shapeRows(await adapter.rawQuery(`SELECT "id" FROM ${table('bom_map')} WHERE "scopeId" = '${scopeId}'`));

      it('目标侧范围成员资格（AC#12/#15 target 侧）：同物料另一修订 / 另一备选的根行、仅另一修订可达、precise 未选中的修订、只经 EBOM 头可达、范围外的 MBOM 行都拒绝，点名 MBOM 根头与该行', async () => {
        const { ebom, mbom, scope, outsiders } = await targetScopeFixture();
        const cases = outsiders.flatMap(([label, header]) => [
          {
            label: `${label} / one_to_one`,
            input: { relation: 'one_to_one' as const, sourceLineId: ebom.lines[0].id, targetLineId: header.lines[0].id }
          },
          { label: `${label} / added`, input: { relation: 'added' as const, targetLineId: header.lines[0].id } }
        ]);
        /** 拒绝须是 BomMapError，且点名范围 MBOM 根头、该行与成员资格。 */
        const verdictOf = (failure: unknown, targetLineId: string): string => {
          if (!(failure instanceof BomMapError)) return `未拒绝或非 BomMapError：${String(failure)}`;
          const named = [mbom.header.id, targetLineId, '成员'].every(part => failure.message.includes(part));
          return named ? '拒绝并点名' : `点名不全：${failure.message}`;
        };
        const verdicts: string[] = [];
        for (const { label, input } of cases) {
          const failure = await saveMapping(adapter, { scopeId: scope.id, ...input }).then(
            () => null,
            (error: unknown) => error
          );
          verdicts.push(`${label}：${verdictOf(failure, input.targetLineId)}`);
        }
        expect(verdicts).toEqual(cases.map(({ label }) => `${label}：拒绝并点名`));
        // EBOM 头的行作目标：类型不匹配（AC#10），在成员资格之前拒绝
        await expect(
          saveMapping(adapter, { scopeId: scope.id, relation: 'added', targetLineId: ebom.lines[0].id })
        ).rejects.toThrow(/类型 ebom 不是 MBOM/);
        expect(await mappingIdsOf(scope.id)).toEqual([]);
      });

      it('目标侧范围成员资格：MBOM 根头行、imprecise 下钻与 precise 选中修订之下的行都是成员；目标比源深一层（下沉）照常接受', async () => {
        const { ebom, mbom, scope, deep, lockedRevision } = await targetScopeFixture();
        for (const targetLineId of [mbom.lines[0].id, deep.lines[0].id, lockedRevision.lines[0].id]) {
          await saveMapping(adapter, {
            scopeId: scope.id,
            relation: 'split',
            sourceLineId: ebom.lines[0].id,
            targetLineId
          });
        }
        await saveMapping(adapter, { scopeId: scope.id, relation: 'added', targetLineId: deep.lines[0].id });
        expect(await mappingIdsOf(scope.id)).toHaveLength(4);
      });

      it('AC#10 两侧类型 / 组织违约：错误点名该行、所在头与范围（源行与目标行同口径）', async () => {
        const child = await itemOnly('n-c');
        const rootRevision = await revisionOf(await itemOnly('n-root'));
        const ebom = await releasedHeader(rootRevision, 'ebom', [{ child }]);
        const mbom = await releasedHeader(rootRevision, 'mbom', [{ child }]);
        const scope = await scopeOf(ebom.header, mbom.header);
        const foreignRevision = await revisionOf(await itemOnly('n-foreign'));
        const foreignEbom = await releasedHeader(foreignRevision, 'ebom', [{ child }], 1, 'org-y');
        const foreignMbom = await releasedHeader(foreignRevision, 'mbom', [{ child }], 1, 'org-y');
        const cases: {
          label: string;
          input: Omit<MappingSaveInput, 'scopeId'>;
          lineId: string;
          headerId: string;
          pattern: RegExp;
        }[] = [
          {
            label: '源行属 MBOM 头',
            input: { relation: 'one_to_one', sourceLineId: mbom.lines[0].id, targetLineId: mbom.lines[0].id },
            lineId: mbom.lines[0].id,
            headerId: mbom.header.id,
            pattern: /类型 mbom 不是 EBOM/
          },
          {
            label: '目标行属 EBOM 头',
            input: { relation: 'added', targetLineId: ebom.lines[0].id },
            lineId: ebom.lines[0].id,
            headerId: ebom.header.id,
            pattern: /类型 ebom 不是 MBOM/
          },
          {
            label: '源行组织不符',
            input: { relation: 'removed', sourceLineId: foreignEbom.lines[0].id },
            lineId: foreignEbom.lines[0].id,
            headerId: foreignEbom.header.id,
            pattern: /组织 org-y .*org-x/
          },
          {
            label: '目标行组织不符',
            input: { relation: 'added', targetLineId: foreignMbom.lines[0].id },
            lineId: foreignMbom.lines[0].id,
            headerId: foreignMbom.header.id,
            pattern: /组织 org-y .*org-x/
          }
        ];
        const verdicts: string[] = [];
        for (const { label, input, lineId, headerId, pattern } of cases) {
          const failure = await saveMapping(adapter, { scopeId: scope.id, ...input }).then(
            () => null,
            (error: unknown) => error
          );
          const message =
            failure instanceof BomMapError ? failure.message : `未拒绝或非 BomMapError：${String(failure)}`;
          const named = [lineId, headerId, scope.id].every(part => message.includes(part)) && pattern.test(message);
          verdicts.push(`${label}：${named ? '点名该行、所在头与范围' : message}`);
        }
        expect(verdicts).toEqual(cases.map(({ label }) => `${label}：点名该行、所在头与范围`));
        expect(await mappingIdsOf(scope.id)).toEqual([]);
      });

      /**
       * 「路径失效」夹具（已存发生项经 ECN 取消级联消失）：EBOM 根一行 L1 → a，a 头一行 LA1 → x；
       * MBOM 根一行 M1 → c。ECN E（2027-01-01 生效，发布后仍未生效、可取消）在 a 头引入行 LA2 → b
       * （b 头一行 LB1 → c），在 MBOM 根引入行 M2 → p（p 的 MBOM 头一行 MP1 → q）。取消 E 即级联删除
       * LA2 / M2：LB1、MP1 分别失去 EBOM / MBOM 侧的范围成员资格，路径 L1 → LA2 → LB1 失去相邻性。
       */
      const lapseFixture = async () => {
        const items: BomItem[] = [];
        for (const key of ['l-root', 'l-a', 'l-b', 'l-c', 'l-p', 'l-q', 'l-x']) items.push(await itemOnly(key));
        const [root, a, b, c, p, q, x] = items;
        const rootRevision = await revisionOf(root);
        const ebom = await releasedHeader(rootRevision, 'ebom', [{ child: a }]);
        const ebomA = await releasedHeader(await revisionOf(a), 'ebom', [{ child: x }]);
        const ebomB = await releasedHeader(await revisionOf(b), 'ebom', [{ child: c }]);
        const mbom = await releasedHeader(rootRevision, 'mbom', [{ child: c }]);
        const mbomP = await releasedHeader(await revisionOf(p), 'mbom', [{ child: q }]);
        const ecn = new BomEcn();
        ecn.ecnNo = `L-ECN-${rand()}`;
        ecn.effectiveDate = day('2027-01-01');
        await ecn.save();
        /** E 在已发布头上引入一行（行与发生项都挂 E）。 */
        const introduce = async (headerId: string, child: BomItem): Promise<BomLine> => {
          const line = new BomLine();
          line.headerId = headerId;
          line.lineNo = 20;
          line.ecnInId = ecn.id;
          await line.save();
          const occurrence = new BomLineOccurrence();
          occurrence.lineId = line.id;
          occurrence.childItemId = child.id;
          occurrence.qty = '1';
          occurrence.uom = 'pcs';
          occurrence.ecnInId = ecn.id;
          occurrence.effectiveFrom = day('2027-01-01');
          await occurrence.save();
          return line;
        };
        const introduced = await introduce(ebomA.header.id, b);
        await introduce(mbom.header.id, p);
        ecn.state = 'released';
        await ecn.save();
        const scope = await scopeOf(ebom.header, mbom.header);
        const save = async (input: Omit<MappingSaveInput, 'scopeId'>): Promise<string> =>
          (await saveMapping(adapter, { scopeId: scope.id, ...input })).mapId;
        const cancel = async (): Promise<void> => {
          ecn.state = 'cancelled';
          await ecn.save();
        };
        return { ebom, ebomB, mbom, mbomP, introduced, scope, save, cancel };
      };

      it('路径失效（源侧）：引入那一跳的 ECN 取消后，失去成员资格的行级映射与失去相邻性的路径级映射在覆盖率与缺口里都标失效，确认跟进拒绝、基线不动', async () => {
        const { ebom, ebomB, mbom, introduced, scope, save, cancel } = await lapseFixture();
        const base = { relation: 'one_to_one' as const, targetLineId: mbom.lines[0].id };
        const control = await save({ ...base, sourceLineId: ebom.lines[0].id });
        const lineLevel = await save({ ...base, sourceLineId: ebomB.lines[0].id });
        const pathLevel = await save({
          ...base,
          sourceLineId: ebomB.lines[0].id,
          sourceLinePath: [ebom.lines[0].id, introduced.id, ebomB.lines[0].id]
        });
        // 相邻性与成员资格不按生效期：E 尚未生效的评估日，路径不在展开里也不是失效
        expect((await mappingCoverage(adapter, scope.id, ctx('2026-09-22'))).invalid).toEqual([]);
        for (const mapId of [control, lineLevel, pathLevel])
          await confirmMapping(adapter, mapId, null, ctx('2027-02-01'));
        const baselines = [await baselineOf(lineLevel), await baselineOf(pathLevel)];
        await cancel();
        const coverage = await mappingCoverage(adapter, scope.id, ctx('2027-02-01'));
        const reasons = new Map(coverage.invalid.map(entry => [entry.mappingId, entry.reason]));
        expect([...reasons.keys()].sort()).toEqual([lineLevel, pathLevel].sort());
        for (const part of [ebomB.lines[0].id, ebom.header.id, '成员', '路径失效']) {
          expect(reasons.get(lineLevel)).toContain(part);
        }
        for (const part of [`${ebom.lines[0].id} → ${introduced.id}`, '相邻', '路径失效']) {
          expect(reasons.get(pathLevel)).toContain(part);
        }
        expect(coverage.covered.map(entry => entry.mappingId)).toEqual([control]);
        const gaps = new Map(
          (await mappingGaps(adapter, scope.id, ctx('2027-02-01'))).gaps.map(gap => [gap.mappingId, gap])
        );
        expect(gaps.get(control)?.invalid).toBeNull();
        expect(gaps.get(control)?.differences).toEqual([]);
        for (const mapId of [lineLevel, pathLevel]) {
          expect(gaps.get(mapId)?.invalid).toEqual({ reason: reasons.get(mapId) });
          // 差异照常给出（消失的步骤逐一点名），失效标记不靠差异
          expect(gaps.get(mapId)?.differences.map(change => change.kind)).toEqual(['missing', 'missing', 'missing']);
          await expect(confirmMapping(adapter, mapId, null, ctx('2027-02-01'))).rejects.toThrow(/路径失效/);
        }
        expect([await baselineOf(lineLevel), await baselineOf(pathLevel)]).toEqual(baselines);
      });

      it('路径失效（目标侧）：目标行失去 MBOM 侧成员资格的映射（含只有目标行的 added）在覆盖率与缺口里标失效、不再算作覆盖，确认跟进拒绝', async () => {
        const { ebom, mbom, mbomP, scope, save, cancel } = await lapseFixture();
        const lapsing = await save({
          relation: 'one_to_one',
          sourceLineId: ebom.lines[0].id,
          targetLineId: mbomP.lines[0].id
        });
        const added = await save({ relation: 'added', targetLineId: mbomP.lines[0].id });
        await confirmMapping(adapter, lapsing, null, ctx('2026-09-22'));
        const before = await mappingCoverage(adapter, scope.id, ctx('2026-09-22'));
        expect(before.invalid).toEqual([]);
        expect(before.covered.map(entry => entry.mappingId)).toEqual([lapsing]);
        await cancel();
        const coverage = await mappingCoverage(adapter, scope.id, ctx('2026-09-22'));
        expect(coverage.covered).toEqual([]);
        expect(coverage.uncovered.map(entry => entry.lineId)).toContain(ebom.lines[0].id);
        const reasons = new Map(coverage.invalid.map(entry => [entry.mappingId, entry.reason]));
        expect([...reasons.keys()].sort()).toEqual([lapsing, added].sort());
        for (const reason of reasons.values()) {
          for (const part of [mbomP.lines[0].id, mbom.header.id, '成员', '路径失效']) expect(reason).toContain(part);
        }
        const gap = (await mappingGaps(adapter, scope.id, ctx('2026-09-22'))).gaps.find(
          entry => entry.mappingId === lapsing
        );
        // 源侧依据没变：只有失效标记，不能因差异为空而算无缺口
        expect(gap?.invalid).toEqual({ reason: reasons.get(lapsing) });
        expect(gap?.differences).toEqual([]);
        for (const mapId of [lapsing, added]) {
          await expect(confirmMapping(adapter, mapId, null, ctx('2026-09-22'))).rejects.toThrow(/路径失效/);
        }
      });

      it('P2-4 M8 多实例并存：saveMapping 经实例的实体构造门面落库', async () => {
        const child = await itemOnly('mi-c');
        const rootRevision = await revisionOf(await itemOnly('mi-root'));
        const ebom = await releasedHeader(rootRevision, 'ebom', [{ child }]);
        const mbom = await releasedHeader(rootRevision, 'mbom', [{ child }]);
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

      /** 两层 EBOM（根 → A → B）+ MBOM 一行；源行是 A 头里到 B 的行（行级映射，已确认）。 */
      const confirmedFixture = async () => {
        const b = await itemOnly('j-b');
        const a = await itemOnly('j-a');
        const rootRevision = await revisionOf(await itemOnly('j-root'));
        const ebom = await releasedHeader(rootRevision, 'ebom', [{ child: a }]);
        const ebomA = await releasedHeader(await revisionOf(a), 'ebom', [{ child: b }]);
        const mbom = await releasedHeader(rootRevision, 'mbom', [{ child: b }]);
        const scope = await scopeOf(ebom.header, mbom.header);
        const { mapId } = await saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'one_to_one',
          sourceLineId: ebomA.lines[0].id,
          targetLineId: mbom.lines[0].id
        });
        await confirmMapping(adapter, mapId, null, ctx('2026-09-22'));
        return { ebom, ebomA, mbom, scope, mapId };
      };

      it('P2-8 空 sourceLinePath 保存即拒（行级映射省略路径），不落库成永远无缺口的映射', async () => {
        const { ebomA, mbom, scope } = await confirmedFixture();
        const before = shapeRows(
          await adapter.rawQuery(`SELECT COUNT(*) FROM ${table('bom_map')} WHERE "scopeId" = '${scope.id}'`)
        );
        const empty = saveMapping(adapter, {
          scopeId: scope.id,
          relation: 'split',
          sourceLineId: ebomA.lines[0].id,
          targetLineId: mbom.lines[0].id,
          sourceLinePath: []
        });
        await expect(empty).rejects.toThrow(BomMapError);
        await expect(empty).rejects.toThrow(/sourceLinePath/);
        expect(
          shapeRows(await adapter.rawQuery(`SELECT COUNT(*) FROM ${table('bom_map')} WHERE "scopeId" = '${scope.id}'`))
        ).toEqual(before);
      });

      it('P2-10 bom_map 的 JSON 列坏 JSON / 形状不对：覆盖率、缺口、确认跟进都点名映射行与列，不抛裸 SyntaxError', async () => {
        const { scope, mapId } = await confirmedFixture();
        const dialect = bomSqlDialectFor(backend);
        const corrupt = async (column: 'sourceLinePath' | 'baselineSteps', raw: string): Promise<void> => {
          await adapter.rawQuery(
            `UPDATE ${table('bom_map')} SET "${column}" = ${dialect.placeholder(0)} WHERE "id" = ${dialect.placeholder(1)}`,
            [raw, mapId]
          );
        };
        const queries = [
          () => mappingCoverage(adapter, scope.id, ctx('2026-09-22')),
          () => mappingGaps(adapter, scope.id, ctx('2026-09-22')),
          () => confirmMapping(adapter, mapId, null, ctx('2026-09-22'))
        ];
        const cases: ['sourceLinePath' | 'baselineSteps', string][] = [
          ['baselineSteps', '{oops'],
          ['baselineSteps', '{"lineId":"l"}'],
          ['baselineSteps', '[{"lineId":"l","occurrenceId":7,"revisionId":null}]'],
          ['sourceLinePath', 'not json'],
          ['sourceLinePath', '[]'],
          ['sourceLinePath', '["l", 2]']
        ];
        for (const [column, raw] of cases) {
          await corrupt(column, raw);
          for (const run of queries) {
            const failure = await run().then(
              () => null,
              (error: unknown) => error
            );
            expect(failure, `${column} = ${raw}`).toBeInstanceOf(BomMapError);
            expect(String((failure as Error).message)).toContain(mapId);
            expect(String((failure as Error).message)).toContain(column);
          }
          await adapter.rawQuery(
            `UPDATE ${table('bom_map')} SET "sourceLinePath" = NULL, "baselineSteps" = '[]' WHERE "id" = '${mapId}'`
          );
        }
      });
    });
  }
});
