import type { Observable } from 'rxjs';
import { EntityType } from './entity/entity.interface.js';
import type { QueryCacheEntityMetadata } from './entity/metadata-options.interface.js';
import type { RuleGroup } from './repository/query.interface.js';
import { IRepository } from './repository/repository.interface.js';
import { RxDB } from './RxDB.js';
import { RxDBChange } from './system/change.js';
import { IRxDBChange, RemoteChange } from './system/system.interface.js';
import type { TransactionExecutor } from './transaction/transaction-executor.interface.js';
import { SwitchVersionActions } from './version/VersionManager.interface.js';

export interface PullBatchRequest {
  namespace?: string;
  entity: string;
  sinceId: number;
}

export interface RemoteMergeResult {
  maxChangeId?: number;
  changeIdMapping?: Array<{ localId: number; remoteId: number }>;
}

/**
 * 仓库构造函数类型 —— 必须可实例化（具体类），不能是抽象类；支持带额外泛型参数的仓库
 */
export interface RepositoryInstance<T extends EntityType = EntityType> {
  readonly EntityType: T;
}

export interface RepositoryConstructor<RT extends RepositoryInstance = RepositoryInstance> {
  new (...args: never[]): RT;
  new (rxdb: RxDB, EntityType: RT['EntityType']): RT;
}

export type AdapterRepositoryConstructor<
  Adapter extends { readonly rxdb: RxDB } = RxDBAdapterBase,
  RT extends RepositoryInstance = RepositoryInstance
> = new (adapter: Adapter, EntityType: EntityType) => RT;

export interface RxDBMutationsMap<T extends EntityType = EntityType> {
  create: Map<T, Set<InstanceType<T>>>;
  remove: Map<T, Set<InstanceType<T>>>;
  update: Map<T, Set<InstanceType<T>>>;
}

/**
 * 事务回调函数。
 *
 * @remarks
 * 参数是本次事务的 {@link TransactionExecutor} —— 持有它才算「在本事务内」。
 * 零参回调仍然兼容（TS 允许形参更少的函数）。
 */
export type TransactionFun = (executor: TransactionExecutor) => Promise<unknown>;

export interface SwitchBranchOptions {
  branchId: string;
  actions: SwitchVersionActions;
}

export interface RawQueryResult {
  rowsAffected: number;
  rows: unknown[][];
  columns: string[];
}

/**
 * RxDB 数据库适配器接口
 */
export interface IRxDBAdapter {
  readonly name: string;

  connect(): Promise<IRxDBAdapter>;

  disconnect(): Promise<void>;

  version(): Promise<string>;

  getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(EntityType: T): RT;

  saveMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]>;

  removeMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]>;

  /**
   * 批量修改实体（创建/更新/删除）
   */
  mutations<T extends EntityType>(options: RxDBMutationsMap<T>): Promise<InstanceType<T>[]>;

  isTableExisted(EntityType: EntityType): Promise<boolean>;

  /**
   * 执行原始 SQL 查询（条件 UPDATE 等绕过 ORM 的场景）
   */
  rawQuery?(sql: string, params?: unknown[]): Promise<RawQueryResult>;
}

/**
 * 数据库适配器基类
 */
export abstract class RxDBAdapterBase {
  protected readonly repository_map = new Map<string, AdapterRepositoryConstructor<this>>();
  protected readonly repository_cache = new Map<EntityType, RepositoryInstance>();

  constructor(public readonly rxdb: RxDB) {}

  public abstract getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(EntityType: T): RT;

  protected repository<RT extends RepositoryInstance>(
    repositoryName: string,
    RepositoryClass: AdapterRepositoryConstructor<this, RT>
  ): void {
    this.repository_map.set(repositoryName, RepositoryClass);
  }
}

export interface RestoreEntityOptions {
  changeId: string;
}

/**
 * 数据库适配器基类（本地）
 */
export abstract class RxDBAdapterLocalBase extends RxDBAdapterBase {
  /**
   * 在应用迁移或仓储运行前升级 RxDB 拥有的表。
   * 不需要持久化系统 schema 状态的 adapter 保持默认的 no-op 实现。
   */
  migrateSystemSchema(): Promise<void> {
    return Promise.resolve();
  }

  /** 系统表就绪后启动此适配器的持久化 writer lease。 */
  startWriterLease(): Promise<void> {
    return Promise.resolve();
  }

  abstract isTableExisted(EntityType: EntityType): Promise<boolean>;

  abstract transaction<T extends TransactionFun>(fun: T, transactionLog?: boolean): Promise<Awaited<ReturnType<T>>>;
  abstract transaction(fun: TransactionFun, transactionLog?: boolean): Promise<unknown>;

  /**
   * 执行 **引导期**（表结构尚未就绪）的事务。
   *
   * @param fun 事务回调函数
   * @param transactionLog 是否写事务日志。默认 `true`；纯 DDL / 元数据引导应显式传 `false`
   *
   * @remarks
   * 与 {@link transaction} 的唯一区别是**跳过「引导已完成」就绪门**。适配器的就绪门等的正是
   * `RxDB.connect()`，而引导期的调用方就在那个 promise 里面 —— 走 {@link transaction} 会等自己，
   * 永久挂起。此时表可能尚未建出，调用方自己负责顺序。
   *
   * 调用方限于两类：`RxDB.connect()` 自身的引导链路（水位线、建表、迁移），以及
   * **在 `connect()` 内部被安装的插件**（它们的 `install()` 同样跑在那条 promise 里，
   * 见 `@aiao/rxdb-plugin-search` 的 FTS 安装）。业务代码一律用 {@link transaction}。
   *
   * `transactionLog` 必须在这里就能传：引导期的 DDL 不属于任何用户变更，写日志会白白触发
   * 一次分支号读取与全量触发器重建。默认实现直接委托 {@link transaction}，
   * 只有自带就绪门的适配器需要覆写。
   *
   * @internal
   */
  bootstrapTransaction<T extends TransactionFun>(
    fun: T,
    transactionLog?: boolean
  ): Promise<Awaited<ReturnType<T>>> {
    return this.transaction(fun, transactionLog);
  }

  abstract createTables(EntityTypes: EntityType[], entities?: InstanceType<EntityType>[]): Promise<boolean>;

  /** 在用户迁移和缺表补建后幂等收敛实体索引。 */
  reconcileEntityIndexes?(EntityTypes: EntityType[]): Promise<void>;

  abstract switchBranch(options: SwitchBranchOptions): Promise<void>;

  abstract getRxDBChangeSequence(): Promise<number>;

  /**
   * 应用压缩后的变更到本地实体表
   *
   * 实现策略（SQLite）：
   * 1. 将 actions 转换为 SQL 操作
   * 2. 在事务中：
   *    a) 执行 SQL 操作实体表（INSERT/UPDATE/DELETE）
   *    b) 批量插入 localChanges 到 RxDBChange 表（用于历史追踪）
   * 3. 发送本地事件通知 UI 更新
   *
   * @param actions - 压缩后的变更操作集合（从远程 pull 来的）
   * @param localChanges - 需要保存到本地 RxDBChange 表的记录（可选）
   * @param disableTriggers - 是否禁用触发器（用于 pull 等操作，避免创建 RxDBChange）
   */
  abstract mergeChanges(
    actions: SwitchVersionActions,
    localChanges?: Omit<RxDBChange, 'id'>[],
    disableTriggers?: boolean
  ): Promise<number | void>;

  /**
   * 获取指定 ID 列表的元数据（QueryCache 专用）
   *
   * 用于本地缓存新鲜度检查，返回 ID → updatedAt 映射。
   *
   * @param entityName - 实体名称
   * @param ids - 实体 ID 列表
   * @returns Observable<Map<string, string>> - ID → updatedAt 映射
   *
   * @example
   * ```typescript
   * adapter.getMetadataByIds('Product', ['p1', 'p2'])
   *   .subscribe(map => {
   *     // map: Map { 'p1' => '2026-01-12T10:00:00Z', 'p2' => '2026-01-12T09:30:00Z' }
   *   });
   * ```
   */
  abstract getMetadataByIds(entityName: string, ids: string[]): Observable<Map<string, string>>;

  /**
   * 批量 upsert 数据（QueryCache 专用）
   *
   * 执行 INSERT OR REPLACE 语义，用于缓存远程拉取的数据。
   *
   * @param entityName - 实体名称
   * @param data - 要写入的数据列表
   * @returns Observable<void>
   *
   * @example
   * ```typescript
   * adapter.upsertMany('Product', [product1, product2]).subscribe();
   * ```
   */
  abstract upsertMany<T>(entityName: string, data: T[]): Observable<void>;

  /**
   * 按 ID 列表批量删除（QueryCache 专用）
   *
   * 用于清理本地缓存中已被远程删除的数据。
   *
   * @param entityName - 实体名称
   * @param ids - 要删除的 ID 列表
   * @returns Observable<void>
   *
   * @example
   * ```typescript
   * adapter.deleteByIds('Product', ['p1', 'p2']).subscribe();
   * ```
   */
  abstract deleteByIds(entityName: string, ids: string[]): Observable<void>;
}

/**
 * 数据库适配器基类（远程）
 */
export abstract class RxDBAdapterRemoteBase extends RxDBAdapterBase {
  /**
   * 从远程拉取变更记录
   *
   * @param sinceId - 拉取此 ID 之后的变更（不包含该 ID）
   * @param limit - 最大拉取数量
   * @param repositoryFilter - 可选的实体过滤列表（用于 repository-level sync）
   * @param filter - 可选的行级过滤条件（用于 SyncType.Filter）
   * @param branchId - 可选的分支 ID（只拉取该分支的变更）
   * @returns 变更记录数组，按 id ASC 排序
   *
   * @remarks
   * 当提供 filter 参数时，会通过 JOIN 实体表并应用过滤条件，
   * 只返回满足条件的实体对应的变更记录。
   */
  abstract pullChanges(
    sinceId: number,
    limit?: number,
    repositoryFilter?: string[],
    filter?: RuleGroup,
    branchId?: string
  ): Promise<RemoteChange[]>;

  /**
   * 获取远程变更数量（轻量级，不下载数据）
   *
   * 此方法只查询远程有多少新变更，不返回实际数据。
   * 用于实现 checkRepositoryUpdates() 功能，节省带宽。
   *
   * @param sinceId - 起始 changeId（不包含该 ID）
   * @param repositoryFilter - 可选的实体过滤列表
   * @param branchId - 可选的分支 ID（只计数该分支的变更）
   * @returns 变更数量和最新 changeId
   */
  abstract getChangeCount(
    sinceId: number,
    repositoryFilter?: string[],
    branchId?: string
  ): Promise<{
    count: number;
    latestChangeId: number;
  }>;

  /**
   * 应用压缩后的变更到远程实体表
   *
   * 实现策略（Supabase）：
   * 1. 将 actions (Map) 转换为 RemoteChange 记录
   * 2. 在事务中：
   *    a) 写入远程 RemoteChange 表（用于其他客户端 pull）
   *    b) 直接操作远程实体表（INSERT/UPDATE/DELETE）
   *
   * @param actions - 压缩后的变更操作集合（从本地 push 来的）
   * @param branchId - 分支 ID（用于在远程变更记录中设置 branchId）
   * @param changes - 完整的原始变更记录（可选，用于保留完整的变更历史）
   * @returns 创建的远程 RxDBChange 的最大 ID（用于更新 lastPullRemoteChangeId）
   *
   * @remarks
   * 提供 `changes` 时，实现必须以客户端 ID 和本地 change ID 作为幂等键。相同批次重试时不得重复执行
   * 实体副作用，并且必须为每个本地 change ID 返回首次提交得到的同一个远端 ID。
   */
  abstract mergeChanges(
    actions: SwitchVersionActions,
    branchId?: string,
    changes?: IRxDBChange[]
  ): Promise<RemoteMergeResult | number | void>;

  /**
   * 批量拉取多个实体的变更记录（单次 HTTP 请求）
   *
   * 每个实体可以有不同的 sinceId（水位线），通过服务端 OR 过滤
   * 实现单次请求获取所有实体的变更。
   *
   * @param requests - 每个实体的拉取请求（namespace + 实体名 + sinceId）
   * @param limit - 最大拉取数量
   * @param branchIds - 分支 ID 列表（支持包含祖先分支）
   * @returns 变更记录数组，按 id ASC 排序
   */
  pullChangesBatch?(requests: PullBatchRequest[], limit: number, branchIds?: string[]): Promise<RemoteChange[]>;

  /**
   * 获取实体元数据，用于新鲜度比较（QueryCache 专用）
   *
   * 只返回 `{ id, updatedAt }` 元数据，网络传输量比完整数据减少 90%+。
   * 这是 QueryCache 同步策略的核心能力。
   *
   * @param entityName - 实体名称
   * @param query - 查询条件
   * @returns Observable<QueryCacheEntityMetadata[]> - 实体 ID 和 updatedAt
   *
   * @example
   * ```typescript
   * adapter.fetchMetadata('Product', { where: { status: 'active' } })
   *   .subscribe(metadata => {
   *     // metadata: [{ id: 'p1', updatedAt: '2026-01-12T10:00:00Z' }, ...]
   *   });
   * ```
   */
  abstract fetchMetadata(entityName: string, query: RuleGroup<unknown>): Observable<QueryCacheEntityMetadata[]>;

  /**
   * 按 ID 列表批量获取完整数据（QueryCache 专用）
   *
   * 用于拉取过时或缺失的数据，避免 N+1 问题。
   *
   * @param entityName - 实体名称
   * @param ids - 需要获取的实体 ID 列表
   * @returns Observable<T[]> - 完整实体数据
   *
   * @example
   * ```typescript
   * adapter.findByIds('Product', ['p1', 'p2', 'p3'])
   *   .subscribe(products => {
   *     // products: [{ id: 'p1', name: 'Product A', ... }, ...]
   *   });
   * ```
   */
  abstract findByIds<T>(entityName: string, ids: string[]): Observable<T[]>;

  pushBranches?(branches: Record<string, unknown>[]): Promise<{ synced: number; skipped: string[] }>;

  branchExists?(branchId: string): Promise<boolean>;

  pullBranches?(): Promise<RemoteBranchInfo[]>;
}

/**
 * 远程分支信息
 */
export interface RemoteBranchInfo {
  id: string;
  fromChangeId?: number | null;
  parentId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * 适配器基础配置
 */
export type IRxDBAdapterOptions = object;

export type AdapterFactory = (rxDB: RxDB) => Promise<IRxDBAdapter> | IRxDBAdapter;

/**
 * 已注册适配器的类型注册表
 *
 * @remarks
 * 这个接口**有意为空**：每个适配器包用 `declare module '@aiao/rxdb'` 把自己的名字
 * 与实现类合并进来（`rxdb-adapter-sqlite` / `-sqlite-wasm` / `-wa-sqlite` /
 * `-pglite` / `-sqliteai` 五个包都这么做）。
 *
 * 此前这里带着 `[name: string]: IRxDBAdapter` 索引签名，
 * 于是 `keyof RxDBAdapters` 恒为 `string`、`RxDBAdapters[K]` 恒为 `IRxDBAdapter` ——
 * 那五处 `declare module` **一个都没生效**，`getAdapter('sqlite')` 永远只能拿到基接口。
 * 索引签名已删除；「名字可以是任意字符串」这件事改由
 * {@link RxDBAdapterName} 和 `getAdapter` 的宽松重载承担。
 *
 * @example
 * ```ts
 * declare module '@aiao/rxdb' {
 *   interface RxDBAdapters {
 *     sqlite: RxDBAdapterSqlite;
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type -- 声明合并注册表，空是它的正确初始状态
export interface RxDBAdapters {}

/**
 * 适配器名称
 *
 * @remarks
 * `(string & {})` 那一支让任意字符串都能传（未注册类型的适配器照样可用），
 * 同时保留 {@link RxDBAdapters} 已注册键的自动补全 —— 直接写 `string` 会把补全全吃掉。
 */
export type RxDBAdapterName = keyof RxDBAdapters | (string & {});
