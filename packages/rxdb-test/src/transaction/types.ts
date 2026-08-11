/**
 * 跨适配器「事务上下文与连接就绪」契约套件的工厂协议。
 *
 * @remarks
 * 设计见 `code-reviews/transaction-executor-design.md`。套件覆盖三个契约：
 * - **C1 就绪门**：等待 `RxDB.connect()` 不得发生在串行队列的临界区内
 * - **C2 事务作用域**：事务身份由显式 executor 表示，外部写入永不被卷入他人事务
 * - **C3 引导事务**：首装的建表与 migration 水位线在同一事务内提交
 *
 * 与 `../encrypted/types.ts` 同一口径：这里只声明**结构类型**，不 import 任何具体适配器包，
 * 因为 PGlite 与 sqlite-core 系不共享基类却必须满足同一契约。
 *
 * 套件只声明运行断言所需的 executor 最小结构，避免绑定具体适配器的扩展方法。
 */
import type { EntityType, MigrationType, RxDB } from '@aiao/rxdb';

/**
 * 一次事务的作用域句柄（设计文档 §4）。
 *
 * 持有它 = 有权在该事务内执行；未持有 = 必须重新排队。事务身份由**对象标识**表示，
 * 不由适配器实例上的环境态推断。
 */
export interface TransactionExecutorLike {
  /** 事务标识，仅用于日志与断言，不参与相等性判断。 */
  readonly id: string;
  /** 生命周期状态；终态后再使用必须抛错，不得静默降级。 */
  readonly state: 'active' | 'committed' | 'rolled-back';
  /** 在本事务内执行原始查询，不再入队。 */
  query(sql: string, params?: readonly unknown[]): Promise<unknown>;
  /** 嵌套内层工作：复用本事务，不新开，也不入队。 */
  run<T>(fun: (executor: TransactionExecutorLike) => Promise<T>): Promise<T>;
}

/** 被测适配器需要暴露给套件的最小事务面。 */
export interface TransactionAdapterLike {
  /** 开启一个独立事务。 */
  transaction<T>(fun: (executor: TransactionExecutorLike) => Promise<T>): Promise<T>;
  /** 队列外的普通查询；契约要求它**永远重新排队**，不被任何进行中的事务卷走。 */
  query(sql: string, params?: readonly unknown[]): Promise<unknown>;
}

/** 建库参数。dbName 由套件生成，保证每个用例都是全新的空库。 */
export interface TransactionSuiteDatabaseOptions {
  /** 全新的数据库名；首装路径只在库为空时才走。 */
  readonly dbName: string;
  /** 参与建表的实体。 */
  readonly entities: readonly EntityType[];
  /** 迁移配置；水位线写入只在配置了 migrations 时发生。 */
  readonly migrations?: readonly MigrationType[];
}

/** 工厂交回给套件的一次性数据库句柄。 */
export interface TransactionSuiteDatabase {
  /** 尚未 `connect()` 的实例 —— 套件自己调用 connect 才能观察引导期行为。 */
  readonly rxdb: RxDB;
  /** 本地适配器在 `rxdb.adapter()` 中注册用的名字。 */
  readonly adapterName: string;
  /**
   * 取本地适配器的事务面。仅在 `connect()` 成功后调用。
   *
   * @remarks
   * 返回结构类型而非具体类，避免 `@aiao/rxdb-test` 依赖任一适配器包。
   */
  adapter(): TransactionAdapterLike;
  /** 释放资源；即使 connect 失败也必须可安全调用。 */
  dispose(): Promise<void>;
}

/**
 * 适配器侧工厂。
 *
 * @example
 * ```ts
 * // packages/rxdb-adapter-sqlite-wasm/src/__tests__/transaction-contract.spec.ts
 * runReadinessSuite({ factory: sqliteWasmTransactionFactory });
 * ```
 */
export interface TransactionSuiteFactory {
  /** `describe` 标题里显示的名字。 */
  readonly name: string;
  /** 建一个未连接的数据库。 */
  createDatabase(options: TransactionSuiteDatabaseOptions): Promise<TransactionSuiteDatabase>;
  /** 创建只连接物理适配器、不初始化 RxDB 活查询的引导事务探针。 */
  createBootstrapProbe(options: { readonly dbName: string; readonly entities: readonly EntityType[] }): Promise<{
    createTables(EntityTypes: EntityType[], entities: InstanceType<EntityType>[]): Promise<boolean>;
    tableExists(EntityType: EntityType): Promise<boolean>;
    dispose(): Promise<void>;
  }>;
  /**
   * 一条能在被测后端上执行、且**不产生副作用**的查询语句。
   *
   * @remarks
   * SQLite 与 PostgreSQL 的方言不同（如 `SELECT 1` 两者都行，但探测表存在与否的语句不同），
   * 因此由适配器提供。
   */
  readonly noopSql: string;
}

/** 各套件的公共入参。 */
export interface TransactionSuiteOptions {
  readonly factory: TransactionSuiteFactory;
}
