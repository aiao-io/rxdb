/**
 * renderer 侧的桌面 SQLite 客户端，实现 sqlite 核心的 `SqliteClientLike` 契约。
 *
 * @module desktop-sqlite-client
 */

import type { SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteChangeType } from '../sqlite-backend.interface.js';
import type { SqliteChangeEvent, SQLiteCompatibleType, SqliteResult } from '../sqlite-core.interface.js';
import { RxDBAdapterDesktopError } from './desktop-error.js';
import {
  assertDesktopHostResponse,
  parseDesktopHostChangeEvent,
  parseDesktopHostHandshakeResult,
  parseDesktopHostOpenResult,
  type DesktopHostFileRequest,
  type DesktopHostOpenResult,
  type DesktopHostRequest
} from './desktop-host-protocol.js';
import type { DesktopPgliteRequest } from './desktop-pglite-protocol.js';
import { assertDesktopSqliteStorage, type DesktopSqliteFileStorage } from './desktop-storage.js';

/**
 * renderer 与 host 之间的传输层。
 *
 * @remarks
 * 刻意收得极窄：Electron 下由 preload 通过 `contextBridge` 暴露这两个方法，
 * renderer 因此拿不到原始 `ipcRenderer`，也就无法向任意频道发消息。
 * 换成 `MessagePort` 或 `worker_threads` 时只要满足同样的两个方法即可，客户端无需改动。
 */
export interface DesktopHostTransport {
  /**
   * 发一条请求并等待应答。
   *
   * @remarks
   * SQLite、文件与 PGlite 三族请求共用同一条通道：preload 暴露的方法名已被 e2e 的
   * `bridgeKeys` 断言冻结，另开一条等于新增方法。分派由 host 侧的路由按 `kind` 完成。
   *
   * @param payload - 协议请求
   * @returns host 的未校验应答负载
   */
  request(payload: DesktopHostRequest | DesktopHostFileRequest | DesktopPgliteRequest): Promise<unknown>;
  /**
   * 订阅 host 主动推送的消息。
   *
   * @param listener - 消息回调
   * @returns 取消订阅的函数
   */
  subscribe(listener: (message: unknown) => void): () => void;
  /**
   * 上一次 {@link DesktopHostTransport.subscribe} 触发的通道注册是否已经生效。
   *
   * @remarks
   * `subscribe()` 必须**同步**返回退订函数，所以它交不出「通道已经建好」这个时刻。
   * 而 Tauri 的 `listen` 是异步的：注册落定之前 host 那边 `emit` 出去的变更事件
   * 不会送到任何人手里。`connect()` 一返回调用方就开始写库，丢的恰好是建库后的第一批
   * 变更，表现为「首屏不刷新」——所以就绪状态必须能被等待，而不是靠延时去赌。
   *
   * 省略即表示**订阅在 `subscribe()` 返回时就已生效**：Electron 侧的
   * `ipcRenderer.on` 是同步的，没有可等待的中间态，此处如实留空即可
   * （preload 的桥接键集被 e2e 的 `bridgeKeys` 断言冻结，也加不进来）。
   * 传输层若是异步建通道，就**必须**实现它。
   *
   * @returns 通道就绪时兑现；注册失败时以原始原因 reject
   */
  subscriptionReady?(): Promise<void>;
}

/** {@link DesktopSqliteClient.connect} 的可选行为参数。 */
export interface DesktopSqliteClientOptions {
  /**
   * 变更事件的防抖窗口（毫秒），省略时用 host 的默认值 `DEFAULT_BATCH_TIMEOUT`。
   *
   * @remarks
   * 与 wasm 客户端的同名选项同义，只是批处理发生在 host 侧——合并在事件跨进程之前完成。
   */
  readonly batchTimeout?: number;
}

/**
 * preload 把传输层挂到 renderer 全局时使用的键。
 *
 * @remarks
 * Electron 下由 `contextBridge.exposeInMainWorld(DESKTOP_HOST_TRANSPORT_KEY, ...)` 注入。
 * 名字带包前缀是为了避免与宿主应用自己的全局撞车。
 */
export const DESKTOP_HOST_TRANSPORT_KEY = '__aiaoRxdbDesktopHost__';

const isDesktopHostTransport = (value: unknown): value is DesktopHostTransport =>
  typeof (value as DesktopHostTransport | undefined)?.request === 'function' &&
  typeof (value as DesktopHostTransport).subscribe === 'function';

/**
 * 读取 preload 注入的传输层。
 *
 * @remarks
 * 只认完整的桥接：只暴露了 `request` 的半成品比完全没暴露更难查，
 * 与其让它带着一个缺方法的对象跑到第一次变更推送时才炸，不如在连接前就拦下来。
 *
 * @returns preload 暴露的传输层
 * @throws {@link RxDBAdapterDesktopError} 未注入或桥接不完整时抛 `host_unavailable`
 */
export function resolveDesktopHostTransport(): DesktopHostTransport {
  const injected = (globalThis as Record<string, unknown>)[DESKTOP_HOST_TRANSPORT_KEY];
  if (!isDesktopHostTransport(injected)) {
    throw new RxDBAdapterDesktopError(
      'host_unavailable',
      `no desktop host transport is exposed on globalThis.${DESKTOP_HOST_TRANSPORT_KEY}; ` +
        `the preload script must contextBridge.exposeInMainWorld it before RxDB connects`
    );
  }
  return injected;
}

const isChangeMessage = (message: unknown): message is { sessionId: string; event: unknown } =>
  typeof message === 'object' && message !== null && (message as { kind?: unknown }).kind === 'change';

/**
 * 把监听回调里的异常挪出传输层的调用栈。
 *
 * @remarks
 * 变更推送的通道是共享的：同一个 renderer 里的每个 `DesktopSqliteClient` 都在同一条通道上
 * 挂着监听者。Electron 的 `ipcRenderer.on` 是同步扇出，异常会一路抛回 Electron 自己的 IPC
 * 派发循环 —— 排在后面的监听者收不到这条消息，表现为「某个库的响应式查询不刷新」，
 * 所有故障形态里最难查的一种。Tauri 的 `deliver` 早就逐个监听者包了 try/catch，两侧应对称。
 *
 * 不吞：丢进微任务里原样重抛，落成一条 uncaught error，与 Tauri 的 `reportListenError` 同一手法。
 * 传输层不该替调用方决定「这个错误不重要」，它只是不该由传输层来接。
 */
const reportOutOfBand = (error: unknown): void => {
  queueMicrotask(() => {
    throw error;
  });
};

/**
 * 在任何有副作用的请求之前核对两端的线协议版本（US-207 AC#9 / US-210 AC#10）。
 *
 * @remarks
 * 顺序就是这条 AC 的全部：`open` 会建库、开连接、登记会话，版本核对排在它之后的话，
 * 一次注定失败的连接仍会在磁盘上留下一个空库文件。握手请求本身无参数、无副作用，
 * 因此这里抛出去时 host 上什么都还没发生。
 *
 * 老到不认识握手的 host 会回 `protocol_violation: unknown request kind handshake`，
 * 原样抛给调用方即可：错误码一致（都是「两端对不上，别再往下走」），而消息已经点明了原因。
 * 这里**不做**任何「那就退回去直接 open」的兜底——版本号存在的意义正是不许降级。
 *
 * @param transport - 传输层
 * @throws {@link RxDBAdapterDesktopError} 两端版本不一致、或 host 根本不认识握手时抛 `protocol_violation`
 */
const negotiateProtocolVersion = async (transport: DesktopHostTransport): Promise<void> => {
  const response = assertDesktopHostResponse('handshake', await transport.request({ kind: 'handshake' }));
  parseDesktopHostHandshakeResult(response.result);
};

/**
 * 解析 `open` 结果；解析不过就先把 host 上刚开出来的会话关掉，再把原始错误抛出去。
 *
 * @remarks
 * 走到这里说明 host 已经建了库、开了连接、登记了会话，而 renderer 才发现结果形状不对。
 * 此时调用方拿不到 client，也就永远没有关掉那条会话的把手——它会一直握着一个打开的
 * SQLite 连接，直到宿主进程退出。
 *
 * 版本不匹配已经由 {@link negotiateProtocolVersion} 挡在 `open` 之前了，本函数因此只剩
 * 「结果形状坏掉」这一类原因（以及握手与 `open` 之间 host 被换掉这种病态情形）。
 * 它仍然必须留着：那类失败同样会留下一条没人认领的会话。
 *
 * `sessionId` 防御性地读：结果形状本来就可能是坏的（那正是走到这里的原因），
 * 读不出字符串就没有可关的东西。
 *
 * @param transport - 传输层
 * @param result - host 回的未校验 `open` 结果
 * @returns 校验通过的打开结果
 * @throws {@link RxDBAdapterDesktopError} 结果非法或协议版本不匹配时，抛出解析给出的原始错误
 */
const parseOpenResultOrClose = async (
  transport: DesktopHostTransport,
  result: unknown
): Promise<DesktopHostOpenResult> => {
  try {
    return parseDesktopHostOpenResult(result);
  } catch (error) {
    const record = typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : undefined;
    const sessionId = record?.['sessionId'];
    if (typeof sessionId === 'string') {
      // 收摊失败不上报：连接已经带着准确的原因失败了，而一个协议都对不上的 host
      // 关不掉会话并不令人意外，把它盖在真正的原因前面只会让诊断更远。
      await transport.request({ kind: 'close', sessionId }).catch(() => undefined);
    }
    throw error;
  }
};

/**
 * 通过桌面 host 访问本地 SQLite 文件的客户端。
 *
 * @remarks
 * 它满足 `SqliteClientLike`，因此 `RxDBAdapterSqliteBase` 里的查询、事务、分支切换
 * 与系统 schema 迁移全部原样复用——桌面路径不是另一套实现，
 * 只是同一份契约换了条传输通道。
 */
export class DesktopSqliteClient implements SqliteClientLike {
  readonly #transport: DesktopHostTransport;
  readonly #sessionId: string;
  readonly #beginTransactionSql: string;
  readonly #beginSystemMigrationTransactionSql: string;
  readonly #handlers = new Map<SQLiteChangeType, Set<(event: SqliteChangeEvent) => void>>();
  /**
   * 会话请求队列的队尾，见 {@link DesktopSqliteClient.request}。
   *
   * @remarks
   * 恒不 reject：失败在入队时就被吞掉，只交给发起方那一份 promise。链上留一个 reject
   * 会让后续所有请求跟着失败，一条查询出错就把整个会话废掉。
   */
  #tail: Promise<unknown> = Promise.resolve();
  /** 由 {@link DesktopSqliteClient.connect} 在实例构造完成后立即装上。 */
  #unsubscribe?: () => void;
  /**
   * 唯一的关闭流程，见 {@link DesktopSqliteClient.disconnect}。
   *
   * @remarks
   * 存在即表示关闭**已开始**；它落定才表示关闭**已完成**。这两个状态必须分开，
   * `#closed` 只承担前者（拒绝新请求）。
   */
  #disconnectPromise?: Promise<void>;
  #closed = false;

  /** 本客户端在 host 上的会话 ID，用于把推送过来的变更事件对号入座。 */
  get sessionId(): string {
    return this.#sessionId;
  }

  private constructor(
    transport: DesktopHostTransport,
    sessionId: string,
    /** host 解析出的逻辑位置，仅供诊断（AC#3）。 */
    readonly resolvedLocation: string,
    beginTransactionSql: string,
    beginSystemMigrationTransactionSql: string
  ) {
    this.#transport = transport;
    this.#sessionId = sessionId;
    this.#beginTransactionSql = beginTransactionSql;
    this.#beginSystemMigrationTransactionSql = beginSystemMigrationTransactionSql;
  }

  /**
   * 打开一个桌面数据库会话。
   *
   * @param transport - 由 preload 或 worker 桥接提供的传输层
   * @param storage - 桌面存储配置
   * @param options - 可选行为参数
   * @returns 已连接的客户端
   * @throws {@link RxDBAdapterDesktopError} 未注入传输层、配置非法或 host 打开失败时
   */
  static async connect(
    transport: DesktopHostTransport,
    storage: DesktopSqliteFileStorage,
    options?: DesktopSqliteClientOptions
  ): Promise<DesktopSqliteClient> {
    if (!isDesktopHostTransport(transport)) {
      throw new RxDBAdapterDesktopError(
        'host_unavailable',
        'no desktop host transport was injected; the preload script must expose one before RxDB connects'
      );
    }
    // renderer 侧先校验一次，非法配置连 IPC 都不用发；host 侧还会再校验一次。
    assertDesktopSqliteStorage(storage);
    // 先握手再 open：版本对不上时，磁盘上不该多出一个空库文件。
    await negotiateProtocolVersion(transport);

    const request = { kind: 'open', storage, batchTimeout: options?.batchTimeout } as const;
    const response = assertDesktopHostResponse('open', await transport.request(request));
    const opened = await parseOpenResultOrClose(transport, response.result);
    const client = new DesktopSqliteClient(
      transport,
      opened.sessionId,
      opened.resolvedLocation,
      opened.beginTransactionSql,
      opened.beginSystemMigrationTransactionSql
    );
    client.#unsubscribe = transport.subscribe(message => client.#onMessage(message));
    await client.#awaitSubscription();
    return client;
  }

  /**
   * 在 host 上执行 SQL。
   *
   * @param sql - 待执行的 SQL
   * @param bindings - 位置绑定参数
   * @returns 与本地 SQLite 后端形状一致的执行结果
   * @throws {@link RxDBAdapterDesktopError} 会话已断开，或 host 报告执行失败时
   */
  async execute(sql: string, bindings: SQLiteCompatibleType[] = []): Promise<SqliteResult> {
    this.#assertOpen();
    const request = { kind: 'execute', sessionId: this.#sessionId, sql, bindings } as const;
    return assertDesktopHostResponse('execute', await this.#request(request)).result;
  }

  /**
   * 报告 host 侧 SQLite 引擎的版本。
   *
   * @returns 形如 `3.50.4` 的版本串
   */
  async version(): Promise<string> {
    this.#assertOpen();
    return assertDesktopHostResponse('version', await this.#request({ kind: 'version', sessionId: this.#sessionId }))
      .result;
  }

  /**
   * 注册变更事件监听。
   *
   * @remarks
   * 返回 Promise 是为了对齐 `SqliteClientLike`：Comlink 远端客户端即便实现是同步的也会返回
   * Promise，注册方一律 `await`，否则监听可能尚未生效就开始写库。
   *
   * 这里等的是传输层的 {@link DesktopHostTransport.subscriptionReady}，也就是
   * `connect()` 等过的那一次注册。正常路径上它早已落定，`await` 只花一个微任务；
   * 通道事后掉线时它会 reject，注册方据此知道自己等不到事件，而不是静默地永远收不到。
   *
   * @param type - 关心的变更类型
   * @param handler - 事件回调
   */
  async addEventListener(type: SQLiteChangeType, handler: (event: SqliteChangeEvent) => void): Promise<void> {
    this.#assertOpen();
    const handlers = this.#handlers.get(type) ?? new Set();
    handlers.add(handler);
    this.#handlers.set(type, handlers);
    await this.#transport.subscriptionReady?.();
  }

  /**
   * 开启普通事务的 SQL。
   *
   * @returns host 在 `open` 应答里给出的语句
   */
  beginTransactionSql(): string {
    return this.#beginTransactionSql;
  }

  /**
   * 系统 schema 迁移使用的最强锁 SQL。
   *
   * @returns host 在 `open` 应答里给出的语句
   */
  beginSystemMigrationTransactionSql(): string {
    return this.#beginSystemMigrationTransactionSql;
  }

  /**
   * 断开会话。
   *
   * @remarks
   * 顺序即 AC#7 的语义：先置关闭标记**停止接受新任务**，再等在途请求跑完，
   * 最后才让 host 释放句柄。等的是 {@link DesktopSqliteClient.#tail}，它不会 reject
   * ——某条在途查询失败不该把句柄一直挂住。
   *
   * 并发调用共享同一个 {@link DesktopSqliteClient.#disconnectPromise}，因此**所有**调用方
   * 都在句柄真正释放之后才落定。只靠 `#closed` 布尔量做不到这一点：它一被置位，第二个调用方
   * 立刻就成功返回，可能在库还开着时就去重命名或备份文件。
   *
   * 关闭失败时这个 promise 被缓存为 rejected，后续调用看到同一个 rejection，**不会**
   * 静默当成已关闭，也不会自动重试——句柄是否释放没有第二个判据，装作成功只会把
   * 「文件仍被占用」推迟到更难定位的地方爆炸。
   *
   * @throws {@link RxDBAdapterDesktopError} host 拒绝或未能关闭该会话时
   */
  async disconnect(): Promise<void> {
    this.#disconnectPromise ??= this.#runDisconnect();
    await this.#disconnectPromise;
  }

  /**
   * 等变更事件通道真正建好，失败就回滚刚打开的会话。
   *
   * @remarks
   * 订阅建不起来意味着响应式查询永远不刷新。返回一个「能查、但永不刷新」的客户端是所有
   * 故障形态里最难查的一种，所以这里让 `connect()` 直接失败，把问题摆在连接这一步。
   *
   * 回滚是必须的：`open` 已经在 host 上开了会话、占了文件锁，调用方却拿不到客户端，
   * 再没有第二个人能关掉它。
   *
   * @throws {@link RxDBAdapterDesktopError} 通道注册失败时抛 `host_unavailable`，
   *   原始原因挂在 `cause` 上
   */
  async #awaitSubscription(): Promise<void> {
    try {
      await this.#transport.subscriptionReady?.();
      return;
    } catch (error) {
      const closeFailure = await this.#abandonSession();
      throw new RxDBAdapterDesktopError(
        'host_unavailable',
        `desktop session ${this.#sessionId} could not subscribe to host change events` +
          (closeFailure ? `; closing the half-open session also failed: ${String(closeFailure)}` : ''),
        { cause: error }
      );
    }
  }

  /**
   * 关掉一个还没交给调用方的会话。
   *
   * @remarks
   * 与 {@link DesktopSqliteClient.disconnect} 的区别是它**不抛**：真正的失败原因是
   * 订阅没建起来，回滚顺不顺利不该把它盖掉。但也不能让回滚失败无痕消失，
   * 所以原样交回去，由调用点拼进消息里。
   *
   * @returns 关闭失败的原因，成功时为 `undefined`
   */
  async #abandonSession(): Promise<unknown> {
    this.#closed = true;
    this.#unsubscribe?.();
    try {
      assertDesktopHostResponse('close', await this.#request({ kind: 'close', sessionId: this.#sessionId }));
      return undefined;
    } catch (error) {
      return error;
    }
  }

  async #runDisconnect(): Promise<void> {
    this.#closed = true;
    await this.#tail;
    this.#unsubscribe?.();
    this.#handlers.clear();
    assertDesktopHostResponse('close', await this.#request({ kind: 'close', sessionId: this.#sessionId }));
  }

  /**
   * 把一个请求排进本会话的队列，队列空了才发上传输层。
   *
   * @remarks
   * **一个会话同一时刻只允许有一个在途请求。** 会话在 host 侧就是一条 SQLite 连接，
   * 而 `BEGIN` / 业务语句 / `COMMIT` 是三次独立往返：只要允许它们与别的请求交错，
   * 「先发的先执行」就不再成立，一条 `SELECT` 可能挤到 `DELETE` 前面跑，
   * 上层看到的是刚删掉的行还在。
   *
   * 这条保证以前是**偶然**成立的：Electron 侧 `ipcMain` 的处理函数是同步的
   * （`node:sqlite` 全同步），一次 `invoke` 跑完才轮到下一次，顺序自然是 FIFO。
   * Tauri 侧不是——每次 `invoke` 派到自己的任务上，再经 `spawn_blocking` 去抢会话锁，
   * 抢到的顺序与发出的顺序无关。行为差异因此只在 Tauri 路径上暴露，且表现为随机失败。
   * 顺序保证放在这里，两个 host 就都不必再依赖各自的调度巧合。
   *
   * 排队不影响并发度：队列是**每会话**一条，不同会话（不同连接）照旧并行，
   * 跨会话的写锁竞争仍由 host 侧的 `busy_timeout` 处理。同一条连接上的请求本来
   * 就会被 SQLite 串起来，这里只是把串行发生的位置提前到发出之前。
   *
   * @param payload - 待发送的请求
   * @returns host 的原始应答
   */
  #request(payload: DesktopHostRequest): Promise<unknown> {
    const settled = this.#tail.then(() => this.#transport.request(payload));
    this.#tail = settled.then(undefined, () => undefined);
    return settled;
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new RxDBAdapterDesktopError('session_closed', `desktop session ${this.#sessionId} is already disconnected`);
    }
  }

  #onMessage(message: unknown): void {
    if (this.#closed || !isChangeMessage(message) || message.sessionId !== this.#sessionId) return;
    let event: SqliteChangeEvent;
    try {
      event = parseDesktopHostChangeEvent(message.event);
    } catch (error) {
      reportOutOfBand(error);
      return;
    }
    const handlers = this.#handlers.get(event.type);
    if (!handlers) return;
    // 逐个包：同一个类型上的 handler 互相独立（不同仓库、不同查询），
    // 一个抛出不该让排在它后面的收不到这条变更。
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        reportOutOfBand(error);
      }
    }
  }
}
