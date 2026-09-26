import { isPromise, LifecycleScope } from '@aiao/utils';
import { BehaviorSubject, defer, distinctUntilChanged, filter, map, Observable, shareReplay, switchMap } from 'rxjs';
import type { WorkingTreeCaptureHook } from './capture/capture-interceptor.js';
import { EntityManager } from './entity/entity-manager.js';
import { EntityType } from './entity/entity.interface.js';
import { SyncType } from './entity/metadata-options.interface.js';
import {
  assertNoSystemEntityOverride,
  indexSyncOverrides,
  snapshotSyncOverrides
} from './entity/sync-override.js';
import { RxDBTabsGateway } from './gateway/RxDBTabsGateway.js';
import { ReachabilityMonitor } from './network/reachability.js';
import { assertPluginDependencyGraph, resolveUniqueProvider } from './plugin/dependency-graph.js';
import { PluginDependencyScheduler } from './plugin/dependency-scheduler.js';
import {
  missingQueryCacheEngineError,
  type QueryCacheEngineFactory
} from './repository/query-cache-engine.interface.js';
import {
  missingQueryCacheOutboxError,
  type QueryCacheOutboxProvider
} from './repository/query-cache-outbox.interface.js';
import {
  AdapterFactory,
  IRxDBAdapter,
  LocalRxDBAdapter,
  RemoteRxDBAdapter,
  RepositoryInstance,
  RxDBAdapterLocalBase,
  RxDBAdapterName,
  RxDBAdapters
} from './rxdb-adapter.js';
import {
  RemoteEntityInvalidatedEvent,
  RxDBEvent,
  RxDBEventMap,
  TRANSACTION_BEGIN,
  TRANSACTION_COMMIT,
  TRANSACTION_ROLLBACK
} from './rxdb-events.js';
import { assertValidSystemContribution, type RxDBSystemContribution } from './rxdb-plugin-system.js';
import { IRxDBPlugin, Plugin, RxDBPluginDependency } from './rxdb-plugin.js';
import { getEntityMetadata, uuid } from './rxdb-utils.js';
import { RxDBContext, RxDBOptions } from './rxdb.interface.js';
import {
  awaitPluginInstalls,
  createPluginScope,
  destroyPlugin,
  discardPluginScope,
  freezeConfig,
  installOnePlugin,
  installPlugin,
  type PluginLifecycleHost,
  releaseConnectionScope,
  resetPluginScheduling,
  trackPluginInstall,
  unregisterRepository
} from './rxdb.plugin-lifecycle.js';
import { assertLocalAdapterCapabilities, isLocalAdapter, isTransactionEvent } from './rxdb.private.js';
import {
  emitEvent,
  handleTransactionBegin,
  handleTransactionCommit,
  handleTransactionRollback,
  runIsolated
} from './rxdb.transaction.js';
import type { EventListener, IRepositoryConfig, RxDBConfig, TransactionContext } from './rxdb.types.js';
import { SchemaManager } from './schema/SchemaManager.js';
import type { BranchMaterializationSource } from './sync-contract/branch-materialization-source.js';
import { SyncStateHub } from './sync-state.js';
import { ACTIVE_BRANCH_KEY, MAIN_BRANCH_ID } from './system/active-branch-guard.js';
import { RxDBBranch } from './system/branch.js';
import { assertClaimedCapabilities } from './system/capability-watermark.js';
import { createMigrationWatermarks, runMigrations } from './system/migration-runner.js';
import { RxDBMigration } from './system/migration.js';
import { createSystemMigrations } from './system/migrations/index.js';
import { createEntitySyncResolver, type EntitySyncResolver } from './sync-contract/entity-sync-resolver.js';
import { CORE_SYSTEM_ENTITIES, isSystemEntity, registerSystemEntities } from './system/system-entities.js';
import { RXDB_DB_NAME_SUFFIX, RXDB_VERSION } from './version.js';
export type { IRepositoryConfig } from './rxdb.types.js';

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

  /**
   * 停机窗口标记：{@link RxDB.#shutdown} 一进来就置位，与 `#rxdb_initialized` 一起复位。
   *
   * @remarks
   * `#rxdb_initialized` 在整个异步拆卸期间都还是 `true`——它标的是「本纪元已初始化」，
   * 复位必须等拆完。于是拆卸的这段时间里两个判断重合不了：已初始化 ≠ 可以往里装东西。
   * 少了这个标记，窗口内的 `use()` 会把插件装进正在释放的纪元（随后被总闸一起释放），
   * 或者更糟——`#ensure_connection_scope()` 在 {@link RxDB.#release_connection_scope}
   * 置空之后建出一个**脱离本次停机**的新作用域，安装在停机结束后继续跑，而这一纪元
   * 已经没有任何拆卸入口会经过它了。
   */
  #shutting_down = false;

  /**
   * 终态标记：{@link RxDB.destroy} 置位，**不复位**。
   *
   * @remarks
   * 与 `#shutting_down` 是两回事。停机窗口是可逆的——`#shutdown()` 把实例复位成
   * 「可重新 `init()`」，重连拿到的是一个新纪元。而 `destroy()` 释放的是**跟随实例**的
   * 那部分资源（{@link RxDB.reachability} 的退避定时器与状态流、
   * {@link RxDB.syncState} 的上游订阅），它们没有第二次装配的入口，复位就等于交出空壳。
   */
  #destroyed = false;

  #repository_config_map = new Map<string, IRepositoryConfig>();

  /**
   * QueryCache 读引擎工厂 —— 由 `@aiao/rxdb-plugin-querycache` 经 {@link RxDB.queryCacheEngine} 填入。
   *
   * @remarks
   * 与 {@link RxDB.#repository_config_map} 同为插件注册槽，但**不做成表**：策略轴的
   * `SyncType` 是闭合联合（US-025 Out of Scope），这个槽的成员恒为 QueryCache 一个。
   * 做成表只会凭空造出一个没人能往里加第二项的注册表。
   */
  #query_cache_engine: QueryCacheEngineFactory | undefined;

  /**
   * 查询出站队列提供者 —— 由 `@aiao/rxdb-plugin-sync` 经 {@link RxDB.queryCacheOutbox} 填入。
   *
   * @remarks
   * 与 {@link RxDB.#query_cache_engine} 是同一条策略轴上的两半，不合并成一个槽：
   * 读引擎与出站队列分属两个包，装了一个不蕴含装了另一个（只推不读、只读不写的
   * 配置都是合法的应用形态），合并成一槽会逼着两个插件互相依赖。
   */
  #query_cache_outbox: QueryCacheOutboxProvider | undefined;

  /**
   * metadata-only 分支的首次物化来源 —— 由 `@aiao/rxdb-plugin-sync` 经
   * {@link RxDB.branchMaterializationSource} 填入。
   *
   * @remarks
   * 工作树插件切到 metadata-only 分支时来这里取。两个插件互不依赖，这一格是它们唯一的会合点；
   * 一条连接至多一个来源，见 {@link RxDB.branchMaterializationSource}。
   */
  #branch_materialization_source: BranchMaterializationSource | undefined;

  #plugin_map = new Map<Plugin, IRxDBPlugin>();

  /**
   * 已注册的系统贡献，按能力名去重。
   *
   * @remarks
   * 同时是「未认领能力守卫」的认领集合：键就是能力名。因此它必须在**任何适配器动作之前**
   * 填好——守卫要在既有库的第一次写之前跑，而贡献的表要跟新库的建表同批出来。
   * 填充点是 {@link RxDB.use}，见那里的 fail-closed 判定。
   */
  #system_contributions = new Map<string, RxDBSystemContribution>();

  /**
   * 本实例的插件贡献的系统表，按 {@link RxDB.use} 顺序。
   *
   * @remarks
   * 与模块级登记簿（`system-entities.ts`）分开的理由是两者回答的问题不同：登记簿回答
   * 「这个类是不是系统表」，必须是模块级的——`isSystemEntity()`（`system/system-entities.ts`）有跨包消费者，它们
   * 手里没有 RxDB 实例。这份则回答「**这个库**该建哪些系统表」，而那必须按实例算。
   *
   * 混用的代价是跨实例污染：登记簿只增不减，拿它去注入会让进程里任何一个库 `use()` 过的
   * 贡献落到**所有**库上——没装插件的库被建出一整套自己既不写也不拦的表，还要吃它们的迁移，
   * 而它在类型上与真正装了插件的库完全一样。
   *
   * 按类引用去重，不按身份：身份撞车（同 `namespace:name` 的两个不同类）该由
   * {@link SchemaManager.init} 当场抛「实体命名冲突」，在这里按身份吞掉会把它变成静默缺表。
   */
  #contributed_system_entities: EntityType[] = [];

  /**
   * 插件名 → 同名候选（按 {@link RxDB.use} 顺序），`plugin:*` 依赖的唯一解析来源。
   *
   * @remarks
   * 存**数组**而不是单值：重名本身不是错（D4），只有该名字真被 `plugin:*` 注入时才无从裁决，
   * 那一刻要把全部候选列进错误里，使用者才知道是哪两个包撞了名。
   * 名字索引整个留在宿主侧 —— 调度器按实例引用记账（INV-3），它不需要认识任何名字。
   */
  #plugin_by_name = new Map<string, IRxDBPlugin[]>();

  /**
   * 插件激活状态与安装 Promise 的唯一持有者。
   *
   * @remarks
   * 「什么时候装哪个插件」全部收口在这里，`#install_one_plugin` / `#destroy_plugin`
   * 都不做纪元比较（US-015 实现约束）。宿主只提供四件事：解析依赖、建作用域、
   * 释放作用域、跑 `install()`。
   */
  #scheduler: PluginDependencyScheduler = new PluginDependencyScheduler({
    resolveDependency: dependency => this.#resolve_dependency(dependency),
    createScope: plugin => this.#create_plugin_scope(plugin),
    releaseScope: (plugin, scope) => this.#discard_plugin_scope(plugin, scope),
    runInstall: (plugin, scope) => this.#track_plugin_install(plugin, scope)
  });

  /**
   * 连接纪元作用域与上一纪元尚未结算的释放。
   *
   * @remarks
   * `scope` 是「本次连接期间产生的宿主改动」的总闸。`#shutdown()` 里即便 {@link RxDB.#destroy_plugin}
   * 漏掉了谁，这一闸也会把整棵子树释放掉，并把字段置空——**不跨纪元复用**是 `init()` 能重跑的前提。
   *
   * `init()` 建、`#shutdown()` 释放。抽到盒子里是为了让 {@link PluginLifecycleHost}
   * 能写回，而不把 `#` 字段泄漏出本类。
   *
   * `release` 存在的唯一理由是 `init()` 是**同步** API：失败回滚只能 `void` 掉释放 Promise
   * （见 {@link RxDB.#release_connection_scope}），而紧接着的**同步**重试是被明确支持的路径
   * （修好 repository 配置后再 `init()` 一次）。此时上一纪元的撤销动作大多还排在微任务里——
   * 逆序释放只有**最后登记**的那一条落在同步段内，其余都在 `await` 之后。
   *
   * 插件普遍用「某个实例字段是否有值」判断「本纪元已装」（`workspace` 的 store、
   * `storage` 挂在 `rxdb` 上的属性）。不等这批撤销跑完就开新纪元，守卫读到的是上一纪元的
   * 残值，`install()` 直接跳过；随后旧撤销再把字段清空，新纪元就成了一个什么都没登记的空壳，
   * 而且**不报错**。所以新纪元的 `install()` 统一在这个 Promise 之后才执行。
   */
  #connection: { scope?: LifecycleScope; release?: Promise<void> } = {};

  /**
   * 插件 → 它在本纪元的激活作用域。
   *
   * @remarks
   * 与调度器里的安装记录一样按纪元清空。不放到插件实例上：插件实例跨纪元存活
   * （`#plugin_map` 不清），作用域不跨纪元存活，放一起必然读到上一轮的死对象。
   */
  #plugin_scopes = new Map<IRxDBPlugin, LifecycleScope>();

  /** 插件生命周期宿主：构造函数在 `#config` 赋值后创建，getter 捕获类实例。 */
  #pluginHost!: PluginLifecycleHost;

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
   * 适配器名 → 连接纪元。
   *
   * @remarks
   * `disconnect()` / `disconnectAll()` 推进它，`connect()` 在同步段取一次快照，并在引导链的
   * 每个 await 边界比对（见 {@link RxDB.#assert_connect_alive}）。少了这层比对，引导链会在
   * 拆卸**完成之后**才醒来并调用 {@link RxDB.#set_adapter_connected}，把刚断开的适配器重新
   * 标成已连接——`disconnect()` 于是成了一句没有效力的声明：调用方以为停机完成，
   * 而 `#shutdown()` 根本没被触发（拆卸时它还不在已连接集合里），插件、网关与查询缓存全部留存。
   *
   * 断开后立刻重连时更糟：旧链路的写回排在新链路之后，{@link RxDB.#connected_adapter_instances}
   * 最终留下的是那个已经关掉的实例，而它正是 {@link RxDB.localAdapterSync} 交给插件的东西。
   *
   * 永远只增不清。跟着 `#shutdown()` 复位就等于让在飞的旧链路重新对上自己的快照，
   * 这张表要挡的恰恰是那一条链。
   */
  #connect_epochs = new Map<string, number>();

  /**
   * 已成功 `connect()` 的适配器名。
   *
   * @remarks
   * 全局拆卸的时机必须按「已连接」判定，不能用 `#adapter_map.size`：后者统计的是「已实例化」，
   * 而 `localAdapter$` / `remoteAdapter$` 的订阅会经 {@link RxDB.getAdapter} 把从未 `connect()`
   * 的适配器也塞进去。用 map 大小判断时，唯一连接的适配器断开会被误判成「还有别的适配器在」，
   * 插件与 gateway 就永远拆不掉。
   *
   * 只能经 {@link RxDB.#set_adapter_connected} 增删 —— 它负责同步推送
   * {@link RxDB.#adapter_connected_sub}，直接改这个 Set 会让订阅者读到陈旧值。
   */
  #connected_adapters = new Set<string>();

  /**
   * 已连接适配器名 → **实例引用**。
   *
   * @remarks
   * 与 {@link RxDB.#connected_adapters} 一一对应，增删点完全相同。多出来的这份是给
   * {@link PluginDependencyScheduler} 用的：依赖纪元按实例引用判定（US-015 INV-3），
   * 只看名字会漏掉「同名换了新实例」这一类变化——名字没变、布尔位没变，而插件手里
   * 握着的却是一条已经作废的连接。
   *
   * 也是 {@link RxDB.localAdapterSync} 的唯一数据源：插件读到的一定是调度器为本纪元
   * 绑定的那个实例，而不是按名字重新解析出来的另一个。
   */
  #connected_adapter_instances = new Map<string, IRxDBAdapter>();

  /** {@link RxDB.#connected_adapters} 的快照流，供 {@link RxDB.adapterConnected$} 派生。 */
  #adapter_connected_sub = new BehaviorSubject<ReadonlySet<string>>(new Set<string>());

  /**
   * 还在引导中的 `connect()` 数量。
   *
   * @remarks
   * 只服务一件事：判断「依赖来源是否已经尘埃落定」，即
   * {@link PluginDependencyScheduler.reportUnsatisfied} 的开闸条件。计数在 `connect()` 同步段自增，在该适配器
   * **建表完成、置位已连接之后**归零一次——不是在整条 `connect()` 结束时，因为那时插件
   * 安装已经跑完了，报告永远等不到开闸。
   *
   * 并行 `connect('local')` / `connect('remote')` 时这个计数是唯一能把两条链联系起来的东西：
   * 先落地的那条看到计数不为零就闭嘴，声明了 `adapter:remote` 的插件才不会在 remote 还在
   * 建表的时候被喊一句「装不上」。
   */
  #bootstrapping_connects = 0;

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
  public readonly localAdapter$: Observable<LocalRxDBAdapter> = this.#local_adapter_sub.asObservable().pipe(
    distinctUntilChanged(),
    filter(Boolean),
    switchMap(localAdapter =>
      defer(() => this.getAdapter(localAdapter)).pipe(map(adapter => adapter as LocalRxDBAdapter))
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  /**
   * 远程适配器
   *
   * @remarks
   * 缓存语义同 {@link RxDB.localAdapter$}。
   */
  public readonly remoteAdapter$: Observable<RemoteRxDBAdapter> = this.#remote_adapter_sub.asObservable().pipe(
    distinctUntilChanged(),
    filter(Boolean),
    switchMap(localAdapter =>
      defer(() => this.getAdapter(localAdapter)).pipe(map(adapter => adapter as RemoteRxDBAdapter))
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  /**
   * 连接状态 Observable
   *
   * @remarks
   * 这是**全实例聚合**信号：任意一个适配器连上就是 `true`。要等某个具体适配器的表结构就绪，
   * 必须用 {@link RxDB.adapterConnected$} —— 多适配器配置下，远程适配器先连上就会把这里
   * 置 `true`，此时本地适配器可能还停在 `createTables()`。
   *
   * 去重后发射：多适配器下每一次单独的连/断都会重算聚合值，但聚合值没变时不该通知订阅者。
   */
  public readonly connected$ = this.#connected_sub.pipe(distinctUntilChanged());

  /**
   * 远端可达性监视器，与 {@link RxDB.connected$} **并列**而不是合并。
   *
   * @remarks
   * 两者语义不同：`connected$` 是**适配器生命周期**（某个 adapter 的 `connect()` 完成没有），
   * 而 HTTP 适配器的 `connect()` 不发任何网络请求 —— 断网时它照样报 connected。
   * 合并会让「适配器已连接但网断了」这个最常见的状态变得不可表达，而那正是
   * local-first 写入唯一需要区分的状态。
   *
   * **生命周期跟随实例而不是连接纪元**：`#shutdown()` 把实例复位成「可重新 `init()`」，
   * 但网络并不会因为某个适配器断开而重置。在这里 `destroy()` 会让复位后的实例拿到一个
   * 永远停在旧状态、`report()` 也不再生效的监视器。
   */
  public readonly reachability = new ReachabilityMonitor();

  public readonly schemaManager!: SchemaManager;

  public readonly entityManager!: EntityManager;

  /**
   * 同步状态汇聚面：网通不通、还有多少没推上去、这会儿在不在推、上一次错在哪、上一次谁判负。
   *
   * @remarks
   * 三框架的 `useSyncState()` 直接绑这一份快照。生命周期与 {@link RxDB.reachability} 同理 ——
   * 跟随实例而不是连接纪元，`#shutdown()` 不销毁它：面板要在断连期间继续显示「离线、待推 N 条」，
   * 那正是它最该出声的时候。
   */
  public readonly syncState!: SyncStateHub;

  /**
   * 本实例的实体同步配置解析器 —— 「某个实体在这个库里走哪种同步策略」的唯一答案。
   *
   * @remarks
   * 优先级：`syncOverrides` 里的实例覆盖 > 实体装饰器 `sync` > 库级 `sync`。核心与插件的
   * 同步消费者都必须经它取值，不能自己回读 `metadata.sync`：同一实体在两个实例里可以走
   * 不同策略，元数据上那一份只是装饰器的声明，不是本库的生效配置。
   */
  public readonly entitySync: EntitySyncResolver;

  /**
   * 当前已连接的本地适配器实例，**同步**读取。
   *
   * @returns 本地适配器实例
   * @throws 本地适配器未配置或尚未连接时抛错
   *
   * @remarks
   * 给声明了 `inject: ['adapter:local']` 的插件用：`install()` 被调用时依赖必然已就绪，
   * 再走一次 `await firstValueFrom(localAdapter$)` 只是把一个确定的值绕成异步的。
   *
   * 与 {@link RxDB.localAdapter$} 的分工：这里读的是**调度器为本纪元绑定的那个实例**，
   * 而 `localAdapter$` 按名字经 {@link RxDB.getAdapter} 重新解析。纪元交替时两者可能
   * 指向不同对象，依赖纪元身份的代码（US-015 INV-3）必须用这个。需要跨纪元持续跟踪
   * 适配器变化的响应式代码仍然用 `localAdapter$`。
   *
   * 未连接时**抛错而不是返回 `undefined`**：没有依赖声明就来同步取适配器是调用方的时序
   * 错误，返回空值只会把它推迟到某个更远的地方再炸。
   */
  public get localAdapterSync(): LocalRxDBAdapter {
    const adapterName = this.#config.sync.local?.adapter;
    if (adapterName === undefined) {
      throw new Error('[RxDB] local adapter is not configured (sync.local.adapter)');
    }
    const adapter = this.#connected_adapter_instances.get(adapterName);
    if (adapter === undefined) {
      throw new Error(`[RxDB] local adapter '${adapterName}' is not connected; await connect('${adapterName}') first`);
    }
    // 这里不重复判定：能进 #connected_adapter_instances 就说明 `connect()` 的 local 分支
    // 已经过了 assertLocalAdapterCapabilities，缺成员的适配器在那一步就抛掉了。
    return adapter as LocalRxDBAdapter;
  }

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
   * 已登记的系统贡献，按注册顺序
   *
   * @remarks
   * 给核心内部那些**不在 `connect()` 链路上**、却必须让贡献方插一脚的写入口用——今天只有
   * `version/create-branch.ts`：它在自己的事务里建分支，而贡献方的分支级行必须写进**同一个**
   * 事务（见 {@link RxDBSystemContribution.writeBranchRows}）。`connect()` 自己不走这个 getter，
   * 它在局部变量里持有同一份快照。
   *
   * 返回数组而不是内部的 Map：调用方要的是「挨个过一遍」，拿到 Map 只会让它多知道一件
   * 与它无关的事——贡献是按能力名去重的。
   *
   * @internal
   */
  get systemContributions(): readonly RxDBSystemContribution[] {
    return [...this.#system_contributions.values()];
  }

  /**
   * **本库**的系统表：核心自带的四张 + 本实例 `use()` 过的插件贡献的那些
   *
   * @remarks
   * 建表这一侧的唯一真相，两个消费者共用：{@link SchemaManager.init} 把它补进
   * `config.entities`，{@link RxDB.#ensureSystemTables} 拿它划既有库的系统补建批次。
   * 两处都**不能**改读模块级的 `SYSTEM_ENTITIES`——那份是判定用的活视图，只增不减，
   * 见 {@link RxDB.#contributed_system_entities}。
   *
   * 顺序即建表顺序，核心四张在前：贡献方的表允许引用 `RxDBBranch`（分支级行就是这么来的），
   * 反过来不成立。
   *
   * 每次返回新数组：`SchemaManager.init()` 会往 `config.entities` 里推东西，拿到内部数组
   * 就等于让它写回这里。
   *
   * @internal
   */
  get systemEntities(): readonly EntityType[] {
    return [...CORE_SYSTEM_ENTITIES, ...this.#contributed_system_entities];
  }

  /**
   * 本库当前生效的工作树捕获钩子；未启用提交能力时为 `undefined`
   *
   * @remarks
   * **这条路不抛。** 它服务的是核心包里那些拦不住、只能由调用点自己接门禁的写入口
   * （`EntityManager.notifyExternalUpdate()` 是第一个，写入口语义矩阵行 11）。那些方法今天在
   * 「没配本地适配器」和「还没连上」的实例上都能调，所以取钩子走**非抛**的
   * {@link RxDB.#resolve_adapter_instance}，而不是 {@link RxDB.localAdapterSync}——后者在这两种
   * 情形下各抛一次，接上门禁就等于给它们凭空加一个「未连接」异常，而 FR-046 要求未启用能力的库
   * 行为逐字节不变。
   *
   * 钩子挂在**适配器实例**上（{@link RxDBAdapterLocalBase.workingTreeCaptureHook}），不在本类里
   * 另存一份：`connect()` / `disconnect()` 会换掉实例，存一份就会在换代之后指着上一纪元的运行时。
   *
   * @internal
   */
  get workingTreeCaptureHook(): WorkingTreeCaptureHook | undefined {
    const adapter = this.#resolve_adapter_instance(this.#config.sync.local?.adapter);
    // 与 localAdapterSync 同一条理由不重复判定：能进 #connected_adapter_instances 就说明
    // `connect()` 的 local 分支已经过了 assertLocalAdapterCapabilities。
    return (adapter as LocalRxDBAdapter | undefined)?.workingTreeCaptureHook;
  }

  /**
   * 已连接的本地适配器实例；未配置或尚未连接时为 `undefined`
   *
   * @remarks
   * **这条路不抛**，与 {@link RxDB.localAdapterSync} 的分工只在这一点上：那个服务的是
   * 声明了 `inject: ['adapter:local']` 的插件，被调用时依赖必然已就绪，取不到就是调用方
   * 的时序错误，该炸；这个服务的是**事件到达时**才执行的代码 —— 事件什么时候来不由接收方
   * 决定，一条在断连期间飘到的通知不该变成一次异常。
   *
   * 今天的唯一消费方是能力插件的 {@link CAPABILITY_ENABLED_EVENT} 处理器（FR-037）：
   * 处理器本身**同步**把捕获钩子装到本纪元的适配器上——不 `await`，走
   * `await firstValueFrom(localAdapter$)` 会让出一个微任务，而那个缝隙里的写入不留痕迹。
   *
   * 但这只保证处理器自己不让出，不保证处理器**何时**跑：接收端若正处于一笔打开的事务中，
   * {@link RxDB.dispatchEvent} 会把这条非事务事件压进队列，直到那笔事务 COMMIT 才派发，
   * 钩子的安装随之延后一个事务窗口。事件不会丢，而且那笔事务本就开始于能力启用之前——
   * 它不需要被新装的钩子看见。
   *
   * 读的是**调度器为本纪元绑定的那个实例**（与 `localAdapterSync` 同一份来源），不是按名字
   * 重新解析：纪元交替时两者可能指向不同对象，而钩子必须装在当前纪元的那一个上。
   *
   * @internal
   */
  get localAdapterIfConnected(): LocalRxDBAdapter | undefined {
    const adapter = this.#resolve_adapter_instance(this.#config.sync.local?.adapter);
    // 与 localAdapterSync 同一条理由不重复判定：能进 #connected_adapter_instances 就说明
    // `connect()` 的 local 分支已经过了 assertLocalAdapterCapabilities。
    return adapter as LocalRxDBAdapter | undefined;
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
    // 覆盖在这里就校验并快照：早于实体绑定与任何数据库写入，之后调用方改原对象也影响不到本实例。
    if (options.syncOverrides !== undefined) {
      this.#config.syncOverrides = snapshotSyncOverrides(options.syncOverrides, options.entities, isSystemEntity);
    }
    this.entitySync = createEntitySyncResolver(this.#config.sync, indexSyncOverrides(this.#config.syncOverrides ?? []));
    this.schemaManager = new SchemaManager(this);
    this.entityManager = new EntityManager(this);
    // changelog 路径的待推数由 `@aiao/rxdb-plugin-history` 在安装时经
    // `syncState.bindPushableCount()` 接上（US-025 阶段 C）：那条流的主人随连接纪元来去，
    // 而本汇聚器跟随实例，构造期没有也不该有它。
    this.syncState = new SyncStateHub({ online$: this.reachability.online$ });
    this.context = { ...this.#config.context };
    this.#pluginHost = this.#createPluginHost();
    this.#freeze_config();
  }

  /**
   * 初始化实例：装配插件、拉起 Schema / Entity / Version 管理器、开网关与事件系统。
   *
   * 幂等：已初始化时直接返回。`connect()` 会在同步段自行调用它，通常无需手动调用。
   *
   * @throws 实例正处于 `#shutdown()` 的拆卸窗口内时抛出。
   *
   * @remarks
   * 任一管理器初始化抛错都会把初始化标志、插件登记与连接作用域一并回滚，
   * 调用方修好问题后重新 `init()` 能真正重跑剩余步骤，而不是被半套状态挡住。
   */
  init() {
    // 拆卸窗口内不能重新初始化：此刻 #rxdb_initialized 仍为 true，早退会让调用方拿到一个
    // 「已初始化」的承诺，而 #shutdown() 随后会把插件、网关、versionManager 逐个销毁，
    // 留下一个空壳。抛错让调用方等拆卸结束后重来。
    if (this.#shutting_down) {
      throw new Error('[RxDB] init() rejected: instance is shutting down');
    }
    // 终态不可逆，与停机窗口分开判：destroy() 之后 reachability / syncState 已经释放，
    // 放行只会交出一个「面板永远停在销毁那一刻」的空壳，而那种故障静默且极难排查。
    // connect() 会把这个同步抛出转成 reject（见其尾部对 init() 的 try/catch）。
    if (this.#destroyed) {
      throw new Error('[RxDB] init() rejected: instance is destroyed');
    }
    if (this.#rxdb_initialized) return;
    this.#rxdb_initialized = true;
    if (!this.#context.clientId) {
      this.#context.clientId = uuid();
    }
    // 初始化本地和远程适配器名称
    //
    // `sync` 在 RxDBOptions 上是必填，且 `rxdb.private.ts` 的 isLocalAdapter 直接
    // 解引用 `options.sync.local`。从前这里写 `|| {}`，同一个字段两套契约：JS 调用方
    // 或反序列化出来的旧配置漏了 sync 时，这里静默当成空对象放行，随后要么在
    // isLocalAdapter 里炸一个看不懂的 TypeError，要么造出一个没有任何适配器的空实例。
    // 在入口点破，错误信息指向真正该改的地方。
    if (!this.#config.sync) {
      throw new Error('[RxDB] init() 失败：配置缺少库级 sync，无法确定 local / remote 适配器');
    }
    const { local, remote } = this.#config.sync;
    if (local) this.#local_adapter_sub.next(local.adapter);
    if (remote) this.#remote_adapter_sub.next(remote.adapter);
    // 安装插件并初始化各个管理器
    // #install_plugin 同步不抛（错误记进调度器的安装记录），故意留在 try 外——
    // Schema/Entity 初始化失败仍只回滚管理器；插件失败由 connect() 传播。
    this.#ensure_connection_scope();
    this.#install_plugin();
    try {
      // 插件贡献的系统表要等 use() 之后才认得出来，构造期那一轮只核得了模块级登记簿
      assertNoSystemEntityOverride(this.#config.syncOverrides ?? [], this.systemEntities);
      this.schemaManager.init();
      this.entityManager.init();
      if (this.#config.multiInstance !== false) this.#init_gateway();
      this.#init_event();
    } catch (error) {
      // 任一步骤抛错，本实例并未真正初始化完成——复位标记，让调用方修复问题
      // （如补齐 repository 配置）后重新 init()/connect() 时能真正重跑剩余步骤，
      // 而不是被这里提前置 true 的标记挡住，之后每次都静默空跑。
      this.#rxdb_initialized = false;
      // 插件已经装了半套（#install_plugin 在 try 之外），这批登记必须跟着一起回滚，
      // 否则重新 init() 会把第二份登记叠在第一份上。init() 是同步 API 不能 await，
      // 但字段置空发生在同步段内，重跑一定拿到全新作用域。
      void this.#release_connection_scope();
      // 与上一行同步成对：作用域没了而调度记录还停在 active，重新 init() 时调度器会认为
      // 「依赖纪元没变、插件还装着」而一个都不重装，拿到的是个从没重新登记过的空壳。
      this.#reset_plugin_scheduling();
      // 这个管理器的资源释放与 {@link RxDB.#shutdown} 逐条对称——它不在连接作用域里，
      // 漏掉就没有第二个人会拆。
      //
      // 网关与 `versionManager`（现由 `@aiao/rxdb-plugin-history` 提供）**都不在这里点名**：
      // 前者已登记进上面刚释放的连接作用域，且作为最晚登记的一条由 `dispose()` 在第一个
      // await 让路之前同步拆掉——正是 `init()` 这条同步路径需要的时序；后者随插件作用域
      // 一并释放，上面 `#release_connection_scope()` 已经覆盖。
      // Repository 身份缓存与实体类绑定：未 init 完就抛时是空操作，init 完之后抛才有东西可清。
      this.entityManager.destroy();
      throw error;
    }
  }

  /**
   * 注册 Repository
   * 统一接口，所有 repository 配置存储在 RxDB 中
   *
   * @param repositoryName - Repository 名称
   * @param config - Repository 配置对象
   * @param scope - 传入时，本次注册会随作用域释放而撤销；不传则永久有效（与改造前一致）
   *
   * @remarks
   * 撤销按**配置对象身份**守卫：释放时表里已经换成别人的配置，说明有更晚的注册覆盖了本次，
   * 此时什么都不做——否则先装后卸的插件会把后来者的注册一并删掉。
   *
   * 传了 `scope` 时**写表这一步本身**就在 `setup` 里：作用域已不是 `active` 时
   * `acquire()` 同步抛且不执行 `setup`，注册于是也不发生。写在 `acquire()` 之外的话，
   * 这条注册会留在表里而没有任何人能撤销它——正是本原语「setup 抛错时这一条不进清单」
   * 要杜绝的那种孤儿。
   */
  public repository<RT extends RepositoryInstance>(
    repositoryName: string,
    config: IRepositoryConfig<RT>,
    scope?: LifecycleScope
  ): this;
  public repository(repositoryName: string, config: IRepositoryConfig, scope?: LifecycleScope): this {
    if (scope === undefined) {
      this.#repository_config_map.set(repositoryName, config);
      return this;
    }
    scope.acquire(() => {
      this.#repository_config_map.set(repositoryName, config);
      return () => this.#unregister_repository(repositoryName, config);
    }, `rxdb:repository:${repositoryName}`);
    return this;
  }

  /**
   * 注册 QueryCache 读引擎工厂
   *
   * @param factory - 引擎工厂，见 {@link QueryCacheEngineFactory}
   * @param scope - 传入时，本次注册会随作用域释放而撤销；不传则永久有效
   *
   * @remarks
   * 形状逐条对齐 {@link RxDB.repository}：撤销按**工厂对象身份**守卫（释放时槽里已换成
   * 别人的工厂，说明有更晚的注册覆盖了本次，此时什么都不做），且**写槽这一步本身**放在
   * `acquire()` 的 `setup` 里 —— 作用域已不是 `active` 时 `acquire()` 同步抛且不执行
   * `setup`，注册于是也不发生，不会留下一条没人能撤销的孤儿登记。
   *
   * 与门面轴的 `repository()` 的区别只在被登记的东西：那一条决定 `getRepository(E)` 的
   * 公开面，这一条只填 `SyncType.QueryCache` 的读实现，不改任何公开面。
   *
   * @example
   * ```typescript
   * import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
   *
   * rxdb.use(rxDBPluginQueryCache);
   * ```
   */
  public queryCacheEngine(factory: QueryCacheEngineFactory, scope?: LifecycleScope): this {
    if (scope === undefined) {
      this.#query_cache_engine = factory;
      return this;
    }
    scope.acquire(() => {
      this.#query_cache_engine = factory;
      return () => this.#unregister_query_cache_engine(factory);
    }, 'rxdb:query-cache-engine');
    return this;
  }

  /**
   * 注册查询出站队列提供者
   *
   * @param provider - 出站队列提供者，见 {@link QueryCacheOutboxProvider}
   * @param scope - 传入时，本次注册会随作用域释放而撤销；不传则永久有效
   *
   * @remarks
   * 形状与 {@link RxDB.queryCacheEngine} 逐条相同（身份守卫撤销、写槽放在 `setup` 里）。
   *
   * 分成两个注册口而不是让 sync 插件把两样东西一起交上来：出站队列随 sync 插件走，
   * 读引擎随 querycache 插件走，两个包各自登记各自的那一半，谁都不必认识对方。
   *
   * @example
   * ```typescript
   * import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
   *
   * rxdb.use(rxDBPluginSync);
   * ```
   */
  public queryCacheOutbox(provider: QueryCacheOutboxProvider, scope?: LifecycleScope): this {
    if (scope === undefined) {
      this.#query_cache_outbox = provider;
      return this;
    }
    scope.acquire(() => {
      this.#query_cache_outbox = provider;
      return () => this.#unregister_query_cache_outbox(provider);
    }, 'rxdb:query-cache-outbox');
    return this;
  }

  /**
   * 登记 metadata-only 分支的首次物化来源
   *
   * @param source - 物化来源，见 {@link BranchMaterializationSource}
   * @param scope - 传入时，本次登记会随作用域释放而撤销；不传则永久有效
   * @throws Error 这条连接上已经登记了另一个来源
   *
   * @remarks
   * 形状与 {@link RxDB.queryCacheOutbox} 相同（身份守卫撤销、写槽放在 `setup` 里），多一道
   * 冲突检查：一条连接**至多一个**来源。两个来源意味着同一条分支可以被两份互不相识的快照
   * 各物化一次，所以后到的那个当场抛错，而不是静默顶掉前一个；同一个来源重复登记是幂等的。
   *
   * 官方同步插件在每个连接期的 `install` 里登记：断连时随作用域撤销，重连时重新登记，
   * 重复 `use()` 由插件去重、走不到第二次登记。业务代码不需要调它。
   *
   * @example
   * ```typescript
   * import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
   *
   * rxdb.use(rxDBPluginSync); // 装配时自动登记
   * ```
   */
  public branchMaterializationSource(source: BranchMaterializationSource, scope?: LifecycleScope): this {
    if (scope === undefined) {
      this.#assign_branch_materialization_source(source);
      return this;
    }
    scope.acquire(() => {
      this.#assign_branch_materialization_source(source);
      return () => this.#unregister_branch_materialization_source(source);
    }, 'rxdb:branch-materialization-source');
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
   * 停机窗口（`disconnect()` / `disconnectAll()` 已开始拆卸、尚未拆完）内调用只**登记**，
   * 安装推迟到下一次 `init()`——本纪元正在退场，往里装的东西没有对称的拆卸入口。
   * 见 {@link RxDB.#shutting_down}。
   *
   * **安装**失败不从这里出去：同步 `install()` 失败只 `console.error`，异步或同步失败都会记入
   * 安装 Promise，由后续 `connect()` 传播 —— 包括**同一个适配器的重复 `connect()`**：命中缓存
   * 那一路也会补跑一趟安装等待，否则连上之后 `use()` 的插件失败就永远出不来（`use()` 同步返回
   * `this`，自己没有报错的出口）。
   *
   * **规划期**错误则相反，同步从这里抛：依赖成环（{@link RxDBPluginDependencyCycleError}）与
   * 依赖歧义（{@link RxDBPluginAmbiguousDependencyError}）都在写进注册表**之前**判，抛出时本次
   * 注册整个不发生。两者都是声明本身不自洽，等到 `connect()` 再报已经晚了 —— 而且调用方手里
   * 并没有摘除插件的入口，让它落进注册表就等于永久毒化后面每一次 `init()`。
   *
   * @param plugin - 插件构造函数
   * @param options - 插件选项
   * @returns 返回 RxDB 实例，支持链式调用
   * @throws {@link RxDBPluginDependencyCycleError} 加入本插件后依赖图成环
   * @throws {@link RxDBPluginAmbiguousDependencyError} 某个被注入的插件名有多个候选
   */
  public use<Options = never>(plugin: Plugin<Options>, options?: Options) {
    if (this.#plugin_map.has(plugin)) {
      console.warn('plugin already installed');
      return this;
    }
    const plugin_instance = plugin(this, options);
    // 先校验后提交：校验用的是「现有注册表 + 本实例」，不通过就当这次 use() 没发生过
    this.#assert_plugin_graph(plugin_instance);
    // 系统贡献要赶在建表之前登记，所以它在 #install_one_plugin **之前**读。
    this.#register_system_contribution(plugin_instance);
    this.#plugin_map.set(plugin, plugin_instance);
    this.#index_plugin_name(plugin_instance);
    // 装不装由 #install_one_plugin 自己判：本纪元已经退场时它是空操作。
    this.#install_one_plugin(plugin_instance);
    return this;
  }

  /**
   * 按名字取已注册的插件实例。
   *
   * @param name - 插件的 {@link IRxDBPlugin.name}
   * @returns 同名候选全集的快照，按 {@link RxDB.use} 顺序；没有则为空数组
   *
   * @remarks
   * 返回**数组**而不是单个实例：重名允许存在（D4），调用方要自己决定拿哪一个。插件工厂用它
   * 做「我是不是已经装过了」的自检，比在数据库实例上挂自有属性再 `hasOwnProperty` 探测可靠 ——
   * 那种门面属性是给使用者的，不是给探测用的，重命名门面就会把自检探空。
   *
   * 每次返回新数组：调用方往里推东西不会写回宿主索引。
   */
  public getPlugins(name: string): readonly IRxDBPlugin[] {
    const candidates = this.#plugin_by_name.get(name);
    return candidates === undefined ? [] : [...candidates];
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
   * 列出当前已注册的 Repository 名称
   *
   * @returns 按注册顺序排列的仓储名数组
   *
   * @remarks
   * 给报错用的。实体声明的 `repository` 找不到时，只说「没找到」等于让人猜是拼错了
   * 还是插件没装；列出当前有什么，调用方一眼看得出缺的是哪一类。核心自身只注册
   * `Repository`，其余全由插件在 `install()` 里挂上来。
   */
  getRepositoryNames(): string[] {
    return Array.from(this.#repository_config_map.keys());
  }

  /**
   * 取已注册的 QueryCache 读引擎工厂
   *
   * @returns 装了插件时是工厂本身，否则 `undefined`
   *
   * @remarks
   * `undefined` 是有意暴露出来的：调用方要自己抛 {@link RxDBMissingPluginError}，
   * 而不是在这里代抛 —— `connect()` 的启动护栏要点名**具体哪个实体**，这一层不知道。
   */
  getQueryCacheEngine(): QueryCacheEngineFactory | undefined {
    return this.#query_cache_engine;
  }

  /**
   * 取已注册的查询出站队列提供者
   *
   * @returns 装了插件时是提供者本身，否则 `undefined`
   *
   * @remarks
   * 与 {@link RxDB.getQueryCacheEngine} 同理，`undefined` 交给调用方去抛
   * {@link RxDBMissingPluginError} —— 点名哪个实体这一层不知道。
   */
  getQueryCacheOutbox(): QueryCacheOutboxProvider | undefined {
    return this.#query_cache_outbox;
  }

  /**
   * 取已登记的首次物化来源
   *
   * @returns 装了同步插件且处于连接期时是来源本身，否则 `undefined`
   *
   * @remarks
   * `undefined` 交给工作树插件去抛 `branch_not_materialized`（`source_unavailable`）——
   * 点名哪条分支这一层不知道。
   */
  getBranchMaterializationSource(): BranchMaterializationSource | undefined {
    return this.#branch_materialization_source;
  }

  /**
   * 连接适配器
   * @param adapterName - 适配器名称
   * @returns 返回连接的适配器实例
   * @throws 引导期间被 `disconnect()` / `disconnectAll()` 中止时抛出（见 {@link RxDB.#connect_epochs}）
   */
  connect<K extends keyof RxDBAdapters>(adapterName: K): Promise<RxDBAdapters[K]>;
  connect(adapterName: RxDBAdapterName): Promise<IRxDBAdapter>;
  connect(adapterName: string): Promise<IRxDBAdapter> {
    // 终态判在重入缓存**之前**：已经引导完的适配器在 #connect_promise_map 里留着一条
    // resolved 的 Promise，下面命中它就直接返回了，`init()` 的终态守卫在这条路径上走不到。
    // 于是 destroy() 的拆卸窗口内（disconnectAll 尚未清空该 map）连一个正要被断开的
    // 适配器会被交出去，而这个实例已经没有第二次 init() 了。
    if (this.#destroyed) {
      return Promise.reject(new Error('[RxDB] connect() rejected: instance is destroyed'));
    }
    // 防重入：如果已经在连接中，直接返回缓存的 Promise
    const pending = this.#connect_promise_map.get(adapterName);
    if (pending) {
      // 还在引导中的那条链**原样**返回：`install()` 里同步回调 `connect()` 必须命中同一条
      // Promise，派生一条出去会绕开 `connectPromise.catch()` 那份兜底。
      if (!this.#connected_adapters.has(adapterName)) return pending;
      // 已经引导完的适配器再 `connect()`：缓存里那条 Promise 早就 resolve 了，插件安装那一段
      // 一步都不会重跑。连上之后 `use()` 进来的插件正是落在这个缝里 —— 它的安装失败此前只剩
      // 一行 console.error，而 `use()` 是同步的、返回 `this`，自己没有报错的出口。这里补上
      // 那一趟，`use()` 文档承诺的「由后续 connect() 传播」才是真的。
      //
      // 不回滚 `#connected_adapters`：与引导期失败不同，本适配器的引导已经**整个走完**，
      // 拆掉一条健康的连接来惩罚一个后来者插件是错的。
      return pending.then(async adapter => {
        await this.#await_plugin_installs();
        return adapter;
      });
    }

    // 引导链全程是 await，断连可以插进任何一个缝里。纪元在同步段取快照，之后每个 await
    // 边界比对一次；比对失败就地中止，且**不做任何清理**——连接一律由 disconnect() 按
    // #adapter_map 关闭（见 #invalidate_connect）。这条链自己再关一遍就是两次 disconnect()。
    const epoch = this.#connect_epochs.get(adapterName) ?? 0;

    // 先入缓存再启动：插件 install 可能同步回调 connect()，必须命中同一条 Promise。
    // init() 必须在 connect() 返回前同步跑完，同一轮 `new Entity()` 才能命中 registry。
    let startConnect!: () => void;
    let failConnect!: (error: unknown) => void;
    const started = new Promise<void>((resolve, reject) => {
      startConnect = resolve;
      failConnect = reject;
    });
    // 引导计数：恰好归零一次，成功与失败两条路都要走到（见 #bootstrapping_connects）
    this.#bootstrapping_connects += 1;
    let counted = true;
    const bootstrapDone = () => {
      if (!counted) return;
      counted = false;
      this.#bootstrapping_connects -= 1;
    };
    const connectPromise = (async () => {
      await started;
      this.#assert_connect_alive(adapterName, epoch);
      const adapter = await this.getAdapter(adapterName);
      // 挡「断连已经发生，本链却刚从工厂里建出新实例」：放行就会 open 一条谁都不会关的连接——
      // disconnect() 清空 #adapter_map 的那一刻，这个实例还没被建出来。
      this.#assert_connect_alive(adapterName, epoch);
      await adapter.connect();
      // 建表与迁移是重活，且要写一条可能已被 disconnect() 关掉的连接，先拦一道。
      this.#assert_connect_alive(adapterName, epoch);
      if (isLocalAdapter(adapterName, this.#config)) {
        // 在 local 分支入口一次性判定，判定过了后面全部直调 —— 见 assertLocalAdapterCapabilities。
        const localAdapter = assertLocalAdapterCapabilities(adapterName, adapter);
        // 初始化
        const existed = await adapter.isTableExisted(RxDBMigration);
        const contributions = [...this.#system_contributions.values()];
        const systemMigrations = createSystemMigrations(this.entityManager, contributions);
        if (existed) {
          // 守卫排在这一切之前，包括 #ensureSystemTables：它要回答的是「这个库该不该由本进程打开」，
          // 而所有后续步骤都已经在写了。放到 runMigrations 里顺带做会省一次读事务，但那样守卫与
          // 第一次写之间就只剩「同一个函数里靠前几行」这种靠读代码维持的保证。
          await this.#assertClaimedCapabilities(localAdapter);
          // 已存在表结构，执行升级流程。
          //
          // 系统表与系统迁移一律排在 migrateSystemSchema() **之前**：水位线一旦写下
          // `__rxdb_system_schema__:N`，后面任何一步失败都会把库留在「标成 N、内容却没到位」
          // 的状态——旧客户端被 UnsupportedRxDBSystemVersionError 拒之门外，新能力也没拿到。
          // 反过来则是可重试的：水位线停在旧值，下次启动重跑整段（data-model.md §8「全有或全无」）。
          await this.#ensureSystemTables(localAdapter);
          await runMigrations(systemMigrations, localAdapter, this.entityManager);
          await localAdapter.migrateSystemSchema();
          localAdapter.completeBootstrap();
          await runMigrations(this.#config.migrations, localAdapter, this.entityManager);
          await this.#ensureEntityTables(localAdapter);
        } else {
          // 创建表结构
          const branch = this.entityManager.instantiate(RxDBBranch);
          branch.id = MAIN_BRANCH_ID;
          branch.activated = true;
          // 冗余列与 `activated` 必须同写（`system/branch.ts` 的可空唯一列就架在它上面）。
          // 漏写这一处，新库的 main 从第一天起就不受「至多一个 active」约束，且不报任何错。
          branch.activeKey = ACTIVE_BRANCH_KEY;
          await localAdapter.createTables(this.#config.entities, [
            branch,
            // 插件贡献的初始行必须挤进**这一次**调用：建表与初始行不同批的话，中间断电留下的是
            // 一张「表在、行不在」的库，而空表与缺行的表在形态上完全一样，没有任何东西能事后分辨。
            ...contributions.flatMap(contribution =>
              contribution.createInitialRows(this.entityManager, { branchIds: [branch.id] })
            ),
            // 新库不跑系统迁移：初始行已在上一行随建表写入，链里的名字在这里直接写成已执行水位。
            // 漏掉这批水位线，下次启动会在一张**已经初始化过**的库上重跑 up()，撞主键。
            ...createMigrationWatermarks([...systemMigrations, ...(this.#config.migrations ?? [])], this.entityManager)
          ]);
          await localAdapter.migrateSystemSchema();
          localAdapter.completeBootstrap();
        }
        await localAdapter.reconcileEntityIndexes?.(this.#config.entities);
        if (existed) {
          // 既有库才把贡献的能力接到这条连接上。新库不调：它的贡献行全是上面那次
          // `createTables()` 刚由本进程写下的，取值当场就已知道，读回来问的是自己一行之前
          // 写了什么；何况那次建表是一次原子提交，在它之外再开事务会破掉「表与初始行同批」。
          //
          // 位置排在 `#set_adapter_connected` **之前**且不可下移：置位同时是 `adapter:local`
          // 的就绪判据，声明了该依赖的插件在它之后才被安装——挪到那之后就会留下一个
          // 「别的插件已经在写、本能力还没接通」的窗口，而那批写入不留痕迹。
          for (const contribution of contributions) {
            await contribution.bootstrapExisting({ adapter: localAdapter });
          }
        }
      }
      // 引导已经跑完，只剩写回。这是纪元比对的最后一道，也是最关键的一道：整个机制要防的
      // 就是拆卸之后才落下的这一笔（见 #connect_epochs）。
      this.#assert_connect_alive(adapterName, epoch);
      // 先于 #await_plugin_installs 置位：这一步同时是「adapter:local / adapter:remote 就绪」
      // 的判据（见 #resolve_dependency），调度器要靠它才会放行声明了该依赖的插件，
      // 而那批安装恰好跑在下一行的 await 里面。
      this.#set_adapter_connected(adapterName, adapter);
      // 与 disconnect() 里的解绑成对：那一侧把名字置回 `''`，这里填回来，
      // localAdapter$ / remoteAdapter$ 的去重环节才会认出「换了一个实例」。
      // 只断一个适配器时 #shutdown() 不会跑，init() 也因幂等早退而不再填名字，
      // 少了这一行，持续订阅者会一直攥着重连前那个已断开的实例。
      this.#publish_adapter_name(adapterName);
      // 本条链的引导到此为止，剩下的是插件安装。先归零再装，最后一条链才有机会开闸报告。
      bootstrapDone();
      try {
        await this.#await_plugin_installs();
        // 与上一行同一个 try：护栏抛出时，下面那段回滚（摘出已连接集合 + 让调度器释放
        // 依赖它的插件）与插件安装失败走的是同一条路——连接已经建起来了，不能留着。
        this.#assert_query_cache_engine();
        this.#assert_query_cache_outbox();
      } catch (error) {
        // 本适配器的引导没有走完，不能留在已连接集合里。聚合信号只在真的一个都不剩时才落下，
        // 否则别的连着的适配器会被一起误报成断开。
        this.#set_adapter_connected(adapterName, undefined);
        // 依赖已经作废：让调度器把靠它装起来的插件释放掉，别留着一份绑在死连接上的登记。
        this.#scheduler.reconcile();
        await this.#scheduler.settle();
        throw error;
      }
      // 插件安装是整条引导链里唯一可以无限期挂起的一段（install() 等外部资源），
      // 因此也是最可能被停机横穿的一段：拆卸会先作废纪元、销毁插件，再解锁这里的等待。
      // 少了这道比对，被拆卸横穿的 connect() 会在插件已销毁、已连接集合已清空之后
      // 「成功」返回一个适配器，调用方据此以为连接可用。与前几道同口径：只抛错、不清理。
      this.#assert_connect_alive(adapterName, epoch);
      return adapter;
    })();

    // 连接失败时清除缓存的 rejected promise，允许后续重试（不吞掉错误）
    connectPromise.catch(() => {
      // 半路失败（getAdapter / 建表 / init 抛错）时补一次归零：否则计数永远挂着，
      // 后续所有 connect() 都以为还有链在引导，报告再也开不了闸。
      bootstrapDone();
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
   * 指定适配器的连接状态流。
   *
   * @param adapterName - 适配器名称
   * @returns 该适配器连上（表结构已就绪）时发 `true`，断开时发 `false`；去重后发射
   *
   * @remarks
   * 与聚合的 {@link RxDB.connected$} 的区别是这里**认适配器**。插件的 `install()` 要等的是
   * 「我要用的那个适配器建好表了」，用聚合信号会被另一个先连上的适配器提前放行。
   *
   * 置位时机在插件安装**之前** —— 引导期的插件正是靠它解除等待，等到插件安装之后就死锁了。
   * 因此它表示的是「表结构可用」，不是「整个 `connect()` 已完成」。
   */
  adapterConnected$(adapterName: string): Observable<boolean> {
    return this.#adapter_connected_sub.pipe(
      map(connected => connected.has(adapterName)),
      distinctUntilChanged()
    );
  }

  /**
   * 断开适配器连接
   *
   * 仅断开指定适配器；只有当所有**已连接**的适配器都已断开时，才执行全局拆卸
   * （插件、网关、versionManager 与初始化状态）。避免单适配器断开误拆全局资源。
   *
   * 该适配器的 `connect()` 还在引导中时，本方法会作废它：那条链在下一个 await 边界以
   * 中止错误 reject，而不是在拆完之后把适配器标回已连接。作废是同步的，不等它落地
   * （理由见 {@link RxDB.#invalidate_connect}）。
   *
   * @param adapterName - 适配器名称
   */
  async disconnect(adapterName: RxDBAdapterName): Promise<void> {
    this.#invalidate_connect(adapterName);
    const cached = this.#adapter_map.get(adapterName);
    if (!cached) return; // 未实例化，无需断开
    const adapter = await cached;
    // 断开最后一个**已连接**适配器前先执行全局拆卸（插件须在适配器断开前销毁）。
    // 判定依据是 #connected_adapters 而非 #adapter_map.size，理由见前者的 @remarks。
    const wasConnected = this.#set_adapter_connected(adapterName, undefined);
    if (wasConnected) {
      if (this.#connected_adapters.size === 0) await this.#shutdown();
      // 还有别的适配器连着：只把靠**这一个**适配器活着的插件释放掉，其余不受影响（AC#4）。
      // 释放必须早于下面的 adapter.disconnect()（INV-7）——插件的撤销条目多半还要用这条连接
      // （删触发器、drop 影子表），适配器先断开会让它们在一个已关闭的连接上执行。
      else {
        this.#scheduler.reconcile();
        await this.#scheduler.settle();
      }
    }
    try {
      await adapter.disconnect();
    } finally {
      // 无论 adapter.disconnect() 成功与否都要清掉缓存条目——否则失败时死实例会一直
      // 留在 #adapter_map 里，重试 getAdapter() 复用同一个已失败的实例而不是走工厂
      // 重建，disconnect 重试也会对同一个（可能已部分拆卸的）实例重复调用。
      this.#adapter_map.delete(adapterName);
      this.#connect_promise_map.delete(adapterName);
      // 解绑名字。#shutdown() 里那两行只覆盖「最后一个适配器也断了」的情形；还有别的
      // 适配器连着时它根本不跑，名字原样留在 subject 里，去重环节于是看不到任何变化——
      // 重连建出的新实例永远推不到仍在订阅的调用方手上（它们还指着已断开的旧实例）。
      this.#retract_adapter_name(adapterName);
    }
  }

  /**
   * 断开全部适配器并执行全局拆卸。
   *
   * 与 {@link RxDB.disconnect} 同口径：先作废所有在飞的 `connect()`，它们会以中止错误
   * reject。不作废的话，它们会在 `#shutdown()` 之后醒来，把刚清空的已连接集合重新填上。
   */
  async disconnectAll(): Promise<void> {
    for (const adapterName of this.#connect_promise_map.keys()) this.#invalidate_connect(adapterName);
    const adapters = await Promise.all(this.#adapter_map.values());
    // 插件须在适配器断开前销毁
    await this.#shutdown();
    try {
      await Promise.all(adapters.map(adapter => adapter.disconnect()));
    } finally {
      // 同 disconnect：部分适配器 disconnect 失败也不能让全部缓存条目悬空。
      this.#adapter_map.clear();
      this.#connect_promise_map.clear();
      this.#clear_adapter_connected();
    }
  }

  /**
   * 终态销毁：断开全部适配器，再释放**跟随实例**而不是连接纪元的那部分资源。
   *
   * @remarks
   * 与 {@link RxDB.disconnectAll} 分成两个出口，因为两者的复位语义相反。`disconnectAll()`
   * 走 `#shutdown()`，把实例复位成「可重新 `init()`」；而 {@link RxDB.reachability} 与
   * {@link RxDB.syncState} 按设计**不跟随连接纪元**——网络不会因为某个适配器断开而重置，
   * 面板也要在断连期间继续显示「离线、待推 N 条」。于是它们只能在这里释放：
   * `reachability` 自己攥着退避定时器和两条长活的 subject；宿主上那对
   * `online` / `offline` 监听自 US-025 D2 起改成按需挂（`watch()` 引用计数，
   * 目前唯一的持有者是 `@aiao/rxdb-plugin-sync` 的作用域）。没有终态出口的话，
   * 一个退避中的实例会把定时器连同自己一起吊住，多实例 / HMR / 测试按实例数线性累积。
   *
   * 幂等；不必先调 `disconnectAll()`，它自己会断干净。销毁后 `init()` 抛错、
   * `connect()` reject（见 {@link RxDB.init}），实例不可复用。
   *
   * @example
   * ```typescript
   * // 组件卸载 / 进程退出时
   * await rxdb.destroy();
   * ```
   */
  async destroy(): Promise<void> {
    if (this.#destroyed) return;
    // 先于 await 置位：拆卸期间进来的 connect() 直接被 init() 的终态判据挡掉，
    // 否则它会在 disconnectAll() 之后醒来，把刚清空的已连接集合重新填上。
    this.#destroyed = true;
    try {
      await this.disconnectAll();
    } finally {
      // 适配器关不干净也要释放实例级资源：`#destroyed` 已经置位，本方法幂等早退，
      // 这个实例不会有第二次 destroy() 来补救。漏掉就等于让 reachability 的退避定时器
      // 和两条长活 subject 永远吊着——偏偏「关闭失败」正是最该把它们放掉的那条路径。
      // 错误照常向上抛，调用方仍然知道适配器没关干净。
      //
      // 顺序：syncState 订阅着 reachability.online$，先断下游再销毁上游，
      // 中间那一下 complete 才不会被当成一帧状态推给面板。
      this.syncState.destroy();
      this.reachability.destroy();
    }
  }

  /**
   * 上报「远端某个实体的数据已变」（US-023）。
   *
   * 供宿主在自己的推送通道（WebSocket / SSE / 轮询）收到变更通知时调用。
   * 使用 `SyncType.QueryCache` 的仓储会据此丢掉该实体的同步记忆，并重跑所有
   * 依赖它的活查询 —— 重跑会回远端重新取一次权威数据。
   *
   * @param entity - 实体名，即 `@Entity({ name })`；未注册的名字是无操作，不抛错
   * @param namespace - 命名空间，默认 `'public'`（与 `@Entity` 的默认值一致）
   *
   * @remarks
   * **签名里没有任何位置能承载行数据，这是有意的。** 推送通道给的行体不经
   * `fetchMetadata` 比对，直接写进本地缓存会让「本地有一份没人验证过的值」
   * 变成常态；本方法只负责让缓存失效，权威值一律由重跑时的拉取决定。
   *
   * 事件不跨标签页转发：每个标签页的宿主各自会收到推送，转发只会让同一次
   * 变更在 N 个标签页里被放大成 N 次远端拉取。
   *
   * @example
   * ```typescript
   * socket.on('changed', ({ entity }) => rxdb.invalidateRemoteEntity(entity));
   * ```
   */
  invalidateRemoteEntity(entity: string, namespace = 'public'): void {
    this.dispatchEvent(new RemoteEntityInvalidatedEvent(namespace, entity));
  }

  /**
   * 通知同源的其他连接：某个能力刚在本连接上被启用（FR-037）。
   *
   * @param capability - 能力名，与 `RxDBSystemContribution.capability` 同值
   *
   * @remarks
   * 能力位只在**连接期**读一次（见 {@link RxDBSystemContribution.bootstrapExisting}），
   * 于是「A 启用、B 早已连上」这一种排列下，B 此后的每一次写都绕开该能力，**一条错误都不会有**。
   * 本方法就是那条补齐用的通道：启用方发一次，同源的其他连接收到
   * {@link CAPABILITY_ENABLED_EVENT} 后自行接通。
   *
   * **只覆盖同源的 BroadcastChannel 可达范围。** 跨进程（Electron 主/渲染、Tauri、Node 多进程）
   * 与 `multiInstance: false` 的实例收不到 —— 那两种情形由能力插件自己的自愈路径收窄，
   * 见 `git show f9528e8f:specs/001-working-tree-commits/threat-model.md` §6。
   *
   * 发起方自己收不到这条事件（网关按 `clientId` 忽略自己发的消息），这是对的：
   * 它在 `enable()` 里已经同步接通过了，再收一次只会让接通发生两遍。
   *
   * 网关未启用（`multiInstance: false`）时是无操作，不抛。
   */
  broadcastCapabilityEnabled(capability: string): void {
    this.#gateway?.broadcastCapabilityEnabled(capability);
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
      emitEvent(this.#event_map, this, event);
      return;
    }

    // 快照迭代：#listener() 返回内部活 Set，若直接遍历，监听器在回调中新增同类型监听器
    // 会被同一次遍历捕获到（Set.forEach 访问遍历期间新增的条目），新监听器错误地收到
    // 本次事件，持续新增还会让派发不终止。
    const listeners = Array.from(this.#listener(event.type as keyof RxDBEventMap));
    runIsolated(listeners, listener => listener.call(this, event));
  }

  /**
   * 增删 {@link RxDB.#connected_adapters} 与 {@link RxDB.#connected_adapter_instances} 并推送快照。
   *
   * @param adapterName - 适配器名称
   * @param adapter - 连上时传本纪元的适配器实例；断开时传 `undefined`
   * @returns 状态是否真的发生了变化（`false` 表示原本就是这个状态）
   *
   * @remarks
   * 聚合的 {@link RxDB.connected$} 在这里跟着算：`true` 只要有一个连上就发，`false` 只在
   * 最后一个也掉线时才发。此前失败路径直接 `next(false)`，会把仍然连着的适配器一起报成断开。
   *
   * 目标状态用「实例还是 `undefined`」表达而不是一个布尔参数：两张表必须同进同出，
   * 而带布尔参数的入口允许「标记为已连接却没登记实例」这种写法——
   * 那时 {@link RxDB.localAdapterSync} 会在插件毫不知情的情况下抛「未连接」。
   */
  #set_adapter_connected(adapterName: string, adapter: IRxDBAdapter | undefined): boolean {
    const connected = adapter !== undefined;
    const changed =
      connected ? !this.#connected_adapters.has(adapterName) : this.#connected_adapters.delete(adapterName);
    if (adapter !== undefined) {
      this.#connected_adapters.add(adapterName);
      this.#connected_adapter_instances.set(adapterName, adapter);
    } else {
      this.#connected_adapter_instances.delete(adapterName);
    }
    if (!changed) return false;
    this.#adapter_connected_sub.next(new Set(this.#connected_adapters));
    this.#connected_sub.next(this.#connected_adapters.size > 0);
    return true;
  }

  /**
   * 把适配器名字填回它所属的那条 subject（`localAdapter$` / `remoteAdapter$` 的源头）。
   *
   * @param adapterName - 适配器名称
   *
   * @remarks
   * 两条流都按 `distinctUntilChanged()` 去重**名字**，而调用方真正关心的是**实例**。
   * 重连会换实例但不换名字，因此必须靠 {@link RxDB.#retract_adapter_name} 先置回 `''`、
   * 这里再填回来，让去重看到一次真实的变化。名字没变时（首连，`init()` 已填过）
   * 这一次推送会被去重吞掉，是空操作。
   *
   * 既不是 local 也不是 remote 的适配器不属于任何一条流，直接跳过。
   */
  #publish_adapter_name(adapterName: string): void {
    if (this.#config.sync.local?.adapter === adapterName) this.#local_adapter_sub.next(adapterName);
    if (this.#config.sync.remote?.adapter === adapterName) this.#remote_adapter_sub.next(adapterName);
  }

  /**
   * 解绑适配器名：把它所属的那条 subject 置回 `''`。
   *
   * @param adapterName - 适配器名称
   *
   * @remarks
   * 与 {@link RxDB.#publish_adapter_name} 成对，语义见那一条。`''` 会被 `filter(Boolean)`
   * 拦下，订阅者在断连期间停在最后一个值上，不会收到一帧空适配器。
   */
  #retract_adapter_name(adapterName: string): void {
    if (this.#config.sync.local?.adapter === adapterName) this.#local_adapter_sub.next('');
    if (this.#config.sync.remote?.adapter === adapterName) this.#remote_adapter_sub.next('');
  }

  /**
   * 作废该适配器在飞的 `connect()`：它会在下一个 await 边界自行中止。
   *
   * @param adapterName - 适配器名称
   *
   * @remarks
   * **不等**那条链落地，这是刻意的。引导链可以卡在适配器自己的 `connect()` 里任意久
   * （对端不可达、文件锁），等它就是把「能不能停机」交给一条已经出问题的连接来决定。
   * 更硬的一条：`connect()` 的收尾 `#await_plugin_installs()` 有时**只能靠 `#shutdown()`
   * 解锁**（安装挂起的插件），等它等于让停机等自己。
   *
   * 于是拆卸与中止是并行的两件事，交接点只有一个：连接一律由 {@link RxDB.disconnect}
   * 按 `#adapter_map` 关闭，中止的链只抛错、不碰连接，两边撞不成两次 `disconnect()`。
   */
  #invalidate_connect(adapterName: string): void {
    this.#connect_epochs.set(adapterName, (this.#connect_epochs.get(adapterName) ?? 0) + 1);
  }

  /**
   * 纪元已被推进（引导期间发生过断连）时抛出中止错误。
   *
   * @param adapterName - 适配器名称
   * @param epoch - `connect()` 在同步段取的纪元快照
   * @throws 快照与当前纪元不符时抛出
   *
   * @remarks
   * 只抛错，不做清理：连接由 {@link RxDB.disconnect} 按 `#adapter_map` 统一关闭，
   * 这条链再关一遍就是两次 `disconnect()`。
   */
  #assert_connect_alive(adapterName: string, epoch: number): void {
    if ((this.#connect_epochs.get(adapterName) ?? 0) === epoch) return;
    throw new Error(`[RxDB] connect('${adapterName}') aborted: disconnect() ran during connection bootstrap`);
  }

  /** 清空已连接集合与实例表并推送一次空快照（拆卸路径专用）。 */
  #clear_adapter_connected(): void {
    this.#connected_adapter_instances.clear();
    if (this.#connected_adapters.size === 0) return;
    this.#connected_adapters.clear();
    this.#adapter_connected_sub.next(new Set<string>());
    this.#connected_sub.next(false);
  }

  /**
   * 规划期总闸：把候选实例并进现有注册表做一次依赖图校验。
   *
   * @param candidate - 本次 `use()` 新建的实例，尚未提交
   * @throws {@link RxDBPluginDependencyCycleError} / {@link RxDBPluginAmbiguousDependencyError}
   *
   * @remarks
   * 校验在**提交之前**，所以两类错误都不会留下半个注册。`use()` 是插件进入本实例的唯一入口，
   * 因此这一道闸走完，`reconcile()` 看到的图就恒为无环且每个被注入的名字都唯一 —— 调度器和
   * {@link RxDB.#resolve_dependency} 不必各自再防一遍。
   */
  #assert_plugin_graph(candidate: IRxDBPlugin): void {
    const index = new Map<string, readonly IRxDBPlugin[]>(this.#plugin_by_name);
    const existing: readonly IRxDBPlugin[] = index.get(candidate.name) ?? [];
    // 同一个实例经两个工厂登记（工厂自检命中后原样返回既有实例）算一个提供方，不是两个
    // 候选 —— 与 {@link RxDB.#index_plugin_name} 同一把尺子。少了这一条，它会在名字下
    // 跟自己撞成一次假歧义。节点表那半边的去重在 {@link topologicalPluginOrder} 里。
    if (!existing.includes(candidate)) index.set(candidate.name, [...existing, candidate]);
    assertPluginDependencyGraph([...this.#plugin_map.values(), candidate], index);
  }

  /**
   * 把实例按名字推进 {@link RxDB.#plugin_by_name}，重名时警告一次。
   *
   * @param instance - 已通过规划期校验的实例
   *
   * @remarks
   * 警告挂在注册这一刻而不是每趟 reconcile：重名是注册态的性质，一次注册喊一次就够，
   * 跟着扫描次数增长只会把日志淹掉（D4 / INV-5 的同一条口径）。
   */
  #index_plugin_name(instance: IRxDBPlugin): void {
    const candidates = this.#plugin_by_name.get(instance.name);
    if (candidates === undefined) {
      this.#plugin_by_name.set(instance.name, [instance]);
      return;
    }
    // 同一个实例经两个工厂引用登记（工厂自检命中后原样返回既有实例）算一个提供方，
    // 不是两个候选：按引用去重，否则它会把自己变成一次假歧义。
    if (candidates.includes(instance)) return;
    candidates.push(instance);
    console.warn(
      `[RxDB] Duplicate plugin name '${instance.name}': ${candidates.length} plugins are registered under it. ` +
        `Injecting 'plugin:${instance.name}' will fail until one of them is renamed.`
    );
  }

  /**
   * 依赖键 → 当前实例引用（{@link PluginSchedulerHost.resolveDependency}）。
   *
   * @param dependency - 依赖键
   * @returns 就绪时返回实例引用；未就绪返回 `undefined`
   *
   * @remarks
   * 「就绪」= 引导链（迁移、建表、索引 reconcile）已经跑完，因为 {@link RxDB.#connected_adapter_instances}
   * 的唯一写入点就在引导之后。返回的是实例本身而不是名字：纪元按引用判定（US-015 INV-3）。
   *
   * `plugin:x` 的就绪判据是**提供方已进入 `active`**（D3），不是「有人以这个名字注册过」：
   * 依赖方要用的是 `install()` 建起来的东西，注册只说明实例存在。名字解析不出候选时返回
   * `undefined` —— 声明它的插件停在等待态并被点名一次，而不是静默消失（AC#15 / INV-5）。
   */
  #resolve_dependency(dependency: RxDBPluginDependency): object | undefined {
    if (dependency === 'adapter:local') return this.#resolve_adapter_instance(this.#config.sync.local?.adapter);
    if (dependency === 'adapter:remote') return this.#resolve_adapter_instance(this.#config.sync.remote?.adapter);
    const provider = resolveUniqueProvider(this.#plugin_by_name, dependency);
    if (provider === undefined) return undefined;
    return this.#scheduler.activationState(provider) === 'active' ? provider : undefined;
  }

  /** 按配置里声明的适配器名查已连接实例；未配置或未连接都返回 `undefined`。 */
  #resolve_adapter_instance(adapterName: string | undefined): IRxDBAdapter | undefined {
    if (adapterName === undefined) return undefined;
    return this.#connected_adapter_instances.get(adapterName);
  }

  /**
   * 全局拆卸：销毁插件与网关，并把实例复位到「可重新 init」的状态。
   * 仅在所有适配器都已断开时调用。
   *
   * @remarks
   * 复位是拆卸的一半：只销毁不复位，`init()` 会因 `#rxdb_initialized` 仍为 `true` 而静默早退，
   * 重连拿到的是一个插件已销毁、网关已 dispose 的空壳。三处状态必须一起复位 ——
   * 初始化标志、网关引用、事务游标（断连时可能正卡在一个永远等不到 COMMIT 的事务里，
   * 不复位则重连后每个实体事件都会被塞进 `#need_dispatch_events` 永不派发）。
   */
  async #shutdown(): Promise<void> {
    // 与 disconnectAll 同口径，且必须在这里再做一次：#shutdown() 也可能从 disconnect()
    // 单点进来（断的是最后一个已连接适配器），那条路径只作废了自己那一个适配器，
    // 其余仍在引导中的 connect() 会在拆卸完成后醒来，把刚清空的已连接集合重新填上。
    // 作废是同步的、不等它们落地（理由见 #invalidate_connect）。
    for (const adapterName of this.#connect_promise_map.keys()) this.#invalidate_connect(adapterName);
    // 先于任何 await 置位：拆卸期间进来的 use() 只登记不安装（见 #shutting_down）。
    this.#shutting_down = true;
    await this.#destroy_plugin();
    // 总闸：#destroy_plugin 漏掉的（安装失败后残留的子作用域等）在这里一并释放，
    // 并把字段置空 —— 下一次 init() 拿到的是全新的连接纪元作用域。
    // 网关在这条线上：它随连接纪元登记，作用域逆序释放保证它按登记的反序拆掉。
    // 历史插件的 `versionManager` 走的是上一行的插件作用域，因此**先于**网关释放 ——
    // 插件的撤销动作还能经网关广播，反过来就不行了。
    await this.#release_connection_scope();
    // 清空 Repository 身份缓存：不清的话，断线重连后 getRepository() 仍会永久复用
    // 断连前那批缓存实例，携带的是断连时刻的陈旧实体状态。
    this.entityManager.destroy();
    // 解绑适配器名：让 localAdapter$ / remoteAdapter$ 的去重环节看到一次变化，
    // 否则仍在订阅中的实时查询会一直复用已断开的适配器实例。`init()` 会重新填回名字。
    this.#local_adapter_sub.next('');
    this.#remote_adapter_sub.next('');
    this.#transaction_stack = [];
    // 复位放在同步收尾段的最后，而不是随 #release_connection_scope() 一起：上面每个 await
    // 都是一次让路，此刻仍有别的 connect() 卡在自己的引导链里、还没走到 #await_plugin_installs()。
    // 提前抹掉安装记录，那个 connect() 醒来时会发现无事可等——一次本该带着安装错误失败的
    // connect() 于是静默地成功返回。
    this.#reset_plugin_scheduling();
    this.#rxdb_initialized = false;
    this.#shutting_down = false;
    this.#clear_adapter_connected();
    this.#connected_sub.next(false);
  }

  /**
   * 构造跨 tab 网关并登记进当前连接纪元的作用域。
   *
   * @remarks
   * 拆成**两次** `acquire()` 而不是一次包两步：网关在**构造期**就
   * `createBroadcastTopic()` + `new LeaderElection()`，通道早于 `init()` 打开。
   * 合成一次的话，`init()` 抛错时整条登记不进清单（本原语的既定语义），
   * 那条已经打开的 channel 和那套选举就没有任何人拆得到。
   *
   * 第二次 `acquire()` 返回 `undefined`：`init()` 装的三个转发监听器由
   * `gateway.destroy()` 一并摘除，也就是上一条登记的撤销动作，这里没有独立的逆操作。
   */
  #init_gateway() {
    const scope = this.#ensure_connection_scope();

    scope.acquire(() => {
      const instance = new RxDBTabsGateway({
        dbName: this.#config.dbName,
        clientId: this.#context.clientId!
      });
      this.#gateway = instance;
      return () => {
        instance.destroy();
        // 只在自己还挂在字段上时才清：重连已写进新实例时，清空会把新纪元的网关抹掉。
        if (this.#gateway === instance) this.#gateway = undefined;
      };
    }, 'rxdb:gateway');

    scope.acquire(() => {
      this.#gateway?.init(
        event => this.dispatchEvent(event),
        (type, listener) => this.addEventListener(type as keyof RxDBEventMap, listener),
        (type, listener) => this.removeEventListener(type as keyof RxDBEventMap, listener)
      );
      return undefined;
    }, 'rxdb:gateway:init');
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
    this.addEventListener(TRANSACTION_BEGIN, event => handleTransactionBegin(this.#transaction_stack, event));
    this.addEventListener(TRANSACTION_COMMIT, event =>
      handleTransactionCommit(this.#transaction_stack, this.#event_map, this, event)
    );
    this.addEventListener(TRANSACTION_ROLLBACK, event =>
      handleTransactionRollback(this.#transaction_stack, this.#event_map, this, event)
    );

    ['entityManager', 'schemaManager'].forEach(key =>
      Object.defineProperty(this, key, {
        enumerable: false,
        configurable: false
      })
    );
  }

  /** 登记全部插件后只对齐一趟。守卫与 {@link RxDB.#install_one_plugin} 故意重复。 */
  #install_plugin() {
    installPlugin(this.#pluginHost);
  }

  /** 把单个插件交给调度器并对齐一次。守卫与 {@link RxDB.#install_plugin} 故意重复。 */
  #install_one_plugin(plugin: IRxDBPlugin) {
    installOnePlugin(this.#pluginHost, plugin);
  }

  /** 执行 `plugin.install(scope)`。失败只记日志并重抛。 */
  async #track_plugin_install(plugin: IRxDBPlugin, scope: LifecycleScope): Promise<void> {
    return trackPluginInstall(this.#pluginHost, plugin, scope);
  }

  /** 从连接纪元作用域上派生一个插件激活作用域，并登记进 {@link RxDB.#plugin_scopes}。 */
  #create_plugin_scope(plugin: IRxDBPlugin): LifecycleScope {
    return createPluginScope(this.#pluginHost, plugin);
  }

  /** 释放一次插件激活作用域并注销登记。 */
  async #discard_plugin_scope(plugin: IRxDBPlugin, scope: LifecycleScope): Promise<void> {
    return discardPluginScope(this.#pluginHost, plugin, scope);
  }

  /** 连接纪元作用域的唯一创建点：`init()` 与 `init()` 之后的 `use()` 都经由这里。 */
  #ensure_connection_scope(): LifecycleScope {
    this.#connection.scope ??= new LifecycleScope(`rxdb:${this.#config.dbName}`);
    return this.#connection.scope;
  }

  /** 释放并置空连接纪元作用域。置空同步，dispose 异步。 */
  #release_connection_scope(): Promise<void> {
    return releaseConnectionScope(this.#pluginHost);
  }

  /** 纪元结束时复位调度记录。 */
  #reset_plugin_scheduling(): void {
    resetPluginScheduling(this.#pluginHost);
  }

  /** 撤销 {@link RxDB.repository} 的一次注册，按配置对象身份守卫。 */
  #unregister_repository(repositoryName: string, config: IRepositoryConfig): void {
    unregisterRepository(this.#pluginHost, repositoryName, config);
  }

  /** 撤销 {@link RxDB.queryCacheEngine} 的一次注册，按工厂对象身份守卫。 */
  #unregister_query_cache_engine(factory: QueryCacheEngineFactory): void {
    if (this.#query_cache_engine !== factory) return;
    this.#query_cache_engine = undefined;
  }

  /** 撤销 {@link RxDB.queryCacheOutbox} 的一次注册，按提供者对象身份守卫。 */
  #unregister_query_cache_outbox(provider: QueryCacheOutboxProvider): void {
    if (this.#query_cache_outbox !== provider) return;
    this.#query_cache_outbox = undefined;
  }

  /** 写入物化来源槽；已被另一个来源占着时抛错（一条连接至多一个）。 */
  #assign_branch_materialization_source(source: BranchMaterializationSource): void {
    const current = this.#branch_materialization_source;
    if (current !== undefined && current !== source) {
      throw new Error('[RxDB] 这条连接已经登记了一个分支物化来源；一条连接至多一个，先撤销前一个再登记。');
    }
    this.#branch_materialization_source = source;
  }

  /** 撤销 {@link RxDB.branchMaterializationSource} 的一次登记，按来源对象身份守卫。 */
  #unregister_branch_materialization_source(source: BranchMaterializationSource): void {
    if (this.#branch_materialization_source !== source) return;
    this.#branch_materialization_source = undefined;
  }

  /**
   * 引导收尾时点名检查：声明了 `SyncType.QueryCache` 的实体是否都有引擎可用。
   *
   * @throws {@link RxDBMissingPluginError} 有这样的实体而引擎槽是空的
   *
   * @remarks
   * 放在 `#await_plugin_installs()` **之后**：插件正是在那一趟里调用
   * {@link RxDB.queryCacheEngine} 的，早一步检查必然误报。
   *
   * 逐个实体扫而不是只判「有没有」，是为了让错误点名第一个受影响的实体 —— 「某处配置错了」
   * 这种错误信息，与不报没有区别。
   */
  #assert_query_cache_engine(): void {
    if (this.#query_cache_engine !== undefined) return;
    for (const EntityType of this.#config.entities) {
      if (this.entitySync.resolve(EntityType)?.type !== SyncType.QueryCache) continue;
      throw missingQueryCacheEngineError(getEntityMetadata(EntityType).name);
    }
  }

  /**
   * 引导收尾时点名检查：声明了 `SyncType.QueryCache` 的实体是否都有出站队列可用。
   *
   * @throws {@link RxDBMissingPluginError} 有这样的实体而队列槽是空的
   *
   * @remarks
   * 与 {@link RxDB.#assert_query_cache_engine} 同一时机、同一形状，分两个方法是因为
   * 两个槽由不同的包填，缺哪个就该点名哪个包。合并成一条只会让缺 sync 插件的人
   * 去装 querycache 插件。
   *
   * 不许「没装就当空集」：读引擎的对账拿待提交写把「远端没返回」和「本地离线写过」
   * 区分开，空集会让每一条离线写都被当成孤儿删掉 —— 静默降级在这里等于丢用户数据。
   */
  #assert_query_cache_outbox(): void {
    if (this.#query_cache_outbox !== undefined) return;
    for (const EntityType of this.#config.entities) {
      if (this.entitySync.resolve(EntityType)?.type !== SyncType.QueryCache) continue;
      throw missingQueryCacheOutboxError(getEntityMetadata(EntityType).name);
    }
  }

  /** 表就绪后等待已经开工的插件安装。 */
  async #await_plugin_installs(): Promise<void> {
    return awaitPluginInstalls(this.#pluginHost);
  }

  /**
   * 冻结配置：顶层 `Object.freeze`（键不可增删改），声明式子树深冻结，
   * {@link LIVE_BEHAVIOUR_CONFIG_KEYS} 列出的字段整棵跳过。
   */
  #freeze_config(): void {
    freezeConfig(this.#pluginHost);
  }

  /** 逆插入序串行拆卸所有插件。 */
  async #destroy_plugin(): Promise<void> {
    return destroyPlugin(this.#pluginHost);
  }

  #createPluginHost(): PluginLifecycleHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 宿主 getter 需捕获 RxDB 私有字段
    const host = this;
    return {
      get rxdbInitialized() {
        return host.#rxdb_initialized;
      },
      get shuttingDown() {
        return host.#shutting_down;
      },
      get pluginMap() {
        return host.#plugin_map;
      },
      get pluginByName() {
        return host.#plugin_by_name;
      },
      get scheduler() {
        return host.#scheduler;
      },
      get bootstrappingConnects() {
        return host.#bootstrapping_connects;
      },
      get connectedAdapters() {
        return host.#connected_adapters;
      },
      get pluginScopes() {
        return host.#plugin_scopes;
      },
      get connection() {
        return host.#connection;
      },
      get config() {
        return host.#config;
      },
      get repositoryConfigMap() {
        return host.#repository_config_map;
      },
      ensureConnectionScope: () => host.#ensure_connection_scope()
    };
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
   * 登记插件的系统贡献。
   *
   * @param plugin - 刚由工厂造出来的插件实例
   * @throws {@link Error} 插件在 `init()` 之后才注册，或能力名已被别的插件占了，或贡献形状非法
   *
   * @remarks
   * **`init()` 之后注册带 `system` 的插件必须抛错。** 那时 `schemaManager.init()` 已经跑完，
   * 贡献的实体再也进不了 `config.entities`——静默跳过留下的是一个「装了插件、表却没建」的库，
   * 而它与「没装插件」在类型上完全一样，第一次用到时才炸，且错误指向的是取数那一行。
   *
   * 判据用 `#rxdb_initialized` 而不是「连上没有」：`init()` 是 `connect()` 的第一步，
   * 挡在这里同时挡住了 `connect()` 之后，而且挡得更早、错误信息更接近成因。
   *
   * 能力名撞车同样抛错：两个插件都认领 `workingTree` 时，谁的表被建出来取决于 `use()` 的
   * 顺序，而水位行里只会留下一个包名——守卫此后会把用户指向错误的包。
   */
  #register_system_contribution(plugin: IRxDBPlugin): void {
    const contribution = plugin.system;
    if (!contribution) return;
    if (this.#rxdb_initialized) {
      throw new Error(
        `[RxDB] 插件 "${plugin.name}" 贡献了系统能力，必须在 connect() 之前 use()：` +
          '系统表随建表一次建出，此刻已经来不及了'
      );
    }
    assertValidSystemContribution(contribution, plugin.name);
    const registered = this.#system_contributions.get(contribution.capability);
    if (registered && registered !== contribution) {
      throw new Error(
        `[RxDB] 能力 "${contribution.capability}" 已由 ${registered.packageSpecifier} 认领，` +
          `${contribution.packageSpecifier} 不能重复认领`
      );
    }
    this.#system_contributions.set(contribution.capability, contribution);
    // 两份清单，两个问题：
    // 模块级登记簿回答「这个类是不是系统表」。它必须是模块级的——`isSystemEntity()` 是个纯
    // 函数，跨包调用点（如 http 适配器判定要不要把这张表推上远端）拿不到 RxDB 实例。
    registerSystemEntities(contribution.entities);
    // 实例级清单回答「**本库**该建哪些系统表」。建表只读这一份，于是没 use() 过本插件的库
    // 不会被建出这些表，也不吃它们的迁移。见 #contributed_system_entities。
    for (const EntityClass of contribution.entities) {
      if (!this.#contributed_system_entities.includes(EntityClass)) {
        this.#contributed_system_entities.push(EntityClass);
      }
    }
  }

  /**
   * 未认领能力守卫：这个库启用过的能力，本进程是不是都装齐了插件。
   *
   * @param adapter - 本地适配器
   * @throws {@link UnclaimedRxDBCapabilityError} 库里有本进程没认领的能力时
   *
   * @remarks
   * 防的事故没有编译期形态：装过插件的库被**没装**该插件的客户端打开，那些表照样在，
   * 写原语却一层拦截都没有，于是用户编辑安静地绕过该能力的簿记。
   *
   * 自开一次引导期只读事务、不复用 `runMigrations()` 里那次读：省下的那次读换来的是
   * 「守卫一定跑在第一次写之前」这条由**调用位置**保证、而不是由函数内部行文保证的性质。
   */
  async #assertClaimedCapabilities(adapter: RxDBAdapterLocalBase): Promise<void> {
    const names = await adapter.bootstrapTransaction(async executor => {
      const records = await executor.getRepository(RxDBMigration).find({ where: { combinator: 'and', rules: [] } });
      return records.map(record => record.name);
    }, false);
    assertClaimedCapabilities(names, new Set(this.#system_contributions.keys()));
  }

  /**
   * 在既有库上补建缺失的**系统**表。
   *
   * @param adapter - 本地适配器
   *
   * @remarks
   * 与 {@link RxDB.#ensureEntityTables} 分开，不是为了少建几张表，而是为了时机：
   * 系统迁移要往这些表里写初始行，因此它们必须在系统迁移之前就位；而接入方实体表
   * 保持原有时机（接入方迁移之后），提前建会改变接入方迁移看到的库状态。
   *
   * 这里的 `isTableExisted` 是**承重的**，不是省 DDL 的优化：两个后端的 `CREATE TABLE` 都**没有**
   * `IF NOT EXISTS`（`sqlite-core/src/table/create_table_sql.ts`、`pglite/src/table/create_table_sql.ts`
   * 都是裸 `CREATE TABLE`；该子句只出现在建索引那一句上）。把一张已存在的表送进 `createTables()`
   * 会直接报错，于是整条 `connect()` 在既有库上炸掉。
   *
   * **探测是逐张顺序发的，两个循环加起来每次 `connect()` 约十几次往返。** 一次元数据查询
   * （`sqlite_master` / `information_schema.tables` 各一句）就能把这批答案一起取回来，但那要求
   * 适配器长出「批量取现存表名」这个公开能力，六个后端两种方言各实现一遍——是一次适配器公开面
   * 扩张，而且落在 `connect()` 这条全仓都走的路径上。顺延记录见 `requirements/roadmap.md`
   * 的「epic-006 评审顺延的架构项」。
   */
  async #ensureSystemTables(adapter: RxDBAdapterLocalBase): Promise<void> {
    const missingEntities: EntityType[] = [];

    for (const entityType of this.systemEntities) {
      const existed = await adapter.isTableExisted(entityType);
      if (!existed) {
        missingEntities.push(entityType);
      }
    }

    if (missingEntities.length > 0) {
      await adapter.createTables(missingEntities);
    }
  }

  /**
   * 在既有库上补建缺失的**接入方**实体表。
   *
   * @param adapter - 本地适配器
   *
   * @remarks
   * `config.entities` 里混着 {@link SchemaManager.init} 注入的系统表，而它们已在
   * {@link RxDB.#ensureSystemTables} 建过了。挡住它们的其实是上一行那次 `isTableExisted`
   * ——刚建完的表查出来就是存在的——但那是一个**跨方法的巧合**：它依赖「系统表先建」这一执行
   * 顺序，而这里显式摘出去不依赖任何顺序。差别在 `CREATE TABLE` 没有 `IF NOT EXISTS`
   * （见 {@link RxDB.#ensureSystemTables}）：一旦顺序被调换，重复下发就不是多跑一趟，是直接报错。
   *
   * **摘系统表按 {@link RxDB.systemEntities}（本实例的清单），不用模块级的 `isSystemEntity()`。**
   * 这是建表侧，与 {@link SchemaManager.init} / {@link RxDB.#ensureSystemTables} 同一条口径
   * （`systemEntities` 的 `@remarks` 把这条写成了不变量）。模块级登记簿是只增不减的活视图，
   * 认得进程里**任何一个**库登记过的身份：同进程里只要有别的库 `use()` 过某插件，本库一个
   * 身份撞上贡献表的接入方实体（`@Entity({namespace:'rxdb', name:'Commit'})` 是合法声明，
   * `namespace` 无人校验）就会在这里被判成「系统表」而静默跳过建表——首次查询报 `no such table`，
   * 错误里没有一个字指向实体注册。按类引用比而不是按 `namespace:name` 比也是刻意的：
   * 这里要回答的正是「**是不是同一个类**」，撞名的两个类必须分开。
   */
  async #ensureEntityTables(adapter: RxDBAdapterLocalBase): Promise<void> {
    const missingEntities: EntityType[] = [];
    const systemEntities = new Set<EntityType>(this.systemEntities);

    for (const entityType of this.#config.entities) {
      if (systemEntities.has(entityType)) continue;
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
