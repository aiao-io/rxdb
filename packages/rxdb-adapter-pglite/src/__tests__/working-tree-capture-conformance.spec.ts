/**
 * @fileoverview PGlite 后端的捕获侧一致性调用点（T068）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb-plugin-working-tree/testing`，六个 v1 后端各有一个这样的文件，理由与提交侧调用点
 * （`working-tree-commit-conformance.spec.ts`）完全相同：**断言一律不写在这里**，本文件
 * 只造一个已启用的库并在用例之间把它关掉。
 *
 * 与提交侧的形态差别有三处，都是捕获侧的命题决定的，而且后两处同出一源——清单里那个
 * `SyncType.QueryCache` 实体：
 *
 * 1. **必须注册整份业务实体清单。**「捕获是否完备」是关于业务写的命题，少一个实体就少一整类
 *    断言。清单由套件自己导出（{@link WORKING_TREE_CONFORMANCE_ENTITIES}），六个调用点原样注册
 *    同一份——各写各的实体就等于各测各的语义。提交侧只取其中的 `ConformanceNote`，而且一次都
 *    不写它（理由见那边的 fileoverview）。
 * 2. **库级 `sync` 必须同时声明 `local` 与 `remote` 适配器。** 那个实体（untracked 域的第一类）
 *    让 `missingQueryCacheAdapter` 校验生效，而它读的是**库级** sync 的两侧；少一侧，
 *    `EntityManager.init()` 直接拒绝建库。远端适配器名**不需要真的注册**：`remoteAdapter$`
 *    是惰性的，`connect()` 与 `workingTree.enable()` 都不会去订阅它。
 * 3. **必须多装三个插件。** US-025 把 QueryCache 的两半都拆了出去，核心只留槽位：读引擎在
 *    {@link rxDBPluginQueryCache}，出站队列在 {@link rxDBPluginSync}
 *    （`query-cache-outbox.interface.ts` 的结论——「一个 QueryCache 实体要两个插件」）。任一
 *    槽位空着，`connect()` 的启动护栏都会把声明了 QueryCache 的实体当场拦下
 *    （`RxDBMissingPluginError`），**不静默降级**。套件从不对这个实体调 `getRepository()`，
 *    但护栏查的是注册清单而不是实际用没用到，所以两个插件照样得装。
 *
 *    第三个是 {@link rxDBPluginHistory}：sync 插件声明了 `inject: ['plugin:history']`，依赖
 *    缺失时宿主**不装它、只告警一次**。于是少了历史插件的症状不是「同步没装上」，而是上面
 *    那条出站队列的 `RxDBMissingPluginError`——装了 sync 却照样报缺 sync，这是唯一的线索。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import {
  WORKING_TREE_CONFORMANCE_ENTITIES,
  WORKING_TREE_CONFORMANCE_REMOTE_ADAPTER,
  WORKING_TREE_CONFORMANCE_USER_ID,
  workingTreeCaptureConformanceSuite
} from '@aiao/rxdb-plugin-working-tree/testing';
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
    // 必须排在 `connect()` 之前：贡献系统能力的插件晚于 `init()` 注册会被核心当场拒绝
    // （系统表随建表一次建出，那时已经来不及），而 `connect()` 的第一步就是 `init()`。
    database.use(rxDBPluginWorkingTree);
    database.use(rxDBPluginQueryCache);
    database.use(rxDBPluginSync);
    database.use(rxDBPluginHistory);
    opened.push(database);
    await database.connect('pglite');
    await database.workingTree.enable();
    return database;
  }
});
