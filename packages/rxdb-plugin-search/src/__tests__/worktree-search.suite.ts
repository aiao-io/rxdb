/**
 * @fileoverview 可写检出位的影子表各有一份全文索引（US-314 B2.5），按后端参数化的共享套件。
 *
 * @remarks
 * 可写检出位是同一个库里的一套影子表。全文索引是插件建在业务表上的附属对象（SQLite 的 FTS5 外部内容虚拟表与触发器、
 * PostgreSQL 的 `_fts` 列、GIN 索引与触发器），影子表上没有它，挂上检出位就搜不到、甚至直接报「表不存在」。
 *
 * 套件不经工作树插件开检出位：本包不依赖它。建表集按工作树插件 `checkouts.add()` 落库的形状自己来——插一条分支、
 * 写上这套表的持有键、`createWorktreeTableSet` 建表播种，再在同一笔事务里 `notifyWorktreeTableSetCreated`；
 * 工作树插件那一侧的调用由它自己的单测钉住。
 *
 * 本文件是 `.suite.ts`，不会被 vitest 直接收集：SQLite 系经各后端的 `*.browser.spec.ts`、PGlite 经
 * `backend/pg-worktree-search.spec.ts` 调 {@link worktreeSearchSuite}。目录里查对象的方言差异收在 harness 里。
 */

import {
  Entity,
  EntityBase,
  PropertyType,
  RxDBBranch,
  WorktreeTableSet,
  type RxDB,
  type TransactionExecutor
} from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import type { AdapterFactory } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rxDBPluginSearch, type RxDBPluginSearch } from '../plugin.js';
import type { SearchResult, SearchState } from '../types.js';

/** 记变更日志的可搜索实体：是影子表集的成员（`log: false` 的实体没有影子副本，测不出东西） */
@Entity({
  name: 'WorktreeSearchNote',
  namespace: 'search_wt',
  tableName: 'worktree_search_note',
  properties: [{ name: 'title', type: PropertyType.string, required: true, searchable: true }]
})
export class WorktreeSearchNote extends EntityBase {
  title!: string;
}

/** 一个后端上的一套库：RxDB 已连上、搜索插件已用 `use()` 装上 */
export interface WorktreeSearchHarness {
  readonly rxdb: RxDB;
  /** 目录里这套影子表的全文索引对象（各后端自己的名字），没建为空 */
  ftsObjectsOf(tableSet: WorktreeTableSet): Promise<readonly string[]>;
  /** 目录里这套影子表还剩的任何对象（表、索引、虚拟表、schema……），删干净为空 */
  leftoversOf(tableSet: WorktreeTableSet): Promise<readonly string[]>;
  cleanup(): Promise<void>;
}

/** 按后端造 harness 的工厂 */
export interface WorktreeSearchHarnessFactory {
  readonly name: string;
  open(): Promise<WorktreeSearchHarness>;
}

/** 装搜索插件：走 `use()`，核心的建表集钩子才找得到它 */
export const searchPluginForWorktreeSuite = (db: RxDB) => rxDBPluginSearch(db, { debounce: 0 });

/**
 * SQLite 系后端的 harness：经 `@aiao/rxdb-adapter-sqlite-core/testing` 的适配器工厂建库。
 *
 * @param adapterFactory - 后端的适配器工厂
 * @returns harness 工厂
 *
 * @remarks
 * 影子表的物理名带 `$<后缀>`，它的 FTS5 虚拟表 `_fts_<物理表名>`、三个触发器与 FTS5 自己的内部表都带这一段。
 */
export const createSqliteWorktreeSearchFactory = (adapterFactory: AdapterFactory): WorktreeSearchHarnessFactory => ({
  name: adapterFactory.name,
  async open() {
    const adapter = await adapterFactory.createAdapter<RxDBAdapterSqliteBase>({
      entities: [WorktreeSearchNote],
      plugins: [searchPluginForWorktreeSuite]
    });
    const rxdb = adapter.rxdb;
    await (rxdb.getPlugins('search')[0] as RxDBPluginSearch).ready;
    const namesOf = async (sql: string, marker: string): Promise<readonly string[]> =>
      (await adapter.rawQuery(sql, [marker])).rows.map(row => String(row[0])).sort();
    return {
      rxdb,
      ftsObjectsOf: tableSet =>
        namesOf(
          `SELECT name FROM sqlite_master WHERE substr(name, 1, 5) = '_fts_' AND instr(name, ?) > 0`,
          `$${tableSet.suffix}`
        ),
      leftoversOf: tableSet =>
        namesOf(`SELECT type || ':' || name FROM sqlite_master WHERE instr(name, ?) > 0`, `$${tableSet.suffix}`),
      cleanup: async () => {
        await rxdb.disconnectAll();
        await adapterFactory.cleanupAdapter?.(adapter);
      }
    };
  }
});

const TABLE_SET = WorktreeTableSet.of('wt_search', [WorktreeSearchNote]);
const HELD_BRANCH = 'search-held';
const COLLECTION = 'WorktreeSearchNote';

/** 在实例挂着的那套表上写一条 note，返回 id */
const writeNote = async (rxdb: RxDB, title: string): Promise<string> => {
  const note = rxdb.entityManager.instantiate(WorktreeSearchNote, { title });
  await note.save();
  return note.id;
};

/**
 * 开一套可写检出位的表：插一条分支并写上这套表的持有键、建表播种，与工作树插件 `checkouts.add()` 落库的形状相同。
 *
 * @param notify - 同一笔事务里调插件的建表集钩子；`false` 模拟插件后装、或旧版本建的检出位
 */
const openTableSet = async (rxdb: RxDB, notify = true): Promise<void> => {
  const adapter = rxdb.localAdapterSync;
  await adapter.transaction(async (executor: TransactionExecutor) => {
    const branch = rxdb.entityManager.createEntityRef(RxDBBranch, {
      id: HELD_BRANCH,
      activated: false,
      activeKey: TABLE_SET.holderKey,
      fromChangeId: null,
      local: true,
      remote: false
    } as never);
    await executor.getRepository(RxDBBranch).create(branch);
    await adapter.createWorktreeTableSet!(executor, TABLE_SET, {
      branchId: HELD_BRANCH,
      actions: { inserts: new Map(), updates: new Map(), deletes: new Map() }
    });
    if (notify) await rxdb.notifyWorktreeTableSetCreated(executor, TABLE_SET);
  }, false);
};

const dropTableSet = async (rxdb: RxDB): Promise<void> => {
  const adapter = rxdb.localAdapterSync;
  await adapter.transaction(executor => adapter.dropWorktreeTableSet!(executor, TABLE_SET), false);
};

/** 盯着一个句柄：等它落定，交出命中的 id（排好序）；句柄出错就抛 */
interface HandleWatcher {
  settled(): Promise<string[]>;
  destroy(): void;
}

const watchSearch = (rxdb: RxDB, query: string): HandleWatcher => {
  const handle = rxdb.searchCollection(COLLECTION, query);
  let state: SearchState = 'idle';
  let results: readonly SearchResult[] = [];
  let failure: unknown;
  const subscriptions = new Subscription();
  subscriptions.add(handle.state$.subscribe(value => (state = value)));
  subscriptions.add(handle.results$.subscribe(value => (results = value)));
  subscriptions.add(handle.error$.subscribe(value => (failure = value)));
  return {
    async settled() {
      await vi.waitFor(() => {
        if (state === 'error') throw failure instanceof Error ? failure : new Error('search entered error state');
        expect(['success', 'empty']).toContain(state);
      });
      return results.map(result => result.id).sort();
    },
    destroy() {
      subscriptions.unsubscribe();
      handle.destroy();
    }
  };
};

/** 搜一次，等句柄落定，交出命中的 id（排好序）；句柄出错就抛 */
const idsFound = async (rxdb: RxDB, query: string): Promise<string[]> => {
  const watcher = watchSearch(rxdb, query);
  try {
    return await watcher.settled();
  } finally {
    watcher.destroy();
  }
};

/**
 * 可写检出位的全文索引（US-314 B2.5）。
 *
 * @param factory - 后端的 harness 工厂
 */
export const worktreeSearchSuite = (factory: WorktreeSearchHarnessFactory): void => {
  describe(`可写检出位的全文索引（US-314 B2.5，${factory.name}）`, () => {
    let harness: WorktreeSearchHarness;
    let rxdb: RxDB;

    beforeEach(async () => {
      harness = await factory.open();
      rxdb = harness.rxdb;
    });

    afterEach(async () => {
      await harness.cleanup();
    });

    it('建表集的同一笔事务里给影子表建出全文索引，播种过来的行搜得到', async () => {
      const seeded = await writeNote(rxdb, 'alpha 主检出位上先有的');

      await openTableSet(rxdb);

      expect(await harness.ftsObjectsOf(TABLE_SET)).not.toEqual([]);
      await rxdb.mountWorktreeTableSet(TABLE_SET);
      expect(await idsFound(rxdb, 'alpha')).toEqual([seeded]);
    });

    it('挂上检出位只搜得到这套表上的行、写入即进索引；挂回主检出位只搜得到主表上的', async () => {
      await openTableSet(rxdb);
      await rxdb.mountWorktreeTableSet(TABLE_SET);
      const inCheckout = await writeNote(rxdb, 'beta 检出位里写的');
      expect(await idsFound(rxdb, 'beta')).toEqual([inCheckout]);

      await rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
      expect(await idsFound(rxdb, 'beta')).toEqual([]);
      const onMain = await writeNote(rxdb, 'gamma 主检出位上后写的');
      expect(await idsFound(rxdb, 'gamma')).toEqual([onMain]);

      await rxdb.mountWorktreeTableSet(TABLE_SET);
      expect(await idsFound(rxdb, 'gamma')).toEqual([]);
    });

    it('换挂之后已有的句柄自动重查，查的是新挂上的那套表', async () => {
      await openTableSet(rxdb);
      await rxdb.mountWorktreeTableSet(TABLE_SET);
      const inCheckout = await writeNote(rxdb, 'zeta 检出位里写的');
      await rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
      const watcher = watchSearch(rxdb, 'zeta');
      try {
        expect(await watcher.settled()).toEqual([]);

        await rxdb.mountWorktreeTableSet(TABLE_SET);

        await vi.waitFor(async () => expect(await watcher.settled()).toEqual([inCheckout]));
      } finally {
        watcher.destroy();
      }
    });

    it('删表集之后不留这套表的全文索引，主表的索引照常', async () => {
      const onMain = await writeNote(rxdb, 'delta 主检出位上的');
      await openTableSet(rxdb);

      await dropTableSet(rxdb);

      expect(await harness.leftoversOf(TABLE_SET)).toEqual([]);
      expect(await idsFound(rxdb, 'delta')).toEqual([onMain]);
    });

    it('挂上一套还没有全文索引的表（插件后装、或建表集时没调钩子）时补建', async () => {
      const seeded = await writeNote(rxdb, 'epsilon 主检出位上先有的');
      await openTableSet(rxdb, false);
      // 开检出位之后才写进主表：检出位里搜不到它，搜到就是查到了主表上
      await writeNote(rxdb, 'epsilon 开检出位之后主检出位上写的');
      expect(await harness.ftsObjectsOf(TABLE_SET)).toEqual([]);

      await rxdb.mountWorktreeTableSet(TABLE_SET);

      expect(await idsFound(rxdb, 'epsilon')).toEqual([seeded]);
      expect(await harness.ftsObjectsOf(TABLE_SET)).not.toEqual([]);
    });
  });
};
