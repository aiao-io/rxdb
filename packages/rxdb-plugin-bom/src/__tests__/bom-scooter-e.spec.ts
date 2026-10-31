/**
 * @fileoverview SC-100 种子 E 层回归测试（US-525 AC#17~#19 vitest 面）
 *
 * 双后端同断言：序列有效性（同一逻辑行 136/137 两段按 unit 各入选一行）、
 * 配置选择（选红入选 / 选蓝落选 / 必选未赋值报配置不完整）。
 */

import { describe, expect, it } from 'vitest';
import { rollupCost } from '../quantity/cost.js';
import { explodeBom } from '../quantity/explosion.js';
import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import { filterByAttr } from '../resolve/ext-attr.js';
import { resolveBom } from '../resolve/resolver.js';
import {
  loadScooterDataset,
  loadScooterDatasetC,
  loadScooterDatasetD,
  loadScooterDatasetE
} from '../testing/scooter-dataset.js';
import { goldenItemId, SCOOTER_GOLDEN_E } from '../testing/scooter-golden.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

for (const backend of BACKENDS) {
  describe(`SC-100 种子 E 层 [${backend}]`, () => {
    const context = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: day(SCOOTER_GOLDEN_E.context.asOfDate) };

    it('AC#18 序列有效性：unit 136 / 137 各入选一段，两段不同发生项', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const itemIds = await loadScooterDataset(adapter);
        await loadScooterDatasetC(adapter, itemIds);
        await loadScooterDatasetD(adapter, itemIds);
        await loadScooterDatasetE(adapter, itemIds);
        const run = async (unit: number | undefined): Promise<{ items: string[]; occurrenceIds: string[] }> => {
          const result = await explodeBom(
            adapter,
            { ...context, unit },
            { parentItemId: goldenItemId(SCOOTER_GOLDEN_E.unitDemo.rootKey) },
            { plannedQty: { value: '1', uom: 'pcs' } }
          );
          const lines = result.requirementLines;
          const items = new Set(lines.map(line => line.itemId));
          const keys = Object.keys(itemIds);
          const names = keys.filter(key => items.has(itemIds[key] ?? ''));
          return {
            items: names,
            occurrenceIds: lines.map(line => line.path[line.path.length - 1])
          };
        };
        const at136 = await run(136);
        const at137 = await run(137);
        expect(at136.items).toEqual(SCOOTER_GOLDEN_E.unitDemo.unit136.items);
        expect(at137.items).toEqual(SCOOTER_GOLDEN_E.unitDemo.unit137.items);
        expect(at136.items).toEqual(['UNIT-PART-OLD']);
        expect(at137.items).toEqual(['UNIT-PART-NEW']);
        expect(at136.occurrenceIds).toHaveLength(1);
        expect(at137.occurrenceIds).toHaveLength(1);
        expect(at136.occurrenceIds[0]).not.toBe(at137.occurrenceIds[0]);
      } finally {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      }
    });

    it('AC#19 配置选择：选红入选、选蓝落选、必选未赋值报配置不完整', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const itemIds = await loadScooterDataset(adapter);
        await loadScooterDatasetC(adapter, itemIds);
        await loadScooterDatasetD(adapter, itemIds);
        await loadScooterDatasetE(adapter, itemIds);
        const run = async (configSelection?: Record<string, string[]>): Promise<string[]> => {
          const result = await explodeBom(
            adapter,
            { ...context, configSelection },
            { parentItemId: goldenItemId(SCOOTER_GOLDEN_E.configDemo.rootKey) },
            { plannedQty: { value: '1', uom: 'pcs' } }
          );
          const items = new Set(result.requirementLines.map(line => line.itemId));
          return Object.keys(itemIds).filter(key => items.has(itemIds[key] ?? ''));
        };
        expect(await run({ 颜色: ['红'] })).toEqual(SCOOTER_GOLDEN_E.configDemo.selectRed.items);
        expect(await run({ 颜色: ['蓝'] })).toEqual(SCOOTER_GOLDEN_E.configDemo.selectBlue.items);
        await expect(run(undefined)).rejects.toThrow(SCOOTER_GOLDEN_E.configDemo.missingError);
      } finally {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      }
    });

    it('AC#17~#19：同一台 SC-100 从 E 层生效日起联合消费配置、序列与 rohs 部件', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const itemIds = await loadScooterDataset(adapter);
        await loadScooterDatasetC(adapter, itemIds);
        await loadScooterDatasetD(adapter, itemIds);
        await loadScooterDatasetE(adapter, itemIds);
        const target = { parentItemId: itemIds[SCOOTER_GOLDEN_E.assembly.rootKey] };
        const integratedContext = context;
        const root = await resolveBom(adapter, integratedContext, target);
        expect(
          root.occurrences.filter(row => [80, 90, 100].includes(row.lineNo)).map(row => [row.lineNo, row.childItemId])
        ).toEqual([...SCOOTER_GOLDEN_E.assembly.rootLines.map(row => [row.lineNo, itemIds[row.itemKey]])]);
        const run = (unit: number | undefined, colors: string[]) =>
          explodeBom(adapter, { ...integratedContext, unit, configSelection: { 颜色: colors } }, target, {
            plannedQty: { value: '1', uom: 'pcs' }
          });
        const oldUnit = await run(136, ['红']);
        const newUnit = await run(137, ['红']);
        const blue = await run(137, ['蓝']);
        expect(oldUnit.requirementLines.some(row => row.itemId === itemIds['UNIT-PART-OLD'])).toBe(true);
        expect(oldUnit.requirementLines.some(row => row.itemId === itemIds['UNIT-PART-NEW'])).toBe(false);
        expect(newUnit.requirementLines.some(row => row.itemId === itemIds['UNIT-PART-NEW'])).toBe(true);
        expect(newUnit.requirementLines.some(row => row.itemId === itemIds['UNIT-PART-OLD'])).toBe(false);
        expect(newUnit.requirementLines.some(row => row.itemId === itemIds['CONFIG-PART'])).toBe(true);
        expect(blue.requirementLines.some(row => row.itemId === itemIds['CONFIG-PART'])).toBe(false);
        expect(newUnit.requirementLines.some(row => row.itemId === itemIds['B-01'])).toBe(true);
        const rohsItems = await filterByAttr(adapter, 'item', [{ code: 'rohs', op: 'eq', value: 'yes' }]);
        expect(rohsItems.map(row => row['id'])).toContain(itemIds['B-01']);
        const missingUnit = await run(undefined, ['红']);
        expect(missingUnit.manifest.unresolved).toHaveLength(1);
        expect(missingUnit.manifest.unresolved[0].candidates.map(candidate => candidate.childItemId).sort()).toEqual(
          [itemIds['UNIT-PART-OLD'], itemIds['UNIT-PART-NEW']].sort()
        );
        await expect(run(137, [])).rejects.toThrow(/配置不完整/);
        await expect(run(137, ['红', '蓝'])).rejects.toThrow(/红蓝互斥/);
        const cost = await rollupCost(
          adapter,
          {
            ...integratedContext,
            unit: 137,
            configSelection: { 颜色: ['红'] },
            currency: 'CNY',
            rateDate: integratedContext.asOfDate
          },
          target
        );
        expect(cost.root.unitCost).toBe(SCOOTER_GOLDEN_E.assembly.redUnitCost);
        for (const date of ['2026-09-22', '2026-10-15']) {
          const before = await explodeBom(adapter, { ...context, asOfDate: day(date) }, target, {
            plannedQty: { value: '1', uom: 'pcs' }
          });
          expect(
            before.requirementLines.some(row =>
              [itemIds['UNIT-DEMO'], itemIds['CONFIG-DEMO'], itemIds['B-01']].includes(row.itemId)
            )
          ).toBe(false);
        }
        const counts = await (adapter as BomLocalAdapter).transaction(async executor => {
          const table = (name: string) => (backend === 'pglite' ? `"bom"."${name}"` : `"bom$${name}"`);
          const result = await executor.query(`SELECT
            (SELECT COUNT(*) FROM ${table('item')}) AS "items",
            (SELECT COUNT(*) FROM ${table('bom_line_occurrence')}) AS "occurrences",
            (SELECT COUNT(*) FROM ${table('ecn')}) AS "ecns",
            (SELECT COUNT(*) FROM ${table('bom_history_batch')}) AS "batches"`);
          return Object.fromEntries(result.columns.map((column, index) => [column, Number(result.rows[0][index])]));
        }, false);
        expect(counts).toEqual(SCOOTER_GOLDEN_E.assembly.counts);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });
  });
}
