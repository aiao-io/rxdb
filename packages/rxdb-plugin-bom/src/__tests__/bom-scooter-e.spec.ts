/**
 * @fileoverview SC-100 种子 E 层回归测试（US-525 AC#17~#19 vitest 面）
 *
 * 双后端同断言：序列有效性（同一逻辑行 136/137 两段按 unit 各入选一行）、
 * 配置选择（选红入选 / 选蓝落选 / 必选未赋值报配置不完整）。
 */

import { describe, expect, it } from 'vitest';
import { explodeBom } from '../quantity/explosion.js';
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
  });
}
