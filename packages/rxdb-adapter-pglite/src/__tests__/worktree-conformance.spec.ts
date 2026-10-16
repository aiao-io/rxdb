/**
 * @fileoverview PGlite 后端的只读检出位一致性调用点（US-313）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb-plugin-working-tree/testing`，六个 v1 后端各有一个这样的文件，断言一律不写在这里。
 * 这里只造库：注册套件的实体，装历史插件与带快照库工厂的工作树插件，`enable()` 之后交回。
 * 主库用内存，快照库用 IndexedDB：持久归属的检出位放开之后要能原样再打开，`close()` / `prune()` 删的也要是真存储。
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

worktreeConformanceSuite({
  name: 'PGlite',
  createDatabase: async () => {
    const database = new RxDB({
      dbName: `worktree-conformance-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      context: { userId: WORKING_TREE_CONFORMANCE_USER_ID },
      entities: [...WORKTREE_CONFORMANCE_ENTITIES],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    database.use(rxDBPluginHistory);
    database.use(rxDBPluginWorkingTree, {
      worktrees: { adapter: db => new RxDBAdapterPGlite(db, { store: 'idb' }) }
    });
    opened.push(database);
    await database.connect('pglite');
    await database.workingTree.enable();
    return database;
  }
});
