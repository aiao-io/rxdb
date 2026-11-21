/**
 * @fileoverview 序列 / 批次有效性（US-518）纯函数与触发器 DDL 测试
 *
 * 纯函数级用例：AC#1 的 136/137 边界、AC#2 双维同时满足、AC#3 批次集合、
 * AC#5 三维相交拒绝 detail、AC#7/#8/#9 单维不相交接受、AC#10 批次不相交接受，
 * 与不带 `unit` 的多候选判定。触发器 SQL 只做生成面断言（含关键谓词的字符串
 * contains），存储层集成（两后端实际安装与拒绝行为）由主会话接入后另测。
 */

import { getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  BOM_EFFECTIVITY_OVERLAP_PREFIX,
  buildUnitLotOverlapGuardPg,
  buildUnitLotOverlapGuardSqlite,
  unitFromGtUnitToCheck
} from '../backend/unit-lot-trigger-ddl.js';
import { BomHeader, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import { rollupCost } from '../quantity/cost.js';
import { explodeBom } from '../quantity/explosion.js';
import { assertCompleteResolution, expandBom, whereUsed } from '../resolve/expansion.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomResolutionError } from '../resolve/resolution.js';
import { resolveBom } from '../resolve/resolver.js';
import {
  describeCandidates,
  effectiveDomainsOverlap,
  lotMatches,
  lotSetsOverlap,
  parseLotCodes,
  selectCandidatesByUnit,
  unitIntervalMatches,
  unitIntervalOverlaps,
  type EffectiveDomain
} from '../resolve/unit-lot.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** 组装有效域（日期传 ISO 串，减少样板）。 */
const domain = (partial: {
  effectiveFrom: string;
  effectiveTo?: string | null;
  unitFrom?: number | null;
  unitTo?: number | null;
  lotCodes?: string[] | null;
}): EffectiveDomain => ({
  effectiveFrom: day(partial.effectiveFrom),
  effectiveTo:
    partial.effectiveTo === undefined ? null
    : partial.effectiveTo === null ? null
    : day(partial.effectiveTo),
  unitFrom: partial.unitFrom ?? null,
  unitTo: partial.unitTo ?? null,
  lotCodes: partial.lotCodes ?? null
});

describe('序列 / 批次纯函数（US-518）', () => {
  it('parseLotCodes：JSON 数组解析、NULL = 全部、坏 JSON / 非字符串数组抛错', () => {
    expect(parseLotCodes(null)).toBeNull();
    expect(parseLotCodes('["B1","B2"]')).toEqual(['B1', 'B2']);
    expect(parseLotCodes('[]')).toEqual([]);
    expect(() => parseLotCodes('not-json')).toThrow(BomResolutionError);
    expect(() => parseLotCodes('"B1"')).toThrow(/批次集合必须是字符串数组/);
    expect(() => parseLotCodes('["B1",1]')).toThrow(/批次集合必须是字符串数组/);
    try {
      parseLotCodes('{bad');
    } catch (error) {
      expect(error).toBeInstanceOf(BomResolutionError);
      expect((error as BomResolutionError).message).toContain('lotCodes');
    }
  });

  it('AC#1：#136 / #137 恰好相邻——旧件 unit ≤ 136、新件 unit ≥ 137，互不相交', () => {
    expect(unitIntervalMatches(null, 136, 136)).toBe(true);
    expect(unitIntervalMatches(137, null, 136)).toBe(false);
    expect(unitIntervalMatches(null, 136, 137)).toBe(false);
    expect(unitIntervalMatches(137, null, 137)).toBe(true);
    // 保存不被判重叠（三维里序列维不相交）
    expect(unitIntervalOverlaps([null, 136], [137, null])).toBe(false);
    // 闭区间共享端点仍相交（136 是旧件的末架）
    expect(unitIntervalOverlaps([null, 136], [136, null])).toBe(true);
    // 未给 unit 恒真（不按序列过滤）
    expect(unitIntervalMatches(null, 136, undefined)).toBe(true);
    expect(unitIntervalMatches(137, null, undefined)).toBe(true);
  });

  it('AC#2：日期与序列两个维度同时满足才入选', () => {
    const oldPart = domain({ effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', unitFrom: null, unitTo: 136 });
    const newPart = domain({ effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', unitFrom: 137, unitTo: null });
    // 点查询 = 有效域与「当日 × 该序列号」求交：日期半开 + 序列闭区间
    const query136 = domain({ effectiveFrom: '2026-05-01', unitFrom: 136, unitTo: 136 });
    const query137 = domain({ effectiveFrom: '2026-05-01', unitFrom: 137, unitTo: 137 });
    expect(effectiveDomainsOverlap(query136, oldPart).overlap).toBe(true);
    expect(effectiveDomainsOverlap(query136, newPart).overlap).toBe(false);
    expect(effectiveDomainsOverlap(query137, oldPart).overlap).toBe(false);
    expect(effectiveDomainsOverlap(query137, newPart).overlap).toBe(true);
    // 日期不满足时序列满足也不入选
    const queryLate = domain({ effectiveFrom: '2027-01-01', unitFrom: 140, unitTo: 140 });
    expect(effectiveDomainsOverlap(queryLate, newPart).overlap).toBe(false);
  });

  it('AC#3：批次精确匹配，NULL = 全部批次', () => {
    expect(lotMatches(['B1'], 'B1')).toBe(true);
    expect(lotMatches(['B1'], 'B2')).toBe(false);
    expect(lotMatches(null, 'B1')).toBe(true);
    expect(lotMatches(null, 'B2')).toBe(true);
    expect(lotMatches(['B1'], undefined)).toBe(true);
    expect(lotMatches([], undefined)).toBe(false);
    expect(lotSetsOverlap(null, [])).toBe(false);
    expect(lotSetsOverlap([], null)).toBe(false);
    // 集合相交口径：NULL 与任何集合相交，交集非空才相交
    expect(lotSetsOverlap(null, ['B2'])).toBe(true);
    expect(lotSetsOverlap(['B1', 'B2'], ['B2', 'B3'])).toBe(true);
    expect(lotSetsOverlap(['B1'], ['B2'])).toBe(false);
  });

  it('AC#5：三维同时相交才拒绝，detail 给出相交的三段中文描述', () => {
    const oldPart = domain({ effectiveFrom: '2026-01-01', effectiveTo: null, unitFrom: null, unitTo: 136 });
    const newPart = domain({
      effectiveFrom: '2026-06-01',
      effectiveTo: '2026-10-01',
      unitFrom: 100,
      unitTo: 200,
      lotCodes: ['B1']
    });
    const result = effectiveDomainsOverlap(oldPart, newPart);
    expect(result.overlap).toBe(true);
    expect(result.detail).toBe(
      '日期 [2026-01-01, +∞) ∩ [2026-06-01, 2026-10-01)、序列 [1, 136] ∩ [100, 200]、批次 全部 ∩ {B1}'
    );
  });

  it('AC#7/#8/#9：任一维不相交即可并存', () => {
    // 日期相交、序列不相交 → 接受
    const ac7a = domain({ effectiveFrom: '2026-01-01', effectiveTo: '2026-06-01', unitFrom: null, unitTo: 100 });
    const ac7b = domain({ effectiveFrom: '2026-03-01', effectiveTo: '2026-09-01', unitFrom: 101, unitTo: null });
    expect(effectiveDomainsOverlap(ac7a, ac7b).overlap).toBe(false);
    // 日期不相交、序列相交 → 接受
    const ac8a = domain({ effectiveFrom: '2026-01-01', effectiveTo: '2026-02-01', unitFrom: null, unitTo: 100 });
    const ac8b = domain({ effectiveFrom: '2026-03-01', effectiveTo: '2026-04-01', unitFrom: 50, unitTo: 150 });
    expect(effectiveDomainsOverlap(ac8a, ac8b).overlap).toBe(false);
    // 日期、序列都不相交 → 接受
    const ac9a = domain({ effectiveFrom: '2026-01-01', effectiveTo: '2026-02-01', unitFrom: null, unitTo: 100 });
    const ac9b = domain({ effectiveFrom: '2026-03-01', effectiveTo: '2026-04-01', unitFrom: 101, unitTo: null });
    expect(effectiveDomainsOverlap(ac9a, ac9b).overlap).toBe(false);
  });

  it('AC#10：日期、序列相交但批次集合不相交 → 接受', () => {
    const a = domain({ effectiveFrom: '2026-01-01', effectiveTo: null, unitFrom: null, unitTo: 136, lotCodes: ['B1'] });
    const b = domain({ effectiveFrom: '2026-01-01', effectiveTo: null, unitFrom: 100, unitTo: 200, lotCodes: ['B2'] });
    expect(effectiveDomainsOverlap(a, b).overlap).toBe(false);
    // 同款数据批次相交时三维齐 → 拒绝
    const c = domain({
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      unitFrom: 100,
      unitTo: 200,
      lotCodes: ['B1', 'B2']
    });
    expect(effectiveDomainsOverlap(a, c).overlap).toBe(true);
  });

  it('AC#6：不带 unit 的多候选判定——全部候选列出，消费方标 unresolved', () => {
    const candidates = [
      { unitFrom: null, unitTo: 136 },
      { unitFrom: 137, unitTo: null }
    ];
    expect(describeCandidates(candidates)).toBe('#1 候选：unit ≤ 136；#2 候选：unit ≥ 137');
    expect(describeCandidates([{ unitFrom: 10, unitTo: 20 }])).toBe('#1 候选：unit ∈ [10, 20]');
    expect(describeCandidates([{ unitFrom: null, unitTo: null }])).toBe('#1 候选：全部序列');
    // unit 未给 → 全部候选（多于一个即 unresolved）
    expect(selectCandidatesByUnit(candidates, undefined)).toEqual([0, 1]);
    // unit 给定时恰好命中其一
    expect(selectCandidatesByUnit(candidates, 136)).toEqual([0]);
    expect(selectCandidatesByUnit(candidates, 137)).toEqual([1]);
  });
});

describe('三维重叠触发器 DDL（US-518）', () => {
  it('SQLite 守卫：INSERT/UPDATE 触发器含三维谓词与 detail 消息', () => {
    const metadata = getEntityMetadata(BomLineOccurrence);
    const sql = buildUnitLotOverlapGuardSqlite(metadata).join('\n');
    // 先删后建：升级后旧版本同名触发器体被替换（IF NOT EXISTS 会让旧体静默保留）
    expect(sql).toContain('DROP TRIGGER IF EXISTS "bom_line_occurrence_unit_lot_overlap_i"');
    expect(sql).toContain('DROP TRIGGER IF EXISTS "bom_line_occurrence_unit_lot_overlap_u"');
    expect(sql).toContain('CREATE TRIGGER "bom_line_occurrence_unit_lot_overlap_i"');
    expect(sql).toContain('CREATE TRIGGER "bom_line_occurrence_unit_lot_overlap_u"');
    expect(sql).not.toContain('IF NOT EXISTS');
    expect(sql).toContain('BEFORE INSERT');
    expect(sql).toContain('BEFORE UPDATE');
    expect(sql).toContain('RAISE(ABORT');
    expect(sql).toContain('LIMIT 1');
    // 三维谓词：日期半开、序列 COALESCE + IS NULL、批次 json_each 集合相交
    expect(sql).toContain('"effectiveTo" IS NULL');
    expect(sql).toContain('"effectiveFrom" <');
    expect(sql).toContain('COALESCE(NEW."unitFrom", 1)');
    expect(sql).toContain('"unitTo" IS NULL');
    expect(sql).toContain('json_each');
    expect(sql).toContain('"lotCodes" IS NULL');
    // 排除自身 + 同逻辑行
    expect(sql).toContain('b."lineId" = NEW."lineId"');
    expect(sql).toContain('b."id" <> NEW."id"');
    // 消息前缀与三维 detail 形态
    expect(sql).toContain(BOM_EFFECTIVITY_OVERLAP_PREFIX);
    expect(sql).toContain("'、日期 '");
    expect(sql).toContain("'、序列 '");
    expect(sql).toContain("'、批次 '");
    expect(sql).toContain('group_concat');
  });

  it('日期维下界 NULL 显式按无下界参与判定（与序列维同一防御口径），消息不因 NULL 塌成空', () => {
    const metadata = getEntityMetadata(BomLineOccurrence);
    const sqlite = buildUnitLotOverlapGuardSqlite(metadata).join('\n');
    expect(sqlite).toContain('NEW."effectiveFrom" IS NULL OR NEW."effectiveFrom" < b."effectiveTo"');
    expect(sqlite).toContain('b."effectiveFrom" IS NULL OR b."effectiveFrom" < NEW."effectiveTo"');
    expect(sqlite).toContain(`COALESCE(NEW."effectiveFrom", '-∞')`);
    const pg = buildUnitLotOverlapGuardPg(metadata).join('\n');
    expect(pg).toContain('NEW."effectiveFrom" IS NULL OR NEW."effectiveFrom" < b."effectiveTo"');
    expect(pg).toContain('b."effectiveFrom" IS NULL OR b."effectiveFrom" < NEW."effectiveTo"');
    expect(pg).toContain(`COALESCE(NEW."effectiveFrom"::text, '-∞')`);
  });

  it('PGlite 守卫：plpgsql 函数 + DO 块触发器，裸 EXECUTE FUNCTION', () => {
    const metadata = getEntityMetadata(BomLineOccurrence);
    const sql = buildUnitLotOverlapGuardPg(metadata).join('\n');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION "bom"."bom_line_occurrence__unit_lot_overlap_guard"()');
    expect(sql).toContain('RETURNS trigger');
    expect(sql).toContain('LANGUAGE plpgsql');
    expect(sql).toContain('RAISE EXCEPTION');
    // PGlite 解析器坑：CREATE TRIGGER 走 DO 块、EXECUTE FUNCTION 目标不带引号
    expect(sql).toContain('DO $$');
    expect(sql).toContain('DROP TRIGGER IF EXISTS "bom_line_occurrence__unit_lot_overlap_trg"');
    expect(sql).toContain('EXECUTE FUNCTION bom.bom_line_occurrence__unit_lot_overlap_guard();');
    expect(sql).not.toContain('EXECUTE FUNCTION "bom"');
    // 三维谓词：批次维用 jsonb_array_elements_text
    expect(sql).toContain('jsonb_array_elements_text');
    expect(sql).toContain('::jsonb');
    expect(sql).toContain('COALESCE(NEW."unitFrom", 1)');
    expect(sql).toContain(BOM_EFFECTIVITY_OVERLAP_PREFIX);
    expect(sql).toContain('string_agg');
  });

  it('AC#4：unitFrom > unitTo 的 CHECK 表达式文本', () => {
    const metadata = getEntityMetadata(BomLineOccurrence);
    expect(unitFromGtUnitToCheck(metadata)).toBe('"unitFrom" <= "unitTo"');
  });

  it('非发生项实体不产出守卫 DDL', () => {
    const metadata = getEntityMetadata(BomLine);
    expect(buildUnitLotOverlapGuardSqlite(metadata)).toEqual([]);
    expect(buildUnitLotOverlapGuardPg(metadata)).toEqual([]);
  });
});

for (const backend of ['wa-sqlite', 'pglite'] as const satisfies readonly BomTestBackend[]) {
  describe(`序列批次真实存储与解析 [${backend}]`, () => {
    it('AC#1/#6：136/137 分段、未指定时列候选，数量与结构同口径，成本拒绝', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const items: BomItem[] = [];
        for (const name of ['unit-parent', 'unit-old', 'unit-new']) {
          const item = new BomItem();
          item.itemNo = name;
          await item.save();
          items.push(item);
        }
        const context = { bomType: 'ebom' as const, orgId: 'org-unit', asOfDate: day('2026-06-01') };
        await loadHistory(adapter, {
          batchNo: 'unit-fixture',
          revisions: [{ itemId: items[0].id, revisionNo: 'A', effectiveFrom: day('2026-01-01') }],
          headers: [
            {
              revisionIndex: 0,
              bomType: 'ebom',
              orgId: context.orgId,
              costLotQty: '1',
              lines: [
                {
                  lineNo: 10,
                  occurrences: [
                    { childItemId: items[1].id, qty: '1', effectiveFrom: day('2026-01-01'), unitTo: 136 },
                    { childItemId: items[2].id, qty: '1', effectiveFrom: day('2026-01-01'), unitFrom: 137 }
                  ]
                }
              ]
            }
          ]
        });
        const occurrenceTable = backend === 'pglite' ? '"bom"."bom_line_occurrence"' : '"bom$bom_line_occurrence"';
        await expect(
          adapter.rawQuery(`UPDATE ${occurrenceTable} SET "unitTo" = 135 WHERE "unitTo" = 136`)
        ).rejects.toThrow(/写入协议|write_protocol/);
        const target = { parentItemId: items[0].id };
        for (const [unit, item] of [
          [136, items[1]],
          [137, items[2]]
        ] as const) {
          expect(
            (await resolveBom(adapter, { ...context, unit }, target)).occurrences.map(row => row.childItemId)
          ).toEqual([item.id]);
          expect((await expandBom(adapter, { ...context, unit }, target)).nodes.map(row => row.itemId)).toEqual([
            items[0].id,
            item.id
          ]);
        }
        const usageTarget = { childItemId: items[1].id };
        const usage = await whereUsed(adapter, context, usageTarget);
        expect(usage.nodes).toEqual([]);
        expect(usage.unresolved).toEqual([
          expect.objectContaining({
            reason: 'unit',
            candidates: expect.arrayContaining([
              expect.objectContaining({ childItemId: items[1].id, unitTo: 136 }),
              expect.objectContaining({ childItemId: items[2].id, unitFrom: 137 })
            ])
          })
        ]);
        expect(() => assertCompleteResolution(usage)).toThrow(/unit|序列/);
        expect((await whereUsed(adapter, { ...context, unit: 136 }, usageTarget)).nodes.map(row => row.itemId)).toEqual(
          [items[0].id]
        );
        expect((await whereUsed(adapter, { ...context, unit: 137 }, usageTarget)).nodes).toEqual([]);
        const unresolved = await resolveBom(adapter, context, target);
        expect(unresolved.occurrences).toEqual([]);
        expect(unresolved.manifest.unresolved).toHaveLength(1);
        expect(unresolved.manifest.unresolved[0].candidates).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ childItemId: items[1].id, unitFrom: null, unitTo: 136 }),
            expect.objectContaining({ childItemId: items[2].id, unitFrom: 137, unitTo: null })
          ])
        );
        expect(() => assertCompleteResolution(unresolved)).toThrow(/unit|序列/);
        const explosion = await explodeBom(adapter, context, target, { plannedQty: { value: '1', uom: 'pcs' } });
        expect(explosion.requirementLines).toEqual([]);
        expect(explosion.manifest.unresolved).toHaveLength(1);
        await expect(
          rollupCost(adapter, { ...context, currency: 'CNY', rateDate: context.asOfDate }, target)
        ).rejects.toThrow(/unit|序列/);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('反查按同行完整批次候选消歧，指定其他批次不会返回目标子件', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const items: BomItem[] = [];
        for (const itemNo of ['usage-parent', 'usage-lot-b1', 'usage-lot-b2']) {
          const item = new BomItem();
          item.itemNo = itemNo;
          await item.save();
          items.push(item);
        }
        const context = { bomType: 'ebom' as const, orgId: 'usage-lot', asOfDate: day('2026-06-01') };
        await loadHistory(adapter, {
          batchNo: 'usage-lot-fixture',
          revisions: [{ itemId: items[0].id, revisionNo: 'A', effectiveFrom: day('2026-01-01') }],
          headers: [
            {
              revisionIndex: 0,
              bomType: 'ebom',
              orgId: context.orgId,
              lines: [
                {
                  lineNo: 10,
                  occurrences: [1, 2].map(index => ({
                    childItemId: items[index].id,
                    qty: '1',
                    effectiveFrom: day('2026-01-01'),
                    lotCodes: JSON.stringify([`B${index}`])
                  }))
                }
              ]
            }
          ]
        });
        const target = { childItemId: items[1].id };
        const unresolved = await whereUsed(adapter, context, target);
        expect(unresolved.nodes).toEqual([]);
        expect(unresolved.unresolved).toEqual([
          expect.objectContaining({
            reason: 'lot',
            candidates: expect.arrayContaining([
              expect.objectContaining({ childItemId: items[1].id, lotCodes: ['B1'] }),
              expect.objectContaining({ childItemId: items[2].id, lotCodes: ['B2'] })
            ])
          })
        ]);
        const selected = await whereUsed(adapter, { ...context, lot: 'B1' }, target);
        expect(selected.nodes.map(row => row.itemId)).toEqual([items[0].id]);
        expect(selected.unresolved).toBeUndefined();
        const excluded = await whereUsed(adapter, { ...context, lot: 'B2' }, target);
        expect(excluded.nodes).toEqual([]);
        expect(excluded.unresolved).toBeUndefined();
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('AC#2/#3：日期、序列、批次同时过滤，单个序列候选不要求 unit', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const items: BomItem[] = [];
        for (const itemNo of ['lot-parent', 'lot-specific', 'lot-all']) {
          const item = new BomItem();
          item.itemNo = itemNo;
          await item.save();
          items.push(item);
        }
        await loadHistory(adapter, {
          batchNo: 'lot-fixture',
          revisions: [{ itemId: items[0].id, revisionNo: 'A', effectiveFrom: day('2026-01-01') }],
          headers: [
            {
              revisionIndex: 0,
              bomType: 'ebom',
              orgId: 'org-lot',
              lines: [
                {
                  lineNo: 10,
                  occurrences: [
                    {
                      childItemId: items[1].id,
                      qty: '1',
                      effectiveFrom: day('2026-01-01'),
                      effectiveTo: day('2026-12-01'),
                      unitFrom: 137,
                      unitTo: 200,
                      lotCodes: '["B1"]'
                    }
                  ]
                },
                { lineNo: 20, occurrences: [{ childItemId: items[2].id, qty: '1', effectiveFrom: day('2026-01-01') }] }
              ]
            }
          ]
        });
        const context = { bomType: 'ebom' as const, orgId: 'org-lot', asOfDate: day('2026-06-01'), unit: 137 };
        const target = { parentItemId: items[0].id };
        const run = async (patch: Partial<typeof context> & { lot?: string }) =>
          (await resolveBom(adapter, { ...context, ...patch }, target)).occurrences.map(row => row.childItemId);
        expect(await run({ lot: 'B1' })).toEqual([items[1].id, items[2].id]);
        expect(await run({ lot: 'B2' })).toEqual([items[2].id]);
        expect(await run({ lot: 'B1', unit: 136 })).toEqual([items[2].id]);
        expect(await run({ lot: 'B1', asOfDate: day('2026-12-01') })).toEqual([items[2].id]);
        const single = await resolveBom(adapter, { ...context, unit: undefined, lot: 'B1' }, target);
        expect(single.occurrences).toHaveLength(2);
        expect(single.manifest.unresolved).toEqual([]);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('AC#4/#5/#7/#8/#9/#10：存储三维矩阵、区间 CHECK 与 UPDATE 兜底', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const parent = new BomItem();
        parent.itemNo = 'matrix-parent';
        await parent.save();
        const child = new BomItem();
        child.itemNo = 'matrix-child';
        await child.save();
        const revision = new BomItemRevision();
        revision.itemId = parent.id;
        revision.revisionNo = 'A';
        await revision.save();
        const header = new BomHeader();
        header.parentRevisionId = revision.id;
        header.bomType = 'ebom';
        header.orgId = 'org-unit';
        await header.save();
        const create = async (lineId: string, patch: Partial<BomLineOccurrence>) => {
          const occurrence = new BomLineOccurrence();
          Object.assign(
            occurrence,
            {
              lineId,
              childItemId: child.id,
              qty: '1',
              effectiveFrom: day('2026-01-01'),
              effectiveTo: day('2026-06-01'),
              unitFrom: 1,
              unitTo: 136
            },
            patch
          );
          await occurrence.save();
          return occurrence;
        };
        const patches: Partial<BomLineOccurrence>[] = [
          { unitFrom: 137, unitTo: null },
          { effectiveFrom: day('2026-06-01'), effectiveTo: null },
          { effectiveFrom: day('2026-06-01'), effectiveTo: null, unitFrom: 137, unitTo: null },
          { lotCodes: '["B2"]' }
        ];
        for (const [index, patch] of patches.entries()) {
          const line = new BomLine();
          line.headerId = header.id;
          line.lineNo = index + 10;
          await line.save();
          await create(line.id, { lotCodes: index === 3 ? '["B1"]' : null });
          const candidate = await create(line.id, patch);
          expect(candidate.id).toBeTruthy();
        }
        const line = new BomLine();
        line.headerId = header.id;
        line.lineNo = 50;
        await line.save();
        await create(line.id, {});
        await expect(create(line.id, { unitFrom: 100, unitTo: 200 })).rejects.toThrow(/日期.*序列/);
        await expect(create(line.id, { unitFrom: 200, unitTo: 100 })).rejects.toThrow(/check|CHECK|unit/i);
        const adjacent = await create(line.id, { unitFrom: 137, unitTo: null });
        adjacent.unitFrom = 100;
        await expect(adjacent.save()).rejects.toThrow(/日期.*序列/);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });
  });
}
