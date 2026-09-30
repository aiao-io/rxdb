/**
 * @fileoverview PGlite 后端的提交侧一致性调用点（T043）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb-plugin-working-tree/testing`，六个 v1 后端各有一个这样的文件。**断言一律不写在这里**：
 * 一旦某个后端在本地加一条「它自己的」断言，六份就开始各测各的，而这套套件存在的理由
 * 恰恰是「六个后端对同一组语义给出同一个答案」。这里只负责两件事：造一个已启用的库，
 * 以及在用例之间把它关掉。
 *
 * 契约（`suite-context.ts`）要求每次调用都交出一个**全新**实例，所以这里不复用同一个库；
 * 契约没有 teardown 钩子，于是回收落在调用点自己身上——文件级 `afterEach` 在套件内层钩子
 * 之后跑，把本条用例开过的库全部断开，免得十几个 PGlite WASM 实例一路堆到文件结束。
 *
 * **{@link rxDBPluginHistory} 与被测插件一起装。** 套件的 §2.2 用 `database.versionManager`
 * 建分支——US-025 把 `VersionManager` 从核心搬进了 `@aiao/rxdb-plugin-history`，核心上不再有
 * 这个成员。它不是被测对象，只是「新建一条分支」这个动作在今天唯一的入口；工作树的
 * `writeBranchRows` 贡献正是挂在那个动作上，缺了它 §2.2 两条用例拿到的是 `undefined`。
 *
 * **`entities` 里那一个 {@link ConformanceNote} 不是给谁写的**，套件对它一次 `save()` 都不调。
 * 注册它是因为 FR-038：`writeCommit` 会拿每个变更单元的 `namespace` / `entity` 去
 * `schemaManager` 解析目标元数据（要知道哪几列是加密列），解析不到就 fail-closed 地抛。
 * 于是套件里全部单元的身份都取自这个真注册过的实体。捕获侧清单里的另一个实体（声明了
 * `SyncType.QueryCache` 的那个）**不在这里注册**：它会连带要求三个插件与一个远端适配器名，
 * 而提交侧一条断言都用不到它。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { ConformanceNote, workingTreeCommitConformanceSuite } from '@aiao/rxdb-plugin-working-tree/testing';
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
      entities: [ConformanceNote],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    // 必须排在 `connect()` 之前：贡献系统能力的插件晚于 `init()` 注册会被核心当场拒绝
    // （系统表随建表一次建出，那时已经来不及），而 `connect()` 的第一步就是 `init()`。
    database.use(rxDBPluginHistory);
    database.use(rxDBPluginWorkingTree);
    opened.push(database);
    await database.connect('pglite');
    await database.workingTree.enable();
    return database;
  }
});
