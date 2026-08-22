import type {
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
  getEntityMetadata,
  getEntityStatus,
  RxDB,
  RxDBAdapterLocalBase,
  RxDBBranch,
  RxDBChange,
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
import type { QueryOptions, Results } from '@electric-sql/pglite';
import { defer, from, map, Observable, of, Subject } from 'rxjs';
import {
  drainPendingChangeHandlers,
  flushPendingChangePipeline,
  trackChangeHandler,
  type ChangePipelineHost
} from './change-pipeline.js';
import generate_entity_deletes_sql from './entity/deletes_sql.js';
import { generate_entity_upserts_sql } from './entity/inserts_sql.js';
import { PgliteKeyringStorage } from './keyring/pglite-keyring-storage.js';
import {
  ADAPTER_NAME,
  PGliteChangeEvent,
  PGliteChangeType,
  PGliteClientOptions,
  PgliteTableColumn
} from './pglite.interface.js';
import { type EncryptionContext, quoteIdentifier, RxdbAdapterPGliteError } from './pglite.utils.js';
import { migrateSystemSchema } from './system/migrate_system_schema.js';
import { IPGliteClient, PGliteClient } from './PGliteClient.js';
import { resolveQueryCacheTarget, resolveUpdatedAtColumn } from './query-cache/query_cache_target.js';
import { buildQueryCacheUpsertStatements } from './query-cache/upsert_many_sql.js';
import { PGliteRepository } from './repository/PGliteRepository.js';
import { PGliteTreeRepository } from './repository/PGliteTreeRepository.js';
import { create_table_indexes_sql } from './table/create_table_sql.js';
import { create_tables_statements } from './table/create_tables_sql.js';
import { generateNotifyInfrastructureSQL, generateNotifyTriggerSQL } from './table/notify_function_sql.js';
import { PGliteTransactionExecutor } from './transaction/PGliteTransactionExecutor.js';
import rxdb_adapter_create_branch from './version/create_branch.js';
import { execute_switch_actions } from './version/execute_switch_actions.js';
import { convertSwitchResultToSql } from './version/switch-result.utils.js';
import { switch_branch } from './version/switch_branch.js';
import rxdb_adapter_switch_transaction_id from './version/switch_transaction_id.js';

/**
 * 适配器生命周期状态。
 *
 * @remarks
 * `bootstrap` 是**引导窗**：`RxDB.connect()` 自身的 promise 尚未 settle，此窗内的
 * `query()` / `rawQuery()` / `createTables()` 必须跳过 `ready()` 就绪门 —— 等它就是等自己。
 * `RxDB.connect()` 建表完成后调 {@link RxDBAdapterPGlite.completeBootstrap} 翻到 `ready`。
 */
type AdapterLifecycleState = 'bootstrap' | 'ready' | 'closing' | 'closed';

export {
  type RxDBChangePipelineTimeoutDiagnostics,
  RxDBChangePipelineTimeoutError
} from './change-pipeline.types.js';

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

  #pipelineHost!: ChangePipelineHost;

  /** 查询任务队列执行器，确保查询按顺序执行 */
  #queue = new AsyncQueueExecutor(1);

  /** 客户端初始化 Promise，确保单例 */
  #client_promise?: Promise<IPGliteClient>;

  /** NOTIFY 基础设施就绪标志，避免重复执行重量级 DDL */
  #notifyInfrastructureReady = false;
  #lifecycle_state: AdapterLifecycleState = 'bootstrap';

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

  constructor(
    rxdb: RxDB,
    private readonly options: PGliteClientOptions
  ) {
    super(rxdb);
    this.#pipelineHost = this.#createPipelineHost();
  }

  /** QueryCache：id → updatedAt。物理定位经 `resolveQueryCacheTarget`（PGL-012）。 */
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

  /** QueryCache upsert。未知键 fail-fast。 */
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

  /** QueryCache 按 id 批量删除。 */
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

  /** 合并远程变更。`disableTriggers` 用于 pull，避免再写 RxDBChange。 */
  async mergeChanges(
    actions: SwitchVersionActions,
    localChanges?: Omit<RxDBChange, 'id'>[],
    disableTriggers = false
  ): Promise<void> {
    const switchAction = await convertSwitchResultToSql(this, actions);
    await execute_switch_actions(this, switchAction, localChanges, disableTriggers);
  }

  /**
   * RxDBChange 序列当前值。
   * 契约对齐 sqlite_sequence：返回最后已用 id；`is_called=false` 时减 1。
   */
  async getRxDBChangeSequence(): Promise<number> {
    const sequenceName = '"rxdb"."rxdb_change_id_seq"';
    const client = await this.#getClient();
    const result = await client.query<{ last_value: number | string; is_called: boolean }>(
      `SELECT last_value, is_called FROM ${sequenceName}`
    );
    if (result.rows.length === 0) {
      return 0;
    }
    const { last_value, is_called } = result.rows[0];
    const lastValue = typeof last_value === 'string' ? parseInt(last_value, 10) : last_value;
    return is_called ? lastValue : lastValue - 1;
  }

  /**
   * 设置 RxDBChange 序列。`sequence` 是最后已用 id；`< 1` 用 `setval(1, false)`。
   */
  async setRxDBChangeSequence(sequence: number): Promise<void> {
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

  /** 按类型分组 UPSERT，再更新实体状态。 */
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
    if (this.#lifecycle_state === 'closed') this.#lifecycle_state = 'bootstrap';
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

  override completeBootstrap(): void {
    if (this.#lifecycle_state === 'bootstrap') this.#lifecycle_state = 'ready';
  }

  /**
   * 断开数据库连接
   *
   * 清理资源并发送销毁信号
   */
  async disconnect(): Promise<void> {
    const client = this.#cached_client ?? (await this.#client_promise?.catch(() => undefined));
    this.#lifecycle_state = 'closing';

    try {
      if (client) {
        this.#detachClientListeners(client);
        try {
          await this.#drainPendingChangeHandlers();
        } finally {
          await client.disconnect();
        }
      }
    } finally {
      this.#cached_client = undefined;
      this.#client_promise = undefined;
      this.#notifyInfrastructureReady = false;
      this.#lifecycle_state = 'closed';
      this.#changeErrors.complete();
    }
  }

  /** 创建分支后冲刷 NOTIFY。 */
  async createBranch(branchId: string, fromChangeId?: number): Promise<InstanceType<typeof RxDBBranch>> {
    const branch = await rxdb_adapter_create_branch(this, branchId, fromChangeId);
    await this.#flushPendingChangePipeline();
    return branch;
  }

  /** 切换分支期间抑制 `rxdb_branch` NOTIFY。 */
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

  /** 尚未实现。 */
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
   * 新建绑定到 `host` 的仓库，不写入缓存。
   * 事务作用域的仓库不能进 `#repository_cache`。
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
   * 创建数据库表。建表走引导链路，不能等就绪门。
   *
   * @param EntityTypes - 实体类型数组
   * @param entities - 初始化数据（可选）
   * @returns 是否成功创建
   */
  async createTables<T extends EntityType>(EntityTypes: T[], entities?: InstanceType<T>[]): Promise<boolean> {
    return this.bootstrapTransaction(async executor => {
      const statements = await create_tables_statements(this, EntityTypes, entities);
      for (const statement of statements) {
        await (executor as PGliteTransactionExecutor).queryRaw(statement);
      }
      for (const tableName of ['rxdb_change', 'rxdb_branch', 'rxdb_migration']) {
        await (executor as PGliteTransactionExecutor).queryRaw(generateNotifyTriggerSQL(tableName));
      }
      return true;
    }, false);
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
    await migrateSystemSchema({
      entities: this.rxdb.config.entities,
      encryptionContext: this.encryptionContext,
      queue: this.#queue,
      suppressedChangeTables: this.#suppressedChangeTables,
      getClient: () => this.#getClient()
    });
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
   * 事务入口。与 query() 共用 `#queue`；就绪等待必须在入队之前。
   * 体内读写必须经回调收到的 executor。
   */
  async transaction<T extends TransactionFun>(
    transactionFun: T,
    transactionLog: boolean = true
  ): Promise<Awaited<ReturnType<T>>> {
    this.#assertWritable();
    await this.ready(); // 与 query() 同口径：就绪等待必须在入队之前
    return this.#queue.addTask(() => this.#run_transaction(transactionFun, transactionLog));
  }

  /**
   * 引导期事务：跳过就绪门。仅限 `RxDB.connect()` 链路。
   *
   * @internal
   */
  override async bootstrapTransaction<T extends TransactionFun>(
    transactionFun: T,
    transactionLog: boolean = true
  ): Promise<Awaited<ReturnType<T>>> {
    this.#assertWritable();
    return this.#queue.addTask(() => this.#run_transaction(transactionFun, transactionLog));
  }

  /**
   * 真实适配器一律新开事务。「已在事务中就复用」由 executor 门面接管。
   */
  async runInTransaction<T extends TransactionFun>(
    transactionFun: T,
    transactionLog: boolean = true
  ): Promise<Awaited<ReturnType<T>>> {
    return this.transaction(transactionFun, transactionLog);
  }

  /** 查询入口。引导窗外走 writeQuery；引导窗就绪后再入队。 */
  public query<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>> {
    if (this.#lifecycle_state !== 'bootstrap') return this.writeQuery<T>(sql, bindings);
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

  /** 原始 SQL。 */
  public async rawQuery(sql: string, params?: unknown[]): Promise<RawQueryResult> {
    return this.transaction(executor => executor.query(sql, params), false);
  }

  /** PGlite live query。调用方负责 unsubscribe。 */
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
   * 就绪门。必须在获取队列槽位之前调用。
   * 等的是整个 `RxDB.connect()`，引导链路走 {@link bootstrapTransaction}。
   */
  protected ready(): Promise<void> {
    return this.rxdb.connect(this.name).then(() => undefined);
  }

  /** PGlite NOTIFY 事件监听器（INSERT/UPDATE/DELETE 共用） */
  readonly #changeListener = (event: PGliteChangeEvent) => {
    void this.#trackChangeHandler(event);
  };

  async #run_transaction<T extends TransactionFun>(
    transactionFun: T,
    transactionLog: boolean
  ): Promise<Awaited<ReturnType<T>>> {
    this.#assertWritable();
    const client = await this.#getClient();
    const transactionId = transactionLog ? crypto.randomUUID() : undefined;

    let executor: PGliteTransactionExecutor | undefined;
    const runTransaction = (): Promise<unknown> =>
      client.transaction(async tx => {
        executor = new PGliteTransactionExecutor(this, tx, transactionId ?? crypto.randomUUID());

        // 延迟外键约束检查到事务提交时
        await tx.query('SET CONSTRAINTS ALL DEFERRED');

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

  #assertWritable(): void {
    if (this.#lifecycle_state === 'bootstrap' || this.#lifecycle_state === 'ready') return;
    throw new RxdbAdapterPGliteError(`RxDB adapter is ${this.#lifecycle_state} and requires reconnect.`);
  }

  #createPipelineHost(): ChangePipelineHost {
    const adapter = this;
    return {
      adapter,
      suppressedChangeTables: adapter.#suppressedChangeTables,
      pendingChangeHandlers: adapter.#pendingChangeHandlers,
      pendingChangeQueues: adapter.#pendingChangeQueues,
      changeErrors: adapter.#changeErrors,
      get changePipelineGeneration() { return adapter.#changePipelineGeneration; },
      set changePipelineGeneration(v: number) { adapter.#changePipelineGeneration = v; },
      get cachedClient() { return adapter.#cached_client; },
      get clientPromise() { return adapter.#client_promise; }
    };
  }

  #trackChangeHandler(event: PGliteChangeEvent): Promise<void> {
    return trackChangeHandler(this.#pipelineHost, event);
  }

  async #drainPendingChangeHandlers(deadline?: number, createTimeoutError?: () => Error): Promise<void> {
    return drainPendingChangeHandlers(this.#pipelineHost, deadline, createTimeoutError);
  }

  async #flushPendingChangePipeline(): Promise<void> {
    return flushPendingChangePipeline(this.#pipelineHost);
  }

  /** 绕过队列的内部查询。 */
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

  /** 单例客户端。 */
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
