/**
 * @fileoverview 可写检出位的表集（US-314 B1.3）：建表集、删表集，以及主检出位的各条写路径都不碰别的表集。
 *
 * @remarks
 * 与 sqlite-core 的 `shared-worktree-table-set.suite.ts` 逐条对应。断言一律落在裸读出来的行与变更日志上，
 * 不走仓库：实体缓存挡在中间时，「表里有没有这行」读的是缓存。往表里写也用裸写，测的是「这张表的触发器此刻挂在哪条分支」。
 * 分支表有没有被写过看行的 `xmin`：行被重写过它就变。
 */

import { encodeRxDBChangeEntityId, RxDB, RxDBBranch, SyncType, uuid, WorktreeTableSet } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { cleanup_db } from '../testing.js';
import { execute_switch_actions } from '../version/execute_switch_actions.js';
import { generateDbName } from './test-utils.js';

describe('可写检出位的表集（US-314 B1.3）', () => {
  const heldBranch = 'held';
  const tableSet = WorktreeTableSet.of('wt_probe', [Todo]);
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  const tableOf = (set: WorktreeTableSet): string =>
    set.isMain ? '"public"."todos"' : `"public$${set.suffix}"."todos"`;

  /** 裸写一行：触发器挂在哪条分支，这次写的变更就记在哪条分支 */
  const rawInsert = async (set: WorktreeTableSet, title: string): Promise<string> => {
    const id = uuid();
    await adapter.internalQuery(
      `INSERT INTO ${tableOf(set)} ("id", "title", "completed", "createdAt", "updatedAt")
       VALUES ($1::uuid, $2::text, false, now(), now())`,
      [id, title]
    );
    return id;
  };

  const branchesOfChanges = async (id: string): Promise<string[]> =>
    (
      await adapter.internalQuery<{ branchId: string }>(
        `SELECT "branchId" FROM "rxdb"."rxdb_change" WHERE "entityId" = $1::text ORDER BY "id"`,
        [encodeRxDBChangeEntityId(id)]
      )
    ).rows.map(row => row.branchId);

  const titlesOf = async (set: WorktreeTableSet): Promise<string[]> =>
    (await adapter.internalQuery<{ title: string }>(`SELECT "title" FROM ${tableOf(set)} ORDER BY "title"`)).rows.map(
      row => row.title
    );

  /** 分支表每行的 `xmin`：行被重写过它就变，没被重写它就不变 */
  const branchRowVersions = async (): Promise<Array<{ id: string; xmin: string }>> =>
    (
      await adapter.internalQuery<{ id: string; xmin: string }>(
        `SELECT "id", "xmin"::text AS "xmin" FROM "rxdb"."rxdb_branch" ORDER BY "id"`
      )
    ).rows;

  const schemasLike = async (pattern: string): Promise<string[]> =>
    (
      await adapter.internalQuery<{ nspname: string }>(
        `SELECT nspname FROM pg_namespace WHERE nspname LIKE $1::text ORDER BY nspname`,
        [pattern]
      )
    ).rows.map(row => row.nspname);

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      entities: [Todo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    rxdb.use(rxDBPluginHistory);
    adapter = await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  // 每条用例自己开一套：持有分支、持有键、表集。清库连同影子表集的 schema 一起删（cleanup_db）。
  beforeEach(async () => {
    await rxdb.versionManager.createBranch(heldBranch);
    await adapter.internalQuery(`UPDATE "rxdb"."rxdb_branch" SET "activeKey" = $1::text WHERE "id" = $2::text`, [
      tableSet.holderKey,
      heldBranch
    ]);
    await adapter.createWorktreeTableSet(tableSet, heldBranch);
  });

  afterEach(async () => {
    await cleanup_db(adapter);
    rxdb.versionManager.resetSessionState();
  });

  it('建出成员自己的表：影子表的写记在持有分支，主表的写照旧记在主检出位的分支', async () => {
    expect(await schemasLike('%$wt\\_probe')).toEqual(['public$wt_probe']);

    const shadowId = await rawInsert(tableSet, 'shadow');
    const mainId = await rawInsert(WorktreeTableSet.MAIN, 'main');

    expect(await branchesOfChanges(shadowId)).toEqual([heldBranch]);
    expect(await branchesOfChanges(mainId)).toEqual(['main']);
    expect(await titlesOf(tableSet)).toEqual(['shadow']);
    expect(await titlesOf(WorktreeTableSet.MAIN)).toEqual(['main']);
  });

  it('主检出位的普通事务不动影子表，也不把影子表的触发器挂到主分支', async () => {
    const todo = new Todo({ title: 'through-transaction' });
    await todo.save();

    expect(await titlesOf(tableSet)).toEqual([]);
    expect(await branchesOfChanges(await rawInsert(tableSet, 'shadow'))).toEqual([heldBranch]);
  });

  // 拉取回填与 QueryCache 写入都走关触发器的写
  it('关触发器的写（拉取）不写分支表，也不动影子表的触发器', async () => {
    const versionsBefore = await branchRowVersions();

    await execute_switch_actions(adapter, { deletes: [], inserts: [], updates: [] }, undefined, true);

    expect(await branchRowVersions()).toEqual(versionsBefore);
    expect(await branchesOfChanges(await rawInsert(tableSet, 'shadow'))).toEqual([heldBranch]);
    expect(await branchesOfChanges(await rawInsert(WorktreeTableSet.MAIN, 'main'))).toEqual(['main']);
  });

  it('撤销 / 重做不写分支表，也不动影子表', async () => {
    const todo = new Todo({ title: 'undo-me' });
    await todo.save();
    const history = rxdb.versionManager.history();
    // 撤销会话每条用例都被清空过，靠这里的本地写入异步恢复：等它可撤销了再撤
    await expect.poll(() => firstValueFrom(history.undoCount$)).toBe(1);
    const versionsBefore = await branchRowVersions();

    await history.undo();
    await history.redo();

    expect(await branchRowVersions()).toEqual(versionsBefore);
    expect(await titlesOf(tableSet)).toEqual([]);
    expect(await branchesOfChanges(await rawInsert(tableSet, 'shadow'))).toEqual([heldBranch]);
  });

  it('主检出位真切分支：只重挂主表集，影子表的触发器还挂在持有分支', async () => {
    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');

    expect(await branchesOfChanges(await rawInsert(tableSet, 'shadow'))).toEqual([heldBranch]);
    expect(await branchesOfChanges(await rawInsert(WorktreeTableSet.MAIN, 'main'))).toEqual(['feature']);

    await rxdb.versionManager.switchBranch('main');
  });

  it('删表集：成员所在的 schema 连同触发器函数一起没了，主表集原样', async () => {
    await adapter.dropWorktreeTableSet(tableSet);

    expect(await schemasLike('%$wt\\_probe')).toEqual([]);
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
