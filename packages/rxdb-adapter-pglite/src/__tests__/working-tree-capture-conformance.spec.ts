/**
 * @fileoverview PGlite 后端的捕获侧一致性调用点（T068）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb/testing`，六个 v1 后端各有一个这样的文件，理由与提交侧调用点
 * （`working-tree-commit-conformance.spec.ts`）完全相同：**断言一律不写在这里**，本文件
 * 只造一个已启用的库并在用例之间把它关掉。
 *
 * 与提交侧唯一的形态差别是两处，都是捕获侧的命题决定的：
 *
 * 1. **必须注册业务实体。**「捕获是否完备」是关于业务写的命题，`entities: []` 一条也断言不了。
 *    清单由套件自己导出（{@link WORKING_TREE_CONFORMANCE_ENTITIES}），六个调用点原样注册同一份——
 *    各写各的实体就等于各测各的语义。
 * 2. **库级 `sync` 必须同时声明 `local` 与 `remote` 适配器。** 清单里有一个 `SyncType.QueryCache`
 *    实体（untracked 域的第一类），而 `missingQueryCacheAdapter` 校验读的是**库级** sync 的两侧；
 *    少一侧，`EntityManager.init()` 直接拒绝建库。远端适配器名**不需要真的注册**：`remoteAdapter$`
 *    是惰性的，`connect()` 与 `workingTree.enable()` 都不会去订阅它。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import {
  WORKING_TREE_CONFORMANCE_ENTITIES,
  WORKING_TREE_CONFORMANCE_REMOTE_ADAPTER,
  WORKING_TREE_CONFORMANCE_USER_ID,
  workingTreeCaptureConformanceSuite
} from '@aiao/rxdb/testing';
import { afterEach } from 'vitest';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

const opened: RxDB[] = [];

afterEach(async () => {
  const pending = opened.splice(0);
  for (const database of pending) await database.disconnectAll();
});

workingTreeCaptureConformanceSuite({
  name: 'PGlite',
  createDatabase: async () => {
    const database = new RxDB({
      dbName: `working-tree-capture-conformance-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      context: { userId: WORKING_TREE_CONFORMANCE_USER_ID },
      entities: [...WORKING_TREE_CONFORMANCE_ENTITIES],
      sync: {
        local: { adapter: 'pglite' },
        remote: { adapter: WORKING_TREE_CONFORMANCE_REMOTE_ADAPTER },
        type: SyncType.None
      }
    });
    database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    opened.push(database);
    await database.connect('pglite');
    await database.workingTree.enable();
    return database;
  }
});
