import type { AdapterRepositoryConstructor } from '@aiao/rxdb';
import type { UnlockOptions } from '@aiao/rxdb-adapter-encrypted';
import type { Observable } from 'rxjs';
import type { RxDBAdapterSqliteBase } from './RxDBAdapterSqliteBase.js';
import { SQLiteChangeType } from './sqlite-backend.interface.js';
import type { SQLiteCompatibleType, SqliteChangeEvent, SqliteResult } from './sqlite-core.interface.js';

/**
 * SQLite 适配器的最小客户端接口。
 * wa-sqlite 的 SqliteClient 与 sqliteai 的 SqliteaiClient 都满足该契约。
 */
export interface SqliteClientLike {
  execute(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult>;
  disconnect(): Promise<void>;
  version(): Promise<string>;
  /** Comlink 远端客户端返回 Promise，注册方必须 await，否则监听可能尚未生效就开始写库 */
  addEventListener(type: SQLiteChangeType, handler: (event: SqliteChangeEvent) => void): void | Promise<void>;
  /**
   * 开启事务时使用的 SQL，默认 `'BEGIN;'`。
   *
   * @remarks
   * 后端可覆写以插入自身特有的锁策略前置语句——例如 wa-sqlite 的
   * `IDBBatchAtomicVFS`/`OPFSAdaptiveVFS` 选用 `shared+hint` 锁策略时，
   * 需要在拿共享锁阶段先发 `PRAGMA write_hint;` 才能在 SHARED→RESERVED
   * 升级时避免 `SQLITE_BUSY`（见 wa-sqlite `WebLocksMixin`）。
   *
   * Comlink 远端客户端即便实现是同步的也会返回 Promise，注册方必须 await。
   */
  beginTransactionSql?(): string | Promise<string>;
  /** 获取系统 schema 升级时后端支持的最高强度锁。 */
  beginSystemMigrationTransactionSql?(): string | Promise<string>;
}

/**
 * SQLite 适配器的基础选项（与后端无关）。
 */
export interface SqliteBaseOptions {
  repositories?: Record<string, AdapterRepositoryConstructor<RxDBAdapterSqliteBase>>;
}

/**
 * 暴露在 `adapter.encryption` 上的开发者门面，内部转发给 `Keyring`。
 * 如果数据库中没有实体声明加密列，所有方法都会抛
 * `EncryptedConfigurationError(code: 'no_encrypted_columns')`。
 */
export interface AdapterEncryptionFacade {
  unlock(opts: UnlockOptions): Promise<void>;
  lock(): void;
  isInitialized(): Promise<boolean>;
  readonly isLocked: boolean;
  readonly lockChange$: Observable<boolean>;
}
