import { deepFreeze, isPromise } from '@aiao/utils';
import { BehaviorSubject, defer, distinctUntilChanged, filter, map, Observable, shareReplay, switchMap } from 'rxjs';
import { EntityManager } from './entity/entity-manager.js';
import { EntityType } from './entity/entity.interface.js';
import { EntityMetadata } from './entity/metadata.interface.js';
import { RxDBTabsGateway } from './gateway/RxDBTabsGateway.js';
import { MergeQueryTaskCreateFn, MergeQueryTaskRemoveFn, MergeQueryTaskUpdateFn } from './repository/QueryManager.js';
import {
  AdapterFactory,
  IRxDBAdapter,
  RepositoryConstructor,
  RepositoryInstance,
  RxDBAdapterLocalBase,
  RxDBAdapterName,
  RxDBAdapterRemoteBase,
  RxDBAdapters
} from './rxdb-adapter.js';
import {
  isCrossTabEvent,
  RxDBEvent,
  RxDBEventMap,
  TRANSACTION_BEGIN,
  TRANSACTION_COMMIT,
  TRANSACTION_ROLLBACK,
  type TransactionBeginEvent,
  type TransactionCommitEvent,
  type TransactionRollbackEvent
} from './rxdb-events.js';
import { IRxDBPlugin, Plugin } from './rxdb-plugin.js';
import { uuid } from './rxdb-utils.js';
import { MigrationType, RxDBContext, RxDBOptions } from './rxdb.interface.js';
import { isLocalAdapter, isTransactionEvent } from './rxdb.private.js';
import { SchemaManager } from './schema/SchemaManager.js';
import { RxDBBranch } from './system/branch.js';
import { RxDBChange } from './system/change.js';
import { isUniqueConstraintViolation, RxDBMigration, RxDBMigrationClaimConflictError } from './system/migration.js';
import { RxDBSync } from './system/sync.js';
import { RXDB_DB_NAME_SUFFIX, RXDB_VERSION } from './version.js';
import { VersionManager } from './version/VersionManager.js';

type EventListener<T> = (event: T) => void;

type RxDBConfig = RxDBOptions;

/**
 * 不参与深冻结的 {@link RxDBOptions} 字段 —— 它们装的是**活的行为**而非声明式数据。
 *
 * - `entities`：实体构造器数组。它既是 `SchemaManager.init()` 的注册表（还要往里 push
 *   内建实体与多对多中间表），其元素的 prototype 又要被 `EntityManager.init()` 挂上
 *   `ENTITY_MANAGER`。冻住会让 push 抛 `object is not extensible`、让 `new Entity()`
 *   抛 `need init rxdb`。
 * - `migrations`：`up` / `down` 是调用方的回调。深冻结连函数自身的属性一起冻住
 *   （闭包状态、测试替身的调用记录），首次调用即抛 `object is not extensible`。
 *
 * 其余字段（`sync` / `context` 等）是声明式数据，仍然深冻结；新增声明式字段自动受保护。
 * 契约由 `__tests__/RxDB.config-freeze.spec.ts` 锁定。
 */
const LIVE_BEHAVIOUR_CONFIG_KEYS: ReadonlySet<string> = new Set(['entities', 'migrations']);

/**
 * 迁移占坑冲突的重试次数
 *
 * 每次重试都会重读一遍已提交的迁移名，正常竞争下一次就能收敛（对手的记录已可见）。
 * 给到 3 次是为了容忍多实例同时启动；再抢不到就是异常，宁可抛错也不静默跳过迁移。
 */
const MIGRATION_CLAIM_RETRIES = 3;

/**
 * 一个打开中的事务上下文
 *
 * @remarks
 * `id` 为 `undefined` 表示派发方没有提供事务身份——这些匿名事务共用同一个上下文，
 * 与引入身份之前的语义一致。
 */
interface TransactionContext {
  id: string | undefined;
  depth: number;
  events: RxDBEvent[];
}

interface MergeQueryTaskOptions {
  create: MergeQueryTaskCreateFn;
  update: MergeQueryTaskUpdateFn;
  remove: MergeQueryTaskRemoveFn;
}

/**
 * IRepositoryConfig 统一注册配置
 * 合并 factory、class 和 merge operations 为单一配置对象
 */
export interface IRepositoryConfig<RT extends RepositoryInstance = RepositoryInstance> {
  /**
   * 根据 {@link EntityMetadata} 动态生成 Entity 类（中间表等场景）
   */
  entityGenerator?: (metadata: EntityMetadata) => EntityType | EntityType[];

  class: RepositoryConstructor<RT>;

  mergeOperations: MergeQueryTaskOptions;
}

/**
 * RxDB 是个单例对象，负责管理插件、适配器、事件以及上下文等全局功能
 * 全局只能创建一个 RxDB 实例，所有 entity 都通过这个实例进行管理
 * 所有 Entity 的 Class 也只能被注册一次
 */
export class RxDB {
  #local_adapter_sub = new BehaviorSubject<string>('');
  #remote_adapter_sub = new BehaviorSubject<string>('');
  #config!: RxDBConfig;

  #rxdb_initialized = false;

  #repository_config_map = new Map<string, IRepositoryConfig>();

  #plugin_map = new Map<Plugin, IRxDBPlugin>();

  #plugin_install_promises = new Map<IRxDBPlugin, Promise<void>>();

  #connected_sub = new BehaviorSubject<boolean>(false);

  #event_map = new Map<keyof RxDBEventMap, Set<EventListener<RxDBEvent>>>();

  /**
   * 多 Tab 通信网关
   *
   * @remarks
   * `#shutdown()` 后会被清空 —— 已销毁的网关不能继续对外暴露状态（如 {@link firstConnectedAt}），
   * 也不能被重连复用（其 `LeaderElection` 已 dispose，再次 `elect()` 会抛错）。
   */
  #gateway?: RxDBTabsGateway;

  /**
   * 事件系统初始化状态标记
   *
   * @remarks
   * 与 {@link RxDB.#rxdb_initialized} 不同，这个标记**不随断连复位**：
   * 事务监听器只读写实例自身的事务游标，与连接无关，装一次即可覆盖实例整个生命周期。
   * 若跟着 `init()` 重复注册，监听器集合会随重连次数无限增长（它们是匿名箭头函数，
   * 每次都是新实例，`Set` 去重不掉）。
   */
  #event_initialized = false;

  /**
   * 打开中的事务上下文栈
   *
   * @remarks
   * 每个上下文自带身份、嵌套深度与事件队列。此前三者都是全实例各一份，两个适配器
   * 并发 BEGIN 会被当成嵌套：其中一个 ROLLBACK 就能清空另一个的队列。
   * 匿名事务（未带身份）仍共用栈顶那一个上下文，行为与改造前一致。
   */
  #transaction_stack: TransactionContext[] = [];

  #adapters = new Map<string, AdapterFactory>();

  #adapter_map = new Map<string, Promise<IRxDBAdapter>>();

  #connect_promise_map = new Map<string, Promise<IRxDBAdapter>>();

  /**
   * 已成功 `connect()` 的适配器名。
   *
   * @remarks
   * 全局拆卸的时机必须按「已连接」判定，不能用 `#adapter_map.size`：后者统计的是「已实例化」，
   * 而 `localAdapter$` / `remoteAdapter$` 的订阅会经 {@link RxDB.getAdapter} 把从未 `connect()`
   * 的适配器也塞进去。用 map 大小判断时，唯一连接的适配器断开会被误判成「还有别的适配器在」，
   * 插件、gateway 与 versionManager 就永远拆不掉。
   */
  #connected_adapters = new Set<string>();

  /**
   * RxDB 上下文
   */
  #context: RxDBContext = {};

  /**
   * 本地适配器
   *
   * @remarks
   * 缓存带引用计数：订阅者归零时连同缓冲一起释放。无 `refCount` 的 `shareReplay(1)` 会把
   * 首个适配器实例钉在缓冲里直到实例销毁 —— 断连重连后每个仓储都会拿到那个已断开的旧适配器。
   * 释放后重新订阅会走回 {@link RxDB.getAdapter}，它自身有 `#adapter_map` 缓存，不会重复建实例。
   *
   * `distinctUntilChanged` 必须排在 `filter` **之前**：断连时 `#shutdown()` 会把适配器名复位成 `''`，
   * 只有让这个空值参与去重，重连时同名的适配器才会被认作一次变化并重新求值。反过来先 filter，
   * 空值被吞掉，去重看到的永远是同一个名字，仍在订阅中的实时查询就会一直挂在已断开的适配器上。
   */
  public readonly localAdapter$: Observable<IRxDBAdapter & RxDBAdapterLocalBase> = this.#local_adapter_sub
    .asObservable()
    .pipe(
      distinctUntilChanged(),
      filter(Boolean),
      switchMap(localAdapter =>
        defer(() => this.getAdapter(localAdapter)).pipe(map(adapter => adapter as IRxDBAdapter & RxDBAdapterLocalBase))
      ),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  /**
   * 远程适配器
   *
   * @remarks
   * 缓存语义同 {@link RxDB.localAdapter$}。
   */
  public readonly remoteAdapter$: Observable<IRxDBAdapter & RxDBAdapterRemoteBase> = this.#remote_adapter_sub
    .asObservable()
    .pipe(
      distinctUntilChanged(),
      filter(Boolean),
      switchMap(localAdapter =>
        defer(() => this.getAdapter(localAdapter)).pipe(map(adapter => adapter as IRxDBAdapter & RxDBAdapterRemoteBase))
      ),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  /**
   * 连接状态 Observable
   */
  public readonly connected$ = this.#connected_sub.asObservable();

  public readonly schemaManager!: SchemaManager;

  public readonly entityManager!: EntityManager;

  public readonly versionManager!: VersionManager;

  get context() {
    return this.#context;
  }

  set context(context: RxDBContext) {
    // clientId 是 init() 内部生成、供 pull/push/realtime 自消息过滤动态读取的托管字段
    // （见 pull-repository.ts / pull-batch.ts / RxDBAdapterSupabase.ts / handle_supabase_change.ts）。
    // 业务方整体替换 context（如登录后设置 userId）若直接整体覆盖，会把它一起抹掉，
    // 后续拉取会把自己刚推送的变更误判成"他人的变更"。这里合并保留既有 clientId，
    // 其余字段仍按业务传入的对象整体生效（含被省略字段的清除）。
    this.#context = { ...context, clientId: this.#context.clientId ?? context.clientId };
  }

  get firstConnectedAt(): Date | undefined {
    return this.#gateway?.firstConnectedAt;
  }

  get version() {
    return RXDB_VERSION;
  }

  get config() {
    return this.#config;
  }

  /**
   * @param options - RxDB 配置选项
   */
  constructor(options: RxDBOptions) {
    // 持有自有副本而非调用方对象：原地改名 + 冻结会让调用方读到被改过的 dbName，
    // 同一个 options 常量构造第二个实例时更会在给已冻结属性赋值处抛 TypeError。
    // 后缀取自 {@link RXDB_DB_NAME_SUFFIX} 而非 `this.version`：库名是用户数据的物理地址，
    // 不能跟着版本号漂。见该常量的 @remarks。
    this.#config = {
      ...options,
      dbName: `${options.dbName}@${RXDB_DB_NAME_SUFFIX}`,
      entities: [...options.entities]
    };
    this.schemaManager = new SchemaManager(this);
    this.entityManager = new EntityManager(this);
    this.versionManager = new VersionManager(this);
    this.context = { ...this.#config.context };
    this.#freeze_config();
  }

  init() {
    if (this.#rxdb_initialized) return;
    this.#rxdb_initialized = true;
    if (!this.#context.clientId) {
      this.#context.clientId = uuid();
    }
    // 初始化本地和远程适配器名称
    const { local, remote } = this.#config.sync || {};
    if (local) this.#local_adapter_sub.next(local.adapter);
    if (remote) this.#remote_adapter_sub.next(remote.adapter);
    // 安装插件并初始化各个管理器
    // #install_plugin 同步不抛（错误记入 #plugin_install_promises），故意留在 try 外——
    // Schema/Entity 初始化失败仍只回滚管理器；插件失败由 connect() 传播。
    this.#install_plugin();
    try {
      this.schemaManager.init();
      this.entityManager.init();
      this.versionManager.init();
      if (this.#config.multiInstance !== false) this.#init_gateway();
      this.#init_event();
    } catch (error) {
      // 任一步骤抛错，本实例并未真正初始化完成——复位标记，让调用方修复问题
      // （如补齐 repository 配置）后重新 init()/connect() 时能真正重跑剩余步骤，
      // 而不是被这里提前置 true 的标记挡住，之后每次都静默空跑。
      this.#rxdb_initialized = false;
      throw error;
    }
  }

  /**
   * 注册 Repository
   * 统一接口，所有 repository 配置存储在 RxDB 中
   *
   * @param repositoryName - Repository 名称
   * @param config - Repository 配置对象
   */
  public repository<RT extends RepositoryInstance>(repositoryName: string, config: IRepositoryConfig<RT>): this;
  public repository(repositoryName: string, config: IRepositoryConfig): this {
    this.#repository_config_map.set(repositoryName, config);
    return this;
  }

  /**
   * 注册 adapter
   * @param adapterName - 适配器名称
   * @param adapter - 适配器工厂函数
   * @returns 返回 RxDB 实例，支持链式调用
   */
  public adapter(adapterName: RxDBAdapterName, adapter: AdapterFactory): this {
    this.#adapters.set(adapterName, adapter);
    return this;
  }

  /**
   * 安装插件
   *
   * `init()` 之前注册的插件在 `init()` 时统一安装；
   * `init()` 之后注册的插件立即安装，保证与 `shutdown` 时的 destroy 对称。
   *
   * 同步 `install()` 失败只 `console.error`，`use()` / `init()` 本身不抛。
   * 异步或同步失败都会记入安装 Promise，由后续 `connect()` 传播。
   *
   * @param plugin - 插件构造函数
   * @param options - 插件选项
   * @returns 返回 RxDB 实例，支持链式调用
   */
  public use<Options = never>(plugin: Plugin<Options>, options?: Options) {
    if (this.#plugin_map.has(plugin)) {
      console.warn('plugin already installed');
    } else {
      const plugin_instance = plugin(this, options);
      this.#plugin_map.set(plugin, plugin_instance);
      if (this.#rxdb_initialized) {
        this.#install_one_plugin(plugin_instance);
      }
    }
    return this;
  }

  /**
   * 获取适配器实例
   * @param adapterName - 适配器名称
   * @returns 返回适配器实例的 Promise
   * @throws 当适配器未注册时抛出错误
   */
  public getAdapter<K extends keyof RxDBAdapters>(adapterName: K): Promise<RxDBAdapters[K]>;
  public getAdapter(adapterName: RxDBAdapterName): Promise<IRxDBAdapter>;
  public async getAdapter(adapterName: string): Promise<IRxDBAdapter> {
    // 如果已经实例化，直接从缓存的 Observable 中获取
    const cached = this.#adapter_map.get(adapterName);
    if (cached) {
      return cached;
    }
    // 检查适配器是否已注册
    const adapterFactory = this.#adapters.get(adapterName);
    if (!adapterFactory) {
      throw new Error(`Adapter "${String(adapterName)}" not found. Please register it first using rxdb.adapter()`);
    }
    // 创建适配器实例
    const adapterInstance = adapterFactory(this);
    const adapter = isPromise(adapterInstance) ? adapterInstance : Promise.resolve(adapterInstance);
    // 缓存为 Promise 以保持兼容性
    this.#adapter_map.set(adapterName, adapter);
    try {
      return await adapter;
    } catch (error) {
      if (this.#adapter_map.get(adapterName) === adapter) this.#adapter_map.delete(adapterName);
      this.#connect_promise_map.delete(adapterName);
      throw error;
    }
  }

  /**
   * 获取 Repository 配置
   *
   * @param repositoryName - Repository 名称
   * @returns Repository 配置对象，如果不存在返回 undefined
   */
  getRepositoryConfig(repositoryName: string): IRepositoryConfig | undefined {
    return this.#repository_config_map.get(repositoryName);
  }

  /**
   * 连接适配器
   * @param adapterName - 适配器名称
   * @returns 返回连接的适配器实例
   */
  connect<K extends keyof RxDBAdapters>(adapterName: K): Promise<RxDBAdapters[K]>;
  connect(adapterName: RxDBAdapterName): Promise<IRxDBAdapter>;
  connect(adapterName: string): Promise<IRxDBAdapter> {
    // 防重入：如果已经在连接中，直接返回缓存的 Promise
    const pending = this.#connect_promise_map.get(adapterName);
    if (pending) {
      return pending;
    }

    // 先入缓存再启动：插件 install 可能同步回呼 connect()，必须命中同一条 Promise。
    // init() 必须在 connect() 返回前同步跑完，同一轮 `new Entity()` 才能命中 registry。
    let startConnect!: () => void;
    let failConnect!: (error: unknown) => void;
    const started = new Promise<void>((resolve, reject) => {
      startConnect = resolve;
      failConnect = reject;
    });
    const connectPromise = (async () => {
      await started;
      const adapter = await this.getAdapter(adapterName);
      await adapter.connect();
      if (isLocalAdapter(adapterName, this.#config)) {
        // 在 local 分支内统一收口一次 cast，避免分散 3 处 `as unknown as`
        const localAdapter = adapter as unknown as RxDBAdapterLocalBase;
        // 初始化
        const existed = await adapter.isTableExisted(RxDBMigration);
        if (existed) {
          // 已存在表结构，执行升级流程
          await localAdapter.migrateSystemSchema?.();
          await localAdapter.startWriterLease?.();
          await this.#runMigrations(localAdapter);
          await this.#ensureEntityTables(localAdapter);
        } else {
          // 创建表结构
          const branch = this.entityManager.instantiate(RxDBBranch);
          branch.id = 'main';
          branch.activated = true;
          await localAdapter.createTables(this.#config.entities, [branch, ...this.#createMigrationWatermarks()]);
          await localAdapter.migrateSystemSchema?.();
          await localAdapter.startWriterLease?.();
        }
        await localAdapter.reconcileEntityIndexes?.(this.#config.entities);
      }
      this.#connected_adapters.add(adapterName);
      this.#connected_sub.next(true);
      try {
        await this.#await_plugin_installs();
      } catch (error) {
        this.#connected_sub.next(false);
        throw error;
      }
      return adapter;
    })();

    // 连接失败时清除缓存的 rejected promise，允许后续重试（不吞掉错误）
    connectPromise.catch(() => {
      if (this.#connect_promise_map.get(adapterName) === connectPromise) {
        this.#connect_promise_map.delete(adapterName);
      }
    });
    this.#connect_promise_map.set(adapterName, connectPromise);
    try {
      this.init();
    } catch (error) {
      failConnect(error);
      return connectPromise;
    }
    startConnect();
    return connectPromise;
  }

  /**
   * 断开适配器连接
   *
   * 仅断开指定适配器；只有当所有**已连接**的适配器都已断开时，才执行全局拆卸
   * （插件、网关、versionManager 与初始化状态）。避免单适配器断开误拆全局资源。
   *
   * @param adapterName - 适配器名称
   */
  async disconnect(adapterName: RxDBAdapterName): Promise<void> {
    const cached = this.#adapter_map.get(adapterName);
    if (!cached) return; // 未实例化，无需断开
    const adapter = await cached;
    // 断开最后一个**已连接**适配器前先执行全局拆卸（插件须在适配器断开前销毁）。
    // 判定依据是 #connected_adapters 而非 #adapter_map.size，理由见前者的 @remarks。
    const wasConnected = this.#connected_adapters.delete(adapterName);
    if (wasConnected && this.#connected_adapters.size === 0) {
      await this.#shutdown();
    }
    try {
      await adapter.disconnect();
    } finally {
      // 无论 adapter.disconnect() 成功与否都要清掉缓存条目——否则失败时死实例会一直
      // 留在 #adapter_map 里，重试 getAdapter() 复用同一个已失败的实例而不是走工厂
      // 重建，disconnect 重试也会对同一个（可能已部分拆卸的）实例重复调用。
      this.#adapter_map.delete(adapterName);
      this.#connect_promise_map.delete(adapterName);
    }
  }

  async disconnectAll(): Promise<void> {
    const adapters = await Promise.all(this.#adapter_map.values());
    // 插件须在适配器断开前销毁
    await this.#shutdown();
    try {
      await Promise.all(adapters.map(adapter => adapter.disconnect()));
    } finally {
      // 同 disconnect：部分适配器 disconnect 失败也不能让全部缓存条目悬空。
      this.#adapter_map.clear();
      this.#connect_promise_map.clear();
      this.#connected_adapters.clear();
    }
  }

  addEventListener<T extends keyof RxDBEventMap>(type: T, listener: EventListener<RxDBEventMap[T]>): void {
    this.#listener(type).add(listener);
  }

  removeEventListener<T extends keyof RxDBEventMap>(type: T, listener: EventListener<RxDBEventMap[T]>): void {
    this.#listener(type).delete(listener);
  }

  dispatchEvent(event: RxDBEvent): void {
    const transactionEvent = isTransactionEvent(event);
    // 在事务期间记录所有实体事务事件，只在事务成功后才 emit。
    // 并发事务下归属栈顶那一个：它是最近一次 BEGIN 的上下文。
    const open = this.#transaction_stack.at(-1);
    if (open !== undefined && transactionEvent === false) {
      open.events.push(event);
      return;
    }

    if (transactionEvent === false) {
      this.#emit(event);
      return;
    }

    // 快照迭代：#listener() 返回内部活 Set，若直接遍历，监听器在回调中新增同类型监听器
    // 会被同一次遍历捕获到（Set.forEach 访问遍历期间新增的条目），新监听器错误地收到
    // 本次事件，持续新增还会让派发不终止。
    const listeners = Array.from(this.#listener(event.type as keyof RxDBEventMap));
    this.#runIsolated(listeners, listener => listener.call(this, event));
  }

  /**
   * 直接把事件交给监听器，跳过事务排队。
   *
   * @remarks
   * 排空某个事务的队列时必须走这里而不是 {@link dispatchEvent}：并发事务下另一个上下文
   * 可能还开着，走 `dispatchEvent` 会把刚放行的事件重新塞进它的队列。
   */
  #emit(event: RxDBEvent): void {
    // 快照理由同 dispatchEvent
    Array.from(this.#listener(event.type as keyof RxDBEventMap)).forEach(listener => listener.call(this, event));
  }

  /**
   * 取与该身份匹配、最内层的打开中事务。
   *
   * @remarks
   * 从栈顶往下找：同一身份可能因 savepoint 嵌套出现多次，最内层的那个才是当前上下文。
   */
  #findTransactionContext(transactionId: string | undefined): TransactionContext | undefined {
    for (let index = this.#transaction_stack.length - 1; index >= 0; index -= 1) {
      if (this.#transaction_stack[index].id === transactionId) return this.#transaction_stack[index];
    }
    return undefined;
  }

  /** 把事务上下文从栈里摘掉——它可能不在栈顶（并发事务先提交内层之外的那个） */
  #closeTransactionContext(context: TransactionContext): void {
    const index = this.#transaction_stack.indexOf(context);
    if (index >= 0) this.#transaction_stack.splice(index, 1);
  }

  /**
   * 逐项调用 fn，任一项抛错都不阻断其余项——收集首个异常，全部跑完后重抛。
   * 用于「批量」语义的场景（事务事件的监听器列表、事务提交/回滚排空的队列事件）：
   * 单项失败不应该让同批次里排在它后面的项被静默跳过。
   */
  #runIsolated<T>(items: Iterable<T>, fn: (item: T) => void): void {
    let failed = false;
    let firstError: unknown;
    for (const item of items) {
      try {
        fn(item);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
    if (failed) throw firstError;
  }

  /**
   * 全局拆卸：销毁插件、网关与 versionManager，并把实例复位到「可重新 init」的状态。
   * 仅在所有适配器都已断开时调用。
   *
   * @remarks
   * 复位是拆卸的一半：只销毁不复位，`init()` 会因 `#rxdb_initialized` 仍为 `true` 而静默早退，
   * 重连拿到的是一个插件已销毁、网关已 dispose 的空壳。三处状态必须一起复位 ——
   * 初始化标志、网关引用、事务游标（断连时可能正卡在一个永远等不到 COMMIT 的事务里，
   * 不复位则重连后每个实体事件都会被塞进 `#need_dispatch_events` 永不派发）。
   */
  async #shutdown(): Promise<void> {
    await this.#destroy_plugin();
    this.versionManager.destroy();
    this.#gateway?.destroy();
    this.#gateway = undefined;
    // 清空 Repository 身份缓存：不清的话，断线重连后 getRepository() 仍会永久复用
    // 断连前那批缓存实例，携带的是断连时刻的陈旧实体状态。
    this.entityManager.destroy();
    // 解绑适配器名：让 localAdapter$ / remoteAdapter$ 的去重环节看到一次变化，
    // 否则仍在订阅中的实时查询会一直复用已断开的适配器实例。`init()` 会重新填回名字。
    this.#local_adapter_sub.next('');
    this.#remote_adapter_sub.next('');
    this.#transaction_stack = [];
    this.#plugin_install_promises.clear();
    this.#rxdb_initialized = false;
    this.#connected_sub.next(false);
  }

  #init_gateway() {
    this.#gateway = new RxDBTabsGateway({
      dbName: this.#config.dbName,
      clientId: this.#context.clientId!
    });

    this.#gateway.init(
      event => this.dispatchEvent(event),
      (type, listener) => this.addEventListener(type as keyof RxDBEventMap, listener),
      (type, listener) => this.removeEventListener(type as keyof RxDBEventMap, listener)
    );
  }

  /**
   * 初始化事件系统
   * 设置事务相关的事件监听器
   *
   * @remarks
   * 每个实例只执行一次（见 {@link RxDB.#event_initialized}）。断连重连会再次走到这里，
   * 但事务监听器与连接无关，重复注册只会让监听器集合无限膨胀。
   */
  #init_event() {
    if (this.#event_initialized) return;
    this.#event_initialized = true;
    // 事务开始：同身份的再次 BEGIN 是 savepoint 嵌套，不同身份另起一个上下文
    const on_begin = (event: TransactionBeginEvent) => {
      const top = this.#transaction_stack.at(-1);
      if (top !== undefined && top.id === event.transactionId) {
        top.depth += 1;
        return;
      }
      this.#transaction_stack.push({ id: event.transactionId, depth: 1, events: [] });
    };
    // 事务结束，发送**本事务**期间记录的实体事件
    const on_commit = (event: TransactionCommitEvent) => {
      const context = this.#findTransactionContext(event.transactionId);
      // 没有匹配的打开中事务：迟到或重复的 COMMIT，不能拿别人的队列顶账
      if (context === undefined) return;
      if (context.depth > 1) {
        context.depth -= 1;
        return;
      }

      this.#closeTransactionContext(context);
      // 队列已清空，无法重放：某个事件的监听器抛错不能中止排空循环，否则它之后的
      // 队列事件永久丢失。逐个隔离，全部排空后再重抛首个异常。
      this.#runIsolated(context.events, queued => this.#emit(queued));
    };
    // 事务回滚：回滚中止**本事务**的整个嵌套栈（无 savepoint 语义），不管深度直接摘掉。
    //
    // 但只丢弃**本 tab 本次事务**产生的事件：队列里还可能躺着他 tab 的变更，
    // 那是别处已经成功提交的写入，与本地回滚没有因果关系。一并丢掉会让本 tab 的 UI
    // 与其他 tab 永久不一致，直到下次全量刷新。跨 tab 事件照常派发。
    const on_rollback = (event: TransactionRollbackEvent) => {
      const context = this.#findTransactionContext(event.transactionId);
      if (context === undefined) return;
      this.#closeTransactionContext(context);
      this.#runIsolated(context.events.filter(isCrossTabEvent), queued => this.#emit(queued));
    };

    this.addEventListener(TRANSACTION_BEGIN, on_begin);
    this.addEventListener(TRANSACTION_COMMIT, on_commit);
    this.addEventListener(TRANSACTION_ROLLBACK, on_rollback);

    ['entityManager', 'schemaManager', 'versionManager'].forEach(key =>
      Object.defineProperty(this, key, {
        enumerable: false,
        configurable: false
      })
    );
  }

  #install_plugin() {
    for (const plugin of this.#plugin_map.values()) {
      this.#install_one_plugin(plugin);
    }
  }

  /**
   * `use()` / `init()` 保持同步且不抛：同步 throw 转成 rejected Promise。
   * 异步 reject 不再吞掉，由 {@link RxDB.#await_plugin_installs} 在 `connect()` 里传播。
   */
  #install_one_plugin(plugin: IRxDBPlugin) {
    const tracked = this.#track_plugin_install(plugin);
    void tracked.then(
      () => undefined,
      () => undefined
    );
    this.#plugin_install_promises.set(plugin, tracked);
  }

  #track_plugin_install(plugin: IRxDBPlugin): Promise<void> {
    try {
      const result = plugin.install();
      if (isPromise(result)) {
        return result.catch(err => {
          console.error(`[RxDB] Plugin '${plugin.name}' install failed:`, err);
          throw err;
        });
      }
      return Promise.resolve();
    } catch (err) {
      console.error(`[RxDB] Plugin '${plugin.name}' install failed:`, err);
      return Promise.reject(err);
    }
  }

  /**
   * 表就绪后等待插件安装。失败清空记录，允许下一次 `connect()` 重试。
   */
  async #await_plugin_installs(): Promise<void> {
    for (const plugin of this.#plugin_map.values()) {
      if (!this.#plugin_install_promises.has(plugin)) {
        this.#install_one_plugin(plugin);
      }
    }
    const entries = [...this.#plugin_install_promises.entries()];
    const results = await Promise.allSettled(entries.map(([, pending]) => pending));
    let firstError: unknown;
    for (const [index, result] of results.entries()) {
      if (result.status !== 'rejected') continue;
      this.#plugin_install_promises.delete(entries[index][0]);
      firstError ??= result.reason;
    }
    if (firstError !== undefined) throw firstError;
  }

  /**
   * 冻结配置：顶层 `Object.freeze`（键不可增删改），声明式子树深冻结，
   * {@link LIVE_BEHAVIOUR_CONFIG_KEYS} 列出的字段整棵跳过。
   */
  #freeze_config(): void {
    const config = this.#config as unknown as Record<string, unknown>;
    for (const key of Object.getOwnPropertyNames(config)) {
      if (LIVE_BEHAVIOUR_CONFIG_KEYS.has(key)) continue;
      const value = config[key];
      if (value === null || (typeof value !== 'object' && typeof value !== 'function')) continue;
      deepFreeze(value);
    }
    Object.freeze(this.#config);
  }

  async #destroy_plugin(): Promise<void> {
    await Promise.all(
      Array.from(this.#plugin_map.values(), async plugin => {
        try {
          await plugin.destroy();
        } catch (err) {
          console.error(`[RxDB] Plugin '${plugin.name}' destroy failed:`, err);
        }
      })
    );
  }

  /**
   * @param type - 事件类型
   * @returns 事件监听器集合
   */
  #listener<T extends keyof RxDBEventMap>(type: T): Set<EventListener<RxDBEventMap[T]>> {
    let listeners = this.#event_map.get(type);
    if (!listeners) {
      listeners = new Set();
      this.#event_map.set(type, listeners);
    }
    // 每个 key 只会存储其自身事件类型的监听器，这是 TS 无法跟踪的不变式
    return listeners as Set<EventListener<RxDBEventMap[T]>>;
  }

  /**
   * 执行待处理的迁移
   *
   * @remarks
   * 「读出已执行集合」只是一次快照，两个实例可以读到同一份空快照并各跑一遍同一条
   * 非幂等迁移。仲裁只能交给 `rxdb_migration.name` 上的唯一索引：先占坑（INSERT）
   * 再执行 `up()`，输掉竞争的一方在占坑处就被数据库挡下。
   *
   * 冲突不能在事务内 `continue` —— Postgres 里一条失败语句会让整个事务进入 aborted
   * 状态，后续语句一律报错。所以整批回滚、重读、重跑；已经提交的那些名字会在重读时
   * 出现在快照里被跳过，不会重复执行。
   */
  async #runMigrations(adapter: RxDBAdapterLocalBase): Promise<void> {
    const migrations = this.#config.migrations;
    if (!migrations || migrations.length === 0) return;
    // 按名称排序：迁移之间可能有先后依赖，重试时的顺序必须和首轮一致
    const sorted = [...migrations].sort((a, b) => a.name.localeCompare(b.name));

    for (let attempt = 0; ; attempt++) {
      try {
        await this.#runMigrationsOnce(adapter, sorted);
        return;
      } catch (error) {
        // 只有占坑冲突可以重试。重试次数用尽仍抢不到说明不是正常竞争（例如唯一索引
        // 挡下的是别的东西），静默跳过会让这条迁移永远不执行，必须抛出来。
        if (!(error instanceof RxDBMigrationClaimConflictError) || attempt >= MIGRATION_CLAIM_RETRIES) throw error;
      }
    }
  }

  /**
   * 单趟迁移事务：占坑成功才执行，任一处失败整批回滚
   *
   * @param adapter - 本地适配器
   * @param sorted - 已按名称排序的迁移列表
   * @throws RxDBMigrationClaimConflictError 占坑撞唯一约束（可重试）
   */
  async #runMigrationsOnce(adapter: RxDBAdapterLocalBase, sorted: MigrationType[]): Promise<void> {
    // 引导期事务：此刻 `connect()` 的 promise 还没 settle，走普通 transaction() 会撞上
    // 适配器的就绪门（它等的就是这个 promise）而永久挂起。
    await adapter.bootstrapTransaction(async executor => {
      // 读写都走 executor 的仓库：事务体内经普通 adapter.query() 的调用会排在自己这个事务
      // 后面（队列并发度 1），而且这里原先用的是 entityManager 的**活查询** findAll ——
      // 在事务体内注册活查询任务本身就会泄漏订阅（该查询会在事务外重跑）。
      const repository = executor.getRepository(RxDBMigration);
      const records = await repository.find({ where: { combinator: 'and', rules: [] } });
      const executedNames = new Set(records.map(record => record.name));

      for (const migration of sorted) {
        if (executedNames.has(migration.name)) continue;
        const record = this.entityManager.instantiate(RxDBMigration);
        record.name = migration.name;
        record.executedAt = new Date();
        try {
          await repository.create(record);
        } catch (error) {
          // 唯一约束判定只夹在这一条 INSERT 上。放宽到整段就会把用户迁移自己撞到的
          // 唯一约束当成占坑冲突重试，非幂等的 up() 被跑第二遍。
          if (isUniqueConstraintViolation(error)) {
            throw new RxDBMigrationClaimConflictError(migration.name, error);
          }
          throw error;
        }
        try {
          // 用户代码是唯一能在事务体内运行的外部代码，必须把 executor 交给它 ——
          // 否则用户在 up() 里的写会落回队列并排在本事务之后（裁决④）
          await migration.up(executor);
        } catch (error) {
          console.error(`Migration failed: ${migration.name}`, error);
          throw error;
        }
      }
    });
  }

  #createMigrationWatermarks(): RxDBMigration[] {
    const names = (this.#config.migrations ?? []).map(migration => migration.name);
    const executedAt = new Date();
    return names.map(name => {
      const record = this.entityManager.instantiate(RxDBMigration);
      record.name = name;
      record.executedAt = executedAt;
      return record;
    });
  }

  async #ensureEntityTables(adapter: RxDBAdapterLocalBase): Promise<void> {
    const missingEntities: EntityType[] = [];

    for (const entityType of this.#config.entities) {
      const existed = await adapter.isTableExisted(entityType);
      if (!existed) {
        missingEntities.push(entityType);
      }
    }

    if (missingEntities.length > 0) {
      await adapter.createTables(missingEntities);
    }
  }
}

// 扩展模块以包含 RxDB 系统实体
declare module '@aiao/rxdb' {
  interface RxDB {
    RxDBChange: typeof RxDBChange;
    RxDBBranch: typeof RxDBBranch;
    RxDBMigration: typeof RxDBMigration;
    RxDBSync: typeof RxDBSync;
  }
}
