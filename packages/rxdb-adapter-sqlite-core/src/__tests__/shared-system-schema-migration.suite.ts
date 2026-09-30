import {
  ACTIVE_BRANCH_KEY,
  AmbiguousActiveBranchError,
  RXDB_CHANGE_CODEC_WATERMARK,
  RXDB_SYSTEM_SCHEMA_WATERMARK,
  RxDBBranch,
  RxDBChange,
  RxDBMigration,
  UnsupportedRxDBSystemVersionError,
  encodeRxDBChangeEntityId,
  getEntityMetadata
} from '@aiao/rxdb';
import { filter, firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { getTableColumnIndexName, get_table_name_by_metadata, quote_sql_identifier } from '../sqlite-core.utils.js';
import type { AdapterFactory } from './adapter-factory.js';
import { Todo } from './fixtures/Todo.js';
import { SUITE_DEADLINE_MS } from './test-utils.js';

const currentWatermarks = [RXDB_SYSTEM_SCHEMA_WATERMARK, RXDB_CHANGE_CODEC_WATERMARK] as const;

const placeholders = currentWatermarks.map(() => '?').join(', ');

const readWatermarks = async (adapter: RxDBAdapterSqliteBase): Promise<Array<[number, string]>> => {
  const table = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBMigration)));
  const result = await adapter.internalQuery(
    `SELECT "id", "name" FROM ${table} WHERE "name" IN (${placeholders}) ORDER BY "id"`,
    [...currentWatermarks]
  );
  return (result.results[0]?.rows ?? []) as Array<[number, string]>;
};

const readRows = async (adapter: RxDBAdapterSqliteBase, sql: string): Promise<unknown[][]> => {
  const result = await adapter.internalQuery(sql);
  return result.results.flatMap(item => item.rows);
};

const reconnectAdapter = async (
  adapter: RxDBAdapterSqliteBase,
  adapterName: string
): Promise<RxDBAdapterSqliteBase> => {
  const rxdb = adapter.rxdb;
  await rxdb.disconnectAll();
  const connect = rxdb.connect.bind(rxdb) as (name: string) => Promise<RxDBAdapterSqliteBase>;
  return connect(adapterName);
};

/** system schema 迁移测试：系统表结构的升级与持久化。 */
export function systemSchemaMigrationSuite(factory: AdapterFactory): void {
  describe.sequential(`system schema migration [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo], persistent: true });
      await firstValueFrom(adapter.rxdb.versionManager.history().undoHistories$);
    });

    afterAll(async () => {
      if (!adapter) return;
      try {
        await adapter.rxdb.disconnectAll();
      } finally {
        await factory.cleanupAdapter?.(adapter);
      }
    });

    it(
      '升级旧 UUID/plain JSON change，重复执行不改写历史',
      async () => {
        const migrationTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBMigration)));
        const changeTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBChange)));
        const todoTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(Todo)));
        const legacyId = '550e8400-e29b-41d4-a716-446655440000';
        const now = new Date().toISOString();
        const legacyCreatedAt = new Date(Date.now() + 60_000).toISOString();
        await adapter.internalQuery(`DELETE FROM ${migrationTable} WHERE "name" IN (${placeholders})`, [
          ...currentWatermarks
        ]);
        await adapter.internalQuery(
          `INSERT INTO ${todoTable} ("id", "title", "completed", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)`,
          [legacyId, 'legacy', 0, now, now]
        );
        await adapter.internalQuery(
          `INSERT INTO ${changeTable}
         ("type", "namespace", "entity", "branchId", "entityId", "inversePatch", "patch", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ['INSERT', 'public', 'Todo', 'main', legacyId, null, '{"title":"legacy"}', legacyCreatedAt, legacyCreatedAt]
        );

        adapter = await reconnectAdapter(adapter, factory.name);

        const changes = await adapter.getRepository(RxDBChange).find({
          where: {
            combinator: 'and',
            rules: [{ field: 'entityId', operator: '=', value: legacyId }]
          }
        });
        expect(changes).toHaveLength(1);
        expect(changes[0].entityId).toBe(legacyId);
        expect(changes[0].patch).toEqual({ title: 'legacy' });

        const history = adapter.rxdb.versionManager.history(Todo);
        await firstValueFrom(
          history.undoHistories$.pipe(
            filter(histories =>
              histories.some(item =>
                item.changes.some(change => change.type === 'INSERT' && change.entityId === legacyId)
              )
            )
          )
        );

        await adapter.rxdb.versionManager.createBranch('legacy-history');
        await adapter.rxdb.versionManager.switchBranch('legacy-history');
        expect(
          await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: legacyId }] }
          })
        ).toHaveLength(1);
        await adapter.rxdb.versionManager.switchBranch('main');

        await history.undo();
        expect(
          await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: legacyId }] }
          })
        ).toHaveLength(0);
        const firstWatermarks = await readWatermarks(adapter);
        expect(firstWatermarks.map(row => row[1])).toEqual(currentWatermarks);

        adapter = await reconnectAdapter(adapter, factory.name);

        expect(await readWatermarks(adapter)).toEqual(firstWatermarks);
        const rawChange = await adapter.internalQuery(`SELECT "entityId", "patch" FROM ${changeTable} WHERE "id" = ?`, [
          changes[0].id
        ]);
        expect(rawChange.results[0]?.rows[0]).toEqual([legacyId, '{"title":"legacy"}']);
        // 本例走两次 reconnect（各含一轮 bootstrap + 迁移）外加建/切分支与 undo，单跑约 1~3.5s。
        // 原先写死 10s，低于 acceptance 配置的 30s，并发下 sqlite / sqliteai 两个 suite 超时假红。
      },
      SUITE_DEADLINE_MS
    );

    it('迁移失败完整回滚，重新打开后自动重试且不改写 change', async () => {
      const migrationTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBMigration)));
      const changeTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBChange)));
      const failureTrigger = quote_sql_identifier('reject_codec_watermark');
      const changesBefore = await readRows(
        adapter,
        `SELECT "id", "entityId", "inversePatch", "patch" FROM ${changeTable} ORDER BY "id"`
      );

      await adapter.internalQuery(`DELETE FROM ${migrationTable} WHERE "name" IN (${placeholders})`, [
        ...currentWatermarks
      ]);
      await adapter.internalQuery(`
        CREATE TRIGGER ${failureTrigger}
        BEFORE INSERT ON ${migrationTable}
        WHEN NEW."name" = '${RXDB_CHANGE_CODEC_WATERMARK}'
        BEGIN
          SELECT RAISE(ABORT, 'injected codec watermark failure');
        END;
      `);
      const triggersBefore = await readRows(
        adapter,
        `SELECT "name", "sql" FROM sqlite_master WHERE "type" = 'trigger' ORDER BY "name"`
      );

      await expect(adapter.migrateSystemSchema()).rejects.toThrow('injected codec watermark failure');

      expect(await readWatermarks(adapter)).toEqual([]);
      expect(
        await readRows(adapter, `SELECT "name", "sql" FROM sqlite_master WHERE "type" = 'trigger' ORDER BY "name"`)
      ).toEqual(triggersBefore);
      expect(
        await readRows(adapter, `SELECT "id", "entityId", "inversePatch", "patch" FROM ${changeTable} ORDER BY "id"`)
      ).toEqual(changesBefore);

      await adapter.internalQuery(`DROP TRIGGER ${failureTrigger}`);
      adapter = await reconnectAdapter(adapter, factory.name);

      expect((await readWatermarks(adapter)).map(row => row[1])).toEqual(currentWatermarks);
      expect(
        await readRows(adapter, `SELECT "id", "entityId", "inversePatch", "patch" FROM ${changeTable} ORDER BY "id"`)
      ).toEqual(changesBefore);
    });

    // FR-048 的「至多一个 active」那一半架在 `rxdb_branch.activeKey` 的可空唯一列上。该列是在
    // v4 水位线**之后**才进 schema 的，而既有库的升级路径只按表粒度补建、从不看列——不在这里补，
    // 那批库的约束就永远缺席，且不报任何错。
    it('给既有库补 activeKey 列与唯一索引；多 active 时整体回滚', async () => {
      const migrationTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBMigration)));
      const branchMetadata = getEntityMetadata(RxDBBranch);
      const branchTableName = get_table_name_by_metadata(branchMetadata);
      const branchTable = quote_sql_identifier(branchTableName);
      const activeKeyProperty = branchMetadata.properties.find(property => property.name === 'activeKey');
      if (!activeKeyProperty) throw new Error('RxDBBranch metadata is missing the "activeKey" property.');
      const indexName = getTableColumnIndexName(branchMetadata, activeKeyProperty);
      const readBranchRows = async (): Promise<unknown[][]> =>
        readRows(adapter, `SELECT "id", "activated", "activeKey" FROM ${branchTable} ORDER BY "id"`);
      const readBranchColumns = async (): Promise<unknown[]> =>
        (await readRows(adapter, `SELECT "name" FROM pragma_table_info('${branchTableName}')`)).map(row => row[0]);
      const readBranchIndexes = async (): Promise<unknown[]> =>
        (
          await readRows(
            adapter,
            `SELECT "name" FROM sqlite_master WHERE "type" = 'index' AND "tbl_name" = '${branchTableName}' ORDER BY "name"`
          )
        ).map(row => row[0]);

      // 退回 v4 形态。索引得先掉，否则 SQLite 不让 DROP COLUMN。
      await adapter.internalQuery(`DROP INDEX ${quote_sql_identifier(indexName)}`);
      await adapter.internalQuery(`ALTER TABLE ${branchTable} DROP COLUMN "activeKey"`);
      await adapter.internalQuery(`UPDATE ${branchTable} SET "activated" = 1`);
      await adapter.internalQuery(`DELETE FROM ${migrationTable} WHERE "name" IN (${placeholders})`, [
        ...currentWatermarks
      ]);
      expect(await readBranchColumns()).not.toContain('activeKey');

      await expect(adapter.migrateSystemSchema()).rejects.toBeInstanceOf(AmbiguousActiveBranchError);

      expect(await readBranchColumns()).not.toContain('activeKey');
      expect(await readBranchIndexes()).not.toContain(indexName);
      expect(await readWatermarks(adapter)).toEqual([]);

      await adapter.internalQuery(`UPDATE ${branchTable} SET "activated" = 0 WHERE "id" != 'main'`);

      await adapter.migrateSystemSchema();

      expect(await readBranchColumns()).toContain('activeKey');
      expect(await readBranchIndexes()).toContain(indexName);
      expect(await readBranchRows()).toEqual([
        ['legacy-history', 0, null],
        ['main', 1, ACTIVE_BRANCH_KEY]
      ]);

      // 索引得真的在管事。只断言它存在的话，建到别的列上（比如 `activated`）照样能过，
      // 而那样的索引对「两行 active」毫无阻挡。
      await expect(
        adapter.internalQuery(`UPDATE ${branchTable} SET "activeKey" = ? WHERE "id" = 'legacy-history'`, [
          ACTIVE_BRANCH_KEY
        ])
      ).rejects.toThrow();
    });

    // 这一步在**每一次** `migrateSystemSchema()` 上都会跑，新库也不例外：水位线是该方法最后
    // 才写的，所以第一次 connect() 同样走完整条升级路径。回填因此必须幂等到**一行都不写**，
    // 而不只是「写回同一个值」——`rxdb_branch` 上挂着变更派发，白写一遍就会多出一条谁都没做过的
    // UPDATE，落进调用方的事件流，且没有任何东西会报错。
    it('库已是目标形态时一行都不写', async () => {
      const migrationTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBMigration)));
      const branchMetadata = getEntityMetadata(RxDBBranch);
      const branchTable = quote_sql_identifier(get_table_name_by_metadata(branchMetadata));
      // 不依赖上一个用例留下的库态：先把「恰好一个 active 且哨兵值已就位」这个前提写死。
      await adapter.internalQuery(`UPDATE ${branchTable} SET "activated" = 0, "activeKey" = NULL WHERE "id" != 'main'`);
      await adapter.internalQuery(`UPDATE ${branchTable} SET "activated" = 1, "activeKey" = ? WHERE "id" = 'main'`, [
        ACTIVE_BRANCH_KEY
      ]);
      await adapter.internalQuery(`DELETE FROM ${migrationTable} WHERE "name" IN (${placeholders})`, [
        ...currentWatermarks
      ]);

      // SQLite 没有行版本号，拿一个 AFTER UPDATE 触发器当见证：写了就留痕，没写就是空表。
      // 名字刻意不带 `_change_trigger` 后缀，免得被迁移里那轮 remove_trigger_sql 顺手删掉。
      await adapter.internalQuery(`CREATE TABLE "rxdb_branch_write_probe" ("id" text)`);
      await adapter.internalQuery(
        `CREATE TRIGGER "rxdb_branch_write_probe_watch" AFTER UPDATE ON ${branchTable}
         BEGIN INSERT INTO "rxdb_branch_write_probe" ("id") VALUES (NEW."id"); END`
      );
      try {
        await adapter.migrateSystemSchema();

        expect(await readRows(adapter, `SELECT "id" FROM "rxdb_branch_write_probe"`)).toEqual([]);
        // 只钉「基数没被动过」，不列全表：这条用例的前提是自己写死的，跟同一份库上前面几条
        // 用例留下多少分支行无关。
        expect(await readRows(adapter, `SELECT "id" FROM ${branchTable} WHERE "activeKey" IS NOT NULL`)).toEqual([
          ['main']
        ]);
        expect(await readRows(adapter, `SELECT "id" FROM ${branchTable} WHERE "activated" = 1`)).toEqual([['main']]);
      } finally {
        await adapter.internalQuery(`DROP TRIGGER "rxdb_branch_write_probe_watch"`);
        await adapter.internalQuery(`DROP TABLE "rxdb_branch_write_probe"`);
      }
    });

    // 迁移重建变更触发器时必须按库此刻停在的分支写。sqlite 侧确实有自愈——每个默认事务
    // COMMIT 时 `#run_transaction` → `switch_transaction_id` 会按真实分支重建全部触发器——
    // 但自愈要等到**下一个**默认事务，迁移结束到那一刻之间的裸写会被永久记到错误的分支名下，
    // 且不报任何错。pglite 侧（`system/migrate_system_schema.ts`）一直是读活动分支再传：
    // 两端形状必须一致，否则同一个库换个后端打开就是另一套行为。
    it('迁移重建的变更触发器按活动分支写，而不是固定 main', async () => {
      const migrationTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBMigration)));
      const changeTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBChange)));
      const todoTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(Todo)));
      const branchTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBBranch)));
      const branchId = 'migration-trigger-branch';

      await adapter.rxdb.versionManager.createBranch(branchId);
      // 直接改分支行，不走 `switchBranch()`：这条用例只要「活动分支不是 main」这一个前提，
      // 而 switchBranch() 自己跑一个默认事务，COMMIT 时就把触发器重建成正确的分支了，
      // 待测的迁移路径会被盖掉。
      await adapter.internalQuery(`UPDATE ${branchTable} SET "activated" = 0, "activeKey" = NULL WHERE "id" != ?`, [
        branchId
      ]);
      await adapter.internalQuery(`UPDATE ${branchTable} SET "activated" = 1, "activeKey" = ? WHERE "id" = ?`, [
        ACTIVE_BRANCH_KEY,
        branchId
      ]);
      await adapter.internalQuery(`DELETE FROM ${migrationTable} WHERE "name" IN (${placeholders})`, [
        ...currentWatermarks
      ]);

      await adapter.migrateSystemSchema();

      // 断言落在触发器自己写下的那一格上，而不是触发器 DDL 的文本：这条链路的故障形态是
      // 「变更被记到一条当前并不在的分支名下」，只有读回 rxdb_change 才能证伪它。写入必须是
      // 裸写（不经 `transaction()`），否则默认事务会先自愈，窗口期根本踩不到。
      const todoId = crypto.randomUUID();
      const now = new Date().toISOString();
      await adapter.internalQuery(
        `INSERT INTO ${todoTable} ("id", "title", "completed", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)`,
        [todoId, 'after migration', 0, now, now]
      );

      const changeRows = await adapter.internalQuery(`SELECT "branchId" FROM ${changeTable} WHERE "entityId" = ?`, [
        encodeRxDBChangeEntityId(todoId)
      ]);
      expect(changeRows.results.flatMap(item => item.rows)).toEqual([[branchId]]);

      // 还原 main 为活动分支：同一份库上后面的用例不该继承这条用例的分支状态。
      await adapter.internalQuery(`UPDATE ${branchTable} SET "activated" = 0, "activeKey" = NULL WHERE "id" != 'main'`);
      await adapter.internalQuery(`UPDATE ${branchTable} SET "activated" = 1, "activeKey" = ? WHERE "id" = 'main'`, [
        ACTIVE_BRANCH_KEY
      ]);
    });

    it('高版本水位 fail-fast', async () => {
      const migrationTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBMigration)));
      await adapter.internalQuery(
        `INSERT INTO ${migrationTable} ("name", "executedAt") VALUES (?, CURRENT_TIMESTAMP)`,
        ['__rxdb_change_codec__:2']
      );

      await expect(adapter.migrateSystemSchema()).rejects.toBeInstanceOf(UnsupportedRxDBSystemVersionError);
    });
  });
}
