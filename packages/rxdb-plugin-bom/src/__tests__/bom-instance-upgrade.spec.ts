/** @fileoverview 合法的持久化 A～E 库增加实例表后可重开，并继续装载阶段 F。 */

import { getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { BOM_ENTITIES, BomInstanceNode } from '../entities.js';
import { explodeBom } from '../quantity/explosion.js';
import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import {
  deterministicId,
  loadScooterDataset,
  loadScooterDatasetC,
  loadScooterDatasetD,
  loadScooterDatasetE,
  loadScooterDatasetF
} from '../testing/scooter-dataset.js';
import { createBomTestAdapter, disposeBomTestAdapter } from './test-utils.js';

const MASTER_ENTITIES = BOM_ENTITIES.filter(Entity => Entity !== BomInstanceNode);
const CONTEXT = {
  bomType: 'ebom' as const,
  orgId: 'org-x',
  asOfDate: new Date('2026-10-16T00:00:00.000Z'),
  unit: 137,
  configSelection: { 颜色: ['红'] }
};
const TARGET = { parentItemId: deterministicId('item:SC-100') };
const QUANTITY = { plannedQty: { value: '1', uom: 'pcs' } };

const rows = async (adapter: BomLocalAdapter, sql: string): Promise<unknown[][]> =>
  adapter.transaction(async executor => (await executor.query(sql)).rows, false);

const masterSnapshot = async (adapter: BomLocalAdapter) =>
  adapter.transaction(async executor => {
    const snapshots: { table: string; columns: string[]; rows: string[] }[] = [];
    for (const Entity of MASTER_ENTITIES) {
      const metadata = getEntityMetadata(Entity);
      const result = await executor.query(`SELECT * FROM "${metadata.namespace}$${metadata.tableName}"`);
      snapshots.push({
        table: metadata.tableName,
        columns: result.columns,
        rows: result.rows.map(row => JSON.stringify(row)).sort()
      });
    }
    return snapshots;
  }, false);

const writePersistentE = async (dbName: string) => {
  const adapter = await createBomTestAdapter('wa-sqlite', MASTER_ENTITIES, { dbName, persistent: true });
  const local: BomLocalAdapter = adapter;
  try {
    const itemIds = await loadScooterDataset(local);
    await loadScooterDatasetC(local, itemIds);
    await loadScooterDatasetD(local, itemIds);
    await loadScooterDatasetE(local, itemIds);
    expect(await rows(local, 'PRAGMA foreign_key_check')).toEqual([]);
    expect(
      await rows(local, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bom$bom_instance_node'`)
    ).toEqual([]);
    const explosion = await explodeBom(local, CONTEXT, TARGET, QUANTITY);
    expect(explosion.truncated).toBeNull();
    expect(explosion.manifest.unresolved).toEqual([]);
    expect(explosion.requirementLines.length).toBeGreaterThan(0);
    return { itemIds, explosion, tables: await masterSnapshot(local) };
  } finally {
    await disposeBomTestAdapter(adapter);
  }
};

describe('实例表的既有持久库升级 [wa-sqlite]', () => {
  it('同一合法 E 库重连完整 schema 后保留主数据，再装 F 的五条事实与来源守卫', async () => {
    const dbName = `upg-${crypto.randomUUID()}`;
    const persisted = await writePersistentE(dbName);
    const upgraded = await createBomTestAdapter('wa-sqlite', BOM_ENTITIES, { dbName, persistent: true });
    const local: BomLocalAdapter = upgraded;
    try {
      expect(await rows(local, 'PRAGMA foreign_key_check')).toEqual([]);
      expect(await masterSnapshot(local)).toEqual(persisted.tables);
      expect(await explodeBom(local, CONTEXT, TARGET, QUANTITY)).toEqual(persisted.explosion);
      expect(Number((await rows(local, 'SELECT COUNT(*) FROM "bom$bom_instance_node"'))[0][0])).toBe(0);

      await loadScooterDatasetF(local, persisted.itemIds);

      expect(Number((await rows(local, 'SELECT COUNT(*) FROM "bom$bom_instance_node"'))[0][0])).toBe(5);
      expect(await explodeBom(local, CONTEXT, TARGET, QUANTITY)).toEqual(persisted.explosion);
      const options = { asOfDate: new Date('2026-10-17T00:00:00.000Z') };
      const first = await upgraded.rxdb.bom.expandInstance(deterministicId('instance:SC-100:SN-001'), options);
      const second = await upgraded.rxdb.bom.expandInstance(deterministicId('instance:SC-100:SN-002'), options);
      expect(first.nodes).toHaveLength(2);
      expect(second.nodes).toHaveLength(3);
      expect(first.truncated || second.truncated).toBe(false);
      const sourceId = deterministicId('occurrence:BATT:F:0');
      expect(second.nodes.find(node => node.itemNo === 'CELL')?.sourceOccurrenceId).toBe(sourceId);
      const rejection = await upgraded
        .rawQuery(`DELETE FROM "bom$bom_line_occurrence" WHERE "id" = '${sourceId}'`)
        .then(
          () => null,
          (cause: unknown) => String(cause)
        );
      expect(rejection).not.toBeNull();
      expect(rejection).toContain(sourceId);
      expect(rejection).toMatch(/实例.*1|1.*实例/);
      expect((await rows(local, `SELECT "id" FROM "bom$bom_line_occurrence" WHERE "id" = '${sourceId}'`))[0][0]).toBe(
        sourceId
      );
      expect(await upgraded.rxdb.bom.expandInstance(second.rootId, options)).toEqual(second);
      expect(await rows(local, 'PRAGMA foreign_key_check')).toEqual([]);
    } finally {
      await disposeBomTestAdapter(upgraded);
    }
  }, 60_000);
});
