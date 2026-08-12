import type { AdapterRepositoryConstructor, EntityMetadata, EntityType, IRepository, IRxDBAdapter } from '@aiao/rxdb';
import {
  assertRxDBUpgradeClaimable,
  assertSupportedRxDBSystemVersions,
  createRxDBActiveWriterLeaseError,
  getEntityMetadata,
  getEntityMutations,
  getRxDBSystemVersionState,
  isCurrentRxDBSystemVersion,
  readRxDBWriterLease,
  resolveRxDBWriterEpoch,
  RxDB,
  RXDB_CHANGE_CODEC_WATERMARK,
  RXDB_CHANGE_CODEC_WATERMARK_PREFIX,
  RXDB_SYSTEM_SCHEMA_WATERMARK,
  RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX,
  RXDB_UPGRADE_GUARD_TABLE_NAME,
  RXDB_UPGRADE_OWNER_TTL_MS,
  RXDB_WRITER_HEARTBEAT_INTERVAL_MS,
  RXDB_WRITER_LEASE_TABLE_NAME,
  RXDB_WRITER_LEASE_TTL_MS,
  RXDB_WRITER_PROTOCOL_VERSION,
  RxDBAdapterLocalBase,
  RxDBBranch,
  RxDBChange,
  RxDBMigration,
  RxDBMutationsMap,
  RxDBSystemMigrationLockError,
  RxDBWriterLeaseError,
  SwitchBranchOptions,
  SwitchVersionActions,
  TransactionBeginEvent,
  TransactionCommitEvent,
  TransactionRollbackEvent,
  uuid
} from '@aiao/rxdb';
import {
  createKeyring,
  EncryptedConfigurationError,
  type Keyring,
  type UnlockOptions,
  validateEncryptedPropertyMetadata
} from '@aiao/rxdb-adapter-encrypted';
import { AsyncQueueExecutor } from '@aiao/utils';
import { proxy } from 'comlink';
import { defer, from, Observable, of } from 'rxjs';
import { releaseComlinkProxy } from './create_sqlite_client.js';
import { generate_upsert_clause } from './entity/insert_sql.js';
import { handle_rxdb_change } from './handle_rxdb_change.js';
import { SqliteCoreKeyringStorage } from './keyring/sqlite-core-keyring-storage.js';
import { SqliteRepository } from './repository/SqliteRepository.js';
import { SqliteTreeRepository } from './repository/SqliteTreeRepository.js';
import { SQLiteChangeType } from './sqlite-backend.interface.js';
import type {
  RowId,
  SqliteChangeErrorEvent,
  SqliteChangeErrorListener,
  SqliteChangeEvent,
  SQLiteCompatibleType,
  SqliteResult
} from './sqlite-core.interface.js';
import {
  build_set_sequence_statements,
  chunkBySqliteBindLimit,
  type EncryptionContext,
  get_table_name_by_entity_type,
  get_table_name_by_metadata,
  getTableColumnIndexName,
  isSqlResultEmpty,
  isTableExistedSql,
  quote_sql_identifier,
  RxDBAdapterSqliteError
} from './sqlite-core.utils.js';
import { create_tables_sql } from './table/create_tables_sql.js';
import { remove_all_triggers_sql } from './table/remove_trigger_sql.js';
import { generate_table_trigger_sql } from './table/trigger_sql.js';
import { SqliteTransactionExecutor } from './transaction/SqliteTransactionExecutor.js';
import { execute_switch_actions } from './version/execute_switch_actions.js';
import { convertSwitchResultToSql } from './version/switch-result.utils.js';
import { switch_branch } from './version/switch_branch.js';
import { switch_transaction_id } from './version/switch_transaction_id.js';

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
 * 事务回调。
 *
 * @remarks
 * 参数是本次事务的 {@link SqliteTransactionExecutor} —— 持有它才算「在本事务内」。
 * 它保留 `execute()` 透传，因此既有的 `transaction(async tx => tx.execute(sql))` 写法不受影响；
 * 跨适配器可移植的入口是 `tx.query()` / `tx.getRepository()`。
 */
export type TransactionFun = (executor: SqliteTransactionExecutor) => Promise<unknown>;

const UPGRADE_GUARD_TABLE = quote_sql_identifier(`rxdb$${RXDB_UPGRADE_GUARD_TABLE_NAME}`);
const WRITER_LEASE_TABLE = quote_sql_identifier(`rxdb$${RXDB_WRITER_LEASE_TABLE_NAME}`);
const UPGRADE_GUARD_TABLE_NAME = `rxdb$${RXDB_UPGRADE_GUARD_TABLE_NAME}`;
const WRITER_LEASE_TABLE_NAME = `rxdb$${RXDB_WRITER_LEASE_TABLE_NAME}`;
type WriterLeaseState = 'bootstrap' | 'starting' | 'active' | 'fenced' | 'closing' | 'closed';

type HeartbeatTimer = ReturnType<typeof setTimeout> & { unref?: () => void };

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

/**
 * 与后端无关的 SQLite adapter 基类。
 *
 * 子类负责实现 `createClient()` 与 `adapterName`。
 */
export abstract class RxDBAdapterSqliteBase extends RxDBAdapterLocalBase implements IRxDBAdapter {
  #cached_client?: SqliteClientLike;
  #row_id_map = new Map<EntityType, Map<RowId, InstanceType<EntityType>>>();
  #entity_row_id_map = new WeakMap<InstanceType<EntityType>, RowId>();
  #queue = new AsyncQueueExecutor(1);
  #client_promise?: Promise<SqliteClientLike>;
  #is_disconnected = false;
  #listeners_registered = false;
  #keyring: Keyring | null = null;
  #encryption_facade?: AdapterEncryptionFacade;
  readonly #writer_id = uuid();
  readonly #upgrade_owner_id = uuid();
  #writer_epoch?: number;
  #writer_lease_state: WriterLeaseState = 'bootstrap';
  #writer_lease_start?: Promise<void>;
  #writer_heartbeat?: HeartbeatTimer;
  #change_error_listeners = new Set<SqliteChangeErrorListener>();
  readonly #change_tasks = new Set<Promise<void>>();
  #sqlite_change_handler = proxy((event: SqliteChangeEvent) => {
    if (this.#is_disconnected) return;
    const task = handle_rxdb_change(this, event);
    this.#change_tasks.add(task);
    void task.then(
      () => this.#change_tasks.delete(task),
      error => {
        this.#change_tasks.delete(task);
        this.emitChangeError({ error, tableName: event.tableName, rowIds: event.rowIds, phase: 'process' });
      }
    );
  });

  abstract readonly name: string;

  /**
   * 创建或获取 SQLite 客户端。
   * 具体 adapter 用各自后端的逻辑实现此方法。
   */
  protected abstract createClient(): Promise<SqliteClientLike>;

  get encryptionContext(): EncryptionContext {
    return {
      keyring: this.#keyring,
      namespace: this.rxdb.config.dbName,
      resolveEntityMetadata: (entity, namespace) => this.rxdb.schemaManager.getEntityMetadata(entity, namespace)
    };
  }

  get encryption(): AdapterEncryptionFacade {
    if (this.#encryption_facade) return this.#encryption_facade;
    const getKeyring = (operation: string): Keyring => {
      if (!this.#keyring) throw this.#noEncryptedColumnsError(operation);
      return this.#keyring;
    };
    const facade: AdapterEncryptionFacade = {
      unlock: async (opts: UnlockOptions): Promise<void> => getKeyring('unlock').unlock(opts),
      lock: (): void => getKeyring('lock').lock(),
      isInitialized: (): Promise<boolean> => getKeyring('isInitialized').isInitialized(),
      get isLocked(): boolean {
        return getKeyring('isLocked').isLocked;
      },
      get lockChange$(): Observable<boolean> {
        return getKeyring('lockChange$').lockChange$;
      }
    };
    this.#encryption_facade = facade;
    return facade;
  }

  constructor(rxdb: RxDB, options?: SqliteBaseOptions) {
    super(rxdb);
    if (options?.repositories) {
      Object.keys(options.repositories).forEach(name => {
        this.repository(name, options.repositories![name]);
      });
    }
    this.repository('Repository', SqliteRepository);
    this.repository('TreeRepository', SqliteTreeRepository);
  }

  /**
   * 订阅变更处理失败。
   *
   * @param listener - 收到 {@link SqliteChangeErrorEvent} 的回调，异常会被隔离
   *
   * @remarks
   * 只要注册了监听器，默认的 `console.error` 降级就交给监听器接管（SQLC-012）。
   */
  addChangeErrorListener(listener: SqliteChangeErrorListener): void {
    this.#change_error_listeners.add(listener);
  }

  /**
   * 取消 {@link addChangeErrorListener} 的订阅。
   *
   * @param listener - 注册时传入的同一个函数引用
   */
  removeChangeErrorListener(listener: SqliteChangeErrorListener): void {
    this.#change_error_listeners.delete(listener);
  }

  /**
   * 报告一次变更处理失败。
   *
   * @param event - 失败详情
   *
   * @remarks
   * 由变更处理管线（`handle_rxdb_change`）调用，不面向应用代码。本方法**永不抛出**：
   * 它所在的路径没有调用方能接住异常，抛出只会变成 unhandled rejection。
   */
  emitChangeError(event: SqliteChangeErrorEvent): void {
    if (this.#change_error_listeners.size === 0) {
      const reason =
        event.phase === 'query' ?
          `Failed to query ${event.tableName} change (rowIds: ${event.rowIds})`
        : `Error processing ${event.tableName} change event`;
      console.error(`[rxdb-adapter-sqlite-core] ${reason}:`, event.error);
      return;
    }
    // 快照迭代：监听器里增删监听器不影响本次派发
    for (const listener of Array.from(this.#change_error_listeners)) {
      try {
        listener(event);
      } catch (listenerError) {
        console.error('[rxdb-adapter-sqlite-core] change-error listener threw:', listenerError);
      }
    }
  }

  getRepository<T extends EntityType, RT = SqliteRepository<T>>(EntityType: T): RT {
    if (!this.repository_cache.has(EntityType)) {
      const meta = getEntityMetadata(EntityType);
      const RepositoryClass = this.repository_map.get(meta.repository);
      if (!RepositoryClass) {
        throw new RxDBAdapterSqliteError(`Repository '${meta.repository}' not found`);
      }
      const repository = new RepositoryClass(this, EntityType);
      this.repository_cache.set(EntityType, repository);
      return repository as RT;
    }
    return this.repository_cache.get(EntityType) as RT;
  }

  /**
   * 新建一个绑定到 `host` 的仓库，**不写入** `repository_cache`。
   *
   * @param EntityType - 实体类型
   * @param host - 仓库要绑定到的适配器（事务场景下是 executor 的门面）
   *
   * @remarks
   * 供 {@link SqliteTransactionExecutor.getRepository} 使用。之所以必须绕开缓存：缓存里的仓库
   * 生命周期与适配器一样长，若把事务作用域的仓库写进去，事务结束后它仍留在缓存里指向一个
   * 已提交/已回滚的事务上下文，之后的**外部**写会打到那上面。
   *
   * @internal
   */
  createUncachedRepository<T extends EntityType>(EntityType: T, host: RxDBAdapterSqliteBase): IRepository<T> {
    const meta = getEntityMetadata(EntityType);
    const RepositoryClass = this.repository_map.get(meta.repository);
    if (!RepositoryClass) {
      throw new RxDBAdapterSqliteError(`Repository '${meta.repository}' not found`);
    }
    // RepositoryClass 的形参声明是 `this`，这里要传的是事务门面（结构等价但不是同一标称类型）
    const construct = RepositoryClass as unknown as new (
      adapter: RxDBAdapterSqliteBase,
      EntityType: EntityType
    ) => unknown;
    return new construct(host, EntityType) as IRepository<T>;
  }

  public async connect() {
    if (this.#writer_lease_state === 'closed') this.#writer_lease_state = 'bootstrap';
    this.#is_disconnected = false;
    try {
      this.#initEncryption();
      await this.#client();
    } catch (err) {
      // 初始化失败时恢复 disconnected 状态，避免后续操作误判为已连接
      this.#is_disconnected = true;
      throw err;
    }
    return this as IRxDBAdapter;
  }

  override async startWriterLease(): Promise<void> {
    if (this.#writer_lease_state === 'active') return;
    if (this.#writer_lease_start) return this.#writer_lease_start;
    if (this.#writer_lease_state !== 'bootstrap') this.#assertWriterLeaseWritable();

    this.#writer_lease_state = 'starting';
    // 水位线是 RxDB.connect() 引导链路的一环，必须绕开就绪门（门等的正是那个 connect()）
    this.#writer_lease_start = this.bootstrapTransaction(async () => undefined, false)
      .then(() => {
        this.#writer_lease_state = 'active';
        this.#scheduleWriterHeartbeat();
      })
      .catch(error => {
        this.#writer_lease_state = 'fenced';
        this.#writer_epoch = undefined;
        throw error;
      })
      .finally(() => {
        this.#writer_lease_start = undefined;
      });
    return this.#writer_lease_start;
  }

  public async disconnect() {
    const previousWriterLeaseState = this.#writer_lease_state;
    this.#writer_lease_state = 'closing';
    try {
      await this.#stopWriterLease(previousWriterLeaseState !== 'bootstrap' && previousWriterLeaseState !== 'closed');
    } finally {
      this.#is_disconnected = true;
      // client.disconnect() 失败也必须清掉缓存：不清的话这个（可能已部分拆卸的）死实例会一直
      // 留在 #cached_client 里，重连时 #client() 直接复用它而不是走工厂重建，
      // 后续每次 disconnect 重试也会对同一个实例反复调用（SQLC-020）
      try {
        await this.#waitForChangeTasks();
        await this.#queue.waitForAll();
        if (this.#cached_client) {
          await this.#cached_client.disconnect();
        }
      } finally {
        // client 是 Comlink 远端代理时必须显式释放根代理的 MessagePort：
        // 不释放则每轮断开/重连都留下一个活端口和 Worker 侧引用（SQLC-041）。
        // 排在 client.disconnect() 之后 —— 先释放代理，后续 RPC 会直接 reject。
        releaseComlinkProxy(this.#cached_client);
        this.#cached_client = undefined;
        this.#client_promise = undefined;
        this.#listeners_registered = false;
        this.#writer_lease_state = 'closed';
      }
    }
  }

  public async version(): Promise<string> {
    const client = await this.#client();
    return await client.version();
  }

  async saveMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    const options = getEntityMutations({
      need_save_entities: entities,
      need_remove_entities: []
    });
    return this.mutations(options);
  }

  async removeMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    const options = getEntityMutations({
      need_save_entities: [],
      need_remove_entities: entities
    });
    return this.mutations(options);
  }

  async mutations<T extends EntityType>(options: RxDBMutationsMap<T>): Promise<InstanceType<T>[]> {
    // C2：不再按环境态分流。外部调用一律开自己的事务并重新排队 —— 事务窗口内的外部写
    // 被卷进他人事务、跟着 ROLLBACK 一起消失，正是 `SQLC-001`。
    // 事务体内的嵌套写要走 `executor.mutations()`（持有 executor 才算在本事务内）。
    return this.transaction(executor => executor.mutations(options)) as Promise<InstanceType<T>[]>;
  }

  public async isTableExisted<T extends EntityType>(EntityType: T): Promise<boolean> {
    const metadata = getEntityMetadata(EntityType);
    const tableName = get_table_name_by_metadata(metadata);
    const { sql, params } = isTableExistedSql(tableName);
    const result = await this.#internal_exec(sql, params);
    return isSqlResultEmpty(result) === false;
  }

  async createTables<T extends EntityType>(EntityTypes: T[], entities?: InstanceType<T>[]): Promise<boolean> {
    const sql = await create_tables_sql(this, EntityTypes, entities);
    if (this.#writer_lease_state === 'bootstrap') {
      return this.#queue.addTask(() =>
        this.#run_transaction(async executor => {
          await executor.execute(sql);
          await this.#ensureWriterProtocol((statement, bindings) => executor.execute(statement, bindings));
          return true;
        }, false)
      );
    }
    // 建表也在引导链路上（RxDB.#ensureEntityTables 补建缺失的实体表），同样不能等就绪门；
    // 何况「表就绪」正是本方法要建立的前提，让它反过来等就绪是循环依赖。
    await this.bootstrapTransaction(executor => executor.execute(sql), false);
    return true;
  }

  override async migrateSystemSchema(): Promise<void> {
    const client = await this.#client();
    await this.#queue.addTask(async () => {
      let transactionStarted = false;
      let committed = false;
      try {
        const beginSql = (await client.beginSystemMigrationTransactionSql?.()) ?? 'BEGIN EXCLUSIVE;';
        try {
          await client.execute(beginSql);
          transactionStarted = true;
        } catch (cause) {
          throw new RxDBSystemMigrationLockError(cause);
        }

        await this.#assertWriterProtocolTables(client);

        const migrationMetadata = getEntityMetadata(RxDBMigration);
        const migrationTable = quote_sql_identifier(get_table_name_by_metadata(migrationMetadata));
        const watermarkResult = await client.execute(
          `SELECT "name" FROM ${migrationTable}
           WHERE substr("name", 1, ?) = ? OR substr("name", 1, ?) = ?`,
          [
            RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX.length,
            RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX,
            RXDB_CHANGE_CODEC_WATERMARK_PREFIX.length,
            RXDB_CHANGE_CODEC_WATERMARK_PREFIX
          ]
        );
        const watermarkNames = watermarkResult.results
          .flatMap(result => result.rows)
          .map(row => row[0])
          .filter((name): name is string => typeof name === 'string');
        const state = getRxDBSystemVersionState(watermarkNames);
        assertSupportedRxDBSystemVersions(state);

        if (!isCurrentRxDBSystemVersion(state)) {
          const guardResult = await client.execute(
            `SELECT "epoch", "state", "ownerId", "ownerExpiresAt", "minProtocol",
                    CASE WHEN "ownerExpiresAt" IS NOT NULL
                               AND julianday("ownerExpiresAt") > julianday('now')
                         THEN 1 ELSE 0 END
             FROM ${UPGRADE_GUARD_TABLE}
             WHERE "databaseId" = ?`,
            [this.rxdb.config.dbName]
          );
          const guardRow = guardResult.results[0]?.rows[0];
          const persistedGuard = guardRow && {
            epoch: guardRow[0],
            state: guardRow[1],
            ownerId: guardRow[2],
            ownerExpiresAt: guardRow[3],
            minProtocol: guardRow[4],
            ownerActive: guardRow[5] === 1
          };
          const epoch = assertRxDBUpgradeClaimable(
            persistedGuard,
            this.#upgrade_owner_id,
            RXDB_WRITER_PROTOCOL_VERSION
          );
          const ownerTtl = `+${String(RXDB_UPGRADE_OWNER_TTL_MS / 1000)} seconds`;
          const drainingGuard = await client.execute(
            `UPDATE ${UPGRADE_GUARD_TABLE}
             SET "state" = 'draining', "ownerId" = ?,
                 "ownerExpiresAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
             WHERE "databaseId" = ?`,
            [this.#upgrade_owner_id, ownerTtl, this.rxdb.config.dbName]
          );
          if (drainingGuard.rowsAffected !== 1) {
            throw new RxDBAdapterSqliteError('RxDB upgrade guard ownership changed before draining.');
          }
          const leaseResult = await client.execute(
            `SELECT "writerId", "protocolVersion", "epoch",
                    CASE WHEN "lastSeenAt" IS NOT NULL
                               AND "expiresAt" IS NOT NULL
                               AND julianday("lastSeenAt") IS NOT NULL
                               AND julianday("expiresAt") IS NOT NULL
                               AND julianday("lastSeenAt") <= julianday('now')
                         THEN 1 ELSE 0 END,
                    CASE WHEN julianday("expiresAt") > julianday('now')
                         THEN 1 ELSE 0 END
             FROM ${WRITER_LEASE_TABLE}
             WHERE "databaseId" = ?`,
            [this.rxdb.config.dbName]
          );
          let hasActiveWriterLease = false;
          for (const row of leaseResult.results.flatMap(result => result.rows)) {
            const lease = readRxDBWriterLease(
              {
                writerId: row[0],
                protocolVersion: row[1],
                epoch: row[2],
                validTtl: row[3] === 1,
                active: row[4] === 1
              },
              persistedGuard,
              RXDB_WRITER_PROTOCOL_VERSION
            );
            if (lease.active && lease.writerId !== this.#writer_id) hasActiveWriterLease = true;
          }
          await client.execute(
            `DELETE FROM ${WRITER_LEASE_TABLE}
             WHERE "databaseId" = ? AND julianday("expiresAt") <= julianday('now')`,
            [this.rxdb.config.dbName]
          );
          if (hasActiveWriterLease) {
            await client.execute('COMMIT;');
            committed = true;
            throw createRxDBActiveWriterLeaseError();
          }
          const migratingGuard = await client.execute(
            `UPDATE ${UPGRADE_GUARD_TABLE}
             SET "state" = 'migrating', "epoch" = "epoch" + 1,
                 "ownerExpiresAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
             WHERE "databaseId" = ? AND "ownerId" = ? AND "state" = 'draining'`,
            [ownerTtl, this.rxdb.config.dbName, this.#upgrade_owner_id]
          );
          if (migratingGuard.rowsAffected !== 1) {
            throw new RxDBAdapterSqliteError('RxDB upgrade guard ownership changed before migration.');
          }

          const existingLoggedMetadata: EntityMetadata[] = [];
          for (const EntityType of this.rxdb.config.entities) {
            const metadata = getEntityMetadata(EntityType);
            if (metadata.log === false) continue;
            const tableName = get_table_name_by_metadata(metadata);
            const tableResult = await client.execute(
              `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
              [tableName]
            );
            if (tableResult.results.some(result => result.rows.length > 0)) {
              existingLoggedMetadata.push(metadata);
            }
          }

          const removeTriggersSql = remove_all_triggers_sql(this);
          if (removeTriggersSql) await client.execute(removeTriggersSql);
          for (const metadata of existingLoggedMetadata) {
            await client.execute(
              generate_table_trigger_sql(metadata, {
                resolveEntityMetadata: this.encryptionContext.resolveEntityMetadata
              })
            );
          }

          // RXD-036：给 rxdb_migration."name" 补唯一索引 —— 它是「同一条迁移只跑一次」的仲裁者。
          // 老库在旧实现下可能已经存了重名行（并发实例各写一条），不先去重，建索引这一步会直接失败
          // 并把整个升级卡死。保留最小 id 的那条：它是最先落库的，`executedAt` 也最接近真实执行时刻。
          const nameProperty = migrationMetadata.properties.find(property => property.name === 'name');
          if (!nameProperty) {
            throw new RxDBAdapterSqliteError('RxDBMigration metadata is missing the "name" property.');
          }
          await client.execute(
            `DELETE FROM ${migrationTable}
             WHERE "id" NOT IN (SELECT MIN("id") FROM ${migrationTable} GROUP BY "name")`
          );
          await client.execute(
            `CREATE UNIQUE INDEX IF NOT EXISTS ${quote_sql_identifier(
              getTableColumnIndexName(migrationMetadata, nameProperty)
            )} ON ${migrationTable}("name")`
          );

          for (const watermark of [RXDB_SYSTEM_SCHEMA_WATERMARK, RXDB_CHANGE_CODEC_WATERMARK]) {
            await client.execute(
              `INSERT INTO ${migrationTable} ("name", "executedAt")
               SELECT ?, CURRENT_TIMESTAMP
               WHERE NOT EXISTS (SELECT 1 FROM ${migrationTable} WHERE "name" = ?)`,
              [watermark, watermark]
            );
          }
          await client.execute(`DELETE FROM ${WRITER_LEASE_TABLE} WHERE "databaseId" = ?`, [this.rxdb.config.dbName]);
          const openedGuard = await client.execute(
            `UPDATE ${UPGRADE_GUARD_TABLE}
             SET "state" = 'open', "ownerId" = NULL, "ownerExpiresAt" = NULL,
                 "minProtocol" = ?
             WHERE "databaseId" = ? AND "ownerId" = ? AND "state" = 'migrating'
               AND "epoch" = ?`,
            [RXDB_WRITER_PROTOCOL_VERSION, this.rxdb.config.dbName, this.#upgrade_owner_id, epoch + 1]
          );
          if (openedGuard.rowsAffected !== 1) {
            throw new RxDBAdapterSqliteError('RxDB upgrade guard ownership changed during migration.');
          }
        }

        await client.execute('COMMIT;');
        committed = true;
      } catch (error) {
        if (transactionStarted && !committed) {
          try {
            await client.execute('ROLLBACK;');
          } catch (rollbackError) {
            console.error('[rxdb-adapter-sqlite-core] system migration ROLLBACK failed:', rollbackError);
            await this.#invalidateClient(client).catch(disconnectError => {
              console.error('[rxdb-adapter-sqlite-core] failed to discard system migration client:', disconnectError);
            });
          }
        }
        throw error;
      }
    });
  }

  async switchBranch(options: SwitchBranchOptions): Promise<void> {
    return switch_branch(this, options);
  }

  async mergeChanges(
    actions: SwitchVersionActions,
    localChanges?: Omit<RxDBChange, 'id'>[],
    disableTriggers = false
  ): Promise<void> {
    const switchAction = await convertSwitchResultToSql(this, actions);
    await execute_switch_actions(this, switchAction, disableTriggers, localChanges);
  }

  cacheRowIdEntity(rowId: bigint, entity: InstanceType<EntityType>) {
    this.#get_row_id_cache_map(entity.constructor as EntityType).set(rowId, entity);
    this.#entity_row_id_map.set(entity, rowId);
  }

  removeCacheEntity(entity: InstanceType<EntityType>) {
    const rowId = this.#entity_row_id_map.get(entity);
    if (rowId !== undefined) {
      const map = this.#get_row_id_cache_map(entity.constructor as EntityType);
      map.delete(rowId);
      this.#entity_row_id_map.delete(entity);
    }
  }

  getEntityByRowId(rowId: bigint, EntityType: EntityType) {
    return this.#get_row_id_cache_map(EntityType).get(rowId);
  }

  getRowIdByEntity(entity: InstanceType<EntityType>): bigint | undefined {
    return this.#entity_row_id_map.get(entity);
  }

  cleanAllCache() {
    this.#row_id_map.clear();
    this.#entity_row_id_map = new WeakMap<InstanceType<EntityType>, RowId>();
  }

  public query(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> {
    if (this.#is_disconnected) {
      return Promise.reject(new RxDBAdapterSqliteError('Adapter is disconnected', { code: 'adapter_disconnected' }));
    }
    // C2：**永远重新排队**。事务内的读写必须经 executor（其门面把 query 直发到事务连接），
    // 未持有 executor 的调用一律是外部调用，不得被进行中的事务卷走。
    //
    // 就绪等待在**入队之前**完成；把它留在队列任务里会占着唯一槽位等一个只能由队列后方
    // 任务完成的 promise（首装死锁）。代价是「调用顺序」变成「就绪顺序」——已就绪时两者一致。
    if (this.#writer_lease_state !== 'bootstrap') return this.writeQuery(sql, bindings);
    return this.ready().then(() => this.#queue.addTask(() => this.#exec(sql, bindings)));
  }

  public writeQuery(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> {
    // C2 全量翻转后，真实适配器上的 writeQuery 一律新开事务（经 runInTransaction → transaction 入队）。
    // 事务体内的写必须经 executor 门面（门面把 writeQuery 直发到事务连接）；未持有 executor 的
    // 调用在事务窗口内再入队会占队列唯一槽位后永久等待。
    // 仓库 create/update/remove 经 entityManager 的活 Repository 时拿不到门面，因此「裸
    // entity.save() 包在 adapter.transaction() 里」是死锁路径——正确写法是：
    // `adapter.transaction(async executor => executor.getRepository(X).create(...))`。
    return this.runInTransaction(executor => (executor as SqliteTransactionExecutor).execute(sql, bindings), false);
  }

  public async rawQuery(sql: string, params?: unknown[]) {
    return this.transaction(executor => executor.query(sql, params), false);
  }

  // transaction() 与 query() 共用 #queue（并发度 1）串行通道。真实适配器入口总是重新入队，
  // 事务体内只有 callback executor 直接使用当前连接，因此外部调用不会被卷入当前事务。
  public async transaction<T extends TransactionFun>(
    transactionFun: T,
    transactionLog: boolean = true
  ): Promise<Awaited<ReturnType<T>>> {
    if (this.#is_disconnected) {
      throw new RxDBAdapterSqliteError('Adapter is disconnected', { code: 'adapter_disconnected' });
    }
    this.#assertWriterLeaseWritable();
    await this.ready(); // 与 query() 同口径：就绪等待必须在入队之前
    return this.#queue.addTask(() => this.#run_transaction(transactionFun, transactionLog));
  }

  /**
   * 引导期事务：与 {@link transaction} 相同，但**跳过就绪门**。
   *
   * @param transactionFun - 事务工作，参数是当前事务 executor
   * @param transactionLog - 是否写事务日志
   *
   * @remarks
   * 仅限 `RxDB.connect()` 的引导链路（水位线、建表、迁移）与本类内部的引导步骤调用 ——
   * 它们本身就跑在 `RxDB.connect()` 的 promise 里，等就绪门就是等自己。
   *
   * 表在这一刻可能尚未建出，顺序由引导链路自己保证。事务体内**不要**调它：门面不改写此方法，
   * 会落到真实适配器上再入队，持槽时二次入队即永久挂起。
   *
   * @internal
   */
  override async bootstrapTransaction<T extends TransactionFun>(
    transactionFun: T,
    transactionLog: boolean = true
  ): Promise<Awaited<ReturnType<T>>> {
    if (this.#is_disconnected) {
      throw new RxDBAdapterSqliteError('Adapter is disconnected', { code: 'adapter_disconnected' });
    }
    this.#assertWriterLeaseWritable();
    return this.#queue.addTask(() => this.#run_transaction(transactionFun, transactionLog));
  }

  /**
   * 执行事务工作。
   *
   * @param transactionFun - 事务工作，参数是当前事务 executor
   * @returns 事务工作的返回值
   *
   * @remarks
   * 真实适配器入口总是新开事务；executor 门面会把事务内的 `runInTransaction()` 映射为
   * `executor.run()`，复用当前事务且不重新入队。
   */
  public async runInTransaction<T extends TransactionFun>(
    transactionFun: T,
    transactionLog: boolean = true
  ): Promise<Awaited<ReturnType<T>>> {
    if (this.#is_disconnected) {
      throw new RxDBAdapterSqliteError('Adapter is disconnected', { code: 'adapter_disconnected' });
    }
    // C2：真实适配器上的 runInTransaction 一律新开事务。「已在事务中就复用」由
    // executor 门面接管（见 SqliteTransactionExecutor 的 facade：runInTransaction → executor.run），
    // 因此事务体内的调用方拿到的是门面，永远走不到这里。
    return this.transaction(transactionFun, transactionLog);
  }

  localRxDBBranch() {
    return this.getRepository(RxDBBranch) as SqliteRepository<typeof RxDBBranch>;
  }

  internalQuery(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> {
    return this.#internal_exec(sql, bindings);
  }

  localRxDBChange() {
    return this.getRepository(RxDBChange) as SqliteTreeRepository<typeof RxDBChange>;
  }

  async getRxDBChangeSequence() {
    const tableName = get_table_name_by_entity_type(RxDBChange);
    const result = await this.#internal_exec(`SELECT seq FROM sqlite_sequence WHERE name = ?`, [tableName]);
    return (result.results[0]?.rows?.[0]?.[0] ?? 0) as number;
  }

  async setRxDBChangeSequence(sequence: number) {
    const tableName = get_table_name_by_entity_type(RxDBChange);
    await this.transaction(async executor => {
      for (const stmt of build_set_sequence_statements(tableName, sequence)) {
        await executor.execute(stmt.sql, stmt.params);
      }
    }, false);
  }

  // QueryCache 方法
  //
  // 三个方法一律走 query() 而非 internalQuery()：它们是 QueryCacheRepository 的真实数据
  // 读写路径，由 RxJS Observable 驱动、落地时机不可控。internalQuery 旁路队列并复用同一连接，
  // 落在事务窗口内会被该事务的 ROLLBACK 一并回滚，或反向污染尚未提交的事务。
  // query() 通过 #queue 串行化，事务体内则由 executor 门面直接使用当前连接。
  // internalQuery 仅保留给真正的内部建表/探测路径（它们本就运行在 connect 内）。

  getMetadataByIds(entityName: string, ids: string[]): Observable<Map<string, string>> {
    return defer(() => {
      if (ids.length === 0) {
        return of(new Map<string, string>());
      }
      return from(
        (async () => {
          const metadataMap = new Map<string, string>();
          const { tableName, updatedAtColumn } = this.#resolveQueryCacheTarget(entityName);

          for (const idsChunk of chunkBySqliteBindLimit(ids)) {
            const placeholders = idsChunk.map(() => '?').join(', ');
            const sql = `SELECT id, ${quote_sql_identifier(updatedAtColumn)} FROM ${quote_sql_identifier(tableName)} WHERE id IN (${placeholders})`;
            const result = await this.query(sql, idsChunk);
            if (result.results?.[0]?.rows) {
              for (const row of result.results[0].rows) {
                metadataMap.set(row[0] as string, row[1] as string);
              }
            }
          }

          return metadataMap;
        })()
      );
    });
  }

  upsertMany<T>(entityName: string, data: T[]): Observable<void> {
    return defer(() => {
      if (data.length === 0) {
        return of(undefined);
      }
      return from(
        this.transaction(async executor => {
          const dataColumns = Object.keys(data[0] as object);
          const placeholderGroup = `(${new Array(dataColumns.length).fill('?').join(', ')})`;
          const { tableName, idColumn, columnNames } = this.#resolveQueryCacheTarget(entityName);
          const columns = dataColumns.map(column => columnNames.get(column) ?? column);
          const columnList = columns.map(quote_sql_identifier).join(', ');
          for (const dataChunk of chunkBySqliteBindLimit(data, columns.length)) {
            const valuePlaceholders = new Array(dataChunk.length).fill(placeholderGroup).join(', ');
            const sql = `INSERT INTO ${quote_sql_identifier(tableName)} (${columnList}) VALUES ${valuePlaceholders}${generate_upsert_clause(idColumn, columns)}`;
            const values = dataChunk.flatMap(item =>
              dataColumns.map(column => (item as Record<string, unknown>)[column])
            );
            await executor.query(sql, values);
          }
        }, false).then(() => undefined)
      );
    });
  }

  deleteByIds(entityName: string, ids: string[]): Observable<void> {
    return defer(() => {
      if (ids.length === 0) {
        return of(undefined);
      }
      return from(
        this.transaction(async executor => {
          const { tableName } = this.#resolveQueryCacheTarget(entityName);
          for (const idsChunk of chunkBySqliteBindLimit(ids)) {
            const placeholders = idsChunk.map(() => '?').join(', ');
            const sql = `DELETE FROM ${quote_sql_identifier(tableName)} WHERE id IN (${placeholders})`;
            await executor.query(sql, idsChunk);
          }
        }, false).then(() => undefined)
      );
    });
  }

  /**
   * 就绪门：**必须在获取队列槽位之前调用，绝不能在队列任务内部调用**。
   *
   * @remarks
   * 队列并发度为 1。在临界区里等 `RxDB.connect()` 会成环：`RxDB.connect()` 的首装路径要靠
   * 队列后方的水位线事务才能完成，而那个事务永远拿不到被占住的槽位（实测轨迹见设计文档 §1.2）。
   *
   * 门等的是**整个 `RxDB.connect()`**，不是「本适配器的 client 连上了没」。两者之间隔着建表、
   * 系统迁移与水位线；曾经按 client 状态放行，于是这段窗口内到达的外部写直接打在还没建出来的
   * 表上（`no such table`）。`RxDB.connect()` 自身按名字缓存 promise，已完成时这里只是多一次
   * 微任务跳转。
   *
   * 引导链路自己**不得**走这道门（那是等自己），一律经 {@link bootstrapTransaction}。
   */
  protected ready(): Promise<void> {
    return this.rxdb.connect(this.name).then(() => undefined);
  }

  /**
   * 把 QueryCache 传入的**逻辑实体名**解析为物理表名与 `updatedAt` 的实际列名。
   *
   * @remarks
   * 本包所有物理表名都由 `get_table_name(name, namespace) => \`${namespace}$${name}\`` 生成，
   * 而 `QueryCacheRepository` 传进来的是逻辑实体名（如 `'Todo'`）。直接把它当表名用，
   * 真机执行必然 `no such table: Todo`。`updatedAt` 同理要经 `propertyMap` 映射，
   * 否则自定义 `columnName` 的实体会再次失败。与 PGlite 适配器的同名方法保持一致。
   *
   * metadata 查不到时按原名回退（调用方可能直接传物理表名），不擅自拼 namespace 前缀。
   */
  #resolveQueryCacheTarget(entityName: string): {
    tableName: string;
    idColumn: string;
    updatedAtColumn: string;
    columnNames: ReadonlyMap<string, string>;
  } {
    const metadata = this.rxdb.schemaManager.getEntityMetadata(entityName, 'public');
    if (!metadata) {
      return { tableName: entityName, idColumn: 'id', updatedAtColumn: 'updatedAt', columnNames: new Map() };
    }
    return {
      tableName: get_table_name_by_metadata(metadata),
      idColumn: metadata.propertyMap?.get('id')?.columnName ?? 'id',
      updatedAtColumn: metadata.propertyMap?.get('updatedAt')?.columnName ?? 'updatedAt',
      columnNames: new Map(
        Array.from(metadata.propertyMap?.entries() ?? [], ([name, property]) => [name, property.columnName])
      )
    };
  }

  /**
   * 读当前分支 id，供事务日志的 `switch_transaction_id` 使用。
   *
   * @remarks
   * 语义对齐 `VersionManager.getCurrentBranch()`：先取 `activated` 的分支，没有则回退 `main`。
   * 必须经 executor 读 —— 理由见调用点。
   */
  async #readCurrentBranchId(executor: SqliteTransactionExecutor): Promise<string> {
    const metadata = getEntityMetadata(RxDBBranch);
    const table = quote_sql_identifier(get_table_name_by_metadata(metadata));
    const idColumn = quote_sql_identifier(metadata.propertyMap?.get('id')?.columnName ?? 'id');
    const activatedColumn = quote_sql_identifier(metadata.propertyMap?.get('activated')?.columnName ?? 'activated');

    // 直发 SQL 而不经仓库：仓库的 addQueryCache 要做实体水合（需要 entityManager），
    // 而这里只要一个 id。少一层依赖，也让适配器单测不必搭出完整的 RxDB。
    const readId = async (whereSql: string, params: SQLiteCompatibleType[]): Promise<string | undefined> => {
      const result = await executor.query(`SELECT ${idColumn} FROM ${table} WHERE ${whereSql} LIMIT 1;`, params);
      const columnIndex = Math.max(0, result.columns.indexOf(idColumn.replaceAll('"', '')));
      const value = result.rows[0]?.[columnIndex];
      return typeof value === 'string' ? value : undefined;
    };

    const activated = await readId(`${activatedColumn} = ?`, [1]);
    if (activated !== undefined) return activated;

    const main = await readId(`${idColumn} = ?`, ['main']);
    if (main !== undefined) return main;

    throw new RxDBAdapterSqliteError('currentBranch is undefined! Cannot start transaction with logging.');
  }

  #initEncryption(): void {
    let hasEncryptedColumns = false;
    const entities = this.rxdb.config.entities ?? [];
    for (const EntityType of entities) {
      const metadata = getEntityMetadata(EntityType);
      validateEncryptedPropertyMetadata(metadata);
      if (metadata.encryptedPropertyMap && metadata.encryptedPropertyMap.size > 0) {
        hasEncryptedColumns = true;
      }
    }
    if (hasEncryptedColumns && !this.#keyring) {
      this.#keyring = createKeyring({
        namespace: this.rxdb.config.dbName,
        storage: new SqliteCoreKeyringStorage(this)
      });
    }
  }

  #noEncryptedColumnsError(method: string): EncryptedConfigurationError {
    return new EncryptedConfigurationError({
      code: 'no_encrypted_columns',
      message: `adapter.encryption.${method} called but no entity declares an encrypted column`
    });
  }

  #client(): Promise<SqliteClientLike> {
    if (!this.#client_promise) {
      this.#client_promise = (async () => {
        let client: SqliteClientLike | undefined;
        try {
          client = await this.createClient();
          await this.#ensureClientEventListeners(client);
          this.#cached_client = client;
          return client;
        } catch (err) {
          this.#cached_client = undefined;
          this.#listeners_registered = false;
          if (client) {
            try {
              await client.disconnect();
            } catch {
              // 忽略清理错误，保留原始失败信息
            }
          }
          this.#client_promise = undefined;
          throw err;
        }
      })();
    }
    return this.#client_promise;
  }

  async #internal_exec(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> {
    const client = await this.#client();
    return await client.execute(sql, bindings);
  }

  async #invalidateClient(client: SqliteClientLike): Promise<void> {
    this.#is_disconnected = true;
    this.#cached_client = undefined;
    this.#client_promise = undefined;
    this.#listeners_registered = false;
    await client.disconnect();
  }

  // query() 的实际执行体：client → execute。
  // 这里**不再** await rxdb.connect()：该等待已上移到 query()/transaction() 的入队之前
  // （见 ready()）。留在这里等价于在队列临界区内等待，会复现首装死锁。
  async #exec(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> {
    if (this.#is_disconnected) {
      throw new RxDBAdapterSqliteError('Adapter is disconnected', { code: 'adapter_disconnected' });
    }
    const client = await this.#client();
    return client.execute(sql, bindings);
  }

  // transaction() 的实际执行体，由 #queue 串行调度（见 transaction() 注释）。
  async #run_transaction<T extends TransactionFun>(
    transactionFun: T,
    transactionLog: boolean
  ): Promise<Awaited<ReturnType<T>>> {
    if (this.#is_disconnected) {
      throw new RxDBAdapterSqliteError('Adapter is disconnected', { code: 'adapter_disconnected' });
    }
    this.#assertWriterLeaseWritable();
    // 同 #exec：就绪等待已上移到 transaction() 的入队之前，不能留在临界区内
    const client = await this.#client();
    let transactionMayBeActive = false;
    let committed = false;
    let executor: SqliteTransactionExecutor | undefined;

    // 事务事件带上本次事务的身份（RXD-062）。此前用的是三个模块级单例事件，RxDB 侧
    // 只能靠一个全局深度计数认亲：两个适配器并发 BEGIN 会被当成嵌套，其中一个回滚就
    // 清空了另一个的挂起队列。身份必须在 BEGIN 之前定好，且 BEGIN/COMMIT/ROLLBACK 同用一个。
    const transactionEventId = uuid();

    let log_begin = '';
    let log_commit = '';
    try {
      this.rxdb.dispatchEvent(new TransactionBeginEvent(transactionEventId));

      executor = new SqliteTransactionExecutor(this, client, uuid());

      if (transactionLog) {
        const transactionId = uuid();
        // 这次读**必须**经 executor。`versionManager.getCurrentBranch()` 走
        // `branchRepository.find()` → `adapter.query()`，而本函数已经跑在 `#queue.addTask`
        // 的事务任务里（并发度 1）—— 翻转后 `query()` 一律重新入队，会排在自己身后永久挂起。
        // 而 `transactionLog` 默认 true，于是**每一个默认事务**都会挂，不是边缘场景。
        // 绊线门禁：`rxdb-adapter-sqlite-wasm/src/__tests__/transaction-log-prelude.spec.ts`。
        //
        // executor 此刻已建但 BEGIN 尚未发出，这次读跑在 autocommit 下 —— 与翻转前
        // 走快路径的实际行为一致。
        const currentBranchId = await this.#readCurrentBranchId(executor);
        log_begin = switch_transaction_id(this, currentBranchId, transactionId);
        log_commit = switch_transaction_id(this, currentBranchId);
      }

      const beginSql = (await client.beginTransactionSql?.()) ?? 'BEGIN;';
      transactionMayBeActive = true;
      await client.execute(`${beginSql}\nPRAGMA defer_foreign_keys = ON;`);
      if (this.#writer_lease_state === 'starting' || this.#writer_lease_state === 'active') {
        try {
          await this.#renewWriterLease(client);
        } catch (error) {
          this.#handleWriterLeaseError(error);
          throw error;
        }
      }
      if (log_begin) await client.execute(log_begin);

      // 传 executor 而非裸 client：持有它才算「在本事务内」。executor 保留 execute() 透传，
      // 既有的 `transaction(async tx => tx.execute(sql))` 写法不受影响。
      const result = await transactionFun(executor);
      await client.execute(`${log_commit}\nCOMMIT;`);
      committed = true;
      // 提交已成功落库，事务到此结束。监听器抛错属于监听器自身的缺陷，就地记录并继续 ——
      // 让它冒泡会触发下面的 ROLLBACK、并把已提交的事务报成失败（与 sqlite-wasm
      // 的 #dispatch_group 同一策略）。
      try {
        this.rxdb.dispatchEvent(new TransactionCommitEvent(transactionEventId));
      } catch (listenerError) {
        console.error('[rxdb-adapter-sqlite-core] TRANSACTION_COMMIT listener threw:', listenerError);
      }
      return result as Awaited<ReturnType<T>>;
    } catch (error: unknown) {
      // 必须带 !committed：COMMIT 之后再发 ROLLBACK 无事务可回滚，只会留下一行误导性日志
      if (transactionMayBeActive && !committed) {
        try {
          await client.execute('ROLLBACK');
        } catch (rollbackError) {
          console.error('[rxdb-adapter-sqlite-core] ROLLBACK failed after transaction error:', rollbackError);
          try {
            await this.#invalidateClient(client);
          } catch (disconnectError) {
            console.error(
              '[rxdb-adapter-sqlite-core] Failed to discard client after ROLLBACK failure:',
              disconnectError
            );
          }
        }
      }
      if (!committed) {
        try {
          this.rxdb.dispatchEvent(new TransactionRollbackEvent(transactionEventId));
        } catch (listenerError) {
          console.error('[rxdb-adapter-sqlite-core] TRANSACTION_ROLLBACK listener threw:', listenerError);
        }
      }
      const message = error instanceof Error ? error.message : 'Transaction Error';
      throw new RxDBAdapterSqliteError(message, { cause: error });
    } finally {
      // executor 必须自持状态并在这里翻成终态：逃逸出事务体后再使用它要能立刻抛错，
      // 而不是静默落到一个已提交/已回滚的连接上继续写。
      executor?.settle(committed ? 'committed' : 'rolled-back');
    }
  }

  async #ensureClientEventListeners(client: SqliteClientLike): Promise<void> {
    if (this.#listeners_registered || this.#is_disconnected) {
      return;
    }

    try {
      await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, this.#sqlite_change_handler);
      await client.addEventListener(SQLiteChangeType.SQLITE_UPDATE, this.#sqlite_change_handler);
      await client.addEventListener(SQLiteChangeType.SQLITE_DELETE, this.#sqlite_change_handler);
      this.#listeners_registered = true;
    } catch (err) {
      throw new RxDBAdapterSqliteError('Failed to register SQLite change listeners', { cause: err });
    }
  }

  async #ensureWriterProtocol(
    execute: (sql: string, bindings?: SQLiteCompatibleType[]) => Promise<unknown>
  ): Promise<void> {
    await execute(`
      CREATE TABLE IF NOT EXISTS ${UPGRADE_GUARD_TABLE} (
        "databaseId" TEXT PRIMARY KEY NOT NULL,
        "epoch" INTEGER NOT NULL,
        "state" TEXT NOT NULL,
        "ownerId" TEXT,
        "ownerExpiresAt" TEXT,
        "minProtocol" INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ${WRITER_LEASE_TABLE} (
        "databaseId" TEXT NOT NULL,
        "writerId" TEXT NOT NULL,
        "protocolVersion" INTEGER NOT NULL,
        "epoch" INTEGER NOT NULL,
        "lastSeenAt" TEXT NOT NULL,
        "expiresAt" TEXT NOT NULL,
        PRIMARY KEY ("databaseId", "writerId")
      );
      CREATE INDEX IF NOT EXISTS "rxdb_writer_lease_expires_at"
        ON ${WRITER_LEASE_TABLE} ("databaseId", "expiresAt");
    `);
    await execute(
      `INSERT OR IGNORE INTO ${UPGRADE_GUARD_TABLE}
       ("databaseId", "epoch", "state", "ownerId", "ownerExpiresAt", "minProtocol")
       VALUES (?, 1, 'open', NULL, NULL, ?)`,
      [this.rxdb.config.dbName, RXDB_WRITER_PROTOCOL_VERSION]
    );
  }

  async #assertWriterProtocolTables(client: SqliteClientLike): Promise<void> {
    const result = await client.execute(
      `SELECT "name" FROM "sqlite_master"
       WHERE "type" = 'table' AND "name" IN (?, ?)`,
      [UPGRADE_GUARD_TABLE_NAME, WRITER_LEASE_TABLE_NAME]
    );
    const existingTables = new Set(
      result.results.flatMap(item => item.rows).flatMap(row => (typeof row[0] === 'string' ? [row[0]] : []))
    );
    const missingTables = [UPGRADE_GUARD_TABLE_NAME, WRITER_LEASE_TABLE_NAME].filter(
      tableName => !existingTables.has(tableName)
    );
    if (missingTables.length > 0) {
      throw new RxDBWriterLeaseError(
        'writer_guard_missing',
        `RxDB writer protocol table(s) missing: ${missingTables.join(', ')}.`
      );
    }
  }

  async #renewWriterLease(client: SqliteClientLike): Promise<void> {
    const guardResult = await client.execute(
      `SELECT "epoch", "state", "minProtocol" FROM ${UPGRADE_GUARD_TABLE} WHERE "databaseId" = ?`,
      [this.rxdb.config.dbName]
    );
    const row = guardResult.results[0]?.rows[0];
    const epoch = resolveRxDBWriterEpoch(
      row && { epoch: row[0], state: row[1], minProtocol: row[2] },
      RXDB_WRITER_PROTOCOL_VERSION,
      this.#writer_epoch
    );
    const renewed = await client.execute(
      `INSERT INTO ${WRITER_LEASE_TABLE}
       ("databaseId", "writerId", "protocolVersion", "epoch", "lastSeenAt", "expiresAt")
       SELECT ?, ?, ?, "epoch",
              strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
              strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
       FROM ${UPGRADE_GUARD_TABLE}
       WHERE "databaseId" = ? AND "state" = 'open' AND "epoch" = ? AND "minProtocol" <= ?
       ON CONFLICT ("databaseId", "writerId") DO UPDATE SET
         "protocolVersion" = excluded."protocolVersion",
         "epoch" = excluded."epoch",
         "lastSeenAt" = excluded."lastSeenAt",
         "expiresAt" = excluded."expiresAt"`,
      [
        this.rxdb.config.dbName,
        this.#writer_id,
        RXDB_WRITER_PROTOCOL_VERSION,
        `+${String(RXDB_WRITER_LEASE_TTL_MS / 1000)} seconds`,
        this.rxdb.config.dbName,
        epoch,
        RXDB_WRITER_PROTOCOL_VERSION
      ]
    );
    if (renewed.rowsAffected !== 1) {
      throw new RxDBWriterLeaseError('writer_fenced', 'RxDB writer lease renewal was rejected by the persisted guard.');
    }
    this.#writer_epoch = epoch;
  }

  #scheduleWriterHeartbeat(): void {
    if (this.#writer_lease_state !== 'active') return;
    this.#writer_heartbeat = setTimeout(() => {
      void this.transaction(async () => undefined, false).then(
        () => this.#scheduleWriterHeartbeat(),
        () => this.#scheduleWriterHeartbeat()
      );
    }, RXDB_WRITER_HEARTBEAT_INTERVAL_MS) as HeartbeatTimer;
    this.#writer_heartbeat.unref?.();
  }

  async #stopWriterLease(hadWriterLease: boolean): Promise<void> {
    if (this.#writer_heartbeat) clearTimeout(this.#writer_heartbeat);
    this.#writer_heartbeat = undefined;
    if (!hadWriterLease || this.#writer_epoch === undefined || !this.#cached_client) return;
    const client = this.#cached_client;
    try {
      await this.#queue.addTask(async () => {
        let started = false;
        try {
          const beginSql = (await client.beginTransactionSql?.()) ?? 'BEGIN;';
          await client.execute(beginSql);
          started = true;
          await client.execute(
            `DELETE FROM ${WRITER_LEASE_TABLE} WHERE "databaseId" = ? AND "writerId" = ? AND "epoch" = ?`,
            [this.rxdb.config.dbName, this.#writer_id, this.#writer_epoch ?? 0]
          );
          await client.execute('COMMIT;');
        } catch (error) {
          if (started) await client.execute('ROLLBACK;');
          throw error;
        }
      });
    } finally {
      this.#writer_epoch = undefined;
    }
  }

  async #waitForChangeTasks(): Promise<void> {
    while (this.#change_tasks.size > 0) {
      await Promise.allSettled([...this.#change_tasks]);
    }
  }

  #assertWriterLeaseWritable(): void {
    if (
      this.#writer_lease_state === 'bootstrap' ||
      this.#writer_lease_state === 'starting' ||
      this.#writer_lease_state === 'active'
    ) {
      return;
    }
    throw new RxDBAdapterSqliteError(`RxDB writer lease is ${this.#writer_lease_state} and requires reconnect.`);
  }

  #handleWriterLeaseError(error: unknown): void {
    if (!(error instanceof RxDBWriterLeaseError)) return;
    this.#writer_lease_state = 'fenced';
    if (this.#writer_heartbeat) clearTimeout(this.#writer_heartbeat);
    this.#writer_heartbeat = undefined;
  }

  #get_row_id_cache_map<T extends EntityType>(EntityType: T) {
    let map = this.#row_id_map.get(EntityType);
    if (!map) {
      map = new Map();
      this.#row_id_map.set(EntityType, map);
    }
    return map;
  }
}
