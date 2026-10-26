/**
 * 桌面 SQLite host：把 renderer 送来的协议请求派发到本地 `node:sqlite` 连接。
 *
 * @remarks
 * 本模块运行在**特权侧**（Electron 主进程或它拥有的 worker），是唯一接触文件系统的地方。
 * 所有入参先过 {@link parseDesktopHostRequest} 的信任边界，再落到引擎。
 *
 * @module desktop-sqlite-host
 */

import type { SqliteChangeEvent } from '@aiao/rxdb-adapter-sqlite-core';
import {
  DESKTOP_HOST_PROTOCOL_VERSION,
  RxDBAdapterDesktopError,
  parseDesktopHostRequest,
  type DesktopHostChangeEventMessage,
  type DesktopHostRequest,
  type DesktopHostResponse
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { NodeSqliteEngine } from './node-sqlite-engine.js';
import { errnoOf, toHostIoError } from './pglite-host/pglite-host-data-dir.js';
import { splitSqliteScript } from './sqlite-script.js';

/**
 * 逻辑位置的 scheme。
 *
 * @remarks
 * `open` 回给 renderer 的 `resolvedLocation` 用它拼装，只表达「应用作用域内的某个库」，
 * 不含物理根目录（AC#3）。
 */
const LOGICAL_LOCATION_SCHEME = 'desktop-sqlite://app-scope';

/**
 * 普通事务的起始 SQL。
 *
 * @remarks
 * 用 `IMMEDIATE` 而非 `Oo1ClientBase` 的裸 `BEGIN`：同一个文件上有多个窗口的连接，
 * 而 `BEGIN` 是延迟取锁的——写锁要等到事务里第一条写语句才拿，撞锁于是发生在**事务中途**。
 * 那时已经读过一份快照，SQLite 要求整个事务回滚重来，重试语义远比在起点重试复杂。
 * `IMMEDIATE` 把取锁挪到起点，撞锁时事务根本还没开，重试就是无副作用地再发一次
 * （见 {@link createElectronSqliteHost} 的 busy 重试）。
 * wa-sqlite 的多连接模式出于同样的理由用 `BEGIN IMMEDIATE`。
 */
const BEGIN_TRANSACTION_SQL = 'BEGIN IMMEDIATE;';

/** 系统 schema 迁移使用的最强锁，与 `Oo1ClientBase` 保持一致。 */
const BEGIN_SYSTEM_MIGRATION_TRANSACTION_SQL = 'BEGIN EXCLUSIVE;';

/**
 * 撞锁后放弃前的总等待时长（毫秒）。
 *
 * @remarks
 * 要盖住「另一个窗口正在跑一次系统 schema 迁移」这段最长的持锁时间——迁移在
 * `BEGIN EXCLUSIVE` 里完成，实测秒级，5 秒留了一个量级的余量。再长就不像是对方在正常干活，
 * 此时把 `database_busy` 报给调用方，比继续无声等待更有用。
 */
const DEFAULT_BUSY_RETRY_BUDGET_MS = 5_000;

/** 首次重试前的等待（毫秒）。取小值是因为绝大多数锁冲突在一两个事件循环周期内就消失。 */
const BUSY_RETRY_INITIAL_DELAY_MS = 1;

/** 退避的上限（毫秒），避免长时间持锁时把重试拉成几秒一次。 */
const BUSY_RETRY_MAX_DELAY_MS = 100;

/** 库文件的日志旁文件：WAL 模式的 `-wal` / `-shm`，回滚日志模式的 `-journal`。 */
const DATABASE_SIDECAR_SUFFIXES: readonly string[] = ['-wal', '-shm', '-journal'];

/**
 * 删一个库文件或旁文件。
 *
 * @param filePath - 物理路径
 * @param label - 回给 renderer 的逻辑名：错误消息里不出现物理路径（AC#3）
 * @returns 文件此前在不在
 * @throws {@link RxDBAdapterDesktopError} 别的进程占着文件（Windows 上的 `EBUSY`）时抛 `database_busy`；其余按文件系统错误归类
 */
const removeDatabaseFile = async (filePath: string, label: string): Promise<boolean> => {
  try {
    await rm(filePath);
    return true;
  } catch (error) {
    if (errnoOf(error) === 'ENOENT') return false;
    if (errnoOf(error) === 'EBUSY') {
      throw new RxDBAdapterDesktopError('database_busy', `${label} is held by another process`, { cause: error });
    }
    throw toHostIoError(error, `failed to remove ${label}`);
  }
};

const delay = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

/** {@link createElectronSqliteHost} 的入参。 */
export interface ElectronSqliteHostOptions {
  /**
   * 把逻辑数据库名解析成物理绝对路径。
   *
   * @remarks
   * 由宿主应用提供，因为只有它知道自己的数据目录（Electron 下通常是
   * `app.getPath('userData')`）。传进来的名字已经过白名单校验，不含任何路径分隔符，
   * 因此 `join(root, databaseName)` 不可能越出 `root`。
   */
  readonly resolveDatabasePath: (databaseName: string) => string;
  /** 把变更事件送达对应会话的 renderer，例如 `webContents.send`。 */
  readonly postChange: (message: DesktopHostChangeEventMessage) => void;
  /**
   * 变更事件送达失败时的上报口。
   *
   * @remarks
   * 窗口在写入途中被销毁是常规竞态，此时写入已经落库；若把送达失败当成写失败回给调用方，
   * 它会重试一次已经成功的写入，产生重复数据。所以送达是 best-effort，失败只上报不影响写结果。
   * 不传则丢弃——但那意味着这类竞态在日志里完全无痕，建议显式接上。
   */
  readonly onDeliveryError?: (error: unknown) => void;
  /** SQLite page cache 大小（KB）。 */
  readonly cacheSizeKb?: number;
  /**
   * 开事务时撞上另一个连接的锁后，重试多久才放弃（毫秒），默认
   * {@link DEFAULT_BUSY_RETRY_BUDGET_MS}。
   *
   * @remarks
   * 主要留给测试收窄等待；生产上调它意味着你对「对方最长持锁多久」有更准的判断。
   */
  readonly busyRetryBudgetMs?: number;
}

/** 桌面 SQLite host 实例。 */
export interface ElectronSqliteHost {
  /**
   * 处理一条来自 renderer 的请求。
   *
   * @remarks
   * **永不 reject**：失败以 `kind: 'error'` 的应答返回。Electron 的 `ipcRenderer.invoke`
   * 在 reject 时会把错误压平成字符串，自定义错误码随之丢失。
   *
   * @param request - 未经校验的请求负载
   * @returns 协议应答
   */
  handle(request: unknown): Promise<DesktopHostResponse>;
  /** 当前打开的会话数，用于诊断与关停检查。 */
  readonly openSessionCount: number;
  /** 关闭全部会话，通常在应用退出前调用。 */
  closeAll(): void;
}

/**
 * 判断一次失败是否值得重试。
 *
 * @remarks
 * 只认「脚本的**第一条**语句是开事务」这一种形状。适配器发的是
 * `BEGIN IMMEDIATE;` 加一条 `PRAGMA`，而 PRAGMA 不取锁——因此这类脚本报 busy 只可能来自
 * 打头的 BEGIN，此时事务根本没开起来，整段重发是无副作用的。其余形状一律不重试：
 * 事务中途撞锁意味着这个事务的快照已经作废，只有调用方知道该怎么重来。
 */
const isRetriableBusy = (error: unknown, sql: string): boolean => {
  if (!(error instanceof RxDBAdapterDesktopError) || error.code !== 'database_busy') return false;
  const [first] = splitSqliteScript(sql);
  return first === BEGIN_TRANSACTION_SQL || first === BEGIN_SYSTEM_MIGRATION_TRANSACTION_SQL;
};

const toErrorResponse = (error: unknown): DesktopHostResponse => {
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
 * 创建一个桌面 SQLite host。
 *
 * @remarks
 * 每个 `open` 请求得到**独立的** `DatabaseSync` 连接，而不是共享一条：
 * 多个窗口共用连接时它们的 `BEGIN` 块会互相穿插，事务隔离直接失效。
 * 各持连接后，跨窗口并发交由 SQLite 自己的文件锁处理（AC#5）。
 *
 * @param options - host 配置
 * @returns host 实例
 */
export function createElectronSqliteHost(options: ElectronSqliteHostOptions): ElectronSqliteHost {
  /** 会话表；记下逻辑库名，删库时据此判断「还有没有人开着」。 */
  const sessions = new Map<string, { readonly engine: NodeSqliteEngine; readonly databaseName: string }>();
  const storageOperations = new Map<string, Promise<unknown>>();
  let storageGeneration = 0;

  const withDatabaseAccess = <T>(databaseName: string, operation: () => T | Promise<T>): Promise<T> => {
    const key = databaseName.toLowerCase();
    const generation = storageGeneration;
    const previous = storageOperations.get(key) ?? Promise.resolve();
    const run = (): T | Promise<T> => {
      if (generation !== storageGeneration) {
        throw new RxDBAdapterDesktopError('host_unavailable', 'the host closed before the storage operation started');
      }
      return operation();
    };
    const result = previous.then(run, run);
    storageOperations.set(key, result);
    return result.finally(() => {
      if (storageOperations.get(key) === result) storageOperations.delete(key);
    });
  };

  const deliver = (sessionId: string, event: SqliteChangeEvent): void => {
    try {
      options.postChange({ kind: 'change', sessionId, event });
    } catch (error) {
      options.onDeliveryError?.(error);
    }
  };

  const requireSession = (sessionId: string): NodeSqliteEngine => {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new RxDBAdapterDesktopError('session_closed', `session ${sessionId} is not open on this host`);
    }
    return session.engine;
  };

  const resolvePath = (databaseName: string): string => {
    try {
      return options.resolveDatabasePath(databaseName);
    } catch (error) {
      throw new RxDBAdapterDesktopError('open_failed', `the application could not resolve a path for ${databaseName}`, {
        cause: error
      });
    }
  };

  const open = (request: Extract<DesktopHostRequest, { kind: 'open' }>): DesktopHostResponse => {
    const { databaseName } = request.storage;
    const sessionId = randomUUID();
    const engine = NodeSqliteEngine.open({
      filePath: resolvePath(databaseName),
      dbName: databaseName,
      onChange: event => deliver(sessionId, event),
      cacheSizeKb: options.cacheSizeKb,
      batchTimeout: request.batchTimeout
    });
    sessions.set(sessionId, { engine, databaseName });
    return {
      kind: 'open',
      result: {
        sessionId,
        resolvedLocation: `${LOGICAL_LOCATION_SCHEME}/${databaseName}`,
        protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
        beginTransactionSql: BEGIN_TRANSACTION_SQL,
        beginSystemMigrationTransactionSql: BEGIN_SYSTEM_MIGRATION_TRANSACTION_SQL
      }
    };
  };

  const close = (sessionId: string): DesktopHostResponse => {
    const engine = requireSession(sessionId);
    sessions.delete(sessionId);
    engine.close();
    return { kind: 'close' };
  };

  /**
   * 删一个库文件及其日志旁文件（US-313：回收只读检出位的快照库）。
   *
   * @remarks
   * 本 host 上还有会话开着同名库就报 `database_busy`，一个字节都不删：会话没关时 unlink 掉文件，POSIX 下
   * 那条连接会对着一个已经不在目录里的 inode 继续写，写进去的东西随连接关闭凭空消失。库名按小写比：
   * 白名单只有 ASCII，而 macOS 与 Windows 的默认文件系统不分大小写，`App.sqlite3` 与 `app.sqlite3` 是同一个文件。
   * 打开与删除共用按库名串行的队列，检查会话到删完文件之间不会插入一个新连接。
   * 别的进程开着同一个文件这里看不见——快照库由检出位的 Web Lock 独占，发起删库的一方手里正握着它。
   *
   * 先删旁文件、最后删库文件：中途失败时留下的是一个还能再删一次的库文件；反过来先删库文件，
   * 留下的孤儿日志会在下一个同名库打开时被当成热日志回放进去，把新库写坏。
   */
  const drop = async (request: Extract<DesktopHostRequest, { kind: 'drop' }>): Promise<DesktopHostResponse> => {
    const { databaseName } = request.storage;
    const folded = databaseName.toLowerCase();
    for (const session of sessions.values()) {
      if (session.databaseName.toLowerCase() === folded) {
        throw new RxDBAdapterDesktopError(
          'database_busy',
          `desktop database ${databaseName} is still open on this host`
        );
      }
    }
    const filePath = resolvePath(databaseName);
    for (const suffix of DATABASE_SIDECAR_SUFFIXES) {
      await removeDatabaseFile(`${filePath}${suffix}`, `${databaseName}${suffix}`);
    }
    return { kind: 'drop', result: { dropped: await removeDatabaseFile(filePath, databaseName) } };
  };

  /**
   * 执行一条语句；开事务的那两条在撞锁时退避重试。
   *
   * @remarks
   * 只重试 {@link BEGIN_TRANSACTION_SQL} 与 {@link BEGIN_SYSTEM_MIGRATION_TRANSACTION_SQL}：
   * 这两条要么拿到锁、要么什么都没做，重发一次没有副作用。事务内部的语句撞锁则不同——
   * 那意味着这个事务的快照已经不能再用，只有调用方知道该怎么重来，host 替它决定只会掩盖问题。
   *
   * 等待走 `setTimeout` 而不是 `PRAGMA busy_timeout`：所有窗口的连接共享主进程这一条线程，
   * 同步自旋会把持锁方的 `COMMIT` 续体一起卡死（见 `NodeSqliteEngine` 的 `#initialize`）。
   */
  const execute = async (request: Extract<DesktopHostRequest, { kind: 'execute' }>): Promise<DesktopHostResponse> => {
    const engine = requireSession(request.sessionId);
    let deadline: number | undefined;
    let wait = BUSY_RETRY_INITIAL_DELAY_MS;
    for (;;) {
      try {
        return { kind: 'execute', result: engine.execute(request.sql, request.bindings) };
      } catch (error) {
        if (!isRetriableBusy(error, request.sql)) throw error;
        deadline ??= performance.now() + (options.busyRetryBudgetMs ?? DEFAULT_BUSY_RETRY_BUDGET_MS);
        if (performance.now() + wait > deadline) throw error;
        await delay(wait);
        wait = Math.min(wait * 2, BUSY_RETRY_MAX_DELAY_MS);
      }
    }
  };

  /**
   * 按种类派发一条已通过协议校验的请求。
   *
   * @remarks
   * 穷尽 `switch` 而不是「若干 `if` + 落空走 `execute`」：后者把「未知种类」这件事
   * 交给了调用约定去保证（今天成立，因为 {@link parseDesktopHostRequest} 先跑）。
   * 一旦协议加了新种类而这里忘记补分支，落空写法会把它当 `execute` 跑，
   * 读一个不存在的 `request.sql` —— 变成运行期的怪异失败而不是编译期的红。
   * `_exhaustive: never` 让这种遗漏在 `tsc` 阶段就挡住。
   */
  const dispatch = (request: DesktopHostRequest): DesktopHostResponse | Promise<DesktopHostResponse> => {
    switch (request.kind) {
      // 握手排在最前，且不碰会话表、不碰 `resolveDatabasePath`：它的全部意义就是让 renderer
      // 在 `open` 建库之前把版本对上，一旦这里有了任何副作用，那半条 AC 就不成立了。
      case 'handshake':
        return { kind: 'handshake', result: { protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION } };
      case 'open':
        return withDatabaseAccess(request.storage.databaseName, () => open(request));
      case 'close':
        return close(request.sessionId);
      case 'version':
        return { kind: 'version', result: requireSession(request.sessionId).version() };
      case 'mute':
        requireSession(request.sessionId).setChangeEventsMuted(request.muted);
        return { kind: 'mute' };
      case 'execute':
        return execute(request);
      case 'drop':
        return withDatabaseAccess(request.storage.databaseName, () => drop(request));
      default: {
        const _exhaustive: never = request;
        // 走到这里说明校验层放进了一个本模块不认识的种类，按协议违规回给调用方。
        throw new RxDBAdapterDesktopError(
          'protocol_violation',
          `unsupported request kind: ${String((_exhaustive as { kind?: unknown }).kind)}`
        );
      }
    }
  };

  return {
    handle: async (request: unknown): Promise<DesktopHostResponse> => {
      try {
        return await dispatch(parseDesktopHostRequest(request));
      } catch (error) {
        return toErrorResponse(error);
      }
    },
    get openSessionCount(): number {
      return sessions.size;
    },
    closeAll: (): void => {
      storageGeneration++;
      for (const { engine } of sessions.values()) engine.close();
      sessions.clear();
    }
  };
}
