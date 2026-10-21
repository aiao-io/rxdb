/**
 * @fileoverview 可写检出位的表集（US-314 B1.3）：建表集、删表集，以及主检出位的各条写路径都不碰别的表集。
 *
 * @remarks
 * 与 sqlite-core 的 `shared-worktree-table-set.suite.ts` 逐条对应。断言一律落在裸读出来的行与变更日志上，
 * 不走仓库：实体缓存挡在中间时，「表里有没有这行」读的是缓存。往表里写也用裸写，测的是「这张表的触发器此刻挂在哪条分支」。
 * 分支表有没有被写过看行的 `xmin`：行被重写过它就变。
 */

import {
  encodeRxDBChangeEntityId,
  Entity,
  EntityBase,
  getEntityMetadata,
  getRxDBChangeKey,
  type IRxDBChange,
  PropertyType,
  RxDB,
  RxDBBranch,
  type SwitchVersionActions,
  SyncType,
  uuid,
  WorktreeTableSet
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { cleanup_db } from '../testing.js';
import { execute_switch_actions } from '../version/execute_switch_actions.js';
import { generateDbName } from './test-utils.js';

/** 整数主键（PGlite 上是 `serial`）：播种要把主表的序列对齐过去（US-314 B1.5） */
@Entity({
  name: 'WorktreeSeqNote',
  namespace: 'wtseq',
  tableName: 'wtseq_note',
  properties: [
    { name: 'id', type: PropertyType.integer, primary: true, readonly: true },
    { name: 'title', type: PropertyType.string }
  ]
})
class WorktreeSeqNote extends EntityBase<number> {
  declare title: string;
}

const emptyActions = (): SwitchVersionActions => ({ inserts: new Map(), updates: new Map(), deletes: new Map() });

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

  /** 在一笔不记日志的事务里建一套表并播种（US-314 B1.5） */
  const createTableSet = (
    set: WorktreeTableSet,
    branchId: string,
    actions: SwitchVersionActions = emptyActions()
  ): Promise<void> =>
    adapter.transaction(executor => adapter.createWorktreeTableSet(executor, set, { branchId, actions }), false);

  const dropTableSet = (set: WorktreeTableSet): Promise<void> =>
    adapter.transaction(executor => adapter.dropWorktreeTableSet(executor, set), false);

  /** 建一条分支，让 `set` 持有它（写持有键） */
  const holdBranchFor = async (set: WorktreeTableSet, branchId: string): Promise<void> => {
    await rxdb.versionManager.createBranch(branchId);
    await adapter.internalQuery(`UPDATE "rxdb"."rxdb_branch" SET "activeKey" = $1::text WHERE "id" = $2::text`, [
      set.holderKey,
      branchId
    ]);
  };

  const countChanges = async (): Promise<number> =>
    Number(
      (await adapter.internalQuery<{ n: string }>(`SELECT count(*)::text AS "n" FROM "rxdb"."rxdb_change"`)).rows[0].n
    );

  /** 一行 Todo 的变更键：`<命名空间>:<实体>:<身份键>` */
  const todoKey = (id: string): string => {
    const { namespace, name } = getEntityMetadata(Todo);
    return getRxDBChangeKey({ namespace, entity: name, entityId: id } as IRxDBChange);
  };

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
      entities: [Todo, WorktreeSeqNote],
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
    await createTableSet(tableSet, heldBranch);
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
    await dropTableSet(tableSet);

    expect(await schemasLike('%$wt\\_probe')).toEqual([]);
    expect(await branchesOfChanges(await rawInsert(WorktreeTableSet.MAIN, 'main'))).toEqual(['main']);
  });

  // 删表集按目录找（US-314 B1.5）：建到一半的、成员已从配置里移除的也删得掉
  it('删表集按目录找：成员不给也删得掉，删两遍不报错', async () => {
    await dropTableSet(WorktreeTableSet.of('wt_probe', []));
    expect(await schemasLike('%$wt\\_probe')).toEqual([]);

    await dropTableSet(WorktreeTableSet.of('wt_probe', []));
  });

  it('主表集不经这里建，成员也必须记变更日志', async () => {
    await expect(createTableSet(WorktreeTableSet.MAIN, 'main')).rejects.toThrow(/主表集/);
    await expect(dropTableSet(WorktreeTableSet.MAIN)).rejects.toThrow(/主表集/);
    await expect(createTableSet(WorktreeTableSet.of('wt_branch', [RxDBBranch]), heldBranch)).rejects.toThrow(
      /变更日志/
    );
  });

  // 打开可写检出位的播种（US-314 B1.5）：与 sqlite-core 共享套件的同名一组逐条对应
  describe('播种（US-314 B1.5）', () => {
    it('主表的行原样复制、叠上增量，都不记进变更日志；之后的写记在持有分支', async () => {
      const seeded = WorktreeTableSet.of('wt_seed', [Todo]);
      await rawInsert(WorktreeTableSet.MAIN, 'keep');
      const gone = await rawInsert(WorktreeTableSet.MAIN, 'gone');
      await holdBranchFor(seeded, 'seed-held');
      const changes = await countChanges();
      const added = uuid();
      const now = new Date().toISOString();

      await createTableSet(seeded, 'seed-held', {
        inserts: new Map([
          [
            todoKey(added),
            {
              patch: { id: added, title: 'added', completed: false, createdAt: now, updatedAt: now },
              inversePatch: null
            }
          ]
        ]),
        updates: new Map(),
        deletes: new Map([[todoKey(gone), { patch: null, inversePatch: null }]])
      });

      expect(await titlesOf(seeded)).toEqual(['added', 'keep']);
      expect(await titlesOf(WorktreeTableSet.MAIN)).toEqual(['gone', 'keep']);
      expect(await countChanges()).toBe(changes);
      expect(await branchesOfChanges(await rawInsert(seeded, 'later'))).toEqual(['seed-held']);
    });

    // 非成员按解析器落回主表集的 schema：叠上去就改写了主检出位的表
    it('增量里有表集之外的实体：整笔拒绝，一个 schema 都不建', async () => {
      const stray = WorktreeTableSet.of('wt_stray', [Todo]);
      await holdBranchFor(stray, 'stray-held');
      const { namespace, name } = getEntityMetadata(WorktreeSeqNote);
      const outside = getRxDBChangeKey({ namespace, entity: name, entityId: 1 } as IRxDBChange);

      await expect(
        createTableSet(stray, 'stray-held', {
          inserts: new Map([[outside, { patch: { id: 1, title: 'outside' }, inversePatch: null }]]),
          updates: new Map(),
          deletes: new Map()
        })
      ).rejects.toThrow(/表集之外/);
      expect(await schemasLike('%$wt\\_stray')).toEqual([]);
    });

    // 显式插入完全不推进 serial 的序列：不对齐的话，检出位里第一次插入就撞主键
    it('对齐 serial 序列：主表删掉的 id，影子表不再发', async () => {
      const seqSet = WorktreeTableSet.of('wt_seq', [WorktreeSeqNote]);
      const insertNote = async (schema: string, title: string): Promise<void> => {
        await adapter.internalQuery(
          `INSERT INTO "${schema}"."wtseq_note" ("title", "createdAt", "updatedAt") VALUES ($1::text, now(), now())`,
          [title]
        );
      };
      for (const title of ['a', 'b', 'c']) await insertNote('wtseq', title);
      const lastId = Number(
        (await adapter.internalQuery<{ id: string }>(`SELECT max("id")::text AS "id" FROM "wtseq"."wtseq_note"`))
          .rows[0].id
      );
      await adapter.internalQuery(`DELETE FROM "wtseq"."wtseq_note" WHERE "id" = $1::integer`, [lastId]);
      await holdBranchFor(seqSet, 'seq-held');

      await createTableSet(seqSet, 'seq-held');
      await insertNote('wtseq$wt_seq', 'd');

      const nextId = Number(
        (await adapter.internalQuery<{ id: string }>(`SELECT max("id")::text AS "id" FROM "wtseq$wt_seq"."wtseq_note"`))
          .rows[0].id
      );
      expect(nextId).toBe(lastId + 1);
    });
  });

  // 实例挂在可写检出位上（US-314 B1.4）：与 sqlite-core 共享套件的同名一组逐条对应
  describe('实例挂在可写检出位上（US-314 B1.4）', () => {
    const titlesThroughRepository = async (): Promise<string[]> =>
      (
        await firstValueFrom(
          rxdb.entityManager.getRepository(Todo).findAll({ where: { combinator: 'and', rules: [] } })
        )
      )
        .map(todo => String(todo.title))
        .sort();

    // 先挂回主表集再清库：外层的清库删的就是这套影子表
    afterEach(async () => {
      await rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
    });

    it('挂上之后读写落在影子表、记在持有分支，当前分支是持有分支；挂回主表集一切照旧', async () => {
      await rawInsert(WorktreeTableSet.MAIN, 'main-row');

      await rxdb.mountWorktreeTableSet(tableSet);

      expect((await rxdb.versionManager.getCurrentBranch()).id).toBe(heldBranch);
      const todo = new Todo({ title: 'in-worktree' });
      await todo.save();
      expect(await titlesOf(tableSet)).toEqual(['in-worktree']);
      expect(await titlesOf(WorktreeTableSet.MAIN)).toEqual(['main-row']);
      expect(await branchesOfChanges(todo.id)).toEqual([heldBranch]);
      expect(await titlesThroughRepository()).toEqual(['in-worktree']);

      await rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);

      expect((await rxdb.versionManager.getCurrentBranch()).id).toBe('main');
      expect(await titlesThroughRepository()).toEqual(['main-row']);
    });

    it('活查询跟着重跑：挂上之后发出影子表的行，挂回之后发出主表的行', async () => {
      await rawInsert(WorktreeTableSet.MAIN, 'main-row');
      await rawInsert(tableSet, 'shadow-row');
      let latest: string[] = [];
      const subscription = rxdb.entityManager
        .getRepository(Todo)
        .findAll({ where: { combinator: 'and', rules: [] } })
        .subscribe(rows => (latest = rows.map(row => String(row.title)).sort()));
      try {
        await expect.poll(() => latest).toEqual(['main-row']);
        await rxdb.mountWorktreeTableSet(tableSet);
        await expect.poll(() => latest).toEqual(['shadow-row']);
        await rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
        await expect.poll(() => latest).toEqual(['main-row']);
      } finally {
        subscription.unsubscribe();
      }
    });

    it('撤销 / 重做撤的是影子表里的写，主表集不动', async () => {
      await rawInsert(WorktreeTableSet.MAIN, 'main-row');
      await rxdb.mountWorktreeTableSet(tableSet);
      const todo = new Todo({ title: 'undo-in-worktree' });
      await todo.save();
      const history = rxdb.versionManager.history();
      // 撤销会话跟着当前分支换到了持有分支，靠这里的本地写入异步恢复：等它可撤销了再撤
      await expect.poll(() => firstValueFrom(history.undoCount$)).toBe(1);

      await history.undo();
      expect(await titlesOf(tableSet)).toEqual([]);
      expect(await titlesOf(WorktreeTableSet.MAIN)).toEqual(['main-row']);

      await history.redo();
      expect(await titlesOf(tableSet)).toEqual(['undo-in-worktree']);
      expect(await titlesOf(WorktreeTableSet.MAIN)).toEqual(['main-row']);
    });

    it('挂在可写检出位上不能真切分支', async () => {
      await rxdb.versionManager.createBranch('feature');
      await rxdb.mountWorktreeTableSet(tableSet);

      await expect(rxdb.versionManager.switchBranch('feature')).rejects.toThrow(/可写检出位/);
      expect((await rxdb.versionManager.getCurrentBranch()).id).toBe(heldBranch);
    });

    // 建分支在事务里取「当前分支」做父分支：挂在可写检出位上时是持有分支，不是主检出位激活的那一条
    it('挂在可写检出位上建分支：父分支是持有分支', async () => {
      await rxdb.mountWorktreeTableSet(tableSet);

      const branch = await rxdb.versionManager.createBranch('from-worktree');

      expect(branch.parentId).toBe(heldBranch);
    });

    it('没有持有分支的表集挂不上', async () => {
      await expect(rxdb.mountWorktreeTableSet(WorktreeTableSet.of('wt_none', [Todo]))).rejects.toThrow(/持有/);
      expect(rxdb.worktreeTableSet).toBe(WorktreeTableSet.MAIN);
    });
  });
});
