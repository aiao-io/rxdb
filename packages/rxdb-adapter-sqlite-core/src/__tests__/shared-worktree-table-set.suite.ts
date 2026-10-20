import { RxDBBranch, RxDBChange, WorktreeTableSet, encodeRxDBChangeEntityId, getEntityMetadata } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import { quote_sql_identifier } from '../sqlite-core.utils.js';
import { get_table_name_by_metadata } from '../table-name-resolver.js';
import { execute_switch_actions } from '../version/execute_switch_actions.js';
import type { AdapterFactory } from './adapter-factory.js';
import { Todo } from './fixtures/Todo.js';
import { cleanup_db } from './test-utils.js';

/**
 * 可写检出位的表集（US-314 B1.3）：建表集、删表集，以及主检出位的各条写路径都不碰别的表集。
 *
 * @remarks
 * 断言一律落在裸读出来的行与变更日志上，不走仓库：实体缓存挡在中间时，「表里有没有这行」读的是缓存。
 * 往表里写也用裸写（不经 `transaction()`）：默认事务首尾会按本实例的表集重挂触发器，经它写就测不到
 * 「这张表的触发器此刻挂在哪条分支」。
 */
export function worktreeTableSetSuite(factory: AdapterFactory): void {
  describe.sequential(`Worktree table set [${factory.name}]`, () => {
    const heldBranch = 'held';
    const tableSet = WorktreeTableSet.of('wt_probe', [Todo]);
    let adapter: RxDBAdapterSqliteBase;

    const tableOf = (set: WorktreeTableSet): string =>
      quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(Todo), set));
    const branchTable = quote_sql_identifier(
      get_table_name_by_metadata(getEntityMetadata(RxDBBranch), WorktreeTableSet.MAIN)
    );
    const changeTable = quote_sql_identifier(
      get_table_name_by_metadata(getEntityMetadata(RxDBChange), WorktreeTableSet.MAIN)
    );

    const readRows = async (sql: string, params?: SQLiteCompatibleType[]): Promise<unknown[][]> =>
      (await adapter.internalQuery(sql, params)).results.flatMap(result => result.rows);

    /** 裸写一行：触发器挂在哪条分支，这次写的变更就记在哪条分支 */
    const rawInsert = async (set: WorktreeTableSet, title: string): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await adapter.internalQuery(
        `INSERT INTO ${tableOf(set)} ("id", "title", "completed", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)`,
        [id, title, 0, now, now]
      );
      return id;
    };

    const branchesOfChanges = async (id: string): Promise<unknown[]> =>
      (
        await readRows(`SELECT "branchId" FROM ${changeTable} WHERE "entityId" = ?`, [encodeRxDBChangeEntityId(id)])
      ).map(row => row[0]);

    const titlesOf = async (set: WorktreeTableSet): Promise<unknown[]> =>
      (await readRows(`SELECT "title" FROM ${tableOf(set)} ORDER BY "title"`)).map(row => row[0]);

    const objectsOf = async (type: 'table' | 'trigger', like: string): Promise<unknown[]> =>
      (
        await readRows(
          `SELECT "name" FROM sqlite_master WHERE "type" = ? AND "name" LIKE ? ESCAPE '\\' ORDER BY "name"`,
          [type, like]
        )
      ).map(row => row[0]);

    /**
     * 在分支表上挂一个 AFTER UPDATE 见证触发器，跑完 `body` 读回被写过的分支行。
     *
     * @remarks
     * SQLite 没有行版本号：写了就留痕，没写就是空。名字不带 `_change_trigger` 后缀，免得被重建触发器的路径顺手删掉。
     */
    const branchWritesDuring = async (body: () => Promise<unknown>): Promise<unknown[]> => {
      await adapter.internalQuery(`CREATE TABLE "rxdb_branch_write_probe" ("id" text)`);
      await adapter.internalQuery(
        `CREATE TRIGGER "rxdb_branch_write_probe_watch" AFTER UPDATE ON ${branchTable}
         BEGIN INSERT INTO "rxdb_branch_write_probe" ("id") VALUES (NEW."id"); END`
      );
      try {
        await body();
        return (await readRows(`SELECT "id" FROM "rxdb_branch_write_probe"`)).map(row => row[0]);
      } finally {
        await adapter.internalQuery(`DROP TRIGGER "rxdb_branch_write_probe_watch"`);
        await adapter.internalQuery(`DROP TABLE "rxdb_branch_write_probe"`);
      }
    };

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
    });

    afterAll(async () => {
      if (adapter) await adapter.rxdb.disconnectAll();
    });

    // 每条用例自己开一套：持有分支、持有键、表集。清库连同影子表集一起删（cleanup_db）。
    beforeEach(async () => {
      await adapter.rxdb.versionManager.createBranch(heldBranch);
      await adapter.internalQuery(`UPDATE ${branchTable} SET "activeKey" = ? WHERE "id" = ?`, [
        tableSet.holderKey,
        heldBranch
      ]);
      await adapter.createWorktreeTableSet(tableSet, heldBranch);
    });

    afterEach(async () => await cleanup_db(adapter));

    it('建出成员自己的表：影子表的写记在持有分支，主表的写照旧记在主检出位的分支', async () => {
      expect(await objectsOf('table', '%$wt\\_probe')).toEqual(['public$todos$wt_probe']);

      const shadowId = await rawInsert(tableSet, 'shadow');
      const mainId = await rawInsert(WorktreeTableSet.MAIN, 'main');

      expect(await branchesOfChanges(shadowId)).toEqual([heldBranch]);
      expect(await branchesOfChanges(mainId)).toEqual(['main']);
      expect(await titlesOf(tableSet)).toEqual(['shadow']);
      expect(await titlesOf(WorktreeTableSet.MAIN)).toEqual(['main']);
    });

    // 每个记日志事务首尾都按本实例的表集重挂触发器：主检出位的实例只能动主表集
    it('主检出位的普通事务不动影子表，也不把影子表的触发器挂到主分支', async () => {
      const todo = new Todo();
      todo.title = 'through-transaction';
      await todo.save();

      expect(await titlesOf(tableSet)).toEqual([]);
      expect(await branchesOfChanges(await rawInsert(tableSet, 'shadow'))).toEqual([heldBranch]);
    });

    // 拉取回填与 QueryCache 写入都走关触发器的写（withTriggersDisabled）
    it('关触发器的写（拉取）不写分支表，也不动影子表的触发器', async () => {
      const written = await branchWritesDuring(() =>
        execute_switch_actions(adapter, { deletes: [], inserts: [], updates: [] }, true)
      );

      expect(written).toEqual([]);
      expect(await branchesOfChanges(await rawInsert(tableSet, 'shadow'))).toEqual([heldBranch]);
      expect(await branchesOfChanges(await rawInsert(WorktreeTableSet.MAIN, 'main'))).toEqual(['main']);
    });

    it('撤销 / 重做不写分支表，也不动影子表', async () => {
      const todo = new Todo();
      todo.title = 'undo-me';
      await todo.save();
      const history = adapter.rxdb.versionManager.history();
      // 撤销会话每条用例都被清空过，靠这里的本地写入异步恢复：等它可撤销了再撤
      await expect.poll(() => firstValueFrom(history.undoCount$)).toBe(1);

      const written = await branchWritesDuring(async () => {
        await history.undo();
        await history.redo();
      });

      expect(written).toEqual([]);
      expect(await titlesOf(tableSet)).toEqual([]);
      expect(await branchesOfChanges(await rawInsert(tableSet, 'shadow'))).toEqual([heldBranch]);
    });

    it('主检出位真切分支：只重挂主表集，影子表的触发器还挂在持有分支', async () => {
      await adapter.rxdb.versionManager.createBranch('feature');
      await adapter.rxdb.versionManager.switchBranch('feature');

      expect(await branchesOfChanges(await rawInsert(tableSet, 'shadow'))).toEqual([heldBranch]);
      expect(await branchesOfChanges(await rawInsert(WorktreeTableSet.MAIN, 'main'))).toEqual(['feature']);
    });

    it('删表集：成员那张表连同触发器一起没了，主表集原样', async () => {
      await adapter.dropWorktreeTableSet(tableSet);

      expect(await objectsOf('table', '%$wt\\_probe')).toEqual([]);
      expect(await objectsOf('trigger', '%$wt\\_probe\\_%')).toEqual([]);
      expect(await objectsOf('trigger', 'public$todos\\_%')).toEqual([
        'public$todos_delete',
        'public$todos_insert',
        'public$todos_update'
      ]);
      expect(await branchesOfChanges(await rawInsert(WorktreeTableSet.MAIN, 'main'))).toEqual(['main']);
    });

    it('主表集不经这里建，成员也必须记变更日志', async () => {
      await expect(adapter.createWorktreeTableSet(WorktreeTableSet.MAIN, 'main')).rejects.toThrow(/主表集/);
      await expect(adapter.dropWorktreeTableSet(WorktreeTableSet.MAIN)).rejects.toThrow(/主表集/);
      await expect(
        adapter.createWorktreeTableSet(WorktreeTableSet.of('wt_branch', [RxDBBranch]), heldBranch)
      ).rejects.toThrow(/变更日志/);
    });
  });
}
