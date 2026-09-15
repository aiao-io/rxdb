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
 *    纪元留一个指向已拆事件总线的管理器；
 * 2. {@link RxDB.syncState} 上的可推送计数订阅 —— 枢纽活得和实例一样长，计数却只在连接
 *    期间有意义，因此走 `bindPushableCount()` 拿一个解绑函数，而不是在构造枢纽时传进去。
 */
export class RxDBPluginHistory extends RxDBPluginBase implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  name: Uncapitalize<string> = 'history';

  install(scope: LifecycleScope) {
    // 构造器里就订阅了活跃分支流（`HistoryManager`），所以「造出来」本身已经是一次资源获取：
    // 先把撤销登记上，再让它开始工作。`init()` 因此不需要自己一条 `acquire()` ——
    // 它登记的事件监听与订阅全都由同一个 `destroy()` 收，中途抛错也够得着。
    const versionManager = new VersionManager(this.rxdb);
    scope.acquire(() => () => versionManager.destroy(), 'history:versionManager');

    scope.acquire(() => {
      Object.defineProperty(this.rxdb, 'versionManager', {
        value: versionManager,
        configurable: true,
        enumerable: true
      });
      return () => void Reflect.deleteProperty(this.rxdb, 'versionManager');
    }, 'history:slot');

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
