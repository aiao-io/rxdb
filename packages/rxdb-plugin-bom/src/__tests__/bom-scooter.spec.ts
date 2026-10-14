/**
 * @fileoverview SC-100 种子回归测试（US-525 阶段 A：AC#1 vitest 面 + 手写 golden 对账）
 *
 * 双后端（wa-sqlite / pglite）：两遍装载逐字节相同；explodeBom 结果与手写 golden
 * 逐位一致（共享输入、独立 oracle——golden 不由被测 kernel 生成）。
 */

import { describe, expect, it } from 'vitest';
import { explodeBom } from '../quantity/explosion.js';
import { loadScooterDataset, SCOOTER_SEED_BATCH_NO } from '../testing/scooter-dataset.js';
import { goldenItemId, goldenOccurrenceId, SCOOTER_GOLDEN } from '../testing/scooter-golden.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** 把 rawQuery 双形状归一为行列。 */
const shapeRows = (result: unknown): { columns: string[]; rows: unknown[][] } => {
  const shaped = result as { results?: { columns: string[]; rows: unknown[][] }[]; columns?: string[]; rows?: unknown[] };
  if (Array.isArray(shaped.results)) return shaped.results[0];
  return { columns: shaped.columns ?? [], rows: (shaped.rows ?? []) as unknown[][] };
};

/** 全表 dump（按主键排序的规范文本，逐字节比对用）。 */
const dumpTables = async (adapter: BomTestAdapter): Promise<string> => {
  const tableRef = adapter.name === 'wa-sqlite' ? (name: string): string => `"bom$${name}"` : (name: string): string => `"bom"."${name}"`;
  const parts: string[] = [];
  for (const name of ['item', 'item_revision', 'bom_header', 'bom_line', 'bom_line_occurrence', 'bom_line_designator', 'bom_history_batch']) {
    const result = shapeRows(await adapter.rawQuery(`SELECT * FROM ${tableRef(name)} ORDER BY "id"`));
    parts.push(`== ${name}`);
    // updatedAt / createdBy 是引擎在每次 update 时强制刷新的系统列，不参与确定性比对
    const kept = result.columns.map((column, index) => ({ column, index }))
      .filter(entry => entry.column !== 'updatedAt' && entry.column !== 'createdBy');
    for (const row of result.rows) {
      parts.push(kept.map(({ column, index }) => {
        const value = row[index];
        return `${column}=${value instanceof Date ? value.toISOString() : String(value)}`;
      }).join('|'));
    }
  }
  return parts.join('\n');
};

for (const backend of BACKENDS) {
  describe(`SC-100 种子 [${backend}]`, () => {
    /** 建库并装载种子（实体构造在多实例间歧义：同一时刻只保持一个连接）。 */
    const loadOnce = async (): Promise<BomTestAdapter> => {
      const created = await createBomTestAdapter(backend);
      await loadScooterDataset(created);
      return created;
    };

    it('AC#1 确定性：两个独立库装载后全表逐字节相同、批次号是常量', async () => {
      const first = await loadOnce();
      const firstDump = await dumpTables(first);
      await disposeBomTestAdapter(first).catch(() => undefined);
      const second = await loadOnce();
      try {
        const secondDump = await dumpTables(second);
        expect(secondDump).toBe(firstDump);
        expect(SCOOTER_SEED_BATCH_NO).toBe('scooter-seed-a');
      } finally {
        await disposeBomTestAdapter(second).catch(() => undefined);
      }
    });

    it('形状：10kΩ 电阻三条逻辑行三组位号（US-525 AC#2 的输入面）', async () => {
      const created = await loadOnce();
      try {
        const r10kId = goldenItemId('R10K');
        const table = (name: string): string => created.name === 'wa-sqlite' ? `"bom$${name}"` : `"bom"."${name}"`;
        const rows = shapeRows(await created.rawQuery(
          `SELECT l."lineNo", occ."qty", (SELECT COUNT(*) FROM ${table('bom_line_designator')} d WHERE d."occurrenceId" = occ."id") AS "designatorCount"` +
          ` FROM ${table('bom_line_occurrence')} occ` +
          ` JOIN ${table('bom_line')} l ON l."id" = occ."lineId"` +
          ` WHERE occ."childItemId" = '${r10kId}' ORDER BY l."lineNo"`
        ));
        expect(rows.rows.length).toBe(3);
        expect(rows.rows.map(row => [row[0], row[1], row[2]])).toEqual([
          [20, '2', 2],
          [30, '3', 3],
          [40, '1', 1]
        ]);
      } finally {
        await disposeBomTestAdapter(created).catch(() => undefined);
      }
    });

    it('golden 对账：explodeBom 需求行与七步中间值逐位等于手写 golden', async () => {
      const created = await loadOnce();
      try {
        const result = await explodeBom(
          created,
          { bomType: SCOOTER_GOLDEN.context.bomType, orgId: SCOOTER_GOLDEN.context.orgId, asOfDate: day(SCOOTER_GOLDEN.context.asOfDate) },
          { parentItemId: goldenItemId(SCOOTER_GOLDEN.rootKey) },
          { plannedQty: { value: SCOOTER_GOLDEN.plannedQty.value, uom: SCOOTER_GOLDEN.plannedQty.uom } }
        );
        expect(result.truncated).toBeNull();
        // 需求行条数
        expect(result.requirementLines.length).toBe(SCOOTER_GOLDEN.requirements.length);
        // 每条 golden 行都能在结果里找到逐位一致的行
        for (const goldenLine of SCOOTER_GOLDEN.requirements) {
          const pathIds = goldenLine.pathKey.map(goldenOccurrenceId);
          const actual = result.requirementLines.find(line => line.path.join('>') === pathIds.join('>'));
          expect(actual, `路径 ${goldenLine.pathKey.join(' → ')} 应有需求行`).toBeDefined();
          expect(actual!.itemId).toBe(goldenItemId(goldenLine.itemKey));
          expect(actual!.qty).toBe(goldenLine.qty);
          expect(actual!.uom).toBe(goldenLine.uom);
          expect(actual!.steps.planned).toEqual(goldenLine.steps.planned);
          expect(actual!.steps.assemblyScrapped).toEqual(goldenLine.steps.assemblyScrapped);
          expect(actual!.steps.gross).toEqual(goldenLine.steps.gross);
          expect(actual!.steps.componentScrapped).toEqual(goldenLine.steps.componentScrapped);
          expect(actual!.steps.converted).toEqual(goldenLine.steps.converted);
        }
        // 穿透记录：WH-01 经修订级 phantom 归一为 1 m
        expect(result.penetrations.length).toBe(SCOOTER_GOLDEN.penetrations.length);
        const penetration = result.penetrations[0];
        const goldenPenetration = SCOOTER_GOLDEN.penetrations[0];
        expect(penetration.path.map(id => id).join('>')).toBe(goldenPenetration.pathKey.map(goldenOccurrenceId).join('>'));
        expect(penetration.childItemId).toBe(goldenItemId(goldenPenetration.itemKey));
        expect(penetration.source).toBe(goldenPenetration.source);
        expect(penetration.converted).toEqual(goldenPenetration.converted);
        expect(penetration.childPlanned).toEqual(goldenPenetration.childPlanned);
      } finally {
        await disposeBomTestAdapter(created).catch(() => undefined);
      }
    });
  });
}
