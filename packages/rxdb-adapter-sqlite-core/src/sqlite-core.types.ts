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
  /**
   * 登记变更监听。Comlink 远端客户端返回 Promise，注册方必须 await，否则监听可能尚未生效就开始写库。
   *
   * @param type - 变更类型
   * @param handler - 监听器
   * @param owner - 登记它的持有者（见 {@link SqliteClientLike.release}）；不认识持有者的客户端忽略这一项
   */
  addEventListener(
    type: SQLiteChangeType,
    handler: (event: SqliteChangeEvent) => void,
    owner?: string
  ): void | Promise<void>;
  /**
   * 一个持有者退出共用的客户端：摘掉它带 `owner` 登记的监听，交还它在 `init` 时拿的那一份持有；
   * 最后一份交还时才关库，关了之后还能再 `init`（US-314 B2.3b）。
   *
   * @param owner - `init` 与 `addEventListener` 时给的持有者键；没持有过的、已经交还过的什么都不做
   *
   * @remarks
   * SharedWorker 里只有一个客户端，每个连上来的标签页拿到的都是它：一个标签页断开只能交还自己那一份，
   * 不能像 {@link SqliteClientLike.disconnect} 那样把别的标签页还在用的连接关掉。
   * 监听要按持有者摘：Comlink 每传一次监听都在 worker 里造一个新代理，按引用摘不掉。
   * 不实现此方法的客户端不能经 SharedWorker 共用。
   */
  release?(owner: string): Promise<void>;
  /**
   * 连接上有没结束的事务就回滚它，答回滚了没有（US-314 B2.3b）。
   *
   * @remarks
   * 共用一条连接的标签页死在事务中间，它那笔事务就一直开着：语句已经送到连接上，`COMMIT` / `ROLLBACK` 再也不会来。
   * 跨标签页的锁随标签页一起放开，下一个拿到锁的先调它。只在拿着跨标签页的锁时调，否则会回滚别人正在跑的事务。
   */
  rollbackOrphanTransaction?(): Promise<boolean>;
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
  /**
   * 暂停 / 恢复变更事件采集。
   *
   * @remarks
   * 恢复整库时静音：恢复出来的系统表行不是新变更，不能在之后被当成事件派发给监听器。
   * 不实现此方法的客户端不支持恢复。Comlink 远端客户端返回 Promise，调用方必须 await。
   *
   * 静音是整个客户端的，不分持有者。SharedWorker 上共用的客户端不会被静音：SharedWorker 传输不支持备份与恢复
   * （`unsupported_combination`，`field` 为 `transport`）。
   */
  setChangeEventsMuted?(muted: boolean): void | Promise<void>;
  /**
   * 描述同一个引擎上新建空库本来的样子。
   *
   * @remarks
   * 有的引擎（例如 sqliteai 的内置扩展）在每条新连接上自动建表并写入初始行，这样的库仍然是「空」的。
   * 实现在同一个已加载的模块上开一条临时 `:memory:` 连接，用 `describeSqliteDatabase()` 描述后关闭。
   * 恢复只把恰好等于这份描述的目标当作空库。不实现此方法的客户端不支持恢复。
   */
  describeBlankDatabase?(): Promise<SqliteBlankDatabase>;
}

/** {@link SqliteClientLike.describeBlankDatabase} 的结果。 */
export interface SqliteBlankDatabase {
  /** 用户对象的 `type:name`（不含 `sqlite_` 开头的内部对象），按字典序。 */
  readonly objects: readonly string[];
  /** 结构与每张表行数的描述；没有对象时为空串。恢复先比它，相同才去读目标的行。 */
  readonly shape: string;
  /** 全部行的描述；没有对象时为空串。结构与行的描述都相同即内容相同。 */
  readonly description: string;
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
