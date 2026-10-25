import {
  ACTIVE_BRANCH_KEY,
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  Entity,
  EntityBase,
  type IRxDBChange,
  PropertyType,
  RxDBBranch,
  RxDBChange,
  WorktreeBranchHeldError,
  WorktreeTableSet,
  WorktreeTableSetMismatchError,
  encodeRxDBChangeEntityId,
  getEntityMetadata,
  getEntityStatus,
  getRxDBChangeKey
} from '@aiao/rxdb';
import { filter, firstValueFrom, skip } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handle_rxdb_change } from '../handle_rxdb_change.js';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { SQLiteChangeType } from '../sqlite-backend.interface.js';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import { quote_sql_identifier } from '../sqlite-core.utils.js';
import { get_table_name_by_metadata } from '../table-name-resolver.js';
import { execute_switch_actions } from '../version/execute_switch_actions.js';
import type { AdapterFactory } from './adapter-factory.js';
import { Todo } from './fixtures/Todo.js';
import {
  cleanup_db,
  create_worktree_table_set,
  drop_worktree_table_set,
  list_worktree_table_set_suffixes
} from './test-utils.js';

/** 主表的物理名恰好以表集后缀的形状结尾（`public$wt_lookalike`）：按目录认表集时不能把它当成一套影子表（US-314 B2.6） */
@Entity({
  name: 'WorktreeLookalike',
  tableName: 'wt_lookalike',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class WorktreeLookalike extends EntityBase {
  declare title: string;
}

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
      expect(
        await readRows(`SELECT "tableSetSuffix" FROM ${changeTable} WHERE "entityId" = ?`, [
          encodeRxDBChangeEntityId(shadowId)
        ])
      ).toEqual([[tableSet.suffix]]);
      expect(
        await readRows(`SELECT "tableSetSuffix" FROM ${changeTable} WHERE "entityId" = ?`, [
          encodeRxDBChangeEntityId(mainId)
        ])
      ).toEqual([[null]]);
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

    // 孤儿回收按目录找还在的表集（US-314 B2.6），包括登记行已经没了的
    it('列举表集：认出每一套影子表的后缀，主表集不算；删掉之后不再列出', async () => {
      const other = WorktreeTableSet.of('wt_other', [Todo]);
      await holdBranchFor(other, 'other-held');
      await create_worktree_table_set(adapter, other, 'other-held');
      expect(await list_worktree_table_set_suffixes(adapter)).toEqual(['wt_other', 'wt_probe']);

      await drop_worktree_table_set(adapter, tableSet);
      await drop_worktree_table_set(adapter, other);
      expect(await list_worktree_table_set_suffixes(adapter)).toEqual([]);
    });

    it('列举表集：配置里实体的主表名恰好以表集后缀的形状结尾，不算一套影子表', async () => {
      const lookalike = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [WorktreeLookalike] });
      try {
        expect(await list_worktree_table_set_suffixes(lookalike)).toEqual([]);
      } finally {
        await lookalike.rxdb.disconnectAll();
      }
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

    it('切分支排队期间发生换挂时，拒绝旧计划且不修改主检出位', async () => {
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const blocking = adapter.transaction(async () => {
        entered.resolve();
        await release.promise;
      }, false);
      await entered.promise;
      const mounting = adapter.rxdb.mountWorktreeTableSet(tableSet);
      let prepared = false;
      const switching = adapter.switchBranch({
        branchId: 'target',
        actions: { inserts: new Map(), updates: new Map(), deletes: new Map() },
        prepare: async () => {
          prepared = true;
        }
      });
      release.resolve();
      try {
        const results = await Promise.allSettled([blocking, mounting, switching]);
        expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']);
        expect(results[2]).toMatchObject({
          reason: expect.objectContaining({ message: expect.stringContaining('表集已改变') })
        });
        expect(prepared).toBe(false);
        expect(await readRows(`SELECT id FROM ${branchTable} WHERE activated = 1`)).toEqual([['main']]);
        expect(await readRows(`SELECT id FROM ${branchTable} WHERE "activeKey" = ?`, [tableSet.holderKey])).toEqual([
          [heldBranch]
        ]);
      } finally {
        await adapter.rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
      }
    });

    it.each(['save', 'remove', 'create', 'saveMany', 'removeMany'] as const)(
      '换挂排队期间的 %s 不得写进另一套表',
      async operation => {
        const todo = new Todo({ title: 'original' });
        await todo.save();
        await adapter.internalQuery(`INSERT INTO ${tableOf(tableSet)} SELECT * FROM ${tableOf(WorktreeTableSet.MAIN)}`);
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        const blocking = adapter.transaction(async () => {
          entered.resolve();
          await release.promise;
        }, false);
        await entered.promise;
        const mounting = adapter.rxdb.mountWorktreeTableSet(tableSet);
        todo.title = 'main-edit';
        const draft = new Todo({ title: 'draft' });
        const writes = {
          save: () => todo.save(),
          remove: () => todo.remove(),
          create: () => draft.save(),
          saveMany: () => adapter.rxdb.entityManager.saveMany([todo]),
          removeMany: () => adapter.rxdb.entityManager.removeMany([todo])
        };
        const saving = writes[operation]();
        release.resolve();
        try {
          const [blocked, mounted, saved] = await Promise.allSettled([blocking, mounting, saving]);
          expect(blocked.status).toBe('fulfilled');
          expect(mounted.status).toBe('fulfilled');
          expect(saved).toMatchObject({ status: 'rejected', reason: expect.any(WorktreeTableSetMismatchError) });
          expect(await titlesOf(tableSet)).toEqual(['original']);
          expect(await titlesOf(WorktreeTableSet.MAIN)).toEqual(['original']);
        } finally {
          await adapter.rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
        }
      }
    );

    it.each(['adapter', 'facade'] as const)('换挂排队期间的 %s 查询只回填当前表集', async mode => {
      const id = await rawInsert(WorktreeTableSet.MAIN, 'main-only');
      const now = new Date().toISOString();
      await adapter.internalQuery(
        `INSERT INTO ${tableOf(tableSet)} ("id", "title", "completed", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)`,
        [id, 'original', 0, now, now]
      );
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const blocking = adapter.transaction(async () => {
        entered.resolve();
        await release.promise;
      }, false);
      await entered.promise;
      const mounting = adapter.rxdb.mountWorktreeTableSet(tableSet);
      const options = { where: { combinator: 'and' as const, rules: [] } };
      const reading =
        mode === 'adapter' ?
          adapter.getRepository(Todo).find(options)
        : firstValueFrom(adapter.rxdb.entityManager.getRepository(Todo).findAll(options));
      release.resolve();
      try {
        const [, , rows] = await Promise.all([blocking, mounting, reading]);
        expect(rows.map(row => ({ title: row.title, suffix: getEntityStatus(row).tableSet.suffix }))).toEqual([
          { title: 'original', suffix: tableSet.suffix }
        ]);
        rows[0].title = `${rows[0].title}-edited`;
        await adapter.rxdb.entityManager.saveMany(rows);
        expect(await titlesOf(tableSet)).toEqual(['original-edited']);
        expect(await titlesOf(WorktreeTableSet.MAIN)).toEqual(['main-only']);
      } finally {
        await adapter.rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
      }
    });

    it.each(['disconnect', 'disconnectAll'] as const)('%s 等待影子事务结束后才复位挂载', async operation => {
      const isolated = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      const database = isolated.rxdb;
      try {
        const saved = await isolated
          .getRepository(Todo)
          .create(database.entityManager.instantiate(Todo, { title: 'original' }));
        await database.versionManager.createBranch(heldBranch);
        await isolated.internalQuery(`UPDATE ${branchTable} SET "activeKey" = ? WHERE "id" = ?`, [
          tableSet.holderKey,
          heldBranch
        ]);
        await create_worktree_table_set(isolated, tableSet, heldBranch);
        await database.mountWorktreeTableSet(tableSet);
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        const writing = isolated.transaction(async executor => {
          const repository = executor.getRepository(Todo);
          const [todo] = await repository.find({ where: { combinator: 'and', rules: [] } });
          entered.resolve();
          await release.promise;
          await repository.update(todo, { title: 'shadow-edit' });
          const main = await executor.query(`SELECT "title" FROM ${tableOf(WorktreeTableSet.MAIN)}`);
          const shadow = await executor.query(`SELECT "title" FROM ${tableOf(tableSet)}`);
          return { main: main.rows, shadow: shadow.rows, tableSet: executor.tableSet };
        }, false);
        await entered.promise;
        const stopped = firstValueFrom(database.connected$.pipe(filter(connected => !connected)));
        const closing = operation === 'disconnect' ? database.disconnect(isolated.name) : database.disconnectAll();
        await stopped;
        release.resolve();
        const [result] = await Promise.all([writing, closing]);
        expect(result).toEqual({ main: [['original']], shadow: [['shadow-edit']], tableSet });
        expect(database.entityManager.hasEntityRef(Todo, saved.id)).toBe(false);
        expect(database.worktreeTableSet).toBe(WorktreeTableSet.MAIN);
        expect(await firstValueFrom(database.worktreeTableSet$)).toBe(WorktreeTableSet.MAIN);
      } finally {
        await database.disconnectAll();
        await factory.cleanupAdapter?.(isolated);
      }
    });

    it('分支持有键释放后，迟到事件仍标记原影子表', async () => {
      const id = await rawInsert(tableSet, 'shadow');
      await adapter.internalQuery(`UPDATE ${tableOf(tableSet)} SET "title" = ? WHERE "id" = ?`, ['shadow-edit', id]);
      const [[changeId]] = await readRows(`SELECT max("id") FROM ${changeTable} WHERE "branchId" = ? AND "type" = ?`, [
        heldBranch,
        'UPDATE'
      ]);
      await adapter.internalQuery(`UPDATE ${branchTable} SET "activeKey" = NULL WHERE "id" = ?`, [heldBranch]);
      const seen: { entity: string; id: unknown; tableSetSuffix?: string }[] = [];
      const listener = (event: { entities: { entity: string; id: unknown; tableSetSuffix?: string }[] }) => {
        seen.push(...event.entities.filter(entity => entity.entity === 'Todo'));
      };
      adapter.rxdb.addEventListener(ENTITY_LOCAL_UPDATE_EVENT, listener);
      try {
        await handle_rxdb_change(adapter, {
          type: SQLiteChangeType.SQLITE_INSERT,
          dbName: adapter.rxdb.config.dbName,
          tableName: 'rxdb$rxdb_change',
          rowIds: [BigInt(String(changeId))],
          recordAt: new Date()
        });
        expect(seen).toContainEqual(expect.objectContaining({ id, tableSetSuffix: tableSet.suffix }));
      } finally {
        adapter.rxdb.removeEventListener(ENTITY_LOCAL_UPDATE_EVENT, listener);
      }
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

      /** 开始收某类事件里 Todo 的那几条（id 与写在哪套表上），收到的放进返回的数组，`stop()` 摘掉监听 */
      const listenTodoEvents = (type: typeof ENTITY_LOCAL_CREATE_EVENT | typeof ENTITY_LOCAL_REMOVE_EVENT) => {
        const seen: { id: unknown; tableSetSuffix?: string }[] = [];
        const { name } = getEntityMetadata(Todo);
        const listener = (event: { entities: { entity: string; id: unknown; tableSetSuffix?: string }[] }) =>
          seen.push(
            ...event.entities
              .filter(entity => entity.entity === name)
              .map(({ id, tableSetSuffix }) => ({ id, tableSetSuffix }))
          );
        adapter.rxdb.addEventListener(type, listener as never);
        return { seen, stop: () => adapter.rxdb.removeEventListener(type, listener as never) };
      };

      // 本地实体事件按表集打标（US-314 B2.3）：写在影子表上的带后缀，主表上的不带，形状与从前逐字相同
      it('事件带上写在哪套表上：影子表的写带后缀，主表的写不带', async () => {
        const created = listenTodoEvents(ENTITY_LOCAL_CREATE_EVENT);
        try {
          const mainId = await rawInsert(WorktreeTableSet.MAIN, 'main-row');
          const shadowId = await rawInsert(tableSet, 'shadow-row');
          // 变更行的事件经更新钩子异步派出
          await expect.poll(() => created.seen.length).toBe(2);

          expect(created.seen.find(event => event.id === mainId)).toEqual({ id: mainId, tableSetSuffix: undefined });
          expect(created.seen.find(event => event.id === shadowId)).toEqual({
            id: shadowId,
            tableSetSuffix: tableSet.suffix
          });
        } finally {
          created.stop();
        }
      });

      it('检出位里切分支派出的事件带后缀', async () => {
        const versionManager = adapter.rxdb.versionManager;
        await rawInsert(WorktreeTableSet.MAIN, 'main-stays');
        await adapter.rxdb.mountWorktreeTableSet(tableSet);
        await versionManager.createBranch('feature');
        await versionManager.switchBranch('feature');
        const featureOnly = await rawInsert(tableSet, 'on-feature');
        const removed = listenTodoEvents(ENTITY_LOCAL_REMOVE_EVENT);

        try {
          await versionManager.switchBranch(heldBranch);
          // 读经过适配器串行队列：等后台事务提交并排空事件，再核对完整事件集与两套表。
          await adapter.query('SELECT 1;');
          expect(await titlesOf(WorktreeTableSet.MAIN)).toEqual(['main-stays']);
          expect(await titlesOf(tableSet)).toEqual([]);
          expect(removed.seen).toEqual([{ id: featureOnly, tableSetSuffix: tableSet.suffix }]);
        } finally {
          removed.stop();
        }
      });

      // 挂载信号在清实体缓存之后才发（US-314 B2.3）：订阅方拿到信号按新那套重填的缓存，不会被随后的清空抹掉
      it('worktreeTableSet$ 在实体缓存清空之后才发出新的一套', async () => {
        const todo = new Todo();
        todo.title = 'cached';
        await todo.save();
        const cachedAtSignal: boolean[] = [];
        const subscription = adapter.rxdb.worktreeTableSet$
          .pipe(skip(1))
          .subscribe(() => cachedAtSignal.push(adapter.rxdb.entityManager.hasEntityRef(Todo, todo.id)));

        await adapter.rxdb.mountWorktreeTableSet(tableSet);
        subscription.unsubscribe();

        expect(cachedAtSignal).toEqual([false]);
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

      // 检出位里切分支（US-314 B2.2）：放开原分支、持有目标分支，只动这套影子表与分支表上这两行的持有键；
      // 主检出位那一行（activated 与哨兵）一格不动，原分支上没提交的改动留在原分支（设计指点 4）
      it('挂在检出位上切分支：只动这套表与持有键，主检出位的行不动；之后的写记在新分支，切回来改动还在', async () => {
        const versionManager = adapter.rxdb.versionManager;
        await adapter.rxdb.mountWorktreeTableSet(tableSet);
        const heldOnly = await rawInsert(tableSet, 'on-held');
        await versionManager.createBranch('feature');

        const written = await branchWritesDuring(() => versionManager.switchBranch('feature'));

        expect([...written].sort()).toEqual(['feature', heldBranch]);
        expect((await versionManager.getCurrentBranch()).id).toBe('feature');
        expect(
          await readRows(
            `SELECT "id", "activated", "activeKey" FROM ${branchTable} WHERE "id" IN (?, ?, ?) ORDER BY "id"`,
            ['feature', heldBranch, 'main']
          )
        ).toEqual([
          ['feature', 0, tableSet.holderKey],
          [heldBranch, 0, null],
          ['main', 1, ACTIVE_BRANCH_KEY]
        ]);
        const featureId = await rawInsert(tableSet, 'on-feature');
        expect(await branchesOfChanges(featureId)).toEqual(['feature']);
        expect(await branchesOfChanges(await rawInsert(WorktreeTableSet.MAIN, 'main-row'))).toEqual(['main']);

        await versionManager.switchBranch(heldBranch);
        expect(await titlesOf(tableSet)).toEqual(['on-held']);
        expect(await branchesOfChanges(heldOnly)).toEqual([heldBranch]);
      });

      it('挂在检出位上切到被占的分支：主检出位的当前分支、别的检出位持有的，都一行不动地拒绝', async () => {
        const versionManager = adapter.rxdb.versionManager;
        await holdBranchFor(WorktreeTableSet.of('wt_other', [Todo]), 'other-held');
        await adapter.rxdb.mountWorktreeTableSet(tableSet);

        const written = await branchWritesDuring(async () => {
          await expect(versionManager.switchBranch('main')).rejects.toBeInstanceOf(WorktreeBranchHeldError);
          await expect(versionManager.switchBranch('other-held')).rejects.toBeInstanceOf(WorktreeBranchHeldError);
        });

        expect(written).toEqual([]);
        expect((await versionManager.getCurrentBranch()).id).toBe(heldBranch);
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
