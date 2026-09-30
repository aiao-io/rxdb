/**
 * @fileoverview RxDB 推拉同步插件
 * 把 {@link SyncManager} 装进宿主的连接纪元，并接住核心同步状态枢纽的「重算待拉数」请求。
 *
 * @module rxdb-plugin-sync
 */

import { IRxDBPlugin, Plugin, RxDB, RxDBPluginBase } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { createSyncBranchMaterializationSource } from './branch-materialization-source.js';
import { pendingQueryCacheWriteIds } from './query-cache-outbox.js';
import { SyncManager } from './SyncManager.js';

/** 本插件当前不接受任何选项 */
export type RxDBPluginSyncOptions = object;

/**
 * 推拉同步 / 冲突 / 仓库依赖序插件。
 *
 * @remarks
 * **声明 `inject: ['plugin:history']`**，且只声明这一条：
 *
 * - 要历史插件，是因为一次往返结束时 undo 边界要作废、待拉计数要结算，而那些状态的主人
 *   在历史侧。{@link SyncManager} 拿的是 `rxdb.versionManager.syncBridge` 这张窄接口，
 *   没有它连构造都无从谈起。依赖缺失时宿主不装本插件、只告警一次，`rxdb.syncManager`
 *   这个槽位于是不存在——没有历史就没有同步，这正是实情。
 * - **不要 `adapter:remote`**：同步入口本身是按调用发起的，装配阶段一条适配器读写都不发；
 *   而 {@link SyncManager.init} 挂的 `connected$` 自动回推订阅必须在第一次连接就位之前
 *   就已经订阅上，声明适配器依赖会把安装推到引导链之后，第一次连接的那一跳回推就丢了。
 *
 * 六处宿主改动都登记在 `scope` 上，断开连接时由宿主逆序释放：
 *
 * 1. `rxdb.syncManager` 这个实例槽位 —— 释放时连同 `destroy()` 一起撤掉，不给下一个纪元
 *    留一个指向已拆事件总线的管理器；
 * 2. {@link RxDB.syncState} 上的「重算待拉数」跳板 —— 远端适配器在实时订阅恢复后按
 *    `syncState.requestPullableRefresh()` 发信号，它不认识 {@link SyncManager}，接住这一跳
 *    是本插件的活（US-025 阶段 D 之前这条绑定在历史插件上，随 `refreshPullableCount` 一起
 *    搬过来）。没装插件时那个请求发进空里，正是「待拉数无人维护」的实情。
 * 3. {@link RxDB.queryCacheOutbox} 这个出站队列槽 —— QueryCache 实体的读引擎要靠它把
 *    「远端没返回」和「本地离线写过」区分开。这一条**没有**缺席形态：槽空着时核心在
 *    `connect()` 就抛 `RxDBMissingPluginError`，因为「当空集」等于把每条离线写都当孤儿删掉。
 * 4. 宿主的 `online` / `offline` 监听 —— `ReachabilityMonitor` 只在有人 `watch()` 时才往
 *    `globalThis` 上挂，而这两个事件唯一的消费者是本包的同步监听器（`wakeup$` 驱动回推
 *    重试）。不同步的库不该因为 `new RxDB()` 就永久多一对活过实例的监听器（US-025 D2）。
 * 5. {@link RxDB.branchMaterializationSource} 这个分支物化来源槽 —— `syncBranches()` 拉下来的
 *    分支只有元数据，工作树插件第一次切过去之前要按来源交出的分页快照物化。远端是本插件的，
 *    来源于是也只能由本插件交；槽空着时那次切换稳定抛 `branch_not_materialized`，
 *    不存在「没装同步也能物化」的形态。槽位至多一个来源，本插件登记即占住。
 */
export class RxDBPluginSync extends RxDBPluginBase implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  readonly inject = ['plugin:history'] as const;
  name: Uncapitalize<string> = 'sync';

  install(scope: LifecycleScope) {
    // `inject` 已经保证历史插件先装完，`versionManager` 槽位此刻一定在。
    // 借的是 `syncBridge` 而不是管理器本身：面越窄，两个包越不会在演进中互相拽住。
    const syncManager = new SyncManager(this.rxdb, this.rxdb.versionManager.syncBridge);
    scope.acquire(() => () => syncManager.destroy(), 'sync:syncManager');

    scope.acquire(() => {
      Object.defineProperty(this.rxdb, 'syncManager', {
        value: syncManager,
        configurable: true,
        enumerable: true
      });
      return () => void Reflect.deleteProperty(this.rxdb, 'syncManager');
    }, 'sync:slot');

    // 只登记 `pendingWriteIds` 这一个问题。`flushQueryCacheOutbox` / `countQueryCacheOutbox`
    // 的调用者（同步监听器、DevTools 面板）都在本包里，核心不必认识它们。
    // 传 scope：断开连接时这条注册跟着一起撤销，不留一个指向已拆纪元的队列。
    this.rxdb.queryCacheOutbox(
      { pendingWriteIds: (namespace, entity) => pendingQueryCacheWriteIds(this.rxdb, namespace, entity) },
      scope
    );

    // 传 scope：断开连接时撤销，下一个纪元登记的是指向新 syncManager 的那一个，不撞「至多一个」。
    this.rxdb.branchMaterializationSource(createSyncBranchMaterializationSource(syncManager), scope);

    // 可达性监听：`watch()` 自己返回撤销函数，正好是 `acquire` 要的 setup 形状。
    // 引用计数在监视器一侧，所以同一个宿主上多装几个消费者也不会互相摘掉对方的监听。
    scope.acquire(() => this.rxdb.reachability.watch(), 'sync:reachability');

    syncManager.init();

    // 跳板约定「回调不得抛出」：这里即发即忘，没有调用方接得住错误，也没有位置重试。
    // 重算失败只说明这一次的读数没刷新，下一次实时恢复还会再请求一次，不该炸掉
    // 适配器的订阅恢复路径。
    scope.acquire(
      () =>
        this.rxdb.syncState.bindPullableRefresh(() => {
          void syncManager.refreshPullableCount().catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[RxDB Sync] 重算待拉数失败：${message}。`);
          });
        }),
      'sync:pullableRefresh'
    );
  }
}

declare module '@aiao/rxdb' {
  interface RxDB {
    /**
     * 推拉同步子系统。
     *
     * @remarks
     * 由 `@aiao/rxdb-plugin-sync` 在连接纪元内装配。**没装插件（或没装它依赖的
     * `@aiao/rxdb-plugin-history`）时这个槽位不存在**：读它拿到 `undefined`，
     * 而不是一个什么都不做的空壳——核心不做 fallback 兜底。
     */
    syncManager: SyncManager;
  }
}

/**
 * 同步插件工厂。
 *
 * @param db - 宿主实例
 *
 * @example
 * ```ts
 * import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
 * import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
 *
 * // 顺序随意：宿主按 `inject` 拓扑排序，历史插件一定先装完。
 * rxdb.use(rxDBPluginSync);
 * rxdb.use(rxDBPluginHistory);
 * ```
 */
export const rxDBPluginSync: Plugin<RxDBPluginSyncOptions> = (db: RxDB) => new RxDBPluginSync(db);
