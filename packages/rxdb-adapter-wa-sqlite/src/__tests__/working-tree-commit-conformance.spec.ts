/**
 * @fileoverview wa-sqlite 后端的提交侧一致性调用点（T043）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb-plugin-working-tree/testing`，六个 v1 后端各有一个这样的文件。**断言一律不写在这里**：
 * 一旦某个后端在本地加一条「它自己的」断言，六份就开始各测各的，而这套套件存在的理由
 * 恰恰是「六个后端对同一组语义给出同一个答案」。这里只负责两件事：造一个已启用的库，
 * 以及在用例之间把它关掉。
 *
 * 库由本包既有的 {@link waSqliteFactory} 建，不另写一份 `new RxDB(...)`：连法（VFS / worker /
 * host / 选项）是这个后端的属性，写第二遍就意味着共享套件跑的后端与本包其余测试跑的后端
 * 可以在无人察觉的情况下分岔。工厂交还的是**适配器**，数据库取它的 `rxdb`。
 *
 * 契约（`suite-context.ts`）要求每次调用都交出一个**全新**实例，所以这里不复用同一个库；
 * 契约没有 teardown 钩子，于是回收落在调用点自己身上——文件级 `afterEach` 在套件内层钩子
 * 之后跑，把本条用例开过的库全部断开。`cleanupAdapter` 无条件调用（它在
 * `AdapterFactory` 上本就是可选成员）：本包今天有没有定义它是会变的，而漏掉它的代价是
 * worker 泄漏到文件结束。
 */

import type { RxDB } from '@aiao/rxdb';
import type { AdapterCleanupTarget } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { workingTreeCommitConformanceSuite } from '@aiao/rxdb-plugin-working-tree/testing';
import { afterEach } from 'vitest';

import { waSqliteFactory } from './wa-sqlite-factory.js';

const opened: AdapterCleanupTarget[] = [];

afterEach(async () => {
  const pending = opened.splice(0);
  for (const adapter of pending) {
    await adapter.rxdb.disconnectAll();
    await waSqliteFactory.cleanupAdapter?.(adapter);
  }
});

workingTreeCommitConformanceSuite({
  name: 'wa-sqlite',
  createDatabase: async (): Promise<RxDB> => {
    const adapter = await waSqliteFactory.createAdapter<AdapterCleanupTarget>({ plugins: [rxDBPluginWorkingTree] });
    opened.push(adapter);
    await adapter.rxdb.workingTree.enable();
    return adapter.rxdb;
  }
});
