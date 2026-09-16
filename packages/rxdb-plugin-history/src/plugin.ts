/**
 * @fileoverview RxDB 历史 / 撤销重做 / 分支插件
 * 把 {@link VersionManager} 装进宿主的连接纪元，并把「可推送变更数」接回核心的同步状态枢纽。
 *
 * @module rxdb-plugin-history
 */

import { IRxDBPlugin, Plugin, RxDB, RxDBPluginBase } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { VersionManager } from './VersionManager.js';

/** 本插件当前不接受任何选项 */
export type RxDBPluginHistoryOptions = object;

/**
 * 历史 / 撤销重做 / 分支插件。
 *
 * @remarks
 * **不声明 `inject`**：`VersionManager.init()` 只挂事件监听与订阅，一条适配器读写都不发。
 * 声明 `adapter:local` 会把安装推到引导链之后，而 `HistoryManager` 的分支流必须在第一条
 * `rxdb_change` 事件到达之前就已经订阅上——装晚了，那一批变更不进历史。这也正是搬进插件
 * 之前的时序：核心在构造器里 `new VersionManager()`、在 `init()` 里调 `init()`，
 * 两者都早于 `schemaManager.init()`。
 *
 * 两处宿主改动都登记在 `scope` 上，断开连接时由宿主逆序释放：
 *
 * 1. `rxdb.versionManager` 这个实例槽位 —— 释放时连同 `destroy()` 一起撤掉，不给下一个
 *    纪元留一个指向已拆事件总线的管理器。槽位排在最先获取，因而最后撤，`destroy()`
 *    才跑得在槽位仍可读的窗口里；
 * 2. {@link RxDB.syncState} 上的可推送计数订阅 —— 枢纽活得和实例一样长，计数却只在连接
 *    期间有意义，因此走 `bindPushableCount()` 拿一个解绑函数，而不是在构造枢纽时传进去。
 *
 * 同一枢纽上的「重算待拉数」跳板**不在这里**：`refreshPullableCount()` 随 US-025 阶段 D
 * 去了 `@aiao/rxdb-plugin-sync`，接住 `requestPullableRefresh()` 于是也是那个插件的活。
 * 只装历史不装同步时那个请求发进空里，正是「没有同步就没有待拉数」的实情。
 */
export class RxDBPluginHistory extends RxDBPluginBase implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  name: Uncapitalize<string> = 'history';

  install(scope: LifecycleScope) {
    const versionManager = new VersionManager(this.rxdb);

    // 槽位**先**获取，于是最后一个撤：撤销序是获取序的逆序，`destroy()` 因此跑在
    // 「`rxdb.versionManager` 还读得到」的窗口里。反过来登记的话，正卡在 await 中途的
    // 历史流（如 `HistoryManager` 的可撤销列表管线）恢复执行时读到 `undefined`，
    // 一次正常断开就伪装成 TypeError 落进 `errors$`。
    scope.acquire(() => {
      Object.defineProperty(this.rxdb, 'versionManager', {
        value: versionManager,
        configurable: true,
        enumerable: true
      });
      return () => void Reflect.deleteProperty(this.rxdb, 'versionManager');
    }, 'history:slot');

    // 构造器里就订阅了活跃分支流（`HistoryManager`），所以「造出来」本身已经是一次资源获取：
    // 先把撤销登记上，再让它开始工作。`init()` 因此不需要自己一条 `acquire()` ——
    // 它登记的事件监听与订阅全都由同一个 `destroy()` 收，中途抛错也够得着。
    scope.acquire(() => () => versionManager.destroy(), 'history:versionManager');

    versionManager.init();

    scope.acquire(() => this.rxdb.syncState.bindPushableCount(versionManager.pushableCount$), 'history:pushableCount');
  }
}

declare module '@aiao/rxdb' {
  interface RxDB {
    /**
     * 历史 / 撤销重做 / 分支子系统。
     *
     * @remarks
     * 由 `@aiao/rxdb-plugin-history` 在连接纪元内装配。**没装插件时这个槽位不存在**：
     * 读它拿到 `undefined`，而不是一个什么都不做的空壳——核心不做 fallback 兜底。
     */
    versionManager: VersionManager;
  }
}

/**
 * 历史插件工厂。
 *
 * @param db - 宿主实例
 *
 * @example
 * ```ts
 * import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
 *
 * rxdb.use(rxDBPluginHistory);
 * ```
 */
export const rxDBPluginHistory: Plugin<RxDBPluginHistoryOptions> = (db: RxDB) => new RxDBPluginHistory(db);
