/**
 * @fileoverview RxDB 推拉同步插件
 * 把 {@link SyncManager} 装进宿主的连接纪元，并接住核心同步状态枢纽的「重算待拉数」请求。
 *
 * @module rxdb-plugin-sync
 */

import { IRxDBPlugin, Plugin, RxDB, RxDBPluginBase } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
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
 * 三处宿主改动都登记在 `scope` 上，断开连接时由宿主逆序释放：
 *
 * 1. `rxdb.syncManager` 这个实例槽位 —— 释放时连同 `destroy()` 一起撤掉，不给下一个纪元
 *    留一个指向已拆事件总线的管理器；
 * 2. {@link RxDB.syncState} 上的「重算待拉数」跳板 —— 远端适配器在实时订阅恢复后按
 *    `syncState.requestPullableRefresh()` 发信号，它不认识 {@link SyncManager}，接住这一跳
 *    是本插件的活（US-025 阶段 D 之前这条绑定在历史插件上，随 `refreshPullableCount` 一起
 *    搬过来）。没装插件时那个请求发进空里，正是「待拉数无人维护」的实情。
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
