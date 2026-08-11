/**
 * @fileoverview 与后端无关的工厂契约，供加密契约套件使用。
 *
 * 结构上与 `@aiao/rxdb-adapter-sqlite-core/testing` 的 `AdapterFactory` 保持一致，
 * 但在本文件内声明，以避免让 `@aiao/rxdb-test` 依赖某个特定 adapter 包
 * （PGlite adapter 并不是 sqlite-core adapter，但仍需满足同一契约）。
 */
import type { EntityType } from '@aiao/rxdb';
import type { Observable } from 'rxjs';

/** 一次 SQL 往返的结果形状。列名与行值都按位置对齐。 */
export interface EncryptedAdapterQueryResult {
  readonly results: ReadonlyArray<{
    readonly columns: ReadonlyArray<string>;
    readonly rows: ReadonlyArray<ReadonlyArray<unknown>>;
  }>;
}

/** keyring 的锁定/解锁能力。 */
export interface EncryptedAdapterEncryption {
  unlock(options: { passphrase: string; idleTimeoutMs?: number }): Promise<void>;
  lock(): void;
  readonly isLocked: boolean;
}

/** 套件用到的 `versionManager` 子集。 */
export interface EncryptedAdapterVersionManager {
  createBranch(branchId: string): Promise<unknown>;
  mergeBranch(branchId: string): Promise<{ merged: number }>;
  switchBranch(branchId: string): Promise<void>;
  history<T>(entity?: new () => T): {
    undoHistories$: Observable<ReadonlyArray<unknown>>;
    undo(steps?: number): Promise<void>;
    redo(steps?: number): Promise<void>;
  };
}

/**
 * 加密契约套件对被测 adapter 的**权威**能力要求。
 *
 * 这里列的每一项都有套件在用；adapter 少实现一项应当在**类型检查**时暴露，
 * 而不是等到运行时某条用例炸掉。各 suite 不再各自声明局部的 `QueryableAdapter`
 * / `LifecycleAdapter` —— 那些声明配合 `createAdapter<T>` 等于「套件要什么就假装有什么」。
 */
export interface EncryptedTestAdapter {
  /**
   * adapter 级缓存清理。**可选**：只有部分后端在 adapter 根上暴露它
   * （`rxdb.entityManager.cleanAllCache()` 才是所有后端都有的那个）。
   * 这里如实标成可选，而不是为了「看起来统一」逼所有 adapter 都实现。
   */
  cleanAllCache?(): void;
  query(sql: string, bindings?: ReadonlyArray<unknown>): Promise<EncryptedAdapterQueryResult>;
  /**
   * 形参写成 `EntityType` 而不是 `new () => T`：adapter 侧的真实签名是
   * `<T extends EntityType, RT = SqliteRepository<T>>(EntityType: T) => RT`，
   * 用 `new () => T` 去接会因 `T` 不满足 `object` 约束而整体不可赋值 ——
   * 那是**契约写错**，不是 adapter 缺能力。
   */
  getRepository<T extends EntityType>(
    entity: T
  ): {
    find(query: {
      where: { combinator: 'and'; rules: ReadonlyArray<unknown> };
    }): Promise<ReadonlyArray<InstanceType<T>>>;
  };
  readonly encryption: EncryptedAdapterEncryption;
  readonly rxdb: {
    disconnectAll(): Promise<void>;
    entityManager: {
      cleanAllCache(): void;
      saveMany<T>(entities: T[]): Promise<T[]>;
    };
    versionManager: EncryptedAdapterVersionManager;
  };
}

export interface EncryptedAdapterFactory {
  /** 显示名，会出现在 `describe` 块中。 */
  readonly name: string;
  /** 返回真实 repository 路径已经执行的 SQL 数量。 */
  getQueryCount(adapter: EncryptedTestAdapter): number;
  /**
   * 构建一个准备好 CRUD 往返的 adapter。
   *
   * 返回类型由**套件**规定而非调用方指定：此前的 `createAdapter<T = unknown>(): Promise<T>`
   * 里 `T` 完全由消费者挑，等价于在公开 API 中内置一次强制断言（RXT-024）。
   *
   * ## 前置条件（RXT-029）
   *
   * 每次调用**必须**返回一个 **fresh / empty / isolated** 的库：
   *
   * - **fresh** —— 不是上一次调用返回的那一个（含 keyring 与 version session 状态）；
   * - **empty** —— 传入的每个实体表、以及 `rxdb_change` / 分支表都没有历史遗留行；
   * - **isolated** —— 同进程内并发存在的其它 adapter 看不到它写的数据。
   *
   * 这不是「建议」而是套件成立的**前提**：套件里大量断言是绝对值而非增量
   * （`saveMany(1000)` 直接断言 `COUNT(*)` 恰好等于 1000，泄漏扫描断言命中集恰好为空，
   * undo/redo 断言历史栈从零开始）。复用持久化库的 factory 第二次运行会读到 2000，
   * 而失败信息指向的是加密层，不是真正的病因。
   *
   * 套件在 `beforeAll` 里会当场校验这条前提并点名违约的 factory，
   * 不会等到某条断言以错误的理由变红。
   */
  createAdapter(options?: Record<string, unknown>): Promise<EncryptedTestAdapter>;
}

/**
 * 读取 adapter 定义的持久化状态字节视图。
 *
 * CRUD 套件只扫描这里返回的字节。使用方必须先说明该视图是否覆盖物理文件、
 * WAL / 空闲页、变更补丁、缓存以及历史快照，再下更严格的落盘结论。
 */
export type ReadDatabaseFile = (adapter: unknown) => Promise<Uint8Array>;

/**
 * 后端专有的解析器，给定实体元数据返回 SQL 加引号的物理表名。
 * wa-sqlite 使用 `"${namespace}$${tableName}"`，
 * PGlite 使用 PostgreSQL schema 写法 `"${namespace}"."${tableName}"`。
 */
export type ResolveTableName = (meta: { readonly namespace: string; readonly tableName: string }) => string;

/** 加密契约套件的共享选项。 */
export interface EncryptedSuiteOptions {
  /** 被测的 adapter factory。 */
  readonly factory: EncryptedAdapterFactory;
  /** 仅供扫描字节的套件使用的可选持久化状态读取器。 */
  readonly readDatabaseFile?: ReadDatabaseFile;
  /** 用于解锁 keyring 的 passphrase，缺省取固定常量。 */
  readonly passphrase?: string;
  /**
   * 后端专有的物理表名解析器。默认采用 wa-sqlite 形态
   * `"${namespace}$${tableName}"` 以保持向后兼容。
   */
  readonly resolveTableName?: ResolveTableName;
}

/** CRUD 套件持久化状态哨兵扫描所需的选项。 */
export interface EncryptedCrudSuiteOptions extends EncryptedSuiteOptions {
  /** adapter 定义的持久化状态字节读取器。 */
  readonly readDatabaseFile: ReadDatabaseFile;
}
