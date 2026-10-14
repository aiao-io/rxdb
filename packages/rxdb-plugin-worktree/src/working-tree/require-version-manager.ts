/**
 * @fileoverview 取历史插件挂上的 `versionManager`：门面与命令层共用的那一道守卫。
 *
 * @remarks
 * 切分支只有一条路——`versionManager.switchBranch()`，而它属于 `rxDBPluginHistory`。没装那个插件时
 * 属性不存在，直接取会在调用点炸出一句读不出主语的 `Cannot read properties of undefined`。
 * 两处调用方（门面的 `createWorktree()` / `switchWorktree()`，命令层的 `switchBranch()`）各写一份
 * 守卫的话，文案与判据迟早分叉，于是收在这里。
 */

import { RxDBError, type RxDB } from '@aiao/rxdb';
// 只为把 `RxDB.versionManager` 那条 `declare module` 拉进本文件的程序里，理由同 `working-tree-commands.ts`。
import type { VersionManager } from '@aiao/rxdb-plugin-history';

/**
 * 取本连接纪元的 `versionManager`，没装 `rxDBPluginHistory` 就抛。
 *
 * @param rxdb - 宿主实例
 * @returns 本连接纪元的 `versionManager`
 * @throws {@link RxDBError} 没装 `rxDBPluginHistory` 时
 *
 * @remarks
 * **现取**，调用方也不要缓存它：它由历史插件在连接纪元内装卸（见 `rxdb-plugin-history/src/plugin.ts`），
 * 存一份等于钉在第一个纪元上。属性只读一次，守卫与返回的是同一个值。
 *
 * `declare module` 把它声明成非可选，所以这里显式放宽成 `| undefined`，否则守卫会被 lint 判成恒真删掉。
 */
export const requireVersionManager = (rxdb: RxDB): VersionManager => {
  const versionManager: VersionManager | undefined = rxdb.versionManager;
  if (!versionManager) {
    throw new RxDBError(
      '这个数据库上没有 versionManager：切分支要经它，它由 use(rxDBPluginHistory) 在连接时挂上。先装历史插件。'
    );
  }
  return versionManager;
};
