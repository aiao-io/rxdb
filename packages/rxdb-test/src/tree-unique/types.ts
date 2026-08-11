/**
 * @fileoverview 「同级唯一」契约套件对被测 adapter 的最小要求。
 *
 * 与 `../encrypted/types.ts`、`../transaction/types.ts` 同一口径：只声明**结构类型**，
 * 不 import 任何具体 adapter 包 —— PGlite 与 sqlite-core 系不共享基类，却必须满足同一契约。
 */
import type { EntityType, RxDB } from '@aiao/rxdb';

/** 建库参数。`dbName` 由套件生成，保证每个用例都是全新的空库。 */
export interface TreeUniqueSuiteDatabaseOptions {
  /** 全新的数据库名。 */
  readonly dbName: string;
  /** 参与建表的实体。 */
  readonly entities: readonly EntityType[];
}

/** 工厂交回给套件的一次性数据库句柄。 */
export interface TreeUniqueSuiteDatabase {
  /** 已经 `connect()` 完成的实例。 */
  readonly rxdb: RxDB;
  /**
   * 直接数表里的行数。
   *
   * @remarks
   * 断言「被拒绝」不能只看 reject —— 还要看**库里到底剩几行**。
   * 走实体查询会被实体缓存干扰（被拒的那次 save 仍留在缓存里），
   * 所以这里要求 runner 用自己的 SQL 方言直接数行，只交回一个数字。
   */
  countRows(entity: EntityType): Promise<number>;
  /** 释放连接。 */
  dispose(): Promise<void>;
}

/** 被测 adapter 的接入点。 */
export interface TreeUniqueSuiteFactory {
  /** 适配器名，用于 describe 标题。 */
  readonly name: string;
  /**
   * 建库并 `connect()`。
   *
   * @remarks
   * 唯一约束是**建表 DDL** 的一部分，所以每个用例都必须拿到全新的空库 ——
   * 复用旧库会连着旧索引一起复用，测的就不是当前 DDL 了。
   */
  createDatabase(options: TreeUniqueSuiteDatabaseOptions): Promise<TreeUniqueSuiteDatabase>;
}
