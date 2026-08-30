/**
 * renderer 侧的桌面 PGlite 客户端，实现 `@aiao/rxdb-adapter-pglite` 的 `IPGliteClient` 契约。
 *
 * @remarks
 * 它把 query / exec / transaction 转成 `pg.*` 请求发给主进程持有的唯一 PGlite 实例，
 * 因此 `RxDBAdapterPGlite` 里的全部 SQL、迁移、变更管线原样复用——桌面路径不是另一套
 * 实现，只是同一份契约换了条传输通道。
 *
 * 事务用的是 US-208 线 G 冻结的「IPC 事务 ID 协议」：`pg.begin` 换回一个 host 签发的
 * 事务 ID，随后的语句带着它走，最后 `pg.commit` / `pg.rollback` 结清。
 *
 * @module pglite/desktop-pglite-client
 */

import {
  DEFAULT_NOTIFY_BATCH_TIMEOUT_MS,
  PGliteNotificationBatcher,
  type IPGliteClient,
  type PGliteClientEvents,
  type PGliteClientOptions
} from '@aiao/rxdb-adapter-pglite';
import {
  RxDBAdapterDesktopError,
  assertDesktopPgliteResponse,
  parseDesktopPgliteHandshakeResult,
  parseDesktopPgliteNotifyMessage,
  parseDesktopPgliteOpenResult,
  type DesktopHostTransport,
  type DesktopPgliteParam,
  type DesktopPgliteQueryResult,
  type DesktopPgliteRequest
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { EventDispatcher } from '@aiao/utils';
import type { QueryOptions, Results, Transaction } from '@electric-sql/pglite';
// 模板编译走 PGlite 自己的实现，而不是本地再拼一遍 `$1、$2`：`identifier` / `raw` / 嵌套
// `sql` 这些辅助器的语义只有原实现说了算，照抄一份的分叉表征是「同一个模板在桌面下
// 少转义了一个标识符」。`/template` 是个独立子路径（约 2 KB），不带任何 WASM 进 renderer。
import { query as compileTemplate } from '@electric-sql/pglite/template';

/** {@link DesktopPGliteClient} 的构造参数。 */
export interface DesktopPGliteClientOptions {
  /** preload 或 worker 桥接提供的传输层。 */
  readonly transport: DesktopHostTransport;
  /** 应用作用域内的逻辑数据目录名；host 在自己的应用数据目录里解析它。 */
  readonly dataDirectoryName: string;
  /** `pg.begin` 的等待上限（毫秒）；省略时由 host 用协议默认值。 */
  readonly beginTimeout?: number;
  /** NOTIFY 批量窗口（毫秒）；省略时用 {@link DEFAULT_NOTIFY_BATCH_TIMEOUT_MS}。 */
  readonly batchTimeout?: number;
}

/**
 * 把 host 的应答还原成 PGlite 的 `Results`。
 *
 * @remarks
 * `rows` 里的值已经是 PG 的原生 JS 表示（bigint / `Uint8Array` / `Date` / 普通对象），
 * 结构化克隆逐值搬过来，这里不做任何再解析——多一层转换就多一处能悄悄丢精度的地方。
 */
const toResults = <T>(result: DesktopPgliteQueryResult): Results<T> => ({
  rows: result.rows as unknown as T[],
  fields: result.fields.map(field => ({ name: field.name, dataTypeID: field.dataTypeID })),
  affectedRows: result.affectedRows
});

/**
 * 拒绝本代理无法转发的 `QueryOptions`。
 *
 * @remarks
 * `parsers` / `serializers` / `onNotice` 都是函数，`blob` 是流——没有一个过得了结构化克隆。
 * 静默忽略它们的后果是调用方以为自己换了解析器，而拿到的还是默认解析结果，
 * 且**没有任何报错**。这里明确失败，比装作支持诚实。
 */
const assertNoQueryOptions = (options: QueryOptions | undefined): void => {
  if (options === undefined) return;
  throw new RxDBAdapterDesktopError(
    'protocol_violation',
    'the desktop PGlite protocol carries no QueryOptions; parsers, serializers, onNotice and blob ' +
      'cannot cross the process boundary'
  );
};

/**
 * 拒绝由 renderer 指定的落盘位置。
 *
 * @remarks
 * 存储归主进程独占（AC#5）：默默忽略 `store` / `dataDir` 会让调用方以为数据落在它指定的
 * 位置，而实际在别处——症状是「重启后数据没了」，排查时根本不会怀疑到这两个被忽略的字段。
 */
const assertHostOwnedStorage = (options: PGliteClientOptions): void => {
  if (options.store === undefined && options.dataDir === undefined) return;
  throw new RxDBAdapterDesktopError(
    'protocol_violation',
    'the desktop PGlite host owns storage; store and dataDir must not be set on the renderer side'
  );
};

const unsupportedTransactionOperation = (operation: string): RxDBAdapterDesktopError =>
  new RxDBAdapterDesktopError(
    'protocol_violation',
    `${operation}() cannot be proxied to the desktop PGlite host; use query() or exec() instead`
  );

/**
 * 通过桌面 host 访问主进程 PGlite 实例的客户端。
 *
 * @remarks
 * 两条串行化链各管一件事：
 * - {@link DesktopPGliteClient.#tail} 是**会话内 FIFO**，保证发出顺序即执行顺序；
 * - {@link DesktopPGliteClient.#lock} 是**本地互斥**，让事务独占整段时间。
 *
 * 后者不是可有可无的谨慎：主进程只有一条 PGlite 连接，一条事务开着时它被挂起的
 * callback 攥着。没有本地互斥的话，第二条事务的 `pg.begin`（或一条自动提交语句）会排在
 * 会话队列里等那条连接，而连接又要等第一条事务把剩下的语句发完——双方互相等，
 * 表现为几秒后一句 `transaction_unavailable`，看上去像 host 有 bug。浏览器路径上
 * PGlite 自己的 mutex 做的正是同一件事，这里只是把它挪到了进程边界的这一侧。
 *
 * @public
 */
export class DesktopPGliteClient extends EventDispatcher<PGliteClientEvents> implements IPGliteClient {
  readonly #options: DesktopPGliteClientOptions;
  readonly #batcher: PGliteNotificationBatcher;
  #dbName = '';
  #sessionId?: string;
  #resolvedLocation?: string;
  #unsubscribe?: () => void;
  #closed = false;
  #closePromise?: Promise<void>;
  /** 会话内 FIFO 队尾；恒不 reject，否则一条查询出错会把整个会话废掉。 */
  #tail: Promise<unknown> = Promise.resolve();
  /** 本地互斥队尾；同样恒不 reject。 */
  #lock: Promise<unknown> = Promise.resolve();

  /** 本客户端在 host 上的会话 ID，用于把推送过来的 NOTIFY 对号入座。 */
  get sessionId(): string {
    if (!this.#sessionId) {
      throw new RxDBAdapterDesktopError('session_closed', 'the desktop PGlite client has not been initialised yet');
    }
    return this.#sessionId;
  }

  /** host 解析出的逻辑位置，仅供诊断（AC#5）。 */
  get resolvedLocation(): string {
    if (!this.#resolvedLocation) {
      throw new RxDBAdapterDesktopError('session_closed', 'the desktop PGlite client has not been initialised yet');
    }
    return this.#resolvedLocation;
  }

  /** 尚未分发的 NOTIFY 行事件数量。 */
  get pendingNotificationCount(): number {
    return this.#batcher.pendingCount;
  }

  constructor(options: DesktopPGliteClientOptions) {
    super();
    this.#options = options;
    this.#batcher = new PGliteNotificationBatcher({
      resolveDbName: () => this.#dbName,
      emit: event => this.dispatchEvent(event.type, event),
      batchTimeout: options.batchTimeout ?? DEFAULT_NOTIFY_BATCH_TIMEOUT_MS,
      onParseError: error => console.error('Failed to parse desktop NOTIFY payload:', error)
    });
  }

  /**
   * 握手、打开会话并订阅变更推送。
   *
   * @remarks
   * 握手排在 `pg.open` 之前是 AC#11 的全部内容：`pg.open` 会 `mkdir` 出数据目录并在里面
   * 跑 initdb，等 renderer 从 open 应答里读出版本不匹配时，磁盘上已经多了一整棵目录树，
   * 而调用方拿不到 client，也就没有把手去收拾它。
   *
   * @param dbName - RxDB 逻辑库名；只用于变更事件的 `dbName` 字段，不参与落盘位置解析
   * @param options - PGlite 选项；**不得**含 `store` 或 `dataDir`
   * @throws {@link RxDBAdapterDesktopError} 指定了落盘位置、协议版本不匹配或 host 打不开数据目录时
   */
  async init(dbName: string, options: PGliteClientOptions): Promise<void> {
    assertHostOwnedStorage(options);
    if (this.#sessionId) {
      throw new RxDBAdapterDesktopError(
        'protocol_violation',
        `the desktop PGlite client is already bound to session ${this.#sessionId}`
      );
    }
    this.#dbName = dbName;

    const handshake = assertDesktopPgliteResponse(
      'pg.handshake',
      await this.#options.transport.request({ kind: 'pg.handshake' })
    );
    parseDesktopPgliteHandshakeResult(handshake.result);

    const opened = assertDesktopPgliteResponse(
      'pg.open',
      await this.#options.transport.request({
        kind: 'pg.open',
        storage: { engine: 'pglite', dataDirectoryName: this.#options.dataDirectoryName }
      })
    );
    const result = await this.#parseOpenResultOrClose(opened.result);
    this.#sessionId = result.sessionId;
    this.#resolvedLocation = result.resolvedLocation;
    this.#unsubscribe = this.#options.transport.subscribe(message => this.#onMessage(message));
    await this.#awaitSubscription();
  }

  /**
   * 执行一条带参数的语句（扩展查询协议）。
   *
   * @param query - SQL
   * @param params - 位置参数
   * @param options - **必须省略**，见 {@link assertNoQueryOptions}
   * @returns 与浏览器路径同形状的结果
   * @throws {@link RxDBAdapterDesktopError} 会话已关闭、传了 `options`，或 host 报告执行失败时
   */
  async query<T>(query: string, params?: unknown[], options?: QueryOptions): Promise<Results<T>> {
    this.#assertOpen();
    assertNoQueryOptions(options);
    return this.#exclusive(async () => this.#queryOn(undefined, query, params));
  }

  /**
   * 以标签模板执行一条语句，参数自动参数化。
   *
   * @param sqlStrings - 模板字面量片段
   * @param params - 插值；`identifier` / `raw` / 嵌套 `sql` 辅助器按原语义处理
   * @returns 与浏览器路径同形状的结果
   * @throws {@link RxDBAdapterDesktopError} 会话已关闭，或 host 报告执行失败时
   */
  async sql<T>(sqlStrings: TemplateStringsArray, ...params: unknown[]): Promise<Results<T>> {
    this.#assertOpen();
    const compiled = compileTemplate(sqlStrings, ...params);
    return this.#exclusive(async () => this.#queryOn(undefined, compiled.query, compiled.params));
  }

  /**
   * 执行一段多语句脚本（简单查询协议）。
   *
   * @param query - 一条或多条以 `;` 分隔的语句
   * @param options - **必须省略**，见 {@link assertNoQueryOptions}
   * @returns 每条语句一个结果
   * @throws {@link RxDBAdapterDesktopError} 会话已关闭、传了 `options`，或 host 报告执行失败时
   */
  async exec(query: string, options?: QueryOptions): Promise<Results[]> {
    this.#assertOpen();
    assertNoQueryOptions(options);
    return this.#exclusive(async () => this.#execOn(undefined, query));
  }

  /**
   * 在主进程那条唯一连接上开一条真事务。
   *
   * @remarks
   * 回调拿到的 `tx` 是个代理：它的每条语句都带着 host 签发的事务 ID 过去，因此确实落在
   * 同一条 PostgreSQL 事务里，而不是被包装成「看起来像事务」的独立请求（AC#2）。
   * 回调正常返回即 `pg.commit`，抛出即 `pg.rollback`——与 PGlite 自己的语义一致。
   *
   * @param callback - 事务体
   * @returns 回调的返回值
   * @throws 回调抛出的原始异常（事务已回滚），或 {@link RxDBAdapterDesktopError}
   */
  async transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    this.#assertOpen();
    return this.#exclusive(() => this.#runTransaction(callback));
  }

  /**
   * 报告 host 侧 PostgreSQL 的版本串。
   *
   * @returns 形如 `PostgreSQL 17.x ...` 的版本串
   */
  async version(): Promise<string> {
    this.#assertOpen();
    return this.#exclusive(
      async () =>
        assertDesktopPgliteResponse('pg.version', await this.#send({ kind: 'pg.version', sessionId: this.sessionId }))
          .result
    );
  }

  /**
   * 断开会话。
   *
   * @remarks
   * 等在途请求与开着的事务跑完再关，因此调用方返回时 host 上确实已经没有本会话的
   * 任何残留。并发调用共享同一个关闭流程。
   */
  async disconnect(): Promise<void> {
    this.#closePromise ??= this.#runClose(true);
    await this.#closePromise;
  }

  /**
   * 不等在途请求，直接让 host 释放本会话。
   *
   * @remarks
   * host 收到 `pg.close` 会把本会话仍开着的事务全部回滚，因此「不等」丢掉的只是那些
   * 未提交的写——这正是 `forceClose` 与 {@link DesktopPGliteClient.disconnect} 的区别。
   */
  async forceClose(): Promise<void> {
    this.#closePromise ??= this.#runClose(false);
    await this.#closePromise;
  }

  /**
   * 解析 `pg.open` 结果；解析不过就先把 host 上刚开出来的会话关掉，再抛原始错误。
   *
   * @remarks
   * 走到这里说明 host 已经建好数据目录、起了实例、登记了会话，而 renderer 才发现结果
   * 形状不对。此时调用方拿不到 client，也就永远没有关掉那条会话的把手。
   */
  async #parseOpenResultOrClose(result: unknown): Promise<{ sessionId: string; resolvedLocation: string }> {
    try {
      return parseDesktopPgliteOpenResult(result);
    } catch (error) {
      const record = typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : undefined;
      const sessionId = record?.['sessionId'];
      if (typeof sessionId === 'string') {
        // 收摊失败不上报：连接已经带着准确的原因失败了，把它盖掉只会让诊断更远。
        await this.#options.transport.request({ kind: 'pg.close', sessionId }).catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * 等变更推送通道真正建好，失败就回滚刚打开的会话。
   *
   * @remarks
   * 订阅建不起来意味着响应式查询永远不刷新。返回一个「能查、但永不刷新」的客户端是所有
   * 故障形态里最难查的一种，所以这里让 `init()` 直接失败。
   */
  async #awaitSubscription(): Promise<void> {
    try {
      await this.#options.transport.subscriptionReady?.();
    } catch (error) {
      const sessionId = this.#sessionId;
      this.#closed = true;
      this.#unsubscribe?.();
      await this.#send({ kind: 'pg.close', sessionId: sessionId! }).catch(() => undefined);
      throw new RxDBAdapterDesktopError(
        'host_unavailable',
        `desktop PGlite session ${String(sessionId)} could not subscribe to host notifications`,
        { cause: error }
      );
    }
  }

  async #runClose(drain: boolean): Promise<void> {
    if (drain) await this.#lock.catch(() => undefined);
    this.#closed = true;
    if (drain) await this.#tail.catch(() => undefined);
    const sessionId = this.#sessionId;
    this.#unsubscribe?.();
    this.#batcher.clear();
    this.removeAllEventListeners();
    if (!sessionId) return;
    assertDesktopPgliteResponse('pg.close', await this.#options.transport.request({ kind: 'pg.close', sessionId }));
  }

  async #runTransaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    const begun = assertDesktopPgliteResponse(
      'pg.begin',
      await this.#send({
        kind: 'pg.begin',
        sessionId: this.sessionId,
        ...(this.#options.beginTimeout === undefined ? {} : { timeout: this.#options.beginTimeout })
      } as DesktopPgliteRequest)
    );
    const transactionId = begun.result.transactionId;
    let settled = false;

    const end = async (kind: 'pg.commit' | 'pg.rollback'): Promise<void> => {
      settled = true;
      assertDesktopPgliteResponse(kind, await this.#send({ kind, sessionId: this.sessionId, transactionId }));
    };
    const assertLive = (): void => {
      if (settled) {
        throw new RxDBAdapterDesktopError('transaction_not_found', `transaction ${transactionId} is already closed`);
      }
    };

    const tx: Transaction = {
      query: async <R>(sql: string, params?: unknown[], options?: QueryOptions): Promise<Results<R>> => {
        assertLive();
        assertNoQueryOptions(options);
        return this.#queryOn(transactionId, sql, params);
      },
      exec: async (sql: string, options?: QueryOptions): Promise<Results[]> => {
        assertLive();
        assertNoQueryOptions(options);
        return this.#execOn(transactionId, sql);
      },
      rollback: async (): Promise<void> => {
        assertLive();
        await end('pg.rollback');
      },
      sql: async <R>(sqlStrings: TemplateStringsArray, ...values: unknown[]): Promise<Results<R>> => {
        assertLive();
        const compiled = compileTemplate(sqlStrings, ...values);
        return this.#queryOn(transactionId, compiled.query, compiled.params);
      },
      // `listen` 代理不了：它要在**这条连接**上挂一个回调，而回调过不了进程边界。
      // 静默降级成「订阅了但永远收不到」是最难查的一种故障，所以当场炸。
      // 事务内的通知请改用 renderer 侧的 NOTIFY 批量器（本客户端已经在监听）。
      listen: (): Promise<(tx?: Transaction) => Promise<void>> => {
        throw unsupportedTransactionOperation('listen');
      },
      get closed(): boolean {
        return settled;
      }
    };

    try {
      const result = await callback(tx);
      if (!settled) await end('pg.commit');
      return result;
    } catch (error) {
      // 回滚失败不覆盖原始错误：调用方要看的是业务那条，而不是收摊那条。
      if (!settled) await end('pg.rollback').catch(() => undefined);
      throw error;
    }
  }

  async #queryOn<T>(transactionId: string | undefined, sql: string, params?: unknown[]): Promise<Results<T>> {
    const request: DesktopPgliteRequest = {
      kind: 'pg.query',
      sessionId: this.sessionId,
      sql,
      params: (params ?? []) as readonly DesktopPgliteParam[],
      ...(transactionId === undefined ? {} : { transactionId })
    };
    return toResults<T>(assertDesktopPgliteResponse('pg.query', await this.#send(request)).result);
  }

  async #execOn(transactionId: string | undefined, sql: string): Promise<Results[]> {
    const request: DesktopPgliteRequest = {
      kind: 'pg.exec',
      sessionId: this.sessionId,
      sql,
      ...(transactionId === undefined ? {} : { transactionId })
    };
    return assertDesktopPgliteResponse('pg.exec', await this.#send(request)).result.map(result => toResults(result));
  }

  /**
   * 独占执行：事务整段、单条自动提交语句各算一次。
   *
   * @remarks
   * 必须在任何 `await` 之前**同步**接上队尾，否则两个并发调用会抢到同一个队尾，
   * 互斥退化成没有。
   */
  #exclusive<T>(run: () => Promise<T>): Promise<T> {
    const settled = this.#lock.then(run);
    this.#lock = settled.then(undefined, () => undefined);
    return settled;
  }

  /**
   * 把一个请求排进会话队列，队列空了才发上传输层。
   *
   * @remarks
   * 一个会话同一时刻只允许有一个在途请求：会话在 host 侧就是同一条 PGlite 连接上的
   * 一串调用，允许交错的话「先发的先执行」不再成立，一条 `SELECT` 可能挤到 `DELETE`
   * 前面跑，上层看到的是刚删掉的行还在。
   */
  #send(payload: DesktopPgliteRequest): Promise<unknown> {
    const settled = this.#tail.then(() => this.#options.transport.request(payload));
    this.#tail = settled.then(undefined, () => undefined);
    return settled;
  }

  #assertOpen(): void {
    if (this.#closed || !this.#sessionId) {
      throw new RxDBAdapterDesktopError(
        'session_closed',
        `desktop PGlite session ${String(this.#sessionId)} is not open`
      );
    }
  }

  /**
   * 收下一条 host 推送。
   *
   * @remarks
   * 变更通道是全 renderer 共享的：SQLite host 的 `change` 消息、别的会话的 NOTIFY 都会
   * 从这里过。先按 `kind` 与 `sessionId` 筛掉不属于自己的，再解析——顺序反过来的话，
   * 一条本来就不该由自己处理的消息会因为形状不符而抛错。
   */
  #onMessage(message: unknown): void {
    if (this.#closed) return;
    if (typeof message !== 'object' || message === null) return;
    if ((message as { kind?: unknown }).kind !== 'pg.notify') return;
    if ((message as { sessionId?: unknown }).sessionId !== this.#sessionId) return;
    const notification = parseDesktopPgliteNotifyMessage(message);
    this.#batcher.accept(notification.channel, notification.payload);
  }
}
