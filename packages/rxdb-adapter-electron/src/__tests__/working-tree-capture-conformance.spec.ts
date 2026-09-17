/**
 * @fileoverview Electron（node:sqlite host）后端的捕获侧一致性调用点（T068）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb-plugin-working-tree/testing`，六个 v1 后端各有一个这样的文件。**后端语义的断言一律不
 * 写在这里**：一旦某个后端在本地加一条「它自己的」断言，六份就开始各测各的，而这套套件存在
 * 的理由恰恰是「六个后端对同一组语义给出同一个答案」。
 *
 * 库由本包既有的 {@link electronAdapterFactory} 建，不另写一份 `new RxDB(...)`：桌面路径要走
 * 「客户端 → 协议校验 → host → `node:sqlite`」全程，连法写第二遍就意味着共享套件跑的链路与
 * 本包其余测试跑的链路可以在无人察觉的情况下分岔。工厂交还的是**适配器**，数据库取它的 `rxdb`。
 *
 * 与提交侧调用点（`working-tree-commit-conformance.spec.ts`）的形态差别有三处，都是捕获侧的
 * 命题决定的，而且后两处同出一源——清单里那个 `SyncType.QueryCache` 实体：
 *
 * 1. **`entities` 必须注册整份清单。**「捕获是否完备」是关于业务写的命题，少一个实体就少一整
 *    类断言。清单由套件自己导出（{@link WORKING_TREE_CONFORMANCE_ENTITIES}），六个调用点原样
 *    注册同一份——各写各的实体就等于各测各的语义。提交侧只取其中的 `ConformanceNote`，而且一次
 *    都不写它（理由见那边的 fileoverview）。
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
 * `afterAll` 里那条 {@link electronHostDeliveryErrors} 断言不违反上面那句：它断言的是**测试
 * 宿主**没有吞掉变更事件，与工作树语义无关——host 的 `onDeliveryError` 是 best-effort，不会
 * 让写入失败，因此不攒起来看一眼的话，一次送达故障会以「某条用例莫名其妙地没看到变更」的
 * 形态出现。本包每个用到这个 host 的文件都这么收尾。
 *
 * {@link stopElectronTestHost} 是必须的：host 与临时工作区按**模块**单例，而 vitest 的每个
 * 文件有自己的模块注册表——本文件不关，`os.tmpdir()` 里就留下一整个库目录。
 *
 * 契约（`suite-context.ts`）要求每次调用都交出一个**全新**实例，所以这里不复用同一个库；
 * 契约没有 teardown 钩子，于是回收落在调用点自己身上——文件级 `afterEach` 在套件内层钩子
 * 之后跑，把本条用例开过的库全部断开。
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
import { afterAll, afterEach, expect } from 'vitest';

import {
  electronAdapterFactory,
  electronHostDeliveryErrors,
  stopElectronTestHost
} from './electron-adapter-factory.js';

const opened: AdapterCleanupTarget[] = [];

afterEach(async () => {
  const pending = opened.splice(0);
  for (const adapter of pending) await adapter.rxdb.disconnectAll();
});

afterAll(() => {
  try {
    expect(electronHostDeliveryErrors()).toEqual([]);
  } finally {
    stopElectronTestHost();
  }
});

workingTreeCaptureConformanceSuite({
  name: 'electron',
  createDatabase: async (): Promise<RxDB> => {
    const adapter = await electronAdapterFactory.createAdapter<AdapterCleanupTarget>({
      entities: [...WORKING_TREE_CONFORMANCE_ENTITIES],
      plugins: [rxDBPluginWorkingTree, rxDBPluginQueryCache, rxDBPluginSync, rxDBPluginHistory],
      remoteAdapter: WORKING_TREE_CONFORMANCE_REMOTE_ADAPTER
    });
    opened.push(adapter);
    await adapter.rxdb.workingTree.enable();
    return adapter.rxdb;
  }
});
