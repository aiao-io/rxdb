/**
 * @fileoverview 「CHECK 违约写入被拒」契约套件对被测 adapter 的最小要求。
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
}

/** 工厂交回给套件的一次性数据库句柄。 */
export interface CheckConstraintSuiteDatabase {
  /** 已经 `connect()` 完成的实例。 */
  readonly rxdb: RxDB;
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
