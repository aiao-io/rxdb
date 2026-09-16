/**
 * @fileoverview sqlite-wasm 后端的捕获侧一致性调用点（T068）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb-plugin-working-tree/testing`，六个 v1 后端各有一个这样的文件。**断言一律不写在这里**：
 * 一旦某个后端在本地加一条「它自己的」断言，六份就开始各测各的，而这套套件存在的理由
 * 恰恰是「六个后端对同一组语义给出同一个答案」。
 *
 * 库由本包既有的 {@link sqliteWasmFactory} 建，不另写一份 `new RxDB(...)`：连法（VFS / worker /
 * host / 选项）是这个后端的属性，写第二遍就意味着共享套件跑的后端与本包其余测试跑的后端
 * 可以在无人察觉的情况下分岔。工厂交还的是**适配器**，数据库取它的 `rxdb`。
 *
 * 与提交侧调用点（`working-tree-commit-conformance.spec.ts`）的形态差别有三处，都是捕获侧的
 * 命题决定的，而且后两处同出一源——清单里那个 `SyncType.QueryCache` 实体：
 *
 * 1. **`entities` 必须注册业务实体。**「捕获是否完备」是关于业务写的命题，空清单一条也断言
 *    不了。清单由套件自己导出（{@link WORKING_TREE_CONFORMANCE_ENTITIES}），六个调用点原样
 *    注册同一份——各写各的实体就等于各测各的语义。
 * 2. **`remoteAdapter` 必须给。** 那个实体（untracked 域的第一类）让 `missingQueryCacheAdapter`
 *    校验生效，而它读的是**库级** sync 的两侧；少一侧，`EntityManager.init()` 直接拒绝建库。
 *    这个名字下不会有适配器被注册，也不需要：`remoteAdapter$` 是惰性的，`connect()` 与
 *    `workingTree.enable()` 都不会去订阅它。
 * 3. **`plugins` 里必须多装三个。** US-025 把 QueryCache 的两半都拆了出去，核心只留槽位：
 *    读引擎在 {@link rxDBPluginQueryCache}，出站队列在 {@link rxDBPluginSync}
 *    （`query-cache-outbox.interface.ts` 的结论——「一个 QueryCache 实体要两个插件」）。任一
 *    槽位空着，`connect()` 的启动护栏都会把声明了 QueryCache 的实体当场拦下
 *    （`RxDBMissingPluginError`），**不静默降级**。套件从不对这个实体调 `getRepository()`，
 *    但护栏查的是注册清单而不是实际用没用到，所以两个插件照样得装。
 *
 *    第三个是 {@link rxDBPluginHistory}：sync 插件声明了 `inject: ['plugin:history']`，依赖
 *    缺失时宿主**不装它、只告警一次**。于是少了历史插件的症状不是「同步没装上」，而是上面
 *    那条出站队列的 `RxDBMissingPluginError`——装了 sync 却照样报缺 sync，这是唯一的线索。
 *
 * 契约（`suite-context.ts`）要求每次调用都交出一个**全新**实例，所以这里不复用同一个库；
 * 契约没有 teardown 钩子，于是回收落在调用点自己身上——文件级 `afterEach` 在套件内层钩子
 * 之后跑，把本条用例开过的库全部断开。 `cleanupAdapter` 无条件调用（它在
 * `AdapterFactory` 上本就是可选成员）：本包今天有没有定义它是会变的，而漏掉它的代价是
 * worker 泄漏到文件结束。
 */

import type { RxDB } from '@aiao/rxdb';
import type { AdapterCleanupTarget } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import {
  WORKING_TREE_CONFORMANCE_ENTITIES,
  WORKING_TREE_CONFORMANCE_REMOTE_ADAPTER,
  workingTreeCaptureConformanceSuite
} from '@aiao/rxdb-plugin-working-tree/testing';
import { afterEach } from 'vitest';

import { sqliteWasmFactory } from './sqlite-wasm-factory.js';

const opened: AdapterCleanupTarget[] = [];

afterEach(async () => {
  const pending = opened.splice(0);
  for (const adapter of pending) {
    await adapter.rxdb.disconnectAll();
    await sqliteWasmFactory.cleanupAdapter?.(adapter);
  }
});

workingTreeCaptureConformanceSuite({
  name: 'sqlite-wasm',
  createDatabase: async (): Promise<RxDB> => {
    const adapter = await sqliteWasmFactory.createAdapter<AdapterCleanupTarget>({
      entities: [...WORKING_TREE_CONFORMANCE_ENTITIES],
      plugins: [rxDBPluginWorkingTree, rxDBPluginQueryCache, rxDBPluginSync, rxDBPluginHistory],
      remoteAdapter: WORKING_TREE_CONFORMANCE_REMOTE_ADAPTER
    });
    opened.push(adapter);
    await adapter.rxdb.workingTree.enable();
    return adapter.rxdb;
  }
});
