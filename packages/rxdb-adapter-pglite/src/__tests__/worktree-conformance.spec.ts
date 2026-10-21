/**
 * @fileoverview PGlite 后端的只读检出位一致性调用点（US-313）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb-plugin-working-tree/testing`，六个 v1 后端各有一个这样的文件，断言一律不写在这里。
 * 这里只造库：注册套件的实体，装历史插件与带快照库工厂的工作树插件，`enable()` 之后交回。
 * 主库用内存。快照库平时也用内存；「持久归属的检出位放开之后原样再打开」那条用例要真存储，经
 * `createDatabaseWithPersistentSnapshots` 换成 IndexedDB（与 sqlite / sqliteai 的调用点同一个做法）。
 * 其余用例只看快照里的数据，开在 IndexedDB 上只是多一份落盘与同步；真实存储的删除由 `drop-storage.spec.ts` 验。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import {
  WORKING_TREE_CONFORMANCE_USER_ID,
  WORKTREE_CONFORMANCE_ENTITIES,
  worktreeConformanceSuite
} from '@aiao/rxdb-plugin-working-tree/testing';
import { afterEach } from 'vitest';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

const opened: RxDB[] = [];

afterEach(async () => {
  for (const database of opened.splice(0)) await database.disconnectAll();
});

/**
 * 建一个已启用提交能力的库，快照库开在 `snapshotStore` 上。
 *
 * @param snapshotStore - 快照库的存储：`memory` 或 `idb`
 */
const createDatabase = async (snapshotStore: 'memory' | 'idb'): Promise<RxDB> => {
  const database = new RxDB({
    dbName: `worktree-conformance-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    context: { userId: WORKING_TREE_CONFORMANCE_USER_ID },
    entities: [...WORKTREE_CONFORMANCE_ENTITIES],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
  database.use(rxDBPluginHistory);
  database.use(rxDBPluginWorkingTree, {
    worktrees: { adapter: db => new RxDBAdapterPGlite(db, { store: snapshotStore }) }
  });
  opened.push(database);
  await database.connect('pglite');
  await database.workingTree.enable();
  return database;
};

worktreeConformanceSuite({
  name: 'PGlite',
  createDatabase: () => createDatabase('memory'),
  createDatabaseWithPersistentSnapshots: () => createDatabase('idb')
});
