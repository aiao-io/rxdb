/**
 * 桌面 PGlite host：把 renderer 送来的 `pg.*` 请求派发到主进程持有的 PGlite 实例。
 *
 * @remarks
 * 本模块运行在**特权侧**，是唯一接触 PGlite 实例的地方。形状由 US-208 线 G 冻结为
 * 「IPC 事务 ID 协议」：主进程持连接，renderer 用 host 签发的事务 ID 把多次 IPC 调用
 * 串成一条真事务。
 *
 * PGlite 只提供 callback 形态的事务（`transaction(cb)`，返回即 COMMIT、抛出即 ROLLBACK），
 * 而 `cb` 跨不了 IPC。本模块的做法是**把 callback 挂起**：进入 `cb` 后立刻 `await` 一个
 * 由 host 持有的 promise，事务因此在 PostgreSQL 侧一直开着，`tx` 句柄留在表里供后续请求
 * 复用。这不是绕开 PGlite 的事务语义，恰恰是照它的语义用——每条语句都真的走同一个 `tx`，
 * 没有任何一条被拆进隐式事务（AC#2 明令禁止把多条独立请求包装成假事务）。
 *
 * @module electron-pglite-host
 */

import {
  DESKTOP_PGLITE_PROTOCOL_VERSION,
  parseDesktopPgliteRequest,
  RxDBAdapterDesktopError,
  type DesktopPgliteNotifyMessage,
  type DesktopPgliteQueryResult,
  type DesktopPgliteRequest,
  type DesktopPgliteResponse
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { randomUUID } from 'node:crypto';

/**
 * 逻辑位置的 scheme。
 *
 * @remarks
 * `pg.open` 回给 renderer 的 `resolvedLocation` 用它拼装，只表达「应用作用域内的某个数据
 * 目录」，不含物理根目录（AC#5）。与 SQLite 侧的 `desktop-sqlite://app-scope` 刻意不同名：
 * 两者的名字空间互不相干，共用一个 scheme 会让日志里的两类位置看起来可以互相替换。
 */
const LOGICAL_LOCATION_SCHEME = 'desktop-pglite://app-scope';

/**
 * host 代 renderer 订阅的 NOTIFY 频道。
 *
 * @remarks
 * 与 `@aiao/rxdb-adapter-pglite` 里 `PGliteClient` 监听的三张系统表一一对应。
 * PostgreSQL 只把 `LISTEN` 过的频道推给连接，因此这份清单漏一项就等于对应的响应式
 * 查询在桌面下永远不刷新——而浏览器下一切正常，排查时几乎不会怀疑到订阅清单上。
 */
export const DESKTOP_PGLITE_WATCH_CHANNELS: readonly string[] = Object.freeze([
  'rxdb_change_notify',
  'rxdb_branch_notify',
  'rxdb_migration_notify'
]);

/** 一条语句的结果；`ElectronPgliteRuntime` 与 PGlite 的 `Results` 在此结构相容。 */
export interface ElectronPgliteRuntimeResult {
  readonly rows: Record<string, unknown>[];
  readonly fields: { name: string; dataTypeID: number }[];
  readonly affectedRows?: number;
}

/** 事务句柄；对应 PGlite 的 `Transaction`，只声明 host 真正用到的两个操作。 */
export interface ElectronPgliteTransaction {
  query(sql: string, params?: unknown[]): Promise<ElectronPgliteRuntimeResult>;
  exec(sql: string): Promise<ElectronPgliteRuntimeResult[]>;
}

/**
 * host 需要的 PGlite 能力子集。
 *
 * @remarks
 * 刻意不写成 `PGliteInterface`：宿主应用极可能传进来的不是裸 `PGlite`，而是跑在 worker
 * 里的 `PGliteWorker`——PGlite 的 WASM 在主进程 JS 线程上是**同步**执行的，一条重查询会
 * 把整个窗口的 IPC 一起卡住（故事「冻结带来的三条实现约束」第 3 条）。声明成结构类型后，
 * 两者都能直接传入，而这份清单也顺便说清了 host 只需要这五个操作。
 */
export interface ElectronPgliteRuntime {
  query(sql: string, params?: unknown[]): Promise<ElectronPgliteRuntimeResult>;
  exec(sql: string): Promise<ElectronPgliteRuntimeResult[]>;
  transaction<T>(callback: (tx: ElectronPgliteTransaction) => Promise<T>): Promise<T>;
  listen(channel: string, callback: (payload: string) => void): Promise<unknown>;
  close(): Promise<void>;
}

/** {@link createElectronPgliteHost} 的入参。 */
export interface ElectronPgliteHostOptions {
  /**
   * 按逻辑数据目录名创建一个 PGlite 运行时。
   *
   * @remarks
   * **必填，没有默认实现**：默认值只能是「在某处建一个 PGlite」，而那个「某处」只有宿主
   * 应用知道（Electron 下通常在 `app.getPath('userData')` 之下）。给一个兜底目录意味着
   * 数据会静默落在谁也没打算用的位置，而症状是「重启后数据没了」。
   *
   * 传进来的名字已过白名单校验，不含任何路径分隔符，因此 `join(root, name)` 不会越出 `root`。
   * 同一个名字在 host 生命周期内只会被调用一次（AC#7）。
   */
  readonly createRuntime: (dataDirectoryName: string) => Promise<ElectronPgliteRuntime>;
  /** 把裸 NOTIFY 送达对应会话的 renderer，例如 `webContents.send`。 */
  readonly postNotify: (message: DesktopPgliteNotifyMessage) => void;
  /**
   * NOTIFY 送达失败时的上报口。
   *
   * @remarks
   * 与 SQLite host 同理：窗口在通知投递途中被销毁是常规竞态，此时写入早已落库，
   * 把送达失败当成写失败回给调用方只会诱发一次重复写入。不传则丢弃。
   */
  readonly onDeliveryError?: (error: unknown) => void;
}

/** 桌面 PGlite host 实例。 */
export interface ElectronPgliteHost {
  /**
   * 处理一条来自 renderer 的请求。
   *
   * @remarks
   * **永不 reject**：失败以 `kind: 'error'` 的应答返回，理由与 SQLite host 一致
   * （`ipcRenderer.invoke` 在 reject 时会把错误压平成字符串，错误码随之丢失）。
   *
   * @param request - 未经校验的请求负载
   * @param ownerId - 发起方的 `webContents.id`；会话与事务都按它归属
   * @returns 协议应答
   */
  handle(request: unknown, ownerId: number): Promise<DesktopPgliteResponse>;
  /** 当前打开的会话数。 */
  readonly openSessionCount: number;
  /** 当前活着的 PGlite 实例数；同一个数据目录上的多个会话只算一个。 */
  readonly openInstanceCount: number;
  /** 当前挂起的事务数；正常静止时应为 0。 */
  readonly openTransactionCount: number;
  /**
   * 回收某个窗口名下的全部会话与事务。
   *
   * @remarks
   * 这是本方案的**前提而非收尾**：挂起的 callback 独占 PGlite 的连接锁，渲染进程崩在
   * 事务中间而没人回收的话，之后任何查询都会永远排队——表征是「数据库不响应」，
   * 与那次崩溃毫无关联线索。调用方必须把它挂到 `render-process-gone` 与 `destroyed`
   * 两个事件上（AC#3）。
   *
   * @param ownerId - 已崩溃或已销毁的 `webContents.id`
   * @returns 本次回滚掉的事务条数
   */
  releaseOwner(ownerId: number): Promise<number>;
  /** 关闭全部会话与实例，通常在应用退出前调用。 */
  closeAll(): Promise<void>;
}

/** 一个数据目录上的运行时及其会话。 */
interface InstanceEntry {
  readonly sessions: Set<string>;
  readonly ready: Promise<ElectronPgliteRuntime>;
}

/** 一条会话。 */
interface SessionEntry {
  readonly dataDirectoryName: string;
  readonly owner: number;
}

/** 一条挂起中的事务。 */
interface TransactionEntry {
  readonly sessionId: string;
  readonly tx: ElectronPgliteTransaction;
  readonly settle: { readonly resolve: () => void; readonly reject: (error: Error) => void };
  /** `transaction(...)` 本身；等它落地才算真的提交/回滚完。 */
  readonly finished: Promise<unknown>;
}

/** `pg.begin` 等到超时的哨兵；用 Symbol 是因为任何合法的 `tx` 都不可能与它相等。 */
const TIMED_OUT = Symbol('pg.begin timed out');

const raceTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof TIMED_OUT>(resolve => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      })
    ]);
  } finally {
    // 不清掉的话，一次成功的 begin 也会让 Node 的事件循环多活 `ms` 毫秒，
    // 于是应用退出被推迟——在测试里表现为「跑完了但进程不退」。
    clearTimeout(timer);
  }
};

/**
 * 把 PGlite 的结果收窄成能过结构化克隆的形状。
 *
 * @remarks
 * `fields` 上除了 `name` / `dataTypeID` 还挂着 PGlite 自己的解析器，整个丢给
 * `ipcRenderer.invoke` 会以 DataCloneError 失败——而报错点在 IPC 层，看上去与 SQL 毫无关系。
 * `rows` 里的 bigint / Uint8Array / Date 都是结构化克隆原生支持的，原样带走（AC#1）。
 */
const toWireResult = (result: ElectronPgliteRuntimeResult): DesktopPgliteQueryResult => ({
  rows: result.rows,
  fields: result.fields.map(field => ({ name: field.name, dataTypeID: field.dataTypeID })),
  affectedRows: result.affectedRows
});

const toErrorResponse = (error: unknown): DesktopPgliteResponse => {
  if (error instanceof RxDBAdapterDesktopError) {
    return { kind: 'error', code: error.code, message: error.detail };
  }
  return {
    kind: 'error',
    code: 'host_internal_error',
    message: error instanceof Error ? error.message : String(error)
  };
};

/**
 * 跑一条语句，把引擎抛出的错误归一成 `statement_failed`。
 *
 * @remarks
 * 不归一的话，一条写错的 SQL 会以 `host_internal_error` 回到 renderer——那个码的含义是
 * 「host 有缺陷」，会把调用方的排查引向完全错误的方向。
 */
const runStatement = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RxDBAdapterDesktopError) throw error;
    throw new RxDBAdapterDesktopError('statement_failed', error instanceof Error ? error.message : String(error), {
      cause: error
    });
  }
};

/**
 * 创建一个桌面 PGlite host。
 *
 * @remarks
 * 与 SQLite host 相反，同一个数据目录上的多个会话**共享一个** PGlite 实例（AC#7）：
 * PGlite 是嵌入式单写者，同一份数据目录被两个实例同时打开会直接损坏它。跨窗口的并发
 * 因此由这一条连接的排队来串行化，而不是交给文件锁。
 *
 * @param options - host 配置
 * @returns host 实例
 */
export function createElectronPgliteHost(options: ElectronPgliteHostOptions): ElectronPgliteHost {
  const instances = new Map<string, InstanceEntry>();
  const sessions = new Map<string, SessionEntry>();
  const transactions = new Map<string, TransactionEntry>();

  const deliver = (sessionId: string, channel: string, payload: string): void => {
    try {
      options.postNotify({ kind: 'pg.notify', sessionId, channel, payload });
    } catch (error) {
      options.onDeliveryError?.(error);
    }
  };

  const createInstance = (dataDirectoryName: string): InstanceEntry => {
    const sessionIds = new Set<string>();
    const ready = (async (): Promise<ElectronPgliteRuntime> => {
      const runtime = await options.createRuntime(dataDirectoryName);
      // 订阅在这里一次性建好，而不是每开一个会话建一次：LISTEN 是连接级的，
      // 重复订阅只会让同一条 NOTIFY 被回调多次，进而让 renderer 侧的批量窗口收到重复事件。
      for (const channel of DESKTOP_PGLITE_WATCH_CHANNELS) {
        await runtime.listen(channel, payload => {
          for (const sessionId of sessionIds) deliver(sessionId, channel, payload);
        });
      }
      return runtime;
    })();
    return { sessions: sessionIds, ready };
  };

  const requireSession = (sessionId: string, ownerId: number): SessionEntry => {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new RxDBAdapterDesktopError('session_closed', `session ${sessionId} is not open on this host`);
    }
    if (session.owner !== ownerId) {
      throw new RxDBAdapterDesktopError('permission_denied', `session ${sessionId} belongs to another window`);
    }
    return session;
  };

  const requireRuntime = async (session: SessionEntry): Promise<ElectronPgliteRuntime> => {
    const instance = instances.get(session.dataDirectoryName);
    if (!instance) {
      throw new RxDBAdapterDesktopError(
        'host_internal_error',
        `session references a released instance for ${session.dataDirectoryName}`
      );
    }
    return instance.ready;
  };

  /**
   * 取一条挂起中的事务。
   *
   * @remarks
   * 同时核对 `sessionId`：事务 ID 是随机 UUID，猜不到，但**会话已经关掉、事务 ID 却被
   * 复用**这条路径是猜得到的。归属对不上时报 `transaction_not_found` 而不是别的码，
   * 因为对调用方而言这条事务确实不存在——它的语句一条都没有执行。
   */
  const requireTransaction = (transactionId: string, sessionId: string): TransactionEntry => {
    const entry = transactions.get(transactionId);
    if (!entry || entry.sessionId !== sessionId) {
      throw new RxDBAdapterDesktopError(
        'transaction_not_found',
        `transaction ${transactionId} is unknown, already finished, or not owned by session ${sessionId}`
      );
    }
    return entry;
  };

  const settle = async (transactionId: string, failure: Error | null): Promise<void> => {
    const entry = transactions.get(transactionId);
    if (!entry) return;
    transactions.delete(transactionId);
    if (failure) entry.settle.reject(failure);
    else entry.settle.resolve();
    // 必须等 `transaction(...)` 自己落地：不等的话 COMMIT 还在飞，紧接着的读可能看不到
    // 刚写进去的数据，而那会被误读成「事务语义不成立」。
    await entry.finished.catch(() => undefined);
  };

  const open = async (
    request: Extract<DesktopPgliteRequest, { kind: 'pg.open' }>,
    ownerId: number
  ): Promise<DesktopPgliteResponse> => {
    const { dataDirectoryName } = request.storage;
    const instance = instances.get(dataDirectoryName) ?? createInstance(dataDirectoryName);
    instances.set(dataDirectoryName, instance);
    try {
      await instance.ready;
    } catch (error) {
      // 起不来的实例不能留在表里：留着的话下一次 `pg.open` 会拿到同一个已经 reject 的
      // promise，于是「修好配置再试一次」永远不可能成功。
      if (instance.sessions.size === 0) instances.delete(dataDirectoryName);
      throw new RxDBAdapterDesktopError(
        'open_failed',
        `the application could not open a PGlite runtime for ${dataDirectoryName}`,
        { cause: error }
      );
    }
    const sessionId = randomUUID();
    instance.sessions.add(sessionId);
    sessions.set(sessionId, { dataDirectoryName, owner: ownerId });
    return {
      kind: 'pg.open',
      result: {
        sessionId,
        resolvedLocation: `${LOGICAL_LOCATION_SCHEME}/${dataDirectoryName}`,
        protocolVersion: DESKTOP_PGLITE_PROTOCOL_VERSION
      }
    };
  };

  /** 关掉一条会话；数据目录上最后一条会话消失时连实例一起释放。 */
  const closeSession = async (sessionId: string): Promise<void> => {
    const session = sessions.get(sessionId);
    if (!session) return;
    sessions.delete(sessionId);
    const instance = instances.get(session.dataDirectoryName);
    if (!instance) return;
    instance.sessions.delete(sessionId);
    if (instance.sessions.size > 0) return;
    instances.delete(session.dataDirectoryName);
    const runtime = await instance.ready.catch(() => undefined);
    await runtime?.close();
  };

  /** 回滚一条会话名下全部挂起的事务，返回条数。 */
  const rollbackSessionTransactions = async (sessionId: string, reason: string): Promise<number> => {
    const doomed = [...transactions.entries()].filter(([, entry]) => entry.sessionId === sessionId).map(([id]) => id);
    for (const transactionId of doomed) {
      await settle(transactionId, new RxDBAdapterDesktopError('transaction_not_found', reason));
    }
    return doomed.length;
  };

  const begin = async (
    request: Extract<DesktopPgliteRequest, { kind: 'pg.begin' }>,
    ownerId: number
  ): Promise<DesktopPgliteResponse> => {
    const runtime = await requireRuntime(requireSession(request.sessionId, ownerId));

    let settleHandles!: TransactionEntry['settle'];
    const closed = new Promise<void>((resolve, reject) => {
      settleHandles = { resolve, reject };
    });
    // 超时路径会在任何人 await 之前就 reject 它；先接住，免得变成未处理拒绝而打死进程。
    closed.catch(() => undefined);

    let markStarted!: (tx: ElectronPgliteTransaction) => void;
    const started = new Promise<ElectronPgliteTransaction>(resolve => {
      markStarted = resolve;
    });
    const finished = runtime.transaction(async tx => {
      markStarted(tx);
      // 事务从这里一直开着，直到 commit / rollback / 回收把 `closed` 结掉。
      await closed;
    });
    finished.catch(() => undefined);

    const tx = await raceTimeout(started, request.timeout);
    if (tx === TIMED_OUT) {
      // 关键在于 reject 而不是简单丢弃：被丢弃的 callback 迟早会在连接空出来的一瞬间
      // 启动，然后永远挂在 `await closed` 上——于是「超时之后再也开不了事务」，
      // 而现场看起来只是「数据库不响应」。reject 让它一进 callback 就抛，
      // PGlite 随即回滚这条空事务并交还连接。
      settleHandles.reject(
        new RxDBAdapterDesktopError('transaction_unavailable', 'the begin that opened this transaction timed out')
      );
      throw new RxDBAdapterDesktopError(
        'transaction_unavailable',
        `waited ${request.timeout}ms for the PGlite connection but another transaction still holds it`
      );
    }

    const transactionId = randomUUID();
    transactions.set(transactionId, { sessionId: request.sessionId, tx, settle: settleHandles, finished });
    return { kind: 'pg.begin', result: { transactionId } };
  };

  const query = async (
    request: Extract<DesktopPgliteRequest, { kind: 'pg.query' }>,
    ownerId: number
  ): Promise<DesktopPgliteResponse> => {
    const session = requireSession(request.sessionId, ownerId);
    const params = [...request.params];
    if (request.transactionId !== undefined) {
      const entry = requireTransaction(request.transactionId, request.sessionId);
      return { kind: 'pg.query', result: toWireResult(await runStatement(() => entry.tx.query(request.sql, params))) };
    }
    const runtime = await requireRuntime(session);
    return { kind: 'pg.query', result: toWireResult(await runStatement(() => runtime.query(request.sql, params))) };
  };

  const exec = async (
    request: Extract<DesktopPgliteRequest, { kind: 'pg.exec' }>,
    ownerId: number
  ): Promise<DesktopPgliteResponse> => {
    const session = requireSession(request.sessionId, ownerId);
    const target =
      request.transactionId === undefined ?
        await requireRuntime(session)
      : requireTransaction(request.transactionId, request.sessionId).tx;
    const results = await runStatement(() => target.exec(request.sql));
    return { kind: 'pg.exec', result: results.map(toWireResult) };
  };

  const end = async (
    request: Extract<DesktopPgliteRequest, { kind: 'pg.commit' | 'pg.rollback' }>,
    ownerId: number
  ): Promise<DesktopPgliteResponse> => {
    requireSession(request.sessionId, ownerId);
    requireTransaction(request.transactionId, request.sessionId);
    const failure =
      request.kind === 'pg.rollback' ? new RxDBAdapterDesktopError('write_aborted', 'rollback requested') : null;
    await settle(request.transactionId, failure);
    return { kind: request.kind };
  };

  const version = async (
    request: Extract<DesktopPgliteRequest, { kind: 'pg.version' }>,
    ownerId: number
  ): Promise<DesktopPgliteResponse> => {
    const runtime = await requireRuntime(requireSession(request.sessionId, ownerId));
    const result = await runStatement(() => runtime.query('SELECT version() AS version'));
    const value = result.rows[0]?.['version'];
    if (typeof value !== 'string') {
      throw new RxDBAdapterDesktopError('host_internal_error', 'PostgreSQL did not report a version string');
    }
    return { kind: 'pg.version', result: value };
  };

  const close = async (
    request: Extract<DesktopPgliteRequest, { kind: 'pg.close' }>,
    ownerId: number
  ): Promise<DesktopPgliteResponse> => {
    requireSession(request.sessionId, ownerId);
    await rollbackSessionTransactions(request.sessionId, `session ${request.sessionId} was closed`);
    await closeSession(request.sessionId);
    return { kind: 'pg.close' };
  };

  /**
   * 按种类派发一条已通过协议校验的请求。
   *
   * @remarks
   * 穷尽 `switch` 的理由与 SQLite host 完全一致：协议加了新种类而这里忘记补分支时，
   * `_exhaustive: never` 让它在 `tsc` 阶段就红，而不是在运行期变成怪异失败。
   */
  const dispatch = (request: DesktopPgliteRequest, ownerId: number): Promise<DesktopPgliteResponse> => {
    switch (request.kind) {
      // 握手排在最前，且不碰会话表、不碰 `createRuntime`：它的全部意义就是让 renderer
      // 在建目录之前把版本对上。这里一旦有任何副作用，磁盘上就会多出一棵 initdb 目录树，
      // 而那时调用方连收拾它的把手都没有（AC#11）。
      case 'pg.handshake':
        return Promise.resolve({
          kind: 'pg.handshake',
          result: { protocolVersion: DESKTOP_PGLITE_PROTOCOL_VERSION }
        });
      case 'pg.open':
        return open(request, ownerId);
      case 'pg.query':
        return query(request, ownerId);
      case 'pg.exec':
        return exec(request, ownerId);
      case 'pg.begin':
        return begin(request, ownerId);
      case 'pg.commit':
      case 'pg.rollback':
        return end(request, ownerId);
      case 'pg.version':
        return version(request, ownerId);
      case 'pg.close':
        return close(request, ownerId);
      default: {
        const _exhaustive: never = request;
        throw new RxDBAdapterDesktopError(
          'protocol_violation',
          `unsupported pglite request kind: ${String((_exhaustive as { kind?: unknown }).kind)}`
        );
      }
    }
  };

  return {
    handle: async (request: unknown, ownerId: number): Promise<DesktopPgliteResponse> => {
      try {
        return await dispatch(parseDesktopPgliteRequest(request), ownerId);
      } catch (error) {
        return toErrorResponse(error);
      }
    },
    get openSessionCount(): number {
      return sessions.size;
    },
    get openInstanceCount(): number {
      return instances.size;
    },
    get openTransactionCount(): number {
      return transactions.size;
    },
    releaseOwner: async (ownerId: number): Promise<number> => {
      const doomed = [...sessions.entries()].filter(([, session]) => session.owner === ownerId).map(([id]) => id);
      let rolledBack = 0;
      for (const sessionId of doomed) {
        rolledBack += await rollbackSessionTransactions(sessionId, `owner ${ownerId} is gone`);
        await closeSession(sessionId);
      }
      return rolledBack;
    },
    closeAll: async (): Promise<void> => {
      for (const sessionId of [...sessions.keys()]) {
        await rollbackSessionTransactions(sessionId, 'the host is shutting down');
        await closeSession(sessionId);
      }
    }
  };
}
