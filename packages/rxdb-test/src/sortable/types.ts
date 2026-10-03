/**
 * @fileoverview 手动排序契约套件对被测 adapter 的最小要求。
 *
 * 与 `../tree-unique/types.ts` 同一口径：只声明**结构类型**，不 import 任何具体 adapter 包。
 */
import type { EntityType, RxDB } from '@aiao/rxdb';

/** 建库参数。`dbName` 由套件生成，保证每个用例都是全新的空库。 */
export interface ManualOrderSuiteDatabaseOptions {
  /** 全新的数据库名。 */
  readonly dbName: string;
  /** 参与建表的实体。 */
  readonly entities: readonly EntityType[];
}

/** 工厂交回给套件的一次性数据库句柄。 */
export interface ManualOrderSuiteDatabase {
  /**
   * 已经 `connect()` 完成的实例。
   *
   * @remarks
   * 本地主适配器必须是被测 adapter：套件经 `rxdb.localAdapter$` 直接写入脏数据、读回库里的真实键。
   */
  readonly rxdb: RxDB;
  /** 释放连接。 */
  dispose(): Promise<void>;
}

/** 被测 adapter 的接入点。 */
export interface ManualOrderSuiteFactory {
  /** 适配器名，用于 describe 标题。 */
  readonly name: string;
  /** 建库并 `connect()`；每个用例一座全新的空库。 */
  createDatabase(options: ManualOrderSuiteDatabaseOptions): Promise<ManualOrderSuiteDatabase>;
}
