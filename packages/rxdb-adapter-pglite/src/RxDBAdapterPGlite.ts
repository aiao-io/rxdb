import type {
  EntityMetadata,
  EntityType,
  IRepository,
  IRxDBAdapter,
  RawQueryResult,
  RestoreEntityOptions,
  RxDBMutationsMap,
  SwitchBranchOptions,
  SwitchVersionActions
} from '@aiao/rxdb';
import {
  assertRxDBUpgradeClaimable,
  assertSupportedRxDBSystemVersions,
  createRxDBActiveWriterLeaseError,
  getEntityMetadata,
  getEntityStatus,
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
  RxDBSystemMigrationLockError,
  RxDBWriterLeaseError,
  TransactionFun
} from '@aiao/rxdb';
import {
  createKeyring,
  EncryptedConfigurationError,
  type Keyring,
  type UnlockOptions,
  validateEncryptedPropertyMetadata
} from '@aiao/rxdb-adapter-encrypted';
import { AsyncQueueExecutor } from '@aiao/utils';
import type { QueryOptions, Results, Transaction } from '@electric-sql/pglite';
import { defer, from, map, Observable, of, Subject } from 'rxjs';
import generate_entity_deletes_sql from './entity/deletes_sql.js';
import generate_entity_inserts_sql, { generate_entity_upserts_sql } from './entity/inserts_sql.js';
import { handle_rxdb_change } from './handle_rxdb_change.js';
import { PgliteKeyringStorage } from './keyring/pglite-keyring-storage.js';
import {
  ADAPTER_NAME,
  PGliteChangeEvent,
  PGliteChangeType,
  PGliteClientOptions,
  PgliteTableColumn
} from './pglite.interface.js';
import {
  type EncryptionContext,
  getTableColumnIndexName,
  getTableNameByMetadata,
  quoteIdentifier,
  RxdbAdapterPGliteError,
  rxDBColumnTypeToPGliteTypeIndexName
} from './pglite.utils.js';
import { IPGliteClient, PGliteClient } from './PGliteClient.js';
import { resolveQueryCacheTarget, resolveUpdatedAtColumn } from './query-cache/query_cache_target.js';
import { buildQueryCacheUpsertStatements } from './query-cache/upsert_many_sql.js';
import { PGliteRepository } from './repository/PGliteRepository.js';
import { PGliteTreeRepository } from './repository/PGliteTreeRepository.js';
import generate_table_create_sql, { create_table_indexes_sql } from './table/create_table_sql.js';
import { generateNotifyInfrastructureSQL, generateNotifyTriggerSQL } from './table/notify_function_sql.js';
import { remove_trigger_sql } from './table/remove_trigger_sql.js';
import generate_trigger_sql from './table/trigger_sql.js';
import { PGliteTransactionExecutor } from './transaction/PGliteTransactionExecutor.js';
import rxdb_adapter_create_branch from './version/create_branch.js';
import { execute_switch_actions } from './version/execute_switch_actions.js';
import { convertSwitchResultToSql } from './version/switch-result.utils.js';
import { switch_branch } from './version/switch_branch.js';
import rxdb_adapter_switch_transaction_id from './version/switch_transaction_id.js';

type HeartbeatTimer = ReturnType<typeof setTimeout> & { unref?: () => void };
type WriterLeaseState = 'bootstrap' | 'starting' | 'active' | 'fenced' | 'closing' | 'closed';
type SystemMigrationOutcome = 'current' | 'migrated' | 'active-writer' | 'storage-peer';
const CHANGE_PIPELINE_TIMEOUT_MS = 2_000;

export interface RxDBChangePipelineTimeoutDiagnostics {
  readonly pendingEvents: number;
  readonly pendingHandlers: number;
  readonly attempts: number;
  readonly generation: number;
  readonly timeoutMs: number;
}

export class RxDBChangePipelineTimeoutError extends RxdbAdapterPGliteError {
  readonly diagnostics: RxDBChangePipelineTimeoutDiagnostics;

  constructor(diagnostics: RxDBChangePipelineTimeoutDiagnostics, cause: Error) {
    super(
      `PGlite change pipeline did not become idle within ${diagnostics.timeoutMs}ms`,
      'CHANGE_PIPELINE_TIMEOUT',
      cause
    );
    this.name = 'RxDBChangePipelineTimeoutError';
    this.diagnostics = diagnostics;
    Object.setPrototypeOf(this, RxDBChangePipelineTimeoutError.prototype);
  }
}

interface UpgradeGuardRow {
  epoch: number;
  state: string;
  ownerId: string | null;
  ownerExpiresAt: Date | null;
  minProtocol: number;
  ownerActive: boolean;
}

/**
 * 暴露在 `adapter.encryption` 上的开发者门面，内部转发给 `Keyring`。
 * 如果数据库中没有实体声明加密列，所有方法都会抛
 * `EncryptedConfigurationError(code: 'no_encrypted_columns')`。
 */
export interface AdapterEncryptionFacade {
  unlock(opts: UnlockOptions): Promise<void>;
  lock(): void;
  readonly isLocked: boolean;
  readonly lockChange$: Observable<boolean>;
}

/**
 * RxDB PGlite 适配器
 *
 * 基于 PGlite（WebAssembly PostgreSQL）的本地存储适配器
 * 提供完整的关系型数据库功能，包括：
 * - 实体持久化和查询
 * - 事务管理
 * - 分支管理（用于多版本数据管理）
 * - 变更历史追踪
 */
export class RxDBAdapterPGlite extends RxDBAdapterLocalBase implements IRxDBAdapter {
  /** 变更事件异步处理失败，供同步状态和 UI 订阅。 */
  #changeErrors = new Subject<Error>();

  /** 仓库实例缓存，避免重复创建 */
  #repository_cache = new Map<EntityType, IRepository<EntityType>>();

  /** PGlite 客户端缓存 */
  #cached_client?: IPGliteClient;

  /** 正在执行的 NOTIFY 事件处理任务 */
  #pendingChangeHandlers = new Set<Promise<void>>();

  /** 按 tableName 串行化的 NOTIFY 事件队列，避免同表事件乱序分发 */
  #pendingChangeQueues = new Map<string, Promise<void>>();

  /** 每次登记新的 change handler 时单调递增。 */
  #changePipelineGeneration = 0;

  /** 由显式业务事件接管期间，不再重复处理对应表的 NOTIFY。 */
  #suppressedChangeTables = new Set<string>();

  /** 查询任务队列执行器，确保查询按顺序执行 */
  #queue = new AsyncQueueExecutor(1);

  /** 客户端初始化 Promise，确保单例 */
  #client_promise?: Promise<IPGliteClient>;

  /** NOTIFY 基础设施就绪标志，避免重复执行重量级 DDL */
  #notifyInfrastructureReady = false;
  readonly #writer_id = crypto.randomUUID();
  readonly #upgrade_owner_id = crypto.randomUUID();
  #writer_epoch?: number;
  #writer_lease_state: WriterLeaseState = 'bootstrap';
  #writer_lease_start?: Promise<void>;
  #writer_heartbeat?: HeartbeatTimer;

  /** 加密 keyring（仅当至少一个 entity 声明加密列时初始化） */
  #keyring: Keyring | null = null;

  /** 缓存的加密 facade 实例 */
  #encryption_facade?: AdapterEncryptionFacade;

  /** 适配器名称 */
  name: string = ADAPTER_NAME;

  /** PGlite NOTIFY 变更处理错误流。 */
  readonly changeErrors$ = this.#changeErrors.asObservable();

  get encryptionContext(): EncryptionContext {
    return {
      keyring: this.#keyring,
      namespace: this.rxdb.config.dbName,
      resolveEntityMetadata: (entity, namespace) => this.rxdb.schemaManager.getEntityMetadata(entity, namespace)
    };
  }

  get encryption(): AdapterEncryptionFacade {
    if (this.#encryption_facade) return this.#encryption_facade;
    const getKeyring = (method: string): Keyring => {
      if (!this.#keyring) throw this.#noEncryptedColumnsError(method);
      return this.#keyring;
    };
    const facade: AdapterEncryptionFacade = {
      unlock: async (opts: UnlockOptions): Promise<void> => getKeyring('unlock').unlock(opts),
      lock: (): void => getKeyring('lock').lock(),
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

  /**
   * 构造函数
   *
   * @param rxdb - RxDB 实例
   * @param options - PGlite 客户端配置选项
   */
  constructor(
    rxdb: RxDB,
    private readonly options: PGliteClientOptions
  ) {
    super(rxdb);
  }

  // QueryCache 方法
  //
  // 三个方法的物理定位一律经 `resolveQueryCacheTarget`：调用方给的是**逻辑实体名**，
  // 表名、schema、主键列名都要从 metadata 推。旧实现写死 `'public'` 并在查不到
  // metadata 时回退裸表名，非 public namespace 的实体因此永远找错表（PGL-012）。

  /**
   * 批量获取实体元数据（QueryCache 专用）
   *
   * 返回 id → updatedAt 的映射，用于 diffMetadata 对比。
   *
   * @param entityName - 实体名称（不含 schema），或 `namespace:entity` 显式限定名
   * @param ids - 要查询的 ID 列表
   * @returns Observable<Map<string, string>> - id → updatedAt 映射
   * @throws {RxdbAdapterPGliteError} 实体未配置、重名，或没有 `updatedAt` 属性
   */
  getMetadataByIds(entityName: string, ids: string[]): Observable<Map<string, string>> {
    return defer(() => {
      if (ids.length === 0) {
        return of(new Map<string, string>());
      }
      const target = resolveQueryCacheTarget(this.rxdb, entityName);
      const idColumn = quoteIdentifier(target.idColumn);
      const updatedAtColumn = quoteIdentifier(resolveUpdatedAtColumn(target));
      // PostgreSQL 使用 = ANY($1) 语法，支持参数化数组
      const sql = `SELECT ${idColumn} AS id, ${updatedAtColumn} AS "updatedAt" FROM ${target.tableName} WHERE ${idColumn} = ANY($1)`;
      return from(this.query(sql, [ids])).pipe(
        map(result => {
          const metadataMap = new Map<string, string>();
          for (const row of result.rows as { id: string; updatedAt: string }[]) {
            metadataMap.set(row.id, row.updatedAt);
          }
          return metadataMap;
        })
      );
    });
  }

  /**
   * 批量更新或插入实体（QueryCache 专用）
   *
   * 使用 INSERT ... ON CONFLICT DO UPDATE 实现 upsert 语义。
   *
   * @remarks
   * 行内键名可以是 JS 属性名，也可以是物理列名（远端适配器 `select('*')` 的返回形态），
   * 两者都经 metadata 映射到物理列并做类型转换与加密。**不属于该实体的键会 fail-fast**，
   * 不会进入 SQL 结构；异构行按各自的列集合分组，互不截断。
   *
   * @param entityName - 实体名称（不含 schema），或 `namespace:entity` 显式限定名
   * @param data - 要写入的数据数组
   * @returns Observable<void>
   * @throws {RxdbAdapterPGliteError} 实体未配置、重名，或行内存在未知键
   */
  upsertMany<T>(entityName: string, data: T[]): Observable<void> {
    return defer(() => {
      if (data.length === 0) {
        return of(undefined);
      }
      return from(
        this.transaction(async executor => {
          const target = resolveQueryCacheTarget(this.rxdb, entityName);
          const statements = await buildQueryCacheUpsertStatements(
            target,
            data as readonly object[],
            this.encryptionContext
          );
          for (const statement of statements) {
            await executor.query(statement.sql, statement.params);
          }
        }, false).then(() => undefined)
      );
    });
  }

  /**
   * 批量删除实体（QueryCache 专用）
   *
   * @param entityName - 实体名称（不含 schema），或 `namespace:entity` 显式限定名
   * @param ids - 要删除的 ID 列表
   * @returns Observable<void>
   * @throws {RxdbAdapterPGliteError} 实体未配置或重名
   */
  deleteByIds(entityName: string, ids: string[]): Observable<void> {
    return defer(() => {
      if (ids.length === 0) {
        return of(undefined);
      }
      const target = resolveQueryCacheTarget(this.rxdb, entityName);
      // PostgreSQL 使用 = ANY($1) 语法，支持参数化数组
      const sql = `DELETE FROM ${target.tableName} WHERE ${quoteIdentifier(target.idColumn)} = ANY($1)`;
      return from(this.transaction(executor => executor.query(sql, [ids]), false).then(() => undefined));
    });
  }

  async mutations<T extends EntityType>(mutations: RxDBMutationsMap<T>): Promise<InstanceType<T>[]> {
    return this.transaction(executor => executor.mutations(mutations));
  }

  /**
   * 合并远程变更到本地实体表
   *
   * 用于同步时应用远程变更到本地数据库，支持禁用触发器以避免产生本地变更记录
   *
   * @param actions - 需要执行的变更操作（插入、更新、删除）
   * @param localChanges - pglite 适配器中未使用（保留以保持接口兼容性）
   * @param disableTriggers - 是否禁用触发器（用于 pull 等操作，避免创建 RxDBChange）
   */
  async mergeChanges(
    actions: SwitchVersionActions,
    localChanges?: Omit<RxDBChange, 'id'>[],
    disableTriggers = false
  ): Promise<void> {
    const switchAction = await convertSwitchResultToSql(this, actions);
    await execute_switch_actions(this, switchAction, localChanges, disableTriggers);
  }

  /**
   * 获取 RxDBChange 表当前序列值
   *
   * 用于同步时获取本地变更序列的当前值，以便确定需要推送到远程的变更范围。
   *
   * @returns 当前序列值
   */
  async getRxDBChangeSequence(): Promise<number> {
    // PostgreSQL 序列名格式: "schema"."tablename_id_seq"
    // RxDBChange 的 tableName 为 'rxdb_change'
    const sequenceName = '"rxdb"."rxdb_change_id_seq"';
    const client = await this.#getClient();
    const result = await client.query<{ last_value: number | string; is_called: boolean }>(
      `SELECT last_value, is_called FROM ${sequenceName}`
    );
    if (result.rows.length === 0) {
      return 0;
    }
    // PostgreSQL 返回 string 类型的 bigint，需要转换
    const { last_value, is_called } = result.rows[0];
    const lastValue = typeof last_value === 'string' ? parseInt(last_value, 10) : last_value;
    // 契约（与 sqlite_sequence 对齐）：返回值 = 最后已用 id，下一个 id = 返回值 + 1。
    // is_called=false 表示 last_value 尚未被 nextval() 消费（序列初建或 setval(..., false) 后），
    // 此时最后已用 id 是 last_value - 1；不减一会让 HistoryManager 的 redo 失效水位虚高一位，
    // undo 后首个新写入被误判为迟到通知而跳过清栈。
    return is_called ? lastValue : lastValue - 1;
  }

  /**
   * 设置 RxDBChange 表序列值
   *
   * 用于同步时调整本地变更序列值，通常在 pull 操作后更新序列以避免与远程冲突。
   *
   * @param sequence - 要设置的序列值
   */
  async setRxDBChangeSequence(sequence: number): Promise<void> {
    // 契约：sequence = 最后已用 id，下一次 nextval() 必须返回 sequence + 1。
    // setval 第三参 is_called=true 才有该语义（false 会让 nextval 返回 sequence 本身，
    // 与 SQLite 端差一位，导致 undo 后的新写入 id 不越过 redo 失效水位）。
    // 序列名走参数化避免任何拼接，::regclass 显式转换让 PostgreSQL 校验合法性。
    // sequence < 1 低于序列 minvalue，setval 会报越界，改用 setval(1, false)（下一个 id = 1）。
    const sql = sequence >= 1 ? `SELECT setval($1::regclass, $2, true)` : `SELECT setval($1::regclass, 1, false)`;
    const params = sequence >= 1 ? ['rxdb.rxdb_change_id_seq', sequence] : ['rxdb.rxdb_change_id_seq'];
    await this.transaction(executor => executor.query(sql, params), false);
  }
  /**
   * 批量删除实体
   *
   * @param entities - 要删除的实体数组
   * @returns 已删除的实体数组
   */
  async removeMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    if (!entities || entities.length === 0) return Promise.resolve([]);

    const groups = new Map<EntityType, InstanceType<T>[]>();
    for (const e of entities) {
      const type = e.constructor as EntityType;
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(e);
    }

    await this.transaction(async executor => {
      for (const [type, group] of groups) {
        const metadata = getEntityMetadata(type);
        for (const statement of generate_entity_deletes_sql(metadata, group)) {
          await executor.query(statement.sql, statement.params);
        }
      }
    }, false);
    return entities;
  }

  /**
   * 批量保存实体
   *
   * 将实体持久化到数据库：
   * 1. 按实体类型分组（避免混合不同表的数据）
   * 2. 为每个类型生成批量插入 SQL（使用 UPSERT）
   * 3. 在事务中执行（如果尚未在事务中）
   * 4. 更新实体状态标记
   *
   * @param entities - 要保存的实体数组
   * @returns 已保存的实体数组
   */
  async saveMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    if (!entities || entities.length === 0) return Promise.resolve([]);

    // 按实体类型分组，避免混合不同表的数据
    const groups = new Map<EntityType, InstanceType<T>[]>();
    for (const e of entities) {
      const type = e.constructor as EntityType;
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(e);
    }

    // 为每个实体类型依次执行批量插入；仅在尚未处于事务中时包装事务
    await this.transaction(async executor => {
      for (const [EntityType, list] of groups.entries()) {
        const metadata = getEntityMetadata(EntityType);
        // 生成批量插入 SQL（使用 ON CONFLICT DO UPDATE 实现 UPSERT）
        const sql = await generate_entity_upserts_sql(metadata, list, this.rxdb.context, this.encryptionContext);
        await executor.query(sql);
      }
    });
    for (const entity of entities) {
      const status = getEntityStatus(entity);
      status.local = true;
      status.modified = false;
    }
    return entities;
  }

  /**
   * 连接到数据库
   *
   * @returns 适配器实例
   */
  public async connect(): Promise<IRxDBAdapter> {
    if (this.#writer_lease_state === 'closed') this.#writer_lease_state = 'bootstrap';
    this.#initEncryption();
    const client = await this.#getClient();

    // 仅在首次连接时执行 NOTIFY 基础设施 DDL（含 CREATE OR REPLACE FUNCTION 等重量操作）
    if (!this.#notifyInfrastructureReady) {
      const notifySql = generateNotifyInfrastructureSQL();
      await client.exec(notifySql);
      this.#notifyInfrastructureReady = true;
    }

    if (client instanceof PGliteClient) {
      this.#detachClientListeners(client);
      client.addEventListener(PGliteChangeType.INSERT, this.#changeListener);
      client.addEventListener(PGliteChangeType.UPDATE, this.#changeListener);
      client.addEventListener(PGliteChangeType.DELETE, this.#changeListener);
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

  /**
   * 断开数据库连接
   *
   * 清理资源并发送销毁信号
   */
  async disconnect(): Promise<void> {
    const client = this.#cached_client ?? (await this.#client_promise?.catch(() => undefined));
    const previousWriterLeaseState = this.#writer_lease_state;
    this.#writer_lease_state = 'closing';

    try {
      if (client) {
        try {
          await this.#stopWriterLease(
            client,
            previousWriterLeaseState !== 'bootstrap' && previousWriterLeaseState !== 'closed'
          );
        } finally {
          this.#detachClientListeners(client);
          try {
            await this.#drainPendingChangeHandlers();
          } finally {
            await client.disconnect();
          }
        }
      }
    } finally {
      this.#cached_client = undefined;
      this.#client_promise = undefined;
      this.#notifyInfrastructureReady = false;
      this.#writer_lease_state = 'closed';
      this.#changeErrors.complete();
    }
  }

  /**
   * 创建分支
   *
   * 分支用于管理数据的不同版本，类似 Git 分支：
   * 1. 验证分支 ID 不存在
   * 2. 确定源分支（从当前活跃分支或指定变更点）
   * 3. 创建新分支记录
   *
   * @param branchId - 新分支 ID
   * @param fromChangeId - 从指定变更 ID 创建分支（可选，默认从当前分支的最新状态）
   * @throws {RxdbAdapterPGliteError} 分支 ID 已存在或源分支未找到
   */
  async createBranch(branchId: string, fromChangeId?: number): Promise<InstanceType<typeof RxDBBranch>> {
    const branch = await rxdb_adapter_create_branch(this, branchId, fromChangeId);
    await this.#flushPendingChangePipeline();
    return branch;
  }

  /**
   * 切换到指定分支
   *
   * 切换数据库分支，包括更新触发器、执行数据迁移操作和更新分支状态
   *
   * @param options - 分支切换选项，包含目标分支 ID 和可选的数据迁移操作
   * @throws {RxdbAdapterPGliteError} 分支切换失败
   */
  async switchBranch(options: SwitchBranchOptions): Promise<void> {
    this.#suppressedChangeTables.add('rxdb_branch');
    try {
      await this.#flushPendingChangePipeline();
      await switch_branch(this, options);
      await this.#flushPendingChangePipeline();
    } finally {
      this.#suppressedChangeTables.delete('rxdb_branch');
    }
  }

  /**
   * 恢复实体到指定状态
   *
   * 从变更历史中恢复实体到指定的版本
   *
   * @param _entity - 要恢复的实体
   * @param _options - 恢复选项
   * @returns 恢复后的实体
   * @throws {RxdbAdapterPGliteError} 此功能尚未实现
   */
  restoreEntity<T extends EntityType>(
    entity: InstanceType<T>,
    options: RestoreEntityOptions
  ): Promise<InstanceType<T>> {
    void entity;
    void options;
    throw new RxdbAdapterPGliteError('restoreEntity is not yet implemented. ');
  }

  /**
   * 获取 PostgreSQL 版本
   *
   * @returns PostgreSQL 版本字符串
   */
  public async version(): Promise<string> {
    const client = await this.#getClient();
    return await client.version();
  }

  /**
   * 获取实体类型的仓库实例
   *
   * 根据实体元数据中的仓库类型创建相应的仓库实例：
   * - Repository: 通用仓库
   * - TreeRepository: 树形仓库（用于层级数据）
   *
   * 仓库实例会被缓存，避免重复创建
   *
   * @param entity - 实体类型
   * @returns 仓库实例
   * @throws {RxdbAdapterPGliteError} 不支持的仓库类型
   */
  /**
   * 新建一个绑定到 `host` 的仓库，**不写入** `#repository_cache`。
   *
   * @param entity - 实体类型
   * @param host - 仓库要绑定到的适配器（事务场景下是 executor 的门面）
   *
   * @remarks
   * 供 {@link PGliteTransactionExecutor.getRepository} 使用。缓存里的仓库生命周期与适配器
   * 一样长；把事务作用域的仓库写进去，事务结束后它会留在缓存里指向一个已终结的事务上下文，
   * 之后的**外部**写会打到那上面。与 sqlite-core 的同名方法保持一致。
   *
   * @internal
   */
  public createUncachedRepository<T extends EntityType>(entity: T, host: RxDBAdapterPGlite): IRepository<T> {
    const meta = getEntityMetadata(entity);
    switch (meta.repository) {
      case 'Repository':
        return new PGliteRepository<T>(host, entity);
      case 'TreeRepository':
        return new PGliteTreeRepository<T>(host, entity);
      default:
        throw new RxdbAdapterPGliteError('Unsupported repository type: ' + meta.repository);
    }
  }

  public getRepository<T extends EntityType, RT = IRepository<T>>(entity: T): RT {
    if (!this.#repository_cache.has(entity)) {
      const meta = getEntityMetadata(entity);
      let repository: IRepository<T>;
      // 根据元数据中的仓库类型创建相应的仓库实例
      switch (meta.repository) {
        case 'Repository':
          repository = new PGliteRepository<T>(this, entity);
          break;
        case 'TreeRepository':
          repository = new PGliteTreeRepository<T>(this, entity);
          break;
        default:
          throw new RxdbAdapterPGliteError('Unsupported repository type: ' + meta.repository);
      }
      this.#repository_cache.set(entity, repository);
      return repository as unknown as RT;
    }
    return this.#repository_cache.get(entity) as unknown as RT;
  }

  /**
   * 创建数据库表
   *
   * 分三阶段创建表结构：
   * 1. 创建表和列（不含外键约束）
   * 2. 添加外键约束
   * 3. 创建触发器（用于变更追踪）
   *
   * 这样可以避免因表创建顺序导致的外键约束失败
   *
   * @param EntityTypes - 实体类型数组
   * @param entities - 初始化数据（可选）
   * @returns 是否成功创建
   */
  async createTables<T extends EntityType>(EntityTypes: T[], entities?: InstanceType<T>[]): Promise<boolean> {
    const run = async (execute: (sql: string, params?: unknown[]) => Promise<unknown>): Promise<boolean> => {
      const foreignKeyStatements: string[] = [];
      const tableStatements: string[] = [];
      const namespaces = new Set<string>();

      for (const EntityType of EntityTypes) {
        const metadata = getEntityMetadata(EntityType);
        if (metadata.namespace && metadata.namespace !== 'public') namespaces.add(metadata.namespace);
      }
      for (const namespace of namespaces) await execute(`CREATE SCHEMA IF NOT EXISTS "${namespace}"`);

      for (const EntityType of EntityTypes) {
        const metadata = getEntityMetadata(EntityType);
        const statements = generate_table_create_sql(this, metadata)
          .split(/;\s*\n/)
          .map(statement => statement.trim())
          .filter(statement => statement.length > 0 && !statement.startsWith('--'));
        for (const statement of statements) {
          const target =
            statement.includes('ADD CONSTRAINT') && statement.includes('FOREIGN KEY') ?
              foreignKeyStatements
            : tableStatements;
          target.push(statement);
        }
      }

      for (const statement of tableStatements) await execute(statement);
      for (const statement of foreignKeyStatements) await execute(statement);

      for (const EntityType of EntityTypes) {
        const metadata = getEntityMetadata(EntityType);
        if (metadata.log === false) continue;
        const triggerSql = generate_trigger_sql(metadata, {
          resolveEntityMetadata: this.encryptionContext.resolveEntityMetadata
        });
        for (const statement of triggerSql.split('---STATEMENT_SEPARATOR---')) {
          if (statement.trim()) await execute(statement.trim());
        }
      }

      if (entities && entities.length > 0) {
        const entitiesByType = new Map<EntityType, InstanceType<EntityType>[]>();
        for (const entity of entities) {
          const EntityType = entity.constructor as unknown as EntityType;
          const group = entitiesByType.get(EntityType) ?? [];
          group.push(entity);
          entitiesByType.set(EntityType, group);
        }
        for (const [EntityType, entitiesOfType] of entitiesByType) {
          const metadata = getEntityMetadata(EntityType);
          await execute(
            await generate_entity_inserts_sql(metadata, entitiesOfType, this.rxdb.context, this.encryptionContext)
          );
        }
      }

      for (const tableName of ['rxdb_change', 'rxdb_branch', 'rxdb_migration']) {
        await execute(generateNotifyTriggerSQL(tableName));
      }
      return true;
    };

    if (this.#writer_lease_state === 'bootstrap') {
      return this.#queue.addTask(() =>
        this.#run_transaction(async executor => {
          const execute = (sql: string, params?: unknown[]): Promise<unknown> => executor.query(sql, params);
          await run(execute);
          await this.#ensureWriterProtocol(execute);
          return true;
        }, false)
      );
    }
    // 建表也在引导链路上（RxDB.#ensureEntityTables 补建缺失的实体表），同样不能等就绪门；
    // 何况「表就绪」正是本方法要建立的前提，让它反过来等就绪是循环依赖。
    return this.bootstrapTransaction(
      executor => run((sql, params) => (executor as PGliteTransactionExecutor).queryRaw(sql, params)),
      false
    );
  }

  override async reconcileEntityIndexes(EntityTypes: EntityType[]): Promise<void> {
    await this.bootstrapTransaction(async executor => {
      for (const EntityType of EntityTypes) {
        const metadata = getEntityMetadata(EntityType);
        const statements = create_table_indexes_sql(metadata, true)
          .split(/;\s*/)
          .map(statement => statement.trim())
          .filter(Boolean);
        for (const statement of statements) await executor.query(statement);
      }
    }, false);
  }

  override async migrateSystemSchema(): Promise<void> {
    const client = await this.#getClient();
    this.#suppressedChangeTables.add('rxdb_migration');
    try {
      await this.#queue.addTask(async () => {
        const outcome = await client.transaction<SystemMigrationOutcome>(async tx => {
          await this.#assertWriterProtocolTables(tx);
          const tableResult = await tx.query<{ table_schema: string; table_name: string }>(
            `SELECT table_schema, table_name
             FROM information_schema.tables
             WHERE table_type = 'BASE TABLE'`
          );
          const existingTables = new Set(tableResult.rows.map(row => `${row.table_schema}\u0000${row.table_name}`));
          const existingMetadata: EntityMetadata[] = [];
          for (const EntityType of this.rxdb.config.entities) {
            const metadata = getEntityMetadata(EntityType);
            if (existingTables.has(`${metadata.namespace}\u0000${metadata.tableName}`)) {
              existingMetadata.push(metadata);
            }
          }

          const migrationMetadata = getEntityMetadata(RxDBMigration);
          if (!existingTables.has(`${migrationMetadata.namespace}\u0000${migrationMetadata.tableName}`)) {
            throw new RxdbAdapterPGliteError('RxDB system migration table is missing.');
          }

          const migrationTable = getTableNameByMetadata(migrationMetadata);
          const watermarkResult = await tx.query<{ name: string }>(
            `SELECT "name" FROM ${migrationTable}
             WHERE left("name", $1::integer) = $2::text OR left("name", $3::integer) = $4::text`,
            [
              RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX.length,
              RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX,
              RXDB_CHANGE_CODEC_WATERMARK_PREFIX.length,
              RXDB_CHANGE_CODEC_WATERMARK_PREFIX
            ]
          );
          const state = getRxDBSystemVersionState(watermarkResult.rows.map(row => row.name));
          assertSupportedRxDBSystemVersions(state);
          if (isCurrentRxDBSystemVersion(state)) return 'current';

          const guardResult = await tx.query<UpgradeGuardRow>(
            `SELECT "epoch", "state", "ownerId", "ownerExpiresAt", "minProtocol",
                    "ownerExpiresAt" IS NOT NULL AND "ownerExpiresAt" > clock_timestamp() AS "ownerActive"
             FROM "rxdb"."${RXDB_UPGRADE_GUARD_TABLE_NAME}"
             WHERE "databaseId" = $1::text
             FOR UPDATE`,
            [this.rxdb.config.dbName]
          );
          const guard = guardResult.rows[0];
          const epoch = assertRxDBUpgradeClaimable(guard, this.#upgrade_owner_id, RXDB_WRITER_PROTOCOL_VERSION);
          await tx.query(
            `UPDATE "rxdb"."${RXDB_UPGRADE_GUARD_TABLE_NAME}"
             SET "state" = 'draining', "ownerId" = $2::text,
                 "ownerExpiresAt" = clock_timestamp() + make_interval(secs => $3::double precision)
             WHERE "databaseId" = $1::text`,
            [this.rxdb.config.dbName, this.#upgrade_owner_id, RXDB_UPGRADE_OWNER_TTL_MS / 1000]
          );
          const leaseResult = await tx.query<{
            writerId: string;
            protocolVersion: number;
            epoch: number;
            validTtl: boolean;
            active: boolean;
          }>(
            `SELECT "writerId", "protocolVersion", "epoch",
                    "lastSeenAt" IS NOT NULL
                      AND "expiresAt" IS NOT NULL
                      AND "lastSeenAt" <= clock_timestamp() AS "validTtl",
                    "expiresAt" > clock_timestamp() AS "active"
             FROM "rxdb"."${RXDB_WRITER_LEASE_TABLE_NAME}"
             WHERE "databaseId" = $1::text`,
            [this.rxdb.config.dbName]
          );
          let hasActiveWriterLease = false;
          for (const row of leaseResult.rows) {
            const lease = readRxDBWriterLease(row, guard, RXDB_WRITER_PROTOCOL_VERSION);
            if (lease.active && lease.writerId !== this.#writer_id) hasActiveWriterLease = true;
          }
          await tx.query(
            `DELETE FROM "rxdb"."${RXDB_WRITER_LEASE_TABLE_NAME}"
             WHERE "databaseId" = $1::text AND "expiresAt" <= clock_timestamp()`,
            [this.rxdb.config.dbName]
          );
          if (hasActiveWriterLease) return 'active-writer';
          if (client.hasStoragePeer?.() === true) return 'storage-peer';

          try {
            await tx.query(
              `LOCK TABLE ${existingMetadata.map(getTableNameByMetadata).join(', ')} IN ACCESS EXCLUSIVE MODE NOWAIT`
            );
          } catch (cause) {
            throw new RxDBSystemMigrationLockError(cause);
          }

          const migratingGuard = await tx.query<{ epoch: number }>(
            `UPDATE "rxdb"."${RXDB_UPGRADE_GUARD_TABLE_NAME}"
             SET "state" = 'migrating', "epoch" = "epoch" + 1,
                 "ownerExpiresAt" = clock_timestamp() + make_interval(secs => $3::double precision)
             WHERE "databaseId" = $1::text AND "ownerId" = $2::text AND "state" = 'draining'
             RETURNING "epoch"`,
            [this.rxdb.config.dbName, this.#upgrade_owner_id, RXDB_UPGRADE_OWNER_TTL_MS / 1000]
          );
          if (migratingGuard.rows[0]?.epoch !== epoch + 1) {
            throw new RxdbAdapterPGliteError('RxDB upgrade guard ownership changed before migration.');
          }

          const branchMetadata = getEntityMetadata(RxDBBranch);
          let activeBranchId = 'main';
          if (existingTables.has(`${branchMetadata.namespace}\u0000${branchMetadata.tableName}`)) {
            const branchResult = await tx.query<{ id: string }>(
              `SELECT "id" FROM ${getTableNameByMetadata(branchMetadata)}
               WHERE "activated" IS TRUE LIMIT 1`
            );
            activeBranchId = branchResult.rows[0]?.id ?? activeBranchId;
          }

          const loggedMetadata = existingMetadata.filter(metadata => metadata.log !== false);
          for (const metadata of loggedMetadata) {
            for (const statement of remove_trigger_sql(metadata).split('---STATEMENT_SEPARATOR---')) {
              await tx.query(statement.trim());
            }
          }

          const changeMetadata = getEntityMetadata(RxDBChange);
          const columnResult = await tx.query<{ data_type: string }>(
            `SELECT data_type FROM information_schema.columns
             WHERE table_schema = $1::text AND table_name = $2::text AND column_name = 'entityId'`,
            [changeMetadata.namespace, changeMetadata.tableName]
          );
          const entityIdType = columnResult.rows[0]?.data_type;
          if (!entityIdType) {
            throw new RxdbAdapterPGliteError('RxDBChange.entityId column is missing.');
          }
          if (entityIdType !== 'text') {
            if (entityIdType !== 'uuid' && entityIdType !== 'character varying') {
              throw new RxdbAdapterPGliteError(`Unsupported legacy RxDBChange.entityId column type: ${entityIdType}`);
            }
            const changeTable = getTableNameByMetadata(changeMetadata);
            await tx.query(`ALTER TABLE ${changeTable} ALTER COLUMN "entityId" TYPE text USING "entityId"::text`);
          }

          for (const metadata of loggedMetadata) {
            const triggerSql = generate_trigger_sql(metadata, {
              branchId: activeBranchId,
              resolveEntityMetadata: this.encryptionContext.resolveEntityMetadata
            });
            for (const statement of triggerSql.split('---STATEMENT_SEPARATOR---')) {
              await tx.query(statement.trim());
            }
          }

          // RXD-036：给 rxdb_migration."name" 补唯一索引 —— 它是「同一条迁移只跑一次」的仲裁者。
          // 老库在旧实现下可能已经存了重名行（并发实例各写一条），不先去重，建索引这一步会直接失败
          // 并把整个升级卡死。保留最小 id 的那条：它是最先落库的，`executedAt` 也最接近真实执行时刻。
          const nameProperty = migrationMetadata.properties.find(property => property.name === 'name');
          if (!nameProperty) {
            throw new RxdbAdapterPGliteError('RxDBMigration metadata is missing the "name" property.');
          }
          await tx.query(
            `DELETE FROM ${migrationTable}
             WHERE "id" NOT IN (SELECT MIN("id") FROM ${migrationTable} GROUP BY "name")`
          );
          await tx.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdentifier(
              getTableColumnIndexName(migrationMetadata, nameProperty)
            )} ON ${migrationTable}("name" ${rxDBColumnTypeToPGliteTypeIndexName(nameProperty)})`
          );

          for (const watermark of [RXDB_SYSTEM_SCHEMA_WATERMARK, RXDB_CHANGE_CODEC_WATERMARK]) {
            await tx.query(
              `INSERT INTO ${migrationTable} ("name", "executedAt")
               SELECT $1::text, now()
               WHERE NOT EXISTS (SELECT 1 FROM ${migrationTable} WHERE "name" = $1::text)`,
              [watermark]
            );
          }
          await tx.query(`DELETE FROM "rxdb"."${RXDB_WRITER_LEASE_TABLE_NAME}" WHERE "databaseId" = $1::text`, [
            this.rxdb.config.dbName
          ]);
          const openedGuard = await tx.query<{ epoch: number }>(
            `UPDATE "rxdb"."${RXDB_UPGRADE_GUARD_TABLE_NAME}"
             SET "state" = 'open', "ownerId" = NULL, "ownerExpiresAt" = NULL,
                 "minProtocol" = $3::integer
             WHERE "databaseId" = $1::text AND "ownerId" = $2::text AND "state" = 'migrating'
             RETURNING "epoch"`,
            [this.rxdb.config.dbName, this.#upgrade_owner_id, RXDB_WRITER_PROTOCOL_VERSION]
          );
          if (openedGuard.rows[0]?.epoch !== epoch + 1) {
            throw new RxdbAdapterPGliteError('RxDB upgrade guard ownership changed during migration.');
          }
          return 'migrated';
        });
        if (outcome === 'active-writer') throw createRxDBActiveWriterLeaseError();
        if (outcome === 'storage-peer') {
          throw new RxDBSystemMigrationLockError(new Error('Another PGlite client owns the same persistent storage.'));
        }
      });
    } finally {
      this.#suppressedChangeTables.delete('rxdb_migration');
    }
  }

  /**
   * 判断表是否存在
   *
   * @param EntityType - 实体类型
   * @returns 表是否存在
   */
  async isTableExisted(EntityType: EntityType): Promise<boolean> {
    const metadata = getEntityMetadata(EntityType);
    const result = await this.#internal_query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
      WHERE
        table_schema = $1 AND
        table_name = $2);`,
      [metadata.namespace, metadata.tableName]
    );
    return result.rows[0]?.exists;
  }

  /**
   * 获取表的列信息
   *
   * @param EntityType - 实体类型
   * @returns 列信息数组
   */
  public async getTableColumns<T extends EntityType>(EntityType: T): Promise<PgliteTableColumn[]> {
    const metadata = getEntityMetadata(EntityType);
    const result = await this.#internal_query(
      `SELECT * FROM information_schema.columns
    WHERE table_schema = $1
    AND table_name = $2
    ORDER BY ordinal_position;`,
      [metadata.namespace, metadata.tableName]
    );
    return result.rows as PgliteTableColumn[];
  }

  /**
   * 获取本地分支仓库
   *
   * @returns 分支仓库实例
   */
  localRxDBBranch() {
    return this.getRepository<typeof RxDBBranch, PGliteRepository<typeof RxDBBranch>>(RxDBBranch);
  }

  /**
   * 获取本地变更仓库
   *
   * @returns 变更仓库实例
   */
  localRxDBChange() {
    return this.getRepository<typeof RxDBChange, PGliteRepository<typeof RxDBChange>>(RxDBChange);
  }

  /**
   * 执行事务
   *
   * 事务管理策略：
   * - 使用手动 BEGIN/COMMIT/ROLLBACK 控制事务边界
   * - 使用 SET CONSTRAINTS ALL DEFERRED 延迟外键约束检查到提交时
   * - 使用 transaction-local setting 向 trigger 传递 transactionId
   *
   * 并发语义：transaction() 与 query() 共用 #queue（并发度 1）串行通道，因此两个并发的
   * transaction() 一定串行执行，不会交错。事务体内的读写必须经回调收到的 executor；
   * 未持有 executor 的调用一律重新入队，不能被当前事务静默吞并。
   *
   * @param transactionFun - 事务函数
   * @param transactionLog - 是否启用事务日志（默认 true）
   * @returns 事务函数的返回值
   * @throws {RxdbAdapterPGliteError} 事务执行失败
   */
  async transaction<T extends TransactionFun>(
    transactionFun: T,
    transactionLog: boolean = true
  ): Promise<Awaited<ReturnType<T>>> {
    this.#assertWriterLeaseWritable();
    await this.ready(); // 与 query() 同口径：就绪等待必须在入队之前
    return this.#queue.addTask(() => this.#run_transaction(transactionFun, transactionLog));
  }

  /**
   * 引导期事务：与 {@link transaction} 相同，但**跳过就绪门**。
   *
   * @param transactionFun - 事务函数
   * @param transactionLog - 是否启用事务日志（默认 true）
   *
   * @remarks
   * 与 `RxDBAdapterSqliteBase#bootstrapTransaction()` 必须保持同一口径。仅限 `RxDB.connect()`
   * 的引导链路（水位线、建表、迁移）调用 —— 它们跑在 `RxDB.connect()` 的 promise 里，
   * 等就绪门就是等自己。表此刻可能尚未建出，顺序由引导链路自己保证。
   *
   * @internal
   */
  override async bootstrapTransaction<T extends TransactionFun>(
    transactionFun: T,
    transactionLog: boolean = true
  ): Promise<Awaited<ReturnType<T>>> {
    this.#assertWriterLeaseWritable();
    return this.#queue.addTask(() => this.#run_transaction(transactionFun, transactionLog));
  }

  /**
   * 执行**内层工作**：已在事务中就复用当前事务，否则开一个新事务。
   *
   * @param transactionFun - 内层工作
   * @returns 内层工作的返回值
   *
   * @remarks
   * 与 `mutations()` / `query()` 的持锁快路径同形（见 {@link transaction} 的并发语义说明）。
   * **只能用于内层工作**：拿它开语义上独立的并发事务会被静默并进当前事务，
   * 要开独立事务请直接用 {@link transaction}。
   *
   * 存在的理由：编排层（如 `merge_branch` 的 normal 策略）要把 N 次 `mergeChanges`
   * 包进一个事务才有原子性，而 `mergeChanges` 内部又要开事务 —— `transaction()` 无条件入队、
   * 队列并发度为 1，外层持槽内层再入队就是永久等待。
   */
  async runInTransaction<T extends TransactionFun>(
    transactionFun: T,
    transactionLog: boolean = true
  ): Promise<Awaited<ReturnType<T>>> {
    // C2：真实适配器上的 runInTransaction 一律新开事务。「已在事务中就复用」由 executor
    // 门面接管（facade: runInTransaction → executor.run），事务体内的调用方拿到的是门面。
    return this.transaction(transactionFun, transactionLog);
  }

  /**
   * 执行 SQL 查询
   *
   * 查询执行策略：真实适配器入口统一加入串行队列；事务体内查询必须使用 callback executor。
   *
   * @param sql - SQL 语句
   * @param bindings - 参数绑定
   * @returns 查询结果
   */
  public query<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>> {
    if (this.#writer_lease_state !== 'bootstrap') return this.writeQuery<T>(sql, bindings);
    // 否则加入队列，保证并发调用的执行顺序。
    // 就绪等待在**入队之前**完成：留在队列任务里会占着唯一槽位等一个只能由队列后方任务
    // 完成的 promise（首装死锁）。代价是「调用顺序」变成「就绪顺序」——已就绪时两者一致。
    return this.ready().then(() =>
      this.#queue.addTask(async () => {
        const client = await this.#getClient();
        return client.query<T>(sql, bindings);
      })
    );
  }

  public writeQuery<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>> {
    return this.runInTransaction(executor => (executor as PGliteTransactionExecutor).queryRaw<T>(sql, bindings), false);
  }

  /**
   * 内部查询方法 (Public Alias)
   * 供核心同步逻辑使用，绕过队列直接查询。
   */
  public internalQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Results<T>> {
    return this.#internal_query<T>(sql, params);
  }

  /**
   * 执行原始 SQL（IRxDBAdapter 可选方法）
   *
   * 用于条件 UPDATE、INSERT 等需要绕过 ORM 的场景。
   * 使用 `rowMode: 'array'` 让 rows 以数组形式返回，对齐 RawQueryResult 结构。
   *
   * @param sql - SQL 语句
   * @param params - 绑定参数
   * @returns 原始查询结果（行数、行数据、列名）
   */
  public async rawQuery(sql: string, params?: unknown[]): Promise<RawQueryResult> {
    return this.transaction(executor => executor.query(sql, params), false);
  }

  /**
   * 创建 PGlite live query（PGlite 独有特性）
   *
   * 在底层查询结果变化时自动回调，避免 NOTIFY 触发器 + 手动 refetch 的额外逻辑。
   * 适合用户自定义 SQL 场景（聚合、JSONB、全文检索等）。
   *
   * @param sql - 查询语句
   * @param params - 查询参数
   * @param callback - 初始化以及后续结果变更时的回调
   * @returns LiveQuery 对象（含 subscribe/unsubscribe/refresh），由调用方负责 unsubscribe
   *
   * @example
   * ```ts
   * const handle = await adapter.liveQuery(
   *   'SELECT count(*)::int AS total FROM "public"."todo" WHERE completed = $1',
   *   [false],
   *   res => console.log(res.rows[0].total)
   * );
   * // 不再使用时：
   * await handle.unsubscribe();
   * ```
   */
  public async liveQuery<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
    callback?: (results: Results<T>) => void
  ) {
    const client = await this.#getClient();
    if (!(client instanceof PGliteClient)) {
      throw new RxdbAdapterPGliteError('liveQuery is only available on the default PGliteClient implementation.');
    }
    return client.liveQuery<T>(sql, params ?? null, callback);
  }

  /**
   * 就绪门：**必须在获取队列槽位之前调用，绝不能在队列任务内部调用**。
   *
   * @remarks
   * 队列并发度为 1。在临界区里等 `RxDB.connect()` 会成环：`RxDB.connect()` 的首装路径要靠
   * 队列后方的水位线事务才能完成，而那个事务永远拿不到被占住的槽位。
   * 与 `RxDBAdapterSqliteBase#ready()` 必须保持同一口径。
   *
   * 门等的是**整个 `RxDB.connect()`**，不是「本适配器的 client 连上了没」——
   * 两者之间隔着建表与水位线，按 client 状态放行会让这段窗口内到达的外部写打在还没建出来的
   * 表上。引导链路自己一律经 {@link bootstrapTransaction} 绕开本门。
   */
  protected ready(): Promise<void> {
    return this.rxdb.connect(this.name).then(() => undefined);
  }

  /** PGlite NOTIFY 事件监听器（INSERT/UPDATE/DELETE 共用） */
  readonly #changeListener = (event: PGliteChangeEvent) => {
    void this.#trackChangeHandler(event);
  };

  /**
   * transaction() 的实际执行体，由 #queue 串行调度（见 transaction() 注释）
   */
  async #run_transaction<T extends TransactionFun>(
    transactionFun: T,
    transactionLog: boolean
  ): Promise<Awaited<ReturnType<T>>> {
    this.#assertWriterLeaseWritable();
    // 就绪等待已上移到 transaction() 的入队之前，不能留在临界区内（见 ready()）
    const client = await this.#getClient();
    const transactionId = transactionLog ? crypto.randomUUID() : undefined;

    let executor: PGliteTransactionExecutor | undefined;
    const runTransaction = (): Promise<unknown> =>
      client.transaction(async tx => {
        executor = new PGliteTransactionExecutor(this, tx, transactionId ?? crypto.randomUUID());

        // 延迟外键约束检查到事务提交时
        await tx.query('SET CONSTRAINTS ALL DEFERRED');
        if (this.#writer_lease_state === 'starting' || this.#writer_lease_state === 'active') {
          try {
            await this.#renewWriterLease(tx);
          } catch (error) {
            this.#handleWriterLeaseError(error);
            throw error;
          }
        }

        if (transactionLog && transactionId) {
          const statement = rxdb_adapter_switch_transaction_id(transactionId);
          await tx.query(statement.sql, statement.params);
        }

        // 执行事务函数
        // 传 executor：持有它才算「在本事务内」。既有的零参回调不受影响。
        const res = await transactionFun(executor);

        return res as Awaited<ReturnType<T>>;
      });

    try {
      const result = (await runTransaction()) as Awaited<ReturnType<T>>;
      // executor 自持状态：**绝不**从驱动的 tx.closed 派生 —— 该标志在失败路径上不翻转，
      // 逃逸出去的 tx 仍会以 autocommit 执行写入。
      executor?.settle('committed');
      return result;
    } catch (error) {
      executor?.settle('rolled-back');
      throw error;
    }
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
        storage: new PgliteKeyringStorage(this)
      });
    }
  }

  #noEncryptedColumnsError(method: string): EncryptedConfigurationError {
    return new EncryptedConfigurationError({
      code: 'no_encrypted_columns',
      message: `adapter.encryption.${method} called but no entity declares an encrypted column`
    });
  }

  async #ensureWriterProtocol(execute: (sql: string, params?: unknown[]) => Promise<unknown>): Promise<void> {
    await execute(`CREATE SCHEMA IF NOT EXISTS "rxdb"`);
    await execute(`
      CREATE TABLE IF NOT EXISTS "rxdb"."${RXDB_UPGRADE_GUARD_TABLE_NAME}" (
        "databaseId" text PRIMARY KEY,
        "epoch" integer NOT NULL,
        "state" text NOT NULL,
        "ownerId" text,
        "ownerExpiresAt" timestamptz,
        "minProtocol" integer NOT NULL
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS "rxdb"."${RXDB_WRITER_LEASE_TABLE_NAME}" (
        "databaseId" text NOT NULL,
        "writerId" text NOT NULL,
        "protocolVersion" integer NOT NULL,
        "epoch" integer NOT NULL,
        "lastSeenAt" timestamptz NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        PRIMARY KEY ("databaseId", "writerId")
      )
    `);
    await execute(
      `CREATE INDEX IF NOT EXISTS "rxdb_writer_lease_expires_at"
       ON "rxdb"."${RXDB_WRITER_LEASE_TABLE_NAME}" ("databaseId", "expiresAt")`
    );
    await execute(
      `INSERT INTO "rxdb"."${RXDB_UPGRADE_GUARD_TABLE_NAME}"
       ("databaseId", "epoch", "state", "ownerId", "ownerExpiresAt", "minProtocol")
       VALUES ($1::text, 1, 'open', NULL, NULL, $2::integer)
       ON CONFLICT ("databaseId") DO NOTHING`,
      [this.rxdb.config.dbName, RXDB_WRITER_PROTOCOL_VERSION]
    );
  }

  async #assertWriterProtocolTables(tx: Transaction): Promise<void> {
    const result = await tx.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'rxdb' AND table_name IN ($1::text, $2::text)`,
      [RXDB_UPGRADE_GUARD_TABLE_NAME, RXDB_WRITER_LEASE_TABLE_NAME]
    );
    const existingTables = new Set(result.rows.map(row => row.table_name));
    const missingTables = [RXDB_UPGRADE_GUARD_TABLE_NAME, RXDB_WRITER_LEASE_TABLE_NAME].filter(
      tableName => !existingTables.has(tableName)
    );
    if (missingTables.length > 0) {
      throw new RxDBWriterLeaseError(
        'writer_guard_missing',
        `RxDB writer protocol table(s) missing: ${missingTables.join(', ')}.`
      );
    }
  }

  async #renewWriterLease(tx: Transaction): Promise<void> {
    const guardResult = await tx.query<{ epoch: number; state: string; minProtocol: number }>(
      `SELECT "epoch", "state", "minProtocol"
       FROM "rxdb"."${RXDB_UPGRADE_GUARD_TABLE_NAME}"
       WHERE "databaseId" = $1::text
       FOR UPDATE`,
      [this.rxdb.config.dbName]
    );
    const epoch = resolveRxDBWriterEpoch(guardResult.rows[0], RXDB_WRITER_PROTOCOL_VERSION, this.#writer_epoch);
    await tx.query(
      `INSERT INTO "rxdb"."${RXDB_WRITER_LEASE_TABLE_NAME}"
       ("databaseId", "writerId", "protocolVersion", "epoch", "lastSeenAt", "expiresAt")
       VALUES ($1::text, $2::text, $3::integer, $4::integer, clock_timestamp(),
               clock_timestamp() + make_interval(secs => $5::double precision))
       ON CONFLICT ("databaseId", "writerId") DO UPDATE SET
         "protocolVersion" = excluded."protocolVersion",
         "epoch" = excluded."epoch",
         "lastSeenAt" = excluded."lastSeenAt",
         "expiresAt" = excluded."expiresAt"`,
      [this.rxdb.config.dbName, this.#writer_id, RXDB_WRITER_PROTOCOL_VERSION, epoch, RXDB_WRITER_LEASE_TTL_MS / 1000]
    );
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

  async #stopWriterLease(client: IPGliteClient, hadWriterLease: boolean): Promise<void> {
    if (this.#writer_heartbeat) clearTimeout(this.#writer_heartbeat);
    this.#writer_heartbeat = undefined;
    if (!hadWriterLease || this.#writer_epoch === undefined) return;
    try {
      await this.#queue.addTask(() =>
        client.transaction(async tx => {
          await tx.query(
            `DELETE FROM "rxdb"."${RXDB_WRITER_LEASE_TABLE_NAME}"
             WHERE "databaseId" = $1::text AND "writerId" = $2::text AND "epoch" = $3::integer`,
            [this.rxdb.config.dbName, this.#writer_id, this.#writer_epoch ?? 0]
          );
        })
      );
    } finally {
      this.#writer_epoch = undefined;
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
    throw new RxdbAdapterPGliteError(`RxDB writer lease is ${this.#writer_lease_state} and requires reconnect.`);
  }

  #handleWriterLeaseError(error: unknown): void {
    if (!(error instanceof RxDBWriterLeaseError)) return;
    this.#writer_lease_state = 'fenced';
    if (this.#writer_heartbeat) clearTimeout(this.#writer_heartbeat);
    this.#writer_heartbeat = undefined;
  }

  #trackChangeHandler(event: PGliteChangeEvent): Promise<void> {
    if (this.#suppressedChangeTables.has(event.tableName)) return Promise.resolve();
    this.#changePipelineGeneration += 1;
    const queueKey = event.tableName;
    const previousTask = this.#pendingChangeQueues.get(queueKey) ?? Promise.resolve();

    // 合并 task 与 queuedTask 链式声明；.finally 回调内部引用 queuedTask 依赖
    // JavaScript 的 TDZ 规则：回调在赋值之后才会执行，所以下方自引用安全。
    const queuedTask: Promise<void> = previousTask
      .catch(() => undefined)
      .then(() => handle_rxdb_change(this, event))
      .catch((error: unknown) => {
        this.#changeErrors.next(error instanceof Error ? error : new Error(String(error)));
      })
      .finally(() => {
        if (this.#pendingChangeQueues.get(queueKey) === queuedTask) {
          this.#pendingChangeQueues.delete(queueKey);
        }
        this.#pendingChangeHandlers.delete(queuedTask);
      });

    this.#pendingChangeQueues.set(queueKey, queuedTask);
    this.#pendingChangeHandlers.add(queuedTask);

    return queuedTask;
  }

  async #drainPendingChangeHandlers(deadline?: number, createTimeoutError?: () => Error): Promise<void> {
    while (this.#pendingChangeHandlers.size > 0) {
      const settlement = Promise.allSettled(Array.from(this.#pendingChangeHandlers));
      if (deadline === undefined || !createTimeoutError) {
        await settlement;
        continue;
      }
      await this.#awaitChangePipelineOperation(settlement, deadline, createTimeoutError);
    }
  }

  async #flushPendingChangePipeline(): Promise<void> {
    const client = this.#cached_client ?? (await this.#client_promise?.catch(() => undefined));

    const deadline = Date.now() + CHANGE_PIPELINE_TIMEOUT_MS;
    let attempts = 0;
    const createTimeoutError = (): RxDBChangePipelineTimeoutError =>
      this.#createChangePipelineTimeoutError(client, attempts);

    while (true) {
      attempts += 1;
      const generation = this.#changePipelineGeneration;
      const flushed =
        client instanceof PGliteClient ?
          await this.#awaitChangePipelineOperation(client.flushPendingNotifications(), deadline, createTimeoutError)
        : false;
      await this.#drainPendingChangeHandlers(deadline, createTimeoutError);

      const idle = !flushed && this.#pendingChangeHandlers.size === 0 && generation === this.#changePipelineGeneration;
      if (Date.now() >= deadline) throw createTimeoutError();
      if (idle) return;
    }
  }

  async #awaitChangePipelineOperation<T>(
    operation: Promise<T>,
    deadline: number,
    createTimeoutError: () => Error
  ): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw createTimeoutError();

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(createTimeoutError()), remaining);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  #createChangePipelineTimeoutError(
    client: IPGliteClient | undefined,
    attempts: number
  ): RxDBChangePipelineTimeoutError {
    const cause = new Error(`Change pipeline deadline exceeded after ${CHANGE_PIPELINE_TIMEOUT_MS}ms`);
    cause.name = 'TimeoutError';
    return new RxDBChangePipelineTimeoutError(
      {
        pendingEvents: client?.pendingNotificationCount ?? 0,
        pendingHandlers: this.#pendingChangeHandlers.size,
        attempts,
        generation: this.#changePipelineGeneration,
        timeoutMs: CHANGE_PIPELINE_TIMEOUT_MS
      },
      cause
    );
  }

  /**
   * 内部查询方法
   *
   * 直接在客户端上执行查询，不经过队列
   *
   * @param query - SQL 查询
   * @param params - 查询参数
   * @param options - 查询选项
   * @returns 查询结果
   */
  async #internal_query<T>(query: string, params?: unknown[], options?: QueryOptions): Promise<Results<T>> {
    const client = await this.#getClient();
    return client.query(query, params, options);
  }

  /**
   * 解绑 PGlite NOTIFY 事件监听器
   */
  #detachClientListeners(client: IPGliteClient): void {
    if (!(client instanceof PGliteClient)) return;

    for (const changeType of [PGliteChangeType.INSERT, PGliteChangeType.UPDATE, PGliteChangeType.DELETE]) {
      client.removeEventListener(changeType, this.#changeListener);
    }
  }

  /**
   * 获取 PGlite 客户端实例
   *
   * 使用单例模式，确保只创建一个客户端实例
   *
   * @returns PGlite 客户端 Promise
   */
  #getClient(): Promise<IPGliteClient> {
    if (!this.#client_promise) {
      const client = new PGliteClient();
      // 初始化客户端并缓存
      this.#client_promise = client
        .init(this.rxdb.config.dbName, this.options)
        .then(() => {
          this.#cached_client = client;
          return client;
        })
        .catch(err => {
          this.#client_promise = undefined;
          throw err;
        });
    }
    return this.#client_promise!;
  }
}

/**
 * 扩展 RxDBAdapters 接口
 *
 * 将 PGlite 适配器注册到 RxDB 适配器类型系统中
 */
declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterPGlite;
  }
}
