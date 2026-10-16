/** @fileoverview US-523 AC#5：十万实例节点增长不写主数据，也不改变主数据查询与计划。 */

import { getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { BOM_ENTITIES, BomInstanceNode, BomItem } from '../entities.js';
import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import { bomSqlDialectFor, buildChildrenOfRevisionsSql, buildParentsOfItemsSql } from '../resolve/bom-sql.js';
import { expandBom, whereUsed } from '../resolve/expansion.js';
import { loadHistory } from '../resolve/history-loader.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

const DEVICE_COUNT = 1000;
const NODES_PER_DEVICE = 100;
const INSTALLED_AT = new Date('2026-01-10T00:00:00.000Z');

interface ScaleFixture {
  items: BomItem[];
  revisionIds: string[];
  occurrenceIds: string[];
}

const instanceId = (index: number): string => `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`;

const seedMaster = async (adapter: BomLocalAdapter): Promise<ScaleFixture> => {
  const items: BomItem[] = [];
  for (let index = 0; index < NODES_PER_DEVICE; index += 1) {
    const item = new BomItem();
    item.itemNo = `INSTANCE-SCALE-${String(index).padStart(3, '0')}`;
    item.serialized = index === 0;
    await item.save();
    items.push(item);
  }
  const revisionIds = items.map(() => crypto.randomUUID());
  const occurrenceIds = items.slice(1).map(() => crypto.randomUUID());
  await loadHistory(adapter, {
    batchNo: 'instance-scale-master',
    revisions: items.map((item, index) => ({
      id: revisionIds[index],
      itemId: item.id,
      revisionNo: 'A',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
    })),
    headers: [
      {
        revisionIndex: 0,
        bomType: 'ebom',
        orgId: 'instance-scale',
        lines: items.slice(1).map((item, index) => ({
          lineNo: index + 1,
          occurrences: [
            {
              id: occurrenceIds[index],
              childItemId: item.id,
              qty: '1',
              effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
            }
          ]
        }))
      }
    ]
  });
  return { items, revisionIds, occurrenceIds };
};

const masterState = async (adapter: BomLocalAdapter, backend: BomTestBackend) =>
  adapter.transaction(async executor => {
    const dialect = bomSqlDialectFor(backend);
    const tables = BOM_ENTITIES.filter(Entity => Entity !== BomInstanceNode)
      .map(Entity => getEntityMetadata(Entity).tableName)
      .sort();
    const reach = await executor.query(
      backend === 'pglite' ?
        `SELECT tablename FROM pg_tables WHERE schemaname = 'bom' AND tablename = 'bom_reach'`
      : `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bom$bom_reach'`
    );
    if (reach.rows.length > 0 && !tables.includes('bom_reach')) tables.push('bom_reach');
    const snapshots: { table: string; rows: number; digest: string }[] = [];
    for (const name of tables) {
      const result = await executor.query(`SELECT * FROM ${dialect.table(name)}`);
      const rows = result.rows.map(row => JSON.stringify(row)).sort();
      const encoded = new TextEncoder().encode(JSON.stringify([result.columns, rows]));
      const digest = await crypto.subtle.digest('SHA-256', encoded);
      snapshots.push({
        table: name,
        rows: rows.length,
        digest: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
      });
    }
    return snapshots;
  }, false);

const masterPlans = async (adapter: BomLocalAdapter, backend: BomTestBackend, fixture: ScaleFixture) =>
  adapter.transaction(async executor => {
    const dialect = bomSqlDialectFor(backend);
    const context = { asOfDate: new Date('2026-02-01T00:00:00.000Z'), bomType: 'ebom', orgId: 'instance-scale' };
    const queries = [
      buildChildrenOfRevisionsSql(dialect, { ...context, revisionIds: [fixture.revisionIds[0]] }),
      buildParentsOfItemsSql(dialect, { ...context, itemIds: [fixture.items[1].id] })
    ];
    const plans: unknown[][][] = [];
    for (const query of queries) {
      const explain = backend === 'pglite' ? 'EXPLAIN (FORMAT JSON, COSTS FALSE)' : 'EXPLAIN QUERY PLAN';
      plans.push((await executor.query(`${explain} ${query.sql}`, query.params)).rows);
    }
    return plans;
  }, false);

const insertInstances = async (
  adapter: BomLocalAdapter,
  backend: BomTestBackend,
  fixture: ScaleFixture
): Promise<void> => {
  const dialect = bomSqlDialectFor(backend);
  const columns = [
    'id',
    'itemRevisionId',
    'parentInstanceId',
    'sourceOccurrenceId',
    'serialNumber',
    'lotCode',
    'installedAt',
    'removedAt',
    'createdAt',
    'updatedAt'
  ];
  const total = DEVICE_COUNT * NODES_PER_DEVICE;
  await adapter.transaction(async executor => {
    for (let offset = 0; offset < total; offset += 64) {
      const params: unknown[] = [];
      const rows: string[] = [];
      for (let index = offset; index < Math.min(offset + 64, total); index += 1) {
        const device = Math.floor(index / NODES_PER_DEVICE);
        const position = index % NODES_PER_DEVICE;
        const values = [
          instanceId(index),
          fixture.revisionIds[position],
          position === 0 ? null : instanceId(device * NODES_PER_DEVICE),
          position === 0 ? null : fixture.occurrenceIds[position - 1],
          position === 0 ? `DEVICE-${device}` : null,
          position === 0 ? null : 'SCALE-LOT',
          dialect.encode(INSTALLED_AT),
          null,
          dialect.encode(INSTALLED_AT),
          dialect.encode(INSTALLED_AT)
        ];
        rows.push(
          `(${values
            .map(value => {
              params.push(value);
              return dialect.placeholder(params.length - 1);
            })
            .join(', ')})`
        );
      }
      await executor.query(
        `INSERT INTO ${dialect.table('bom_instance_node')} (${columns.map(column => `"${column}"`).join(', ')}) VALUES ${rows.join(', ')}`,
        params
      );
    }
  }, false);
};

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`实例图规模隔离 [${backend}]`, () => {
    it('AC#5：100 节点主数据建 1000 台实例后摘要、下钻、反查与查询计划完全不变', async () => {
      const adapter = await createBomTestAdapter(backend);
      const local: BomLocalAdapter = adapter;
      try {
        const fixture = await seedMaster(local);
        const context = {
          bomType: 'ebom' as const,
          orgId: 'instance-scale',
          asOfDate: new Date('2026-02-01T00:00:00.000Z')
        };
        const target = { parentItemId: fixture.items[0].id };
        const before = {
          tables: await masterState(local, backend),
          expansion: await expandBom(local, context, target),
          usage: await whereUsed(local, context, { childItemId: fixture.items[1].id }),
          plans: await masterPlans(local, backend, fixture)
        };
        expect(before.expansion.nodes).toHaveLength(NODES_PER_DEVICE);
        expect(before.usage.nodes).toHaveLength(1);
        await insertInstances(local, backend, fixture);
        const count = await local.transaction(async executor => {
          const result = await executor.query(
            `SELECT COUNT(*) FROM ${bomSqlDialectFor(backend).table('bom_instance_node')}`
          );
          return Number(result.rows[0][0]);
        }, false);
        expect(count).toBe(100_000);
        const after = {
          tables: await masterState(local, backend),
          expansion: await expandBom(local, context, target),
          usage: await whereUsed(local, context, { childItemId: fixture.items[1].id }),
          plans: await masterPlans(local, backend, fixture)
        };
        expect(after).toEqual(before);
        expect(JSON.stringify(after.plans)).not.toContain('bom_instance_node');
        const instance = await adapter.rxdb.bom.expandInstance(instanceId(0));
        expect(instance.nodes).toHaveLength(NODES_PER_DEVICE);
        const traced = await adapter.rxdb.bom.whereUsedInstance({ serialNumber: 'DEVICE-999' });
        expect(traced.matches).toHaveLength(1);
        expect(traced.matches[0].root.id).toBe(instanceId(999 * NODES_PER_DEVICE));
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    }, 600_000);
  });
}
