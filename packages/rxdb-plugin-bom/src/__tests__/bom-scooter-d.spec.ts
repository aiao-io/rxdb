/**
 * @fileoverview SC-100 种子 D 层回归测试（US-525 AC#13~#15 vitest 面）
 *
 * 双后端（wa-sqlite / pglite）同断言：整机成本卷算逐项等于手写 golden D
 * （材料/加工/制费/抵减/总额）；缺成本子件报缺失不以 0 兜底；EBOM↔MBOM split 映射
 * 双向可追溯（同一源行三个目标行，两张根头挂在同一物料的同一修订上）。
 */

import { describe, expect, it } from 'vitest';
import { rollupCost } from '../quantity/cost.js';
import { decimalAdd, decimalFromCanonical, decimalToCanonical } from '../quantity/decimal.js';
import {
  deterministicId,
  loadScooterDataset,
  loadScooterDatasetC,
  loadScooterDatasetD
} from '../testing/scooter-dataset.js';
import { goldenItemId, SCOOTER_GOLDEN_D } from '../testing/scooter-golden.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** 规范十进制串求和（断言用，不经 JS number）。 */
const decimalSum = (amounts: string[]): string =>
  decimalToCanonical(
    amounts.reduce((sum, amount) => decimalAdd(sum, decimalFromCanonical(amount)), decimalFromCanonical('0'))
  );

/** rawQuery 双形状归一。 */
const shapeRows = (result: unknown): unknown[][] => {
  const shaped = result as { results?: { rows: unknown[][] }[]; rows?: unknown[][] };
  if (Array.isArray(shaped.results)) return shaped.results[0].rows;
  return shaped.rows ?? [];
};

for (const backend of BACKENDS) {
  describe(`SC-100 种子 D 层 [${backend}]`, () => {
    it('AC#14 整机成本卷算逐项等于手写 golden D', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const itemIds = await loadScooterDataset(adapter);
        await loadScooterDatasetC(adapter, itemIds);
        await loadScooterDatasetD(adapter, itemIds);
        const result = await rollupCost(
          adapter,
          {
            bomType: SCOOTER_GOLDEN_D.context.bomType,
            orgId: SCOOTER_GOLDEN_D.context.orgId,
            asOfDate: day(SCOOTER_GOLDEN_D.context.asOfDate),
            currency: SCOOTER_GOLDEN_D.context.currency,
            rateDate: day(SCOOTER_GOLDEN_D.context.rateDate)
          },
          { parentItemId: goldenItemId(SCOOTER_GOLDEN_D.rootKey) },
          { value: SCOOTER_GOLDEN_D.batchQty.value, uom: SCOOTER_GOLDEN_D.batchQty.uom }
        );
        expect(result.root.batchCost).toBe(SCOOTER_GOLDEN_D.batchCost);
        expect(result.root.unitCost).toBe(SCOOTER_GOLDEN_D.unitCost);
        // 虚拟线束的四条材料穿透到根层，M3 的线束用量和整机直接用量分别保留。
        const materialRows = result.root.material.map(line => [
          line.childItemId,
          line.demand,
          line.demandUom,
          line.unitCost,
          line.amount
        ]);
        expect(materialRows).toHaveLength(9);
        expect(materialRows).toEqual(
          expect.arrayContaining([
            [goldenItemId('SEAT'), '1', 'pcs', '1', '1'],
            [
              goldenItemId('PCBA'),
              '1',
              'pcs',
              '8.020408163265306122448979591836735',
              '8.020408163265306122448979591836735'
            ],
            [goldenItemId('WIRE'), '1.2', 'm', '1', '1.2'],
            [goldenItemId('TERMINAL'), '2', 'pcs', '1', '2'],
            [goldenItemId('SHRINK'), '1', 'pcs', '1', '1'],
            [goldenItemId('M3'), '4', 'pcs', '1', '4'],
            [goldenItemId('BATT'), '1', 'pcs', '11', '11'],
            [goldenItemId('M3'), '8', 'pcs', '1', '8'],
            [goldenItemId('HOUSING'), '1', 'pcs', '2.9', '2.9']
          ])
        );
        const phantomOccurrenceIds: string[] = [0, 1, 2, 3].map(index =>
          deterministicId(`occurrence:WH-01:D:${index}`)
        );
        const phantomMaterials = result.root.material.filter(line => phantomOccurrenceIds.includes(line.occurrenceId));
        expect(phantomMaterials.map(line => line.occurrenceId)).toEqual(phantomOccurrenceIds);
        expect(decimalSum(phantomMaterials.map(line => line.amount))).toBe('8.2');
        const materialTotal = decimalSum(result.root.material.map(line => line.amount));
        expect(materialTotal).toBe(SCOOTER_GOLDEN_D.materialTotal);
        expect(result.root.processing).toEqual([]);
        expect(result.root.overhead).toBe('0');
        expect(result.root.credits).toEqual([]);
        expect(result.root.children.map(child => child.itemId)).toEqual([
          goldenItemId('PCBA'),
          goldenItemId('BATT'),
          goldenItemId('HOUSING')
        ]);
        // HOUSING 节点逐项：材料 SHEET 2 / 加工 0.5h × 2 / 制费 0.2 / 抵减 OFFCUT 0.3
        const housing = result.root.children.find(child => child.itemId === goldenItemId('HOUSING'));
        expect(housing).toBeDefined();
        expect(housing!.material).toEqual([
          expect.objectContaining({
            childItemId: goldenItemId('SHEET'),
            demand: '2',
            demandUom: 'pcs',
            unitCost: '1',
            amount: '2'
          })
        ]);
        expect(housing!.processing).toEqual([
          {
            operationSeq: 10,
            setup: '0',
            run: '0.5',
            fixed: '0',
            hours: '0.5',
            timeUom: 'h',
            rateHours: '0.5',
            rateUom: 'h',
            rate: '2',
            amount: SCOOTER_GOLDEN_D.processingTotal
          }
        ]);
        expect(housing!.overhead).toBe(SCOOTER_GOLDEN_D.overhead);
        expect(housing!.credits).toEqual([
          expect.objectContaining({
            childItemId: goldenItemId('OFFCUT'),
            outQty: '0.3',
            outUom: 'pcs',
            creditPrice: '1',
            amount: SCOOTER_GOLDEN_D.creditTotal
          })
        ]);
        expect(housing!.batchCost).toBe('2.9');
      } finally {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      }
    });

    it('AC#15 缺成本的子件：卷算明确报缺失，不以 0 兜底', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const itemIds = await loadScooterDataset(adapter);
        await loadScooterDatasetC(adapter, itemIds);
        await loadScooterDatasetD(adapter, itemIds);
        await expect(
          rollupCost(
            adapter,
            {
              bomType: 'ebom',
              orgId: 'org-x',
              asOfDate: day('2026-10-15'),
              currency: 'CNY',
              rateDate: day('2026-10-15')
            },
            { parentItemId: goldenItemId('COST-DEMO') }
          )
        ).rejects.toThrow(/缺成本|缺失/);
      } finally {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      }
    });

    it('AC#13 EBOM 钣金 → MBOM 板材 + 2 工序件：split 映射双向可追溯', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const itemIds = await loadScooterDataset(adapter);
        await loadScooterDatasetC(adapter, itemIds);
        await loadScooterDatasetD(adapter, itemIds);
        const scopeId = deterministicId('map-scope:D');
        const ebomHeaderId = deterministicId('header:SHEET-ASSY:A');
        const mbomHeaderId = deterministicId('header:SHEET-ASSY:A:mbom');
        // 变换范围两侧父件同一物料（US-516）：两张头挂在 SHEET-ASSY 的同一修订 A 上
        const headerTable = backend === 'wa-sqlite' ? '"bom$bom_header"' : '"bom"."bom_header"';
        const revisionTable = backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"';
        const roots = shapeRows(
          await adapter.rawQuery(
            `SELECT h."id", h."bomType", h."parentRevisionId", r."itemId" FROM ${headerTable} h JOIN ${revisionTable} r ON r."id" = h."parentRevisionId" WHERE h."id" IN ('${ebomHeaderId}', '${mbomHeaderId}') ORDER BY h."bomType"`
          )
        ).map(row => row.map(String));
        const revisionId = deterministicId('revision:SHEET-ASSY:A');
        expect(roots).toEqual([
          [ebomHeaderId, 'ebom', revisionId, goldenItemId('SHEET-ASSY')],
          [mbomHeaderId, 'mbom', revisionId, goldenItemId('SHEET-ASSY')]
        ]);
        const lineTable = backend === 'wa-sqlite' ? '"bom$bom_line"' : '"bom"."bom_line"';
        const ebomLineId = String(
          shapeRows(
            await adapter.rawQuery(
              `SELECT l."id" FROM ${lineTable} l WHERE l."headerId" = '${ebomHeaderId}' ORDER BY l."lineNo" ASC`
            )
          )[0][0]
        );
        const mbomLineIds = shapeRows(
          await adapter.rawQuery(
            `SELECT l."id" FROM ${lineTable} l WHERE l."headerId" = '${mbomHeaderId}' ORDER BY l."lineNo" ASC`
          )
        ).map(row => String(row[0]));
        expect(mbomLineIds).toHaveLength(3);
        const rows = shapeRows(
          await adapter.rawQuery(
            `SELECT "relation", "sourceLineId", "targetLineId" FROM ${backend === 'wa-sqlite' ? '"bom$bom_map"' : '"bom"."bom_map"'} WHERE "scopeId" = '${scopeId}' ORDER BY "targetLineId"`
          )
        );
        expect(rows).toHaveLength(3);
        for (const row of rows) {
          expect(String(row[0])).toBe('split');
          expect(String(row[1])).toBe(ebomLineId);
        }
        // 双向：三个目标行各不相同（板材 + 2 工序件）
        const targets = rows.map(row => String(row[2]));
        expect(new Set(targets).size).toBe(3);
        for (const target of mbomLineIds) {
          expect(targets).toContain(target);
        }
      } finally {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      }
    });
  });
}
