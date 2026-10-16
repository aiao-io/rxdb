/**
 * @fileoverview 工作树插件的选项：只读检出位的快照库建在哪（US-313）。
 */

import type { AdapterFactory, Plugin } from '@aiao/rxdb';

/**
 * 给快照实例造本地适配器：形状与 `rxdb.adapter()` 的工厂相同。
 *
 * @remarks
 * 存储位置按入参 `db.config.dbName` 定，每个检出位一个库名；造出来的必须与主库是同一种后端。
 *
 * 不能照搬主实例的适配器工厂：按外层库名或常量命名的 SharedWorker、已初始化就直接返回的 Worker 客户端，
 * 都会让第二个实例悄悄连到主库上。快照实例另有一道兜底：它带一条只在快照库上登记的迁移，
 * 真连到了主库就在连接时失败。
 */
export type WorktreeAdapterFactory = AdapterFactory;

/** 只读检出位的选项。 */
export interface WorktreeOptions {
  /** 快照库的适配器工厂，见 {@link WorktreeAdapterFactory} */
  readonly adapter: WorktreeAdapterFactory;
  /**
   * 装到快照实例上的读侧插件（如树、图）。
   *
   * @remarks
   * 生成实体类的插件要与主实例一致，否则它生成的表在快照实例上没有对应的类，打开时报 `incomplete_entities`。
   * 不要装写侧插件（历史、同步、workspace、工作树、storage、搜索）：只读实例上它们无事可做，有的还要写库。
   */
  readonly plugins?: readonly Plugin[];
}

/** {@link rxDBPluginWorkingTree} 的选项。 */
export interface RxDBPluginWorkingTreeOptions {
  /** 只读检出位；不给就打不开（`not_configured`） */
  readonly worktrees?: WorktreeOptions;
}
