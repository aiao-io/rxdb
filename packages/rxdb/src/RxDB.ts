import { isPromise, LifecycleScope } from '@aiao/utils';
import { BehaviorSubject, defer, distinctUntilChanged, filter, map, Observable, shareReplay, switchMap } from 'rxjs';
import { EntityManager } from './entity/entity-manager.js';
import { EntityType } from './entity/entity.interface.js';
import { RxDBTabsGateway } from './gateway/RxDBTabsGateway.js';
import { ReachabilityMonitor } from './network/reachability.js';
import { PluginDependencyScheduler } from './plugin/dependency-scheduler.js';
import {
  AdapterFactory,
  IRxDBAdapter,
  RepositoryInstance,
  RxDBAdapterLocalBase,
  RxDBAdapterName,
  RxDBAdapterRemoteBase,
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
import { IRxDBPlugin, Plugin, RxDBPluginDependency } from './rxdb-plugin.js';
import { uuid } from './rxdb-utils.js';
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
import { isLocalAdapter, isTransactionEvent } from './rxdb.private.js';
import {
  emitEvent,
  handleTransactionBegin,
  handleTransactionCommit,
  handleTransactionRollback,
  runIsolated
} from './rxdb.transaction.js';
import type { EventListener, IRepositoryConfig, RxDBConfig, TransactionContext } from './rxdb.types.js';
import { SchemaManager } from './schema/SchemaManager.js';
import { SyncStateHub } from './sync-state.js';
import { RxDBBranch } from './system/branch.js';
import { RxDBChange } from './system/change.js';
import { createMigrationWatermarks, runMigrations } from './system/migration-runner.js';
import { RxDBMigration } from './system/migration.js';
import { RxDBSync } from './system/sync.js';
import { RXDB_DB_NAME_SUFFIX, RXDB_VERSION } from './version.js';
import { VersionManager } from './version/VersionManager.js';
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

  #repository_config_map = new Map<string, IRepositoryConfig>();

  #plugin_map = new Map<Plugin, IRxDBPlugin>();

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
   * 插件、gateway 与 versionManager 就永远拆不掉。
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

  public readonly versionManager!: VersionManager;

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
  public get localAdapterSync(): IRxDBAdapter & RxDBAdapterLocalBase {
    const adapterName = this.#config.sync.local?.adapter;
    if (adapterName === undefined) {
      throw new Error('[RxDB] local adapter is not configured (sync.local.adapter)');
    }
    const adapter = this.#connected_adapter_instances.get(adapterName);
    if (adapter === undefined) {
      throw new Error(`[RxDB] local adapter '${adapterName}' is not connected; await connect('${adapterName}') first`);
    }
    // 「配置为 local 的适配器实现了 RxDBAdapterLocalBase」是配置层的约定，运行时无从校验：
    // 该基类的成员（migrateSystemSchema / completeBootstrap …）全是可选的，没有可判别的形状。
    // 与 {@link RxDB.localAdapter$} 和 `connect()` 的 local 分支同一套信任模型，不额外加检查。
    return adapter as IRxDBAdapter & RxDBAdapterLocalBase;
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
    this.syncState = new SyncStateHub({
      online$: this.reachability.online$,
      // 每次连接纪元交替都重新解析这个 getter。`#shutdown()` 里的 versionManager.destroy()
      // 连 historyManager 一起销毁，下一次 init() 建的是**另一个** BehaviorSubject ——
      // 只在构造时读一次的话，重连之后面板会永远停在断连那一刻的数字。
      pushableCount$: this.connected$.pipe(switchMap(() => this.versionManager.pushableCount$))
    });
    this.context = { ...this.#config.context };
    this.#pluginHost = this.#createPluginHost();
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
    // #install_plugin 同步不抛（错误记进调度器的安装记录），故意留在 try 外——
    // Schema/Entity 初始化失败仍只回滚管理器；插件失败由 connect() 传播。
    this.#ensure_connection_scope();
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
      // 插件已经装了半套（#install_plugin 在 try 之外），这批登记必须跟着一起回滚，
      // 否则重新 init() 会把第二份登记叠在第一份上。init() 是同步 API 不能 await，
      // 但字段置空发生在同步段内，重跑一定拿到全新作用域。
      void this.#release_connection_scope();
      // 与上一行同步成对：作用域没了而调度记录还停在 active，重新 init() 时调度器会认为
      // 「依赖纪元没变、插件还装着」而一个都不重装，拿到的是个从没重新登记过的空壳。
      this.#reset_plugin_scheduling();
      // 三个管理器的资源释放与 {@link RxDB.#shutdown} 逐条对称——它们不在连接作用域里，
      // 漏掉就没有第二个人会拆。抛错点在各自 init() 之后时具体泄漏什么：
      // - `versionManager`：4 个事件监听器 + RxJS subscription 留在原地，重试叠第二份
      //   （`init()` 没有幂等守卫，`#historyManagerDestroyed` 只挡二次 `destroy()`）；
      // - `#gateway`：构造期就 `createBroadcastTopic()` + `new LeaderElection()`，通道早于
      //   `init()` 打开；且 `#destroyed` 是终态，重试只能 new 第二个写进 `#gateway`，
      //   旧实例从此无人引用也无人 `destroy()`——每失败一次泄漏一条 channel 加一套选举。
      // 三步都是同步的，`init()` 作为同步 API 不需要 await。
      this.versionManager.destroy();
      this.#gateway?.destroy();
      this.#gateway = undefined;
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
      // 装不装由 #install_one_plugin 自己判：本纪元已经退场时它是空操作。
      this.#install_one_plugin(plugin_instance);
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
   * @throws 引导期间被 `disconnect()` / `disconnectAll()` 中止时抛出（见 {@link RxDB.#connect_epochs}）
   */
  connect<K extends keyof RxDBAdapters>(adapterName: K): Promise<RxDBAdapters[K]>;
  connect(adapterName: RxDBAdapterName): Promise<IRxDBAdapter>;
  connect(adapterName: string): Promise<IRxDBAdapter> {
    // 防重入：如果已经在连接中，直接返回缓存的 Promise
    const pending = this.#connect_promise_map.get(adapterName);
    if (pending) {
      return pending;
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
        // 在 local 分支内统一收口一次 cast，避免分散 3 处 `as unknown as`
        const localAdapter = adapter as unknown as RxDBAdapterLocalBase;
        // 初始化
        const existed = await adapter.isTableExisted(RxDBMigration);
        if (existed) {
          // 已存在表结构，执行升级流程
          await localAdapter.migrateSystemSchema?.();
          localAdapter.completeBootstrap?.();
          await runMigrations(this.#config.migrations, localAdapter, this.entityManager);
          await this.#ensureEntityTables(localAdapter);
        } else {
          // 创建表结构
          const branch = this.entityManager.instantiate(RxDBBranch);
          branch.id = 'main';
          branch.activated = true;
          await localAdapter.createTables(this.#config.entities, [
            branch,
            ...createMigrationWatermarks(this.#config.migrations, this.entityManager)
          ]);
          await localAdapter.migrateSystemSchema?.();
          localAdapter.completeBootstrap?.();
        }
        await localAdapter.reconcileEntityIndexes?.(this.#config.entities);
      }
      // 引导已经跑完，只剩写回。这是纪元比对的最后一道，也是最关键的一道：整个机制要防的
      // 就是拆卸之后才落下的这一笔（见 #connect_epochs）。
      this.#assert_connect_alive(adapterName, epoch);
      // 先于 #await_plugin_installs 置位：这一步同时是「adapter:local / adapter:remote 就绪」
      // 的判据（见 #resolve_dependency），调度器要靠它才会放行声明了该依赖的插件，
      // 而那批安装恰好跑在下一行的 await 里面。
      this.#set_adapter_connected(adapterName, adapter);
      // 本条链的引导到此为止，剩下的是插件安装。先归零再装，最后一条链才有机会开闸报告。
      bootstrapDone();
      try {
        await this.#await_plugin_installs();
      } catch (error) {
        // 本适配器的引导没有走完，不能留在已连接集合里。聚合信号只在真的一个都不剩时才落下，
        // 否则别的连着的适配器会被一起误报成断开。
        this.#set_adapter_connected(adapterName, undefined);
        // 依赖已经作废：让调度器把靠它装起来的插件释放掉，别留着一份绑在死连接上的登记。
        this.#scheduler.reconcile();
        await this.#scheduler.settle();
        throw error;
      }
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
   * 依赖键 → 当前实例引用（{@link PluginSchedulerHost.resolveDependency}）。
   *
   * @param dependency - 依赖键
   * @returns 就绪时返回实例引用；未就绪返回 `undefined`
   *
   * @remarks
   * 「就绪」= 引导链（迁移、建表、索引 reconcile）已经跑完，因为 {@link RxDB.#connected_adapter_instances}
   * 的唯一写入点就在引导之后。返回的是实例本身而不是名字：纪元按引用判定（US-015 INV-3）。
   *
   * `plugin:*` 阶段 A 恒为未就绪 —— 声明它的插件会停在等待态并触发一次告警，而不是静默消失。
   */
  #resolve_dependency(dependency: RxDBPluginDependency): object | undefined {
    if (dependency === 'adapter:local') return this.#resolve_adapter_instance(this.#config.sync.local?.adapter);
    if (dependency === 'adapter:remote') return this.#resolve_adapter_instance(this.#config.sync.remote?.adapter);
    return undefined;
  }

  /** 按配置里声明的适配器名查已连接实例；未配置或未连接都返回 `undefined`。 */
  #resolve_adapter_instance(adapterName: string | undefined): IRxDBAdapter | undefined {
    if (adapterName === undefined) return undefined;
    return this.#connected_adapter_instances.get(adapterName);
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
    // 先于任何 await 置位：拆卸期间进来的 use() 只登记不安装（见 #shutting_down）。
    this.#shutting_down = true;
    await this.#destroy_plugin();
    // 总闸：#destroy_plugin 漏掉的（安装失败后残留的子作用域等）在这里一并释放，
    // 并把字段置空 —— 下一次 init() 拿到的是全新的连接纪元作用域。
    await this.#release_connection_scope();
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
    this.addEventListener(TRANSACTION_BEGIN, event => handleTransactionBegin(this.#transaction_stack, event));
    this.addEventListener(TRANSACTION_COMMIT, event =>
      handleTransactionCommit(this.#transaction_stack, this.#event_map, this, event)
    );
    this.addEventListener(TRANSACTION_ROLLBACK, event =>
      handleTransactionRollback(this.#transaction_stack, this.#event_map, this, event)
    );

    ['entityManager', 'schemaManager', 'versionManager'].forEach(key =>
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
