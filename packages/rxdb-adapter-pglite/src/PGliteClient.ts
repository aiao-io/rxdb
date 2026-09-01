import { EventDispatcher, nextMicroTask } from '@aiao/utils';
import { DescribeQueryResult, PGlite, QueryOptions, Results, Transaction } from '@electric-sql/pglite';
import type { LiveQuery } from '@electric-sql/pglite/live';
import { live, LiveNamespace } from '@electric-sql/pglite/live';
import { PGliteWorker } from '@electric-sql/pglite/worker';
import { PGliteNotificationBatcher } from './notify/notification-batcher.js';
import { PGliteChangeEvent, PGliteChangeType, PGliteClientOptions } from './pglite.interface.js';
import { RxdbAdapterPGliteError } from './pglite.utils.js';

interface PGliteRuntime {
  waitReady: Promise<void>;
  close(): Promise<void>;
  syncToFs(): Promise<void>;
  listen(channel: string, callback: (payload: string) => void): Promise<() => Promise<void>>;
  sql<T>(sqlStrings: TemplateStringsArray, ...params: unknown[]): Promise<Results<T>>;
  exec(query: string, options?: QueryOptions): Promise<Array<Results>>;
  query<T>(query: string, params?: unknown[], options?: QueryOptions): Promise<Results<T>>;
  describeQuery(query: string, options?: QueryOptions): Promise<DescribeQueryResult>;
  transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;
  runExclusive<T>(fn: () => Promise<T>): Promise<T>;
  live: LiveNamespace;
}

type ResolvedPGliteClientOptions = Omit<PGliteClientOptions, 'store'> & {
  dataDir?: string;
  relaxedDurability: boolean;
  extensions: NonNullable<PGliteClientOptions['extensions']>;
};

type PGliteClientState = 'idle' | 'initializing' | 'ready' | 'closing' | 'closed';

const storageClients = new Map<string, Set<PGliteClient>>();
const runtimeWorkers = new WeakMap<PGliteRuntime, Worker>();

/**
 * 把 {@link PGliteClientOptions} 规范化为 PGlite 构造函数能直接消费的形状。
 *
 * - `store: 'memory'` 时不设 `dataDir`，并默认开启 `relaxedDurability`
 * - 其他情况 `dataDir` 默认为 `idb://<dbName>`
 * - 强制注入 `live` extension（liveQuery 依赖）
 *
 * 公开导出供单测与高级用户预计算配置，正常使用无需直接调用。
 *
 * @param dbName - 数据库名（用作 IndexedDB key）
 * @param options - 原始用户选项
 * @returns 规范化后的 PGlite 选项
 * @public
 */
export function resolvePGliteInitOptions(dbName: string, options: PGliteClientOptions): ResolvedPGliteClientOptions {
  const { store, dataDir, relaxedDurability, extensions, ...restOptions } = options;

  return {
    ...restOptions,
    relaxedDurability: relaxedDurability ?? store === 'memory',
    dataDir: dataDir ?? (store === 'memory' ? undefined : `idb://${dbName}`),
    extensions: {
      ...(extensions ?? {}),
      live
    }
  };
}

/**
 * 判断是否需要为 PGlite 启用 Web Worker。
 *
 * 当且仅当 `dataDir` 以 `opfs-ahp://` 开头时返回 `true`：OPFS-AHP 后端必须运行在 Worker
 * 中（Synchronous Access Handles 要求脱离主线程），其他后端（memory、idb）在主线程即可。
 *
 * @param options - 至少含 `dataDir` 的选项
 * @returns 是否需要 Worker
 * @public
 */
export function shouldUsePGliteWorker(options: Pick<ResolvedPGliteClientOptions, 'dataDir'>): boolean {
  return options.dataDir?.startsWith('opfs-ahp://') ?? false;
}

async function createPGliteRuntime(dbName: string, options: PGliteClientOptions): Promise<PGliteRuntime> {
  const initOptions = resolvePGliteInitOptions(dbName, options);

  if (shouldUsePGliteWorker(initOptions)) {
    if (typeof Worker === 'undefined') {
      throw new Error('OPFS-backed PGlite requires Web Worker support');
    }

    const worker = new Worker(new URL('./pglite.browser.worker.ts', import.meta.url), {
      type: 'module',
      name: `pglite-${dbName}`
    });

    try {
      const runtime = (await PGliteWorker.create(worker, initOptions)) as unknown as PGliteRuntime;
      runtimeWorkers.set(runtime, worker);
      return runtime;
    } catch (error) {
      try {
        worker.terminate();
      } catch {
        // Worker 创建错误是根因，terminate 失败不能覆盖它。
      }
      throw error;
    }
  }

  const runtime = new PGlite(initOptions) as unknown as PGliteRuntime;
  try {
    await runtime.waitReady;
    return runtime;
  } catch (error) {
    await runtime.close().catch(() => undefined);
    throw error;
  }
}

/**
 * PGlite 客户端事件映射：
 * 每个 {@link PGliteChangeType} 对应一个 {@link PGliteChangeEvent}，
 * 用于 {@link PGliteClient}（基于 {@link EventDispatcher}）的 `addEventListener` 强类型推断。
 *
 * @public
 */
export interface PGliteClientEvents {
  [PGliteChangeType.INSERT]: PGliteChangeEvent;
  [PGliteChangeType.UPDATE]: PGliteChangeEvent;
  [PGliteChangeType.DELETE]: PGliteChangeEvent;
}

/**
 * PGlite 客户端的最小公开契约。
 *
 * 抽象出 {@link PGliteClient} 的核心方法，便于在测试中替换 mock 或在跨适配器代码中
 * 以接口形式注入。所有方法签名都直接转发到底层 `@electric-sql/pglite` 同名 API。
 *
 * @public
 */
export interface IPGliteClient {
  init(dbName: string, options: PGliteClientOptions): Promise<void>;

  /**
   * 执行单个 SQL 语句
   * 使用 PostgreSQL 的"扩展查询"协议消息
   * @param query 要执行的查询语句
   * @param params 查询的可选参数
   * @returns 查询的结果
   */
  query<T>(query: string, params?: unknown[], options?: QueryOptions): Promise<Results<T>>;

  /**
   * 执行单个 SQL 语句，类似于 query，但使用模板语句，其中模板值将被视为参数
   *
   * 使用 PostgreSQL 的"扩展查询"协议消息
   *
   * @param query 要执行的查询，参数作为模板值
   * @returns 查询的结果
   *
   * @example
   * ```ts
   * const results = await db.sql`SELECT * FROM ${identifier`foo`} WHERE id = ${id}`
   * ```
   */
  sql<T>(sqlStrings: TemplateStringsArray, ...params: unknown[]): Promise<Results<T>>;

  /**
   * 执行 SQL 查询，可以包含多个语句
   * 使用 PostgreSQL 的"简单查询"协议消息
   * @param query 要执行的查询
   * @returns 查询的结果
   */
  exec(query: string, options?: QueryOptions): Promise<Array<Results>>;

  /**
   * 描述查询
   * @param query 要描述的查询
   * @returns 查询结果类型的描述
   *
   * @remarks
   * 可选：`DescribeQueryResult` 里挂着解析器函数，跨不了结构化克隆，因此 US-208 的桌面
   * 代理客户端提供不了它。适配器自身一处都没调用，声明成必需只会把「本地实现不了」
   * 变成「必须编一个假的」。
   */
  describeQuery?(query: string, options?: QueryOptions): Promise<DescribeQueryResult>;

  /**
   * 执行事务
   * @param callback 接收事务对象的回调函数
   * @returns 事务的结果
   */
  transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;

  /**
   * 独占运行函数，在函数运行期间不允许其他事务或查询
   * 这在使用 execProtocol 方法时特别有用，因为它们不会被阻塞，
   * 也不会阻塞事务和查询使用的锁
   * @param fn 要运行的函数
   * @returns 函数的结果
   *
   * @remarks
   * 可选，理由与 {@link IPGliteClient.describeQuery} 同类但更硬：`fn` 是调用方的闭包，
   * 跨进程传不过去；真要代理，只能让 renderer 在整个 `fn` 期间扣住主进程那条唯一连接，
   * 而 renderer 崩溃时这把锁就永远松不开了。
   */
  runExclusive?<T>(fn: () => Promise<T>): Promise<T>;

  /** 当前 realm 中是否有其他客户端持有同一份持久化存储。 */
  hasStoragePeer?(): boolean;

  /** 尚未分发的 NOTIFY 行事件数量。 */
  readonly pendingNotificationCount?: number;

  /**
   * 创建 PGlite live query，数据变化时自动回调
   * @param query SQL
   * @param params 参数
   * @param callback 结果回调
   *
   * @remarks
   * 可选：`LiveQuery` 句柄带着订阅与 `unsubscribe`，代理实现需要自建一整套跨进程订阅
   * 生命周期。{@link RxDBAdapterPGlite.liveQuery} 已按能力判定并快速失败。
   */
  liveQuery?<T>(
    query: string,
    params?: unknown[] | null,
    callback?: (results: Results<T>) => void
  ): Promise<LiveQuery<T>>;

  /** 不执行持久化同步，直接释放客户端资源。 */
  forceClose(): Promise<void>;
  disconnect(): Promise<void>;
  version(): Promise<string>;
}

/**
 * 变更事件源：能挂/摘 {@link PGliteChangeType} 监听的客户端。
 *
 * @remarks
 * 与 {@link IPGliteClient} 分开声明，是因为**能不能推变更**和**能不能执行 SQL** 是两件事：
 * 只读或纯查询用途的客户端可以只满足后者。适配器按这个契约结构化判定，而不是按具体类，
 * 否则代理实现（US-208 的桌面客户端）会被 `instanceof` 判为不支持——症状是变更事件全丢，
 * 而且 `disconnect()` 也不会去解绑它。
 *
 * @public
 */
export interface PGliteChangeEventSource {
  addEventListener<T extends keyof PGliteClientEvents>(type: T, listener: (event: PGliteClientEvents[T]) => void): void;
  removeEventListener<T extends keyof PGliteClientEvents>(
    type: T,
    listener: (event: PGliteClientEvents[T]) => void
  ): void;
}

/**
 * 把客户端窄化为变更事件源；不具备该能力时返回 `undefined`。
 *
 * @param client - 任意 PGlite 客户端
 * @returns 变更事件源，或 `undefined`
 * @public
 */
export function asPGliteChangeEventSource(client: IPGliteClient): PGliteChangeEventSource | undefined {
  const candidate = client as Partial<PGliteChangeEventSource>;
  if (typeof candidate.addEventListener !== 'function') return undefined;
  if (typeof candidate.removeEventListener !== 'function') return undefined;
  return candidate as PGliteChangeEventSource;
}

/**
 * PGlite 客户端：封装 `@electric-sql/pglite` 实例，提供：
 * - 统一的 query/exec/transaction API（对齐 {@link IPGliteClient}）
 * - 系统表（rxdb_change/rxdb_branch/rxdb_migration）NOTIFY 监听 + 批量分发
 *   （16ms trailing 防抖，另有 max-wait 与容量上限兜底，见 {@link PGliteNotificationBatcher}）
 * - 安全的 disconnect（先 `syncToFs` 再 `close`，避免 IDBFS 关闭后回调抛错）
 * - LiveQuery 支持（依赖 init 阶段注入的 `live` extension）
 *
 * 通过 `addEventListener(PGliteChangeType.INSERT, fn)` 订阅变更事件，
 * 类型由 {@link PGliteClientEvents} 推导。
 *
 * @public
 */
export class PGliteClient extends EventDispatcher<PGliteClientEvents> implements IPGliteClient {
  #pglite?: PGliteRuntime;
  #dbName!: string;
  /**
   * NOTIFY 的去重与批量窗口。
   *
   * @remarks
   * 抽成独立对象是为了让 US-208 的桌面客户端复用同一套语义——那条路径上 NOTIFY 由主进程
   * host 转发过来，批量仍然发生在渲染进程。见 {@link PGliteNotificationBatcher}。
   */
  readonly #batcher = new PGliteNotificationBatcher({
    resolveDbName: () => this.#dbName,
    emit: event => this.dispatchEvent(event.type, event),
    onParseError: error => console.error('Failed to parse NOTIFY payload:', error)
  });
  #notificationUnsubscribes: Array<() => Promise<void>> = [];
  #isDisconnecting = false;
  #storageKey?: string;
  #state: PGliteClientState = 'idle';
  #lifecycleQueue = Promise.resolve();
  #lifecycleVersion = 0;
  #initPromise?: Promise<void>;
  #initVersion = 0;
  #closeVersion = 0;

  /** 尚未分发的 NOTIFY 行事件数量。 */
  get pendingNotificationCount(): number {
    return this.#batcher.pendingCount;
  }

  /**
   * 初始化 PGlite 运行时并订阅系统表 NOTIFY 频道。
   *
   * 必须在任何 query/exec 之前调用。重复调用会先完整关闭旧运行时，
   * 并发调用共享同一个初始化任务。
   *
   * @param dbName - 数据库名（用于 IndexedDB 持久化与 Worker 命名）
   * @param options - PGlite 选项；`store: 'memory'` 用于测试，其他值持久化
   */
  init(dbName: string, options: PGliteClientOptions): Promise<void> {
    if (this.#initPromise && this.#initVersion > this.#closeVersion) return this.#initPromise;

    this.#initVersion = ++this.#lifecycleVersion;
    const operation = this.#enqueueLifecycle(() => this.#initialize(dbName, options));
    this.#initPromise = operation;
    void operation
      .finally(() => {
        if (this.#initPromise === operation) this.#initPromise = undefined;
      })
      .catch(() => undefined);
    return operation;
  }

  async sql<T>(sqlStrings: TemplateStringsArray, ...params: unknown[]): Promise<Results<T>> {
    return this.#getRuntime().sql(sqlStrings, ...params);
  }

  async exec(query: string, options?: QueryOptions): Promise<Array<Results>> {
    return this.#getRuntime().exec(query, options);
  }

  async query<T>(query: string, params?: unknown[], options?: QueryOptions): Promise<Results<T>> {
    return this.#getRuntime().query(query, params, options);
  }

  async describeQuery(query: string, options?: QueryOptions): Promise<DescribeQueryResult> {
    return this.#getRuntime().describeQuery(query, options);
  }

  async transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.#getRuntime().transaction(callback);
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    return this.#getRuntime().runExclusive(fn);
  }

  /** 判断当前是否有其他存活客户端持有同一份持久化存储。 */
  hasStoragePeer(): boolean {
    if (!this.#storageKey) return false;
    const clients = storageClients.get(this.#storageKey);
    if (!clients) return false;
    for (const client of clients) {
      if (client !== this) return true;
    }
    return false;
  }

  /**
   * 创建 live query，借助 @electric-sql/pglite/live 插件。
   * 依赖 init() 时已加载的 `live` extension。
   */
  async liveQuery<T>(
    query: string,
    params?: unknown[] | null,
    callback?: (results: Results<T>) => void
  ): Promise<LiveQuery<T>> {
    return this.#getRuntime().live.query<T>(query, params ?? null, callback);
  }

  /**
   * 立即冲刷未发送的 NOTIFY 事件，绕过 16ms 防抖。
   *
   * 用于测试断言"事件已分发"的场景，或在关键路径（事务提交后）需要立即感知变更。
   *
   * @returns 调用时是否存在待处理事件
   */
  async flushPendingNotifications(): Promise<boolean> {
    await new Promise<void>(resolve => setTimeout(resolve, this.#batcher.batchTimeout));
    const hasPendingNotifications = this.#batcher.pendingCount > 0 || this.#batcher.hasScheduledFlush;

    if (this.#isDisconnecting) this.#batcher.clear();
    else this.#batcher.flush();

    await nextMicroTask();
    return hasPendingNotifications;
  }

  /**
   * 安全断开 PGlite 连接：取消订阅、清空待处理事件、`syncToFs` 后 close。
   *
   * 在 `relaxedDurability` + IDBFS 后端下，必须先 `syncToFs` 把 cursor 写回，
   * 否则关闭后 Emscripten 残余回调会抛 `InvalidStateError`。
   * durability flush 失败时仍会释放全部资源，随后抛出 `DURABILITY_LOST`。
   */
  disconnect(): Promise<void> {
    return this.#enqueueClose(true);
  }

  /**
   * 跳过 durability flush，直接取消订阅并关闭 runtime。
   * 调用方必须显式接受尚未落盘的数据可能丢失。
   */
  forceClose(): Promise<void> {
    return this.#enqueueClose(false);
  }

  /**
   * 返回底层 PostgreSQL 版本字符串（执行 `SELECT version()`）。
   *
   * 主要用于诊断与日志，不要在热路径调用。
   */
  async version() {
    const version = await this.#getRuntime().query<{ version: string }>('SELECT version()');
    return version.rows[0].version;
  }

  async #initialize(dbName: string, options: PGliteClientOptions): Promise<void> {
    if (this.#pglite) await this.#releaseRuntime(true, false);

    this.#state = 'initializing';
    this.#dbName = dbName;
    this.#isDisconnecting = false;
    try {
      const runtime = await createPGliteRuntime(dbName, options);
      this.#pglite = runtime;

      // 仅订阅系统表的通知，避免误处理 liveQuery 等内部频道。
      const watchTables = ['rxdb_change', 'rxdb_branch', 'rxdb_migration'];
      for (const table of watchTables) {
        const channel = `${table}_notify`;
        const unsubscribe = await runtime.listen(channel, payload => {
          if (this.#isDisconnecting) return;
          this.#batcher.accept(channel, payload);
        });
        this.#notificationUnsubscribes.push(unsubscribe);
      }

      this.#storageKey = resolvePGliteInitOptions(dbName, options).dataDir;
      if (this.#storageKey) {
        const clients = storageClients.get(this.#storageKey) ?? new Set<PGliteClient>();
        clients.add(this);
        storageClients.set(this.#storageKey, clients);
      }
      this.#state = 'ready';
    } catch (error) {
      await this.#releaseRuntime(false, false).catch(() => undefined);
      throw error;
    }
  }

  #enqueueLifecycle(operation: () => Promise<void>): Promise<void> {
    const task = this.#lifecycleQueue.then(operation);
    this.#lifecycleQueue = task.catch(() => undefined);
    return task;
  }

  #enqueueClose(flushDurability: boolean): Promise<void> {
    this.#closeVersion = ++this.#lifecycleVersion;
    return this.#enqueueLifecycle(() => this.#releaseRuntime(flushDurability, true));
  }

  async #releaseRuntime(flushDurability: boolean, removeEventListeners: boolean): Promise<void> {
    const runtime = this.#pglite;
    this.#state = 'closing';
    this.#isDisconnecting = true;
    this.#clearPendingNotifications();

    const unsubscriptions = this.#notificationUnsubscribes.splice(0);
    await Promise.allSettled(unsubscriptions.map(unsubscribe => Promise.resolve().then(unsubscribe)));
    if (removeEventListeners) this.removeAllEventListeners();

    let durabilityFailed = false;
    let durabilityError: unknown;
    let closeFailed = false;
    let closeError: unknown;
    if (runtime && flushDurability) {
      try {
        await runtime.syncToFs();
      } catch (error) {
        durabilityFailed = true;
        durabilityError = error;
      }
    }

    try {
      await runtime?.close();
    } catch (error) {
      closeFailed = true;
      closeError = error;
    } finally {
      const worker = runtime ? runtimeWorkers.get(runtime) : undefined;
      try {
        worker?.terminate();
      } catch (error) {
        if (!closeFailed) {
          closeFailed = true;
          closeError = error;
        }
      } finally {
        if (runtime) runtimeWorkers.delete(runtime);
      }
      if (this.#pglite === runtime) this.#pglite = undefined;
      this.#removeStorageClient();
      this.#state = 'closed';
    }

    if (durabilityFailed) {
      const cause = durabilityError instanceof Error ? durabilityError : new Error(String(durabilityError));
      throw new RxdbAdapterPGliteError('PGlite durability flush failed before close', 'DURABILITY_LOST', cause);
    }
    if (closeFailed) throw closeError;
  }

  #clearPendingNotifications(): void {
    this.#batcher.clear();
  }

  #removeStorageClient(): void {
    if (!this.#storageKey) return;
    const clients = storageClients.get(this.#storageKey);
    clients?.delete(this);
    if (clients?.size === 0) storageClients.delete(this.#storageKey);
    this.#storageKey = undefined;
  }

  #getRuntime(): PGliteRuntime {
    if (this.#pglite) return this.#pglite;
    throw new RxdbAdapterPGliteError(`PGlite client is not ready (state: ${this.#state})`, 'CLIENT_NOT_READY');
  }
}
