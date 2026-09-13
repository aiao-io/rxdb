/**
 * @fileoverview PGlite 后端的提交侧一致性调用点（T043）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb/testing`，六个 v1 后端各有一个这样的文件。**断言一律不写在这里**：
 * 一旦某个后端在本地加一条「它自己的」断言，六份就开始各测各的，而这套套件存在的理由
 * 恰恰是「六个后端对同一组语义给出同一个答案」。这里只负责两件事：造一个已启用的库，
 * 以及在用例之间把它关掉。
 *
 * 契约（`suite-context.ts`）要求每次调用都交出一个**全新**实例，所以这里不复用同一个库；
 * 契约没有 teardown 钩子，于是回收落在调用点自己身上——文件级 `afterEach` 在套件内层钩子
 * 之后跑，把本条用例开过的库全部断开，免得十几个 PGlite WASM 实例一路堆到文件结束。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { workingTreeCommitConformanceSuite } from '@aiao/rxdb/testing';
import { afterEach } from 'vitest';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

const opened: RxDB[] = [];

afterEach(async () => {
  const pending = opened.splice(0);
  for (const database of pending) await database.disconnectAll();
});

workingTreeCommitConformanceSuite({
  name: 'PGlite',
  createDatabase: async () => {
    const database = new RxDB({
      dbName: `working-tree-commit-conformance-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      entities: [],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    opened.push(database);
    await database.connect('pglite');
    await database.workingTree.enable();
    return database;
  }
});
