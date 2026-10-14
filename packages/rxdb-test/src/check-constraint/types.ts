/**
 * @fileoverview 声明式存储约束（CHECK / 条件唯一 / 区间排他）契约套件对被测 adapter 的最小要求。
 *
 * 与 `../tree-unique/types.ts` 同一口径：只声明结构类型，不 import 任何具体 adapter 包。
 * 断言对象是归一后的错误类与落库行为，SQLite family 与 PGlite 各跑一份。
 */

import type { EntityType, RxDB } from '@aiao/rxdb';

/** 建库参数。`dbName` 由套件生成，保证每个用例都是全新的空库。 */
export interface CheckConstraintSuiteDatabaseOptions {
  /** 全新的数据库名。 */
  readonly dbName: string;
  /** 参与建表的实体。 */
  readonly entities: readonly EntityType[];
  /**
   * 是否在 `connect()` 之前安装历史插件（`@aiao/rxdb-plugin-history`）。
   *
   * @remarks
   * 区间排他的 AC#14 要走 undo / redo 与切分支重放。`@aiao/rxdb-test` 不依赖插件包，由 runner 安装。
   */
  readonly history?: boolean;
}

/**
 * 套件用到的 `versionManager` 子集。
 *
 * @remarks
 * 这是**结构类型**，不是核心 `RxDB` 上的成员：历史 / 撤销重做 / 分支住在 `@aiao/rxdb-plugin-history`
 * 里。本包因此不 `import` 那个插件，只写下套件需要的形状；装插件并交回 `rxdb.versionManager`
 * 是 runner 的活（`history: true` 时）。
 */
export interface CheckConstraintSuiteVersionManager {
  createBranch(branchId: string): Promise<unknown>;
  switchBranch(branchId: string): Promise<void>;
  history(): {
    undo(steps?: number): Promise<void>;
    redo(steps?: number): Promise<void>;
  };
}

/** 工厂交回给套件的一次性数据库句柄。 */
export interface CheckConstraintSuiteDatabase {
  /** 已经 `connect()` 完成的实例。 */
  readonly rxdb: RxDB;
  /** `history: true` 时交回的版本管理器（历史插件装在 `rxdb` 上）；其余情况不给。 */
  readonly versionManager?: CheckConstraintSuiteVersionManager;
  /** 释放连接。 */
  dispose(): Promise<void>;
}

/** 被测 adapter 的接入点。 */
export interface CheckConstraintSuiteFactory {
  /** 适配器名，用于 describe 标题。 */
  readonly name: string;
  /**
   * 建库并 `connect()`。
   *
   * @remarks
   * CHECK 是**建表 DDL** 的一部分，所以每个用例都必须拿到全新的空库。
   */
  createDatabase(options: CheckConstraintSuiteDatabaseOptions): Promise<CheckConstraintSuiteDatabase>;
}
