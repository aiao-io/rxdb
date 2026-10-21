import {
  Entity,
  EntityBase,
  type IRxDBChange,
  PropertyType,
  RxDBBranch,
  RxDBChange,
  WorktreeTableSet,
  encodeRxDBChangeEntityId,
  getEntityMetadata,
  getRxDBChangeKey
} from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import { quote_sql_identifier } from '../sqlite-core.utils.js';
import { get_table_name_by_metadata } from '../table-name-resolver.js';
import { execute_switch_actions } from '../version/execute_switch_actions.js';
import type { AdapterFactory } from './adapter-factory.js';
import { Todo } from './fixtures/Todo.js';
import { cleanup_db, create_worktree_table_set, drop_worktree_table_set } from './test-utils.js';

/** 整数主键（SQLite 上是 `AUTOINCREMENT`）：播种要把主表的序列对齐过去（US-314 B1.5） */
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

    /** 建一条分支，让 `set` 持有它（写持有键） */
    const holdBranchFor = async (set: WorktreeTableSet, branchId: string): Promise<void> => {
      await adapter.rxdb.versionManager.createBranch(branchId);
      await adapter.internalQuery(`UPDATE ${branchTable} SET "activeKey" = ? WHERE "id" = ?`, [
        set.holderKey,
        branchId
      ]);
    };

    const countChanges = async (): Promise<number> =>
      Number((await readRows(`SELECT count(*) FROM ${changeTable}`))[0][0]);

    /** 一行 Todo 的变更键：`<命名空间>:<实体>:<身份键>` */
    const todoKey = (id: string): string => {
      const { namespace, name } = getEntityMetadata(Todo);
      return getRxDBChangeKey({ namespace, entity: name, entityId: id } as IRxDBChange);
    };

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo, WorktreeSeqNote] });
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
      await create_worktree_table_set(adapter, tableSet, heldBranch);
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
      await drop_worktree_table_set(adapter, tableSet);

      expect(await objectsOf('table', '%$wt\\_probe')).toEqual([]);
      expect(await objectsOf('trigger', '%$wt\\_probe\\_%')).toEqual([]);
      expect(await objectsOf('trigger', 'public$todos\\_%')).toEqual([
        'public$todos_delete',
        'public$todos_insert',
        'public$todos_update'
      ]);
      expect(await branchesOfChanges(await rawInsert(WorktreeTableSet.MAIN, 'main'))).toEqual(['main']);
    });

    // 删表集按目录找（US-314 B1.5）：建到一半的、成员已从配置里移除的也删得掉
    it('删表集按目录找：成员不给也删得掉，删两遍不报错', async () => {
      await drop_worktree_table_set(adapter, WorktreeTableSet.of('wt_probe', []));
      expect(await objectsOf('table', '%$wt\\_probe')).toEqual([]);

      await drop_worktree_table_set(adapter, WorktreeTableSet.of('wt_probe', []));
    });

    it('主表集不经这里建，成员也必须记变更日志', async () => {
      await expect(create_worktree_table_set(adapter, WorktreeTableSet.MAIN, 'main')).rejects.toThrow(/主表集/);
      await expect(drop_worktree_table_set(adapter, WorktreeTableSet.MAIN)).rejects.toThrow(/主表集/);
      await expect(
        create_worktree_table_set(adapter, WorktreeTableSet.of('wt_branch', [RxDBBranch]), heldBranch)
      ).rejects.toThrow(/变更日志/);
    });

    // 打开可写检出位的播种（US-314 B1.5）：建表、复制主表集、叠增量都在调用方那一笔事务里，都不记进变更日志
    describe('播种（US-314 B1.5）', () => {
      it('主表的行原样复制、叠上增量，都不记进变更日志；之后的写记在持有分支', async () => {
        const seeded = WorktreeTableSet.of('wt_seed', [Todo]);
        await rawInsert(WorktreeTableSet.MAIN, 'keep');
        const gone = await rawInsert(WorktreeTableSet.MAIN, 'gone');
        await holdBranchFor(seeded, 'seed-held');
        const changes = await countChanges();
        const added = crypto.randomUUID();
        const now = new Date().toISOString();

        await create_worktree_table_set(adapter, seeded, 'seed-held', {
          inserts: new Map([
            [
              todoKey(added),
              { patch: { id: added, title: 'added', completed: 0, createdAt: now, updatedAt: now }, inversePatch: null }
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

      // 非成员按解析器落回主表名：叠上去就改写了主检出位的表
      it('增量里有表集之外的实体：整笔拒绝，一张表都不建', async () => {
        const stray = WorktreeTableSet.of('wt_stray', [Todo]);
        await holdBranchFor(stray, 'stray-held');
        const { namespace, name } = getEntityMetadata(WorktreeSeqNote);
        const outside = getRxDBChangeKey({ namespace, entity: name, entityId: 1 } as IRxDBChange);

        await expect(
          create_worktree_table_set(adapter, stray, 'stray-held', {
            inserts: new Map([[outside, { patch: { id: 1, title: 'outside' }, inversePatch: null }]]),
            updates: new Map(),
            deletes: new Map()
          })
        ).rejects.toThrow(/表集之外/);
        expect(await objectsOf('table', '%$wt\\_stray')).toEqual([]);
      });

      // 显式插入只会把影子表的序列抬到它自己的最大 id：主表删掉的 id 会被影子表再发一次
      it('对齐自增序列：主表删掉的 id，影子表不再发', async () => {
        const metadata = getEntityMetadata(WorktreeSeqNote);
        const seqSet = WorktreeTableSet.of('wt_seq', [WorktreeSeqNote]);
        const mainTable = quote_sql_identifier(get_table_name_by_metadata(metadata, WorktreeTableSet.MAIN));
        const shadowTable = quote_sql_identifier(get_table_name_by_metadata(metadata, seqSet));
        const insertNote = async (table: string, title: string): Promise<void> => {
          const now = new Date().toISOString();
          await adapter.internalQuery(`INSERT INTO ${table} ("title", "createdAt", "updatedAt") VALUES (?, ?, ?)`, [
            title,
            now,
            now
          ]);
        };
        for (const title of ['a', 'b', 'c']) await insertNote(mainTable, title);
        const [[lastId]] = await readRows(`SELECT max("id") FROM ${mainTable}`);
        await adapter.internalQuery(`DELETE FROM ${mainTable} WHERE "id" = ?`, [Number(lastId)]);
        await holdBranchFor(seqSet, 'seq-held');

        await create_worktree_table_set(adapter, seqSet, 'seq-held');
        await insertNote(shadowTable, 'd');

        const [[nextId]] = await readRows(`SELECT max("id") FROM ${shadowTable}`);
        expect(Number(nextId)).toBe(Number(lastId) + 1);
      });
    });

    // 实例挂在可写检出位上（US-314 B1.4）：读写落在影子表、记在持有分支，当前分支是持有分支；挂回主表集一切照旧。
    describe('实例挂在可写检出位上（US-314 B1.4）', () => {
      const titlesThroughRepository = async (): Promise<string[]> =>
        (
          await firstValueFrom(
            adapter.rxdb.entityManager.getRepository(Todo).findAll({ where: { combinator: 'and', rules: [] } })
          )
        )
          .map(todo => todo.title)
          .sort();

      // 先挂回主表集再清库：外层的清库删的就是这套影子表
      afterEach(async () => {
        await adapter.rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
      });

      // 检出位里合并只合这套表的成员（US-314 B2.1）：`WorktreeSeqNote` 记日志、不是这套影子表的成员，照合会落回主表、
      // 记在主检出位的分支名下（与 QueryCache 同步的实体同一种处境）
      it('挂在检出位上合并：只合这套表的成员，非成员的变更不落主表、不进日志', async () => {
        const versionManager = adapter.rxdb.versionManager;
        const seqTable = quote_sql_identifier(
          get_table_name_by_metadata(getEntityMetadata(WorktreeSeqNote), WorktreeTableSet.MAIN)
        );
        const now = new Date().toISOString();
        await versionManager.createBranch('merge-src');
        await versionManager.switchBranch('merge-src');
        // 裸写：主表集的触发器此刻挂在 merge-src 上，两行都记在它名下
        await rawInsert(WorktreeTableSet.MAIN, 'from-src');
        await adapter.internalQuery(`INSERT INTO ${seqTable} ("title", "createdAt", "updatedAt") VALUES (?, ?, ?)`, [
          'not-a-member',
          now,
          now
        ]);
        await versionManager.switchBranch('main');

        await adapter.rxdb.mountWorktreeTableSet(tableSet);
        const before = await countChanges();
        const result = await versionManager.mergeBranch('merge-src');

        expect(result.merged).toBe(1);
        expect(await titlesOf(tableSet)).toEqual(['from-src']);
        expect(await readRows(`SELECT "title" FROM ${seqTable}`)).toEqual([]);
        expect(await countChanges()).toBe(before + 1);
      });

      // QueryCache 同步的实体只在主表集（不进影子表集）：挂在检出位上回填缓存，要摘的是主表集的触发器，
      // 否则回填被记进主分支的日志，挂回主检出位后出站队列把它当离线写推回远端（US-314 B2.1）。
      // `WorktreeSeqNote` 记日志、不是这套影子表的成员，落回主表，与 QueryCache 的表同一种处境。
      it('挂在检出位上写 QueryCache：主表的行不进变更日志，主表与影子表的触发器都照旧挂在各自的分支', async () => {
        await adapter.rxdb.mountWorktreeTableSet(tableSet);
        const before = await countChanges();

        await firstValueFrom(
          adapter.upsertMany('wtseq:WorktreeSeqNote', [
            { id: 7, title: 'cached', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          ])
        );
        await firstValueFrom(adapter.deleteByIds('wtseq:WorktreeSeqNote', ['7']));

        expect(await countChanges()).toBe(before);
        expect(await branchesOfChanges(await rawInsert(WorktreeTableSet.MAIN, 'main'))).toEqual(['main']);
        expect(await branchesOfChanges(await rawInsert(tableSet, 'shadow'))).toEqual([heldBranch]);
      });

      it('挂上之后读写落在影子表、记在持有分支，当前分支是持有分支；挂回主表集一切照旧', async () => {
        await rawInsert(WorktreeTableSet.MAIN, 'main-row');

        await adapter.rxdb.mountWorktreeTableSet(tableSet);

        expect((await adapter.rxdb.versionManager.getCurrentBranch()).id).toBe(heldBranch);
        const todo = new Todo();
        todo.title = 'in-worktree';
        await todo.save();
        expect(await titlesOf(tableSet)).toEqual(['in-worktree']);
        expect(await titlesOf(WorktreeTableSet.MAIN)).toEqual(['main-row']);
        expect(await branchesOfChanges(todo.id)).toEqual([heldBranch]);
        expect(await titlesThroughRepository()).toEqual(['in-worktree']);

        await adapter.rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);

        expect((await adapter.rxdb.versionManager.getCurrentBranch()).id).toBe('main');
        expect(await titlesThroughRepository()).toEqual(['main-row']);
      });

      it('活查询跟着重跑：挂上之后发出影子表的行，挂回之后发出主表的行', async () => {
        await rawInsert(WorktreeTableSet.MAIN, 'main-row');
        await rawInsert(tableSet, 'shadow-row');
        let latest: string[] = [];
        const subscription = adapter.rxdb.entityManager
          .getRepository(Todo)
          .findAll({ where: { combinator: 'and', rules: [] } })
          .subscribe(rows => (latest = rows.map(row => row.title).sort()));
        try {
          await expect.poll(() => latest).toEqual(['main-row']);
          await adapter.rxdb.mountWorktreeTableSet(tableSet);
          await expect.poll(() => latest).toEqual(['shadow-row']);
          await adapter.rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
          await expect.poll(() => latest).toEqual(['main-row']);
        } finally {
          subscription.unsubscribe();
        }
      });

      it('撤销 / 重做撤的是影子表里的写，主表集不动', async () => {
        await rawInsert(WorktreeTableSet.MAIN, 'main-row');
        await adapter.rxdb.mountWorktreeTableSet(tableSet);
        const todo = new Todo();
        todo.title = 'undo-in-worktree';
        await todo.save();
        const history = adapter.rxdb.versionManager.history();
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
        await adapter.rxdb.versionManager.createBranch('feature');
        await adapter.rxdb.mountWorktreeTableSet(tableSet);

        await expect(adapter.rxdb.versionManager.switchBranch('feature')).rejects.toThrow(/可写检出位/);
        expect((await adapter.rxdb.versionManager.getCurrentBranch()).id).toBe(heldBranch);
      });

      // 建分支在事务里取「当前分支」做父分支：挂在可写检出位上时是持有分支，不是主检出位激活的那一条
      it('挂在可写检出位上建分支：父分支是持有分支', async () => {
        await adapter.rxdb.mountWorktreeTableSet(tableSet);

        const branch = await adapter.rxdb.versionManager.createBranch('from-worktree');

        expect(branch.parentId).toBe(heldBranch);
      });

      it('没有持有分支的表集挂不上', async () => {
        await expect(adapter.rxdb.mountWorktreeTableSet(WorktreeTableSet.of('wt_none', [Todo]))).rejects.toThrow(
          /持有/
        );
        expect(adapter.rxdb.worktreeTableSet).toBe(WorktreeTableSet.MAIN);
      });
    });
  });
}
