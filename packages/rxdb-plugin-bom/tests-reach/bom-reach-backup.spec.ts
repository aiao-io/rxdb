import { RxDBMigration } from '@aiao/rxdb';
import { restorePGliteDatabase, RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { describe, expect, it } from 'vitest';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from '../src/__tests__/test-utils.js';
import { BOM_ENTITIES, BomHeader, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from '../src/entities.js';
import { bomSqlDialectFor } from '../src/resolve/bom-sql.js';
import { deterministicId } from '../src/testing/scooter-dataset.js';
import { connectReachUpgradeDatabase, seedReachUpgradeDatabase } from './legacy-test-utils.js';
import { expectReachMatches, readReachPairs, readReachRows } from './reach-test-utils.js';

const readMasterRows = (adapter: BomTestAdapter) =>
  adapter.transaction(async executor => {
    const tables = [BomItem, BomItemRevision, BomHeader, BomLine, BomLineOccurrence];
    const snapshots = [];
    for (const Entity of tables) {
      snapshots.push((await executor.query(`SELECT * FROM ${executor.tableRef(Entity)} ORDER BY "id"`)).rows);
    }
    return snapshots;
  }, false);

const readMigrationNames = (adapter: BomTestAdapter) =>
  adapter.transaction(async executor => {
    const dialect = bomSqlDialectFor(adapter.name);
    return (
      await executor.query(
        `SELECT "name" FROM ${executor.tableRef(RxDBMigration)} WHERE "name" = ${dialect.placeholder(0)}`,
        ['0001-bom-reach']
      )
    ).rows;
  }, false);

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM 旧物理备份升级 [${backend}]`, () => {
    it('无闭包旧备份恢复到当前插件后只回填一次，主数据保真且继续维护拓扑', async () => {
      const source = await connectReachUpgradeDatabase(backend, `r-${crypto.randomUUID()}`, true);
      let target = await createBomTestAdapter(backend, BOM_ENTITIES, {
        dbName: `r-${crypto.randomUUID()}`,
        persistent: true,
        deferConnect: true
      });
      try {
        await seedReachUpgradeDatabase(source);
        const oldReachTables = await source.transaction(
          executor =>
            executor.query(
              backend === 'pglite' ?
                `SELECT tablename FROM pg_tables WHERE schemaname = 'bom' AND tablename = 'bom_reach'`
              : `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bom$bom_reach'`
            ),
          false
        );
        expect(oldReachTables.rows).toEqual([]);
        expect(await readMigrationNames(source)).toEqual([]);
        const masterBefore = await readMasterRows(source);
        const chunks: Uint8Array[] = [];
        await source.backup(
          new WritableStream<Uint8Array>({
            write(chunk) {
              chunks.push(chunk.slice());
            }
          })
        );
        await disposeBomTestAdapter(source);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          }
        });
        if (target instanceof RxDBAdapterWaSqlite) await target.restore(stream);
        else await restorePGliteDatabase(stream, { rxdb: target.rxdb, options: { store: 'idb' } });
        await target.rxdb.connect(backend);
        expect(await readMasterRows(target)).toEqual(masterBefore);
        await expectReachMatches(target);
        const originalPairs = await readReachPairs(target);
        expect(originalPairs).toHaveLength(3);
        expect(await readMigrationNames(target)).toEqual([['0001-bom-reach']]);

        const db = target.rxdb;
        const child = db.entityManager.instantiate(BomItem, { itemNo: 'UPGRADE-D' });
        await child.save();
        await db.bom.loadHistory({
          batchNo: 'reach-restored-leaf',
          revisions: [{ itemId: child.id, revisionNo: 'A', effectiveFrom: new Date('2026-01-01T00:00:00.000Z') }],
          headers: []
        });
        const dialect = bomSqlDialectFor(backend);
        const parentRevision = await target.transaction(
          executor =>
            executor.query(
              `SELECT "id" FROM ${dialect.table('item_revision')} WHERE "itemId" = ${dialect.placeholder(0)}`,
              [deterministicId('reach-upgrade:UPGRADE-C')]
            ),
          false
        );
        const header = db.entityManager.instantiate(BomHeader, {
          parentRevisionId: String(parentRevision.rows[0][0]),
          bomType: 'ebom',
          orgId: 'reach-upgrade-org'
        });
        await header.save();
        const line = db.entityManager.instantiate(BomLine, { headerId: header.id, lineNo: 10 });
        await line.save();
        const occurrence = db.entityManager.instantiate(BomLineOccurrence, {
          lineId: line.id,
          childItemId: child.id,
          qty: '1',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
        });
        await occurrence.save();
        await expectReachMatches(target);
        expect(await readReachPairs(target)).toHaveLength(6);
        expect(await readReachPairs(target)).toContainEqual([
          'ebom',
          'reach-upgrade-org',
          deterministicId('reach-upgrade:UPGRADE-A'),
          child.id
        ]);
        await occurrence.remove();
        expect(await readReachPairs(target)).toEqual(originalPairs);
        await expectReachMatches(target);

        const reachBeforeReconnect = await readReachRows(target);
        await disposeBomTestAdapter(target);
        await target.rxdb.connect(backend);
        const current = db.localAdapterSync;
        if (!(current instanceof RxDBAdapterWaSqlite || current instanceof RxDBAdapterPGlite)) {
          throw new Error('重连未建立 BOM 测试后端');
        }
        target = current;
        expect(await readReachRows(target)).toEqual(reachBeforeReconnect);
        expect(await readMigrationNames(target)).toEqual([['0001-bom-reach']]);
      } finally {
        await disposeBomTestAdapter(source);
        await disposeBomTestAdapter(target);
      }
    }, 60_000);
  });
}
