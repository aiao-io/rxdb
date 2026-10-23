/**
 * @fileoverview SC-100 种子 C 层回归测试（US-525 AC#10/#11/#12 vitest 面）
 *
 * 双后端（wa-sqlite / pglite）：C 层装载后默认评估日（ECN-2026-014 生效前）A/B 层
 * golden 逐位不变；生效日后受影响路径按 SCOOTER_GOLDEN_C 两段给值；已生效的
 * ECN-2026-005 取消被拒；ECN-2026-014 的影响面经 where-used 命中整机 SC-100。
 */

import { describe, expect, it } from 'vitest';
import { explodeBom } from '../quantity/explosion.js';
import { ecnImpact } from '../resolve/ecn.js';
import { deterministicId, loadScooterDataset, loadScooterDatasetC } from '../testing/scooter-dataset.js';
import { goldenItemId, SCOOTER_GOLDEN_C } from '../testing/scooter-golden.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

for (const backend of BACKENDS) {
  describe(`SC-100 种子 C 层 [${backend}]`, () => {
    /** 建库并装载 A/B/C 三层种子。 */
    const loadOnce = async (): Promise<BomTestAdapter> => {
      const created = await createBomTestAdapter(backend);
      const itemIds = await loadScooterDataset(created);
      await loadScooterDatasetC(created, itemIds);
      return created;
    };

    /** 按评估日展开整机，返回 itemKey → 各路径需求 qty 列表（按 explodeBom 输出序）。 */
    const requirementsByItem = async (adapter: BomTestAdapter, asOfDate: string): Promise<Map<string, string[]>> => {
      const result = await explodeBom(
        adapter,
        { bomType: 'ebom', orgId: 'org-x', asOfDate: day(asOfDate) },
        { parentItemId: goldenItemId('SC-100') },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      const byItem = new Map<string, string[]>();
      const itemIds = new Map<string, string>();
      const rows = (await adapter.rawQuery(
        `SELECT "id", "itemNo" FROM ${backend === 'wa-sqlite' ? '"bom$item"' : '"bom"."item"'}`
      )) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
      const shape = 'results' in rows ? rows.results[0] : rows;
      for (const row of shape.rows) itemIds.set(String(row[0]), String(row[1]));
      for (const line of result.requirementLines) {
        const key = itemIds.get(line.itemId) ?? line.itemId;
        const list = byItem.get(key) ?? [];
        list.push(line.qty);
        byItem.set(key, list);
      }
      return byItem;
    };

    it('C 层装载后：默认评估日 A/B 层需求逐位不变，生效日后受影响路径按 golden C 两段给值', async () => {
      const adapter = await loadOnce();
      try {
        const before = await requirementsByItem(adapter, '2026-09-22');
        for (const { itemKey, before: expected } of SCOOTER_GOLDEN_C.requirements) {
          if (expected === null) {
            expect(before.has(itemKey)).toBe(false);
          } else {
            expect([...(before.get(itemKey) ?? [])].sort()).toEqual([...expected].sort());
          }
        }
        const after = await requirementsByItem(adapter, '2026-10-15');
        for (const { itemKey, after: expected } of SCOOTER_GOLDEN_C.requirements) {
          if (expected === null) {
            expect(after.has(itemKey)).toBe(false);
          } else {
            expect([...(after.get(itemKey) ?? [])].sort()).toEqual([...expected].sort());
          }
        }
        // 不受影响路径在生效前后逐位不变
        for (const key of ['CELL', 'WIRE', 'TERMINAL', 'SHRINK', 'M3', 'WH-01']) {
          if (!SCOOTER_GOLDEN_C.requirements.some(entry => entry.itemKey === key)) {
            expect(after.get(key)).toEqual(before.get(key));
          }
        }
      } finally {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      }
    });

    it('AC#12 已生效的种子 ECN：取消拒绝（提示改走更正 ECN）', async () => {
      const adapter = await loadOnce();
      try {
        const table = backend === 'wa-sqlite' ? '"bom$ecn"' : '"bom"."ecn"';
        const ecnId = deterministicId('ecn:ECN-2026-005');
        await expect(
          adapter.rawQuery(`UPDATE ${table} SET "state" = 'cancelled' WHERE "id" = '${ecnId}'`)
        ).rejects.toThrow(/更正|已生效|AC#7/);
      } finally {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      }
    });

    it('AC#11 ECN-2026-014 影响面：3 张 BOM 经 where-used 命中整机 SC-100', async () => {
      const adapter = await loadOnce();
      try {
        const impact = await ecnImpact(adapter, deterministicId('ecn:ECN-2026-014'));
        expect(impact.affectedItemIds.sort()).toEqual(
          [goldenItemId('SC-100'), goldenItemId('PCBA'), goldenItemId('BATT')].sort()
        );
        expect(impact.topItems.map(top => top.itemId)).toContain(goldenItemId('SC-100'));
        // 路径非空
        const scooter = impact.topItems.find(top => top.itemId === goldenItemId('SC-100'));
        expect(scooter?.paths.length).toBeGreaterThan(0);
      } finally {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      }
    });
  });
}
