import { RxDBMigration } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  createPlainPersistentDatabase,
  disposeBomTestAdapter,
  type BomTestAdapter
} from '../src/__tests__/test-utils.js';
import { BomItem } from '../src/entities.js';
import { bomSqlDialectFor } from '../src/resolve/bom-sql.js';
import { deterministicId } from '../src/testing/scooter-dataset.js';
import { BomCycleError } from '../src/types.js';
import {
  connectReachUpgradeDatabase,
  corruptReachUpgradeGraph,
  insertReachUpgradeClosingEdge,
  insertReachUpgradeEdge,
  seedReachUpgradeDatabase
} from './legacy-test-utils.js';
import { expectReachMatches, readReachPairs, readReachRows, withReachFixture } from './reach-test-utils.js';

/** 把可达维护换成旧版本的空操作体，模拟插件升级前留在库里的同名对象。 */
const installStaleReachMaintenance = (adapter: BomTestAdapter): Promise<unknown> =>
  adapter.transaction(async executor => {
    const occurrence = bomSqlDialectFor(adapter.name).table('bom_line_occurrence');
    if (adapter.name === 'pglite') {
      await executor.query(
        `CREATE OR REPLACE FUNCTION "bom"."bom_reach_maintain"() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;`
      );
      return;
    }
    await executor.query('DROP TRIGGER "bom_reach_insert"');
    await executor.query(`CREATE TRIGGER "bom_reach_insert" AFTER INSERT ON ${occurrence} BEGIN SELECT 1; END;`);
  }, false);

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM 可达性升级与方向判环 [${backend}]`, () => {
    it('重连按当前版本替换可达维护触发器体，旧体不与新体并存', async () => {
      const name = `r-${crypto.randomUUID()}`;
      let adapter = await connectReachUpgradeDatabase(backend, name, false);
      try {
        await seedReachUpgradeDatabase(adapter);
        await installStaleReachMaintenance(adapter);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
      adapter = await connectReachUpgradeDatabase(backend, name, false);
      try {
        await adapter.rxdb.entityManager
          .instantiate(BomItem, { id: deterministicId('reach-upgrade:UPGRADE-D'), itemNo: 'UPGRADE-D' })
          .save();
        await insertReachUpgradeEdge(adapter, 'UPGRADE-C', 'UPGRADE-D');
        expect(await readReachPairs(adapter)).toHaveLength(6);
        await expectReachMatches(adapter);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    }, 60_000);

    it('旧entities配置和真实旧库自动回填，重连不删除重建派生行', async () => {
      const name = `r-${crypto.randomUUID()}`;
      let adapter: BomTestAdapter | undefined;
      try {
        adapter = await connectReachUpgradeDatabase(backend, name, true);
        await seedReachUpgradeDatabase(adapter);
        await disposeBomTestAdapter(adapter);
        adapter = await connectReachUpgradeDatabase(backend, name, false);
        await expectReachMatches(adapter);
        expect(await readReachPairs(adapter)).toHaveLength(3);
        const before = await readReachRows(adapter);
        await disposeBomTestAdapter(adapter);
        adapter = await connectReachUpgradeDatabase(backend, name, false);
        expect(await readReachRows(adapter)).toEqual(before);
        await expectReachMatches(adapter);
        const migrations = await adapter.transaction(
          executor =>
            executor.query(
              `SELECT "name" FROM ${executor.tableRef(RxDBMigration)} WHERE "name" = ${backend === 'pglite' ? '$1' : '?'}`,
              ['0001-bom-reach']
            ),
          false
        );
        expect(migrations.rows).toEqual([['0001-bom-reach']]);
      } finally {
        if (adapter !== undefined) await disposeBomTestAdapter(adapter);
      }
    }, 60_000);

    it('既有库首次引入BOM插件与实体：可达性迁移不读尚未建立的源表，连上即判环与维护', async () => {
      const name = `r-${crypto.randomUUID()}`;
      await createPlainPersistentDatabase(backend, name);
      const adapter = await connectReachUpgradeDatabase(backend, name, false);
      try {
        await seedReachUpgradeDatabase(adapter);
        expect(await readReachPairs(adapter)).toHaveLength(3);
        await expectReachMatches(adapter);
        await expect(insertReachUpgradeClosingEdge(adapter)).rejects.toBeInstanceOf(BomCycleError);
        const migrations = await adapter.transaction(
          executor =>
            executor.query(
              `SELECT "name" FROM ${executor.tableRef(RxDBMigration)} WHERE "name" = ${backend === 'pglite' ? '$1' : '?'}`,
              ['0001-bom-reach']
            ),
          false
        );
        expect(migrations.rows).toEqual([['0001-bom-reach']]);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
      await disposeBomTestAdapter(await connectReachUpgradeDatabase(backend, name, false));
    }, 60_000);

    it('非consume反向边切回consume必须先拒绝成环，不能只检查child端点变化', async () => {
      await withReachFixture(backend, async fixture => {
        await fixture.add('A', 'B');
        const reverse = await fixture.add('B', 'A', { direction: 'by_product' });
        const before = await readReachRows(fixture.adapter);
        reverse.flowDirection = 'consume';
        await expect(reverse.save()).rejects.toBeInstanceOf(BomCycleError);
        expect(await readReachRows(fixture.adapter)).toEqual(before);
        await expectReachMatches(fixture.adapter);
      });
    });

    it('迁移水位存在但派生表丢失传递对时重连明确失败，不用错误空缓存接查询', async () => {
      const name = `r-${crypto.randomUUID()}`;
      const adapter = await connectReachUpgradeDatabase(backend, name, false);
      try {
        await seedReachUpgradeDatabase(adapter);
        expect(await readReachPairs(adapter)).toHaveLength(3);
        const dialect = bomSqlDialectFor(backend);
        await adapter.transaction(executor =>
          executor.query(
            `DELETE FROM ${dialect.table('bom_reach')} WHERE ("bomType", "orgId", "ancestorItemId", "descendantItemId") IN (
            SELECT a."bomType", a."orgId", a."ancestorItemId", b."descendantItemId" FROM ${dialect.table('bom_reach')} a
            JOIN ${dialect.table('bom_reach')} b ON a."descendantItemId" = b."ancestorItemId" AND a."bomType" = b."bomType" AND a."orgId" = b."orgId"
          )`
          )
        );
      } finally {
        await disposeBomTestAdapter(adapter);
      }
      await expect(connectReachUpgradeDatabase(backend, name, false)).rejects.toThrow(/可达性派生表不完整/);
    }, 60_000);

    it('坏旧图升级失败不提交迁移水位，不留下部分回填', async () => {
      const name = `r-${crypto.randomUUID()}`;
      let adapter: BomTestAdapter | undefined;
      try {
        adapter = await connectReachUpgradeDatabase(backend, name, true);
        await seedReachUpgradeDatabase(adapter);
        await corruptReachUpgradeGraph(adapter);
        await disposeBomTestAdapter(adapter);
        adapter = undefined;
        await expect(connectReachUpgradeDatabase(backend, name, false)).rejects.toThrow(/旧主数据并集包含有向环/);
        adapter = await connectReachUpgradeDatabase(backend, name, true);
        const result = await adapter.transaction(
          executor =>
            executor.query(
              `SELECT "name" FROM ${executor.tableRef(RxDBMigration)} WHERE "name" = ${backend === 'pglite' ? '$1' : '?'}`,
              ['0001-bom-reach']
            ),
          false
        );
        expect(result.rows).toEqual([]);
        const dialect = bomSqlDialectFor(backend);
        const tableExists = await adapter.transaction(
          executor =>
            executor.query(
              backend === 'pglite' ?
                `SELECT tablename FROM pg_tables WHERE schemaname = 'bom' AND tablename = 'bom_reach'`
              : `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bom$bom_reach'`
            ),
          false
        );
        if (tableExists.rows.length > 0) {
          const rows = await adapter.transaction(
            executor => executor.query(`SELECT COUNT(*) FROM ${dialect.table('bom_reach')}`),
            false
          );
          expect(Number(rows.rows[0][0])).toBe(0);
        }
      } finally {
        if (adapter !== undefined) await disposeBomTestAdapter(adapter);
      }
    }, 60_000);
  });
}
