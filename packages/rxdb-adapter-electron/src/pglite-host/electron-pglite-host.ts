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
  type DesktopPgliteBackupBeginRequest,
  type DesktopPgliteBackupCursorRequest,
  type DesktopPgliteDataDirItem,
  type DesktopPgliteEngineRequest,
  type DesktopPgliteEngineResult,
  type DesktopPgliteNotifyMessage,
  type DesktopPgliteRequest,
  type DesktopPgliteResponse
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { randomUUID } from 'node:crypto';
import { hasPgVersion, walkPgliteDataDirectory } from './pglite-host-data-dir.js';
import { acquirePgliteDirectoryLock, type PgliteDirectoryLock } from './pglite-host-lock.js';
import {
  createPgliteRestoreCoordinator,
  type DesktopPgliteRestoreRequest,
  type PgliteRestoreCoordinator
} from './pglite-host-restore.js';
import {
  runStatement,
  suspendTransaction,
  toWireResult,
  type ElectronPgliteProbeRuntime,
  type ElectronPgliteRuntime,
  type SuspendedTransaction
} from './pglite-host-runtime.js';

export type {
  ElectronPgliteProbeRuntime,
  ElectronPgliteRuntime,
  ElectronPgliteRuntimeResult,
  ElectronPgliteTransaction
} from './pglite-host-runtime.js';

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

/**
 * 备份与恢复所需的宿主配置（US-217）。
 *
 * @remarks
 * 不传时 host 只提供连接：`pg.engine`、`pg.backup.*`、`pg.restore.*` 一律报 `unsupported_operation`，
 * `pg.open` 也不取目录锁，与引入备份之前的行为逐项一致。传了之后每个打开的数据目录旁边都有一把
 * 跨进程的目录锁：同一目录上的恢复与连接互斥，另一个进程里的 host 也不例外（AC#12）。
 */
export interface ElectronPgliteBackupOptions {
  /**
   * 逻辑数据目录名到物理路径。
   *
   * @remarks
   * **必须**就是 `createRuntime` 为同一个名字打开的目录：备份从这里读文件，恢复往这里写文件，
   * 目录锁与恢复标记也建在它旁边。两者不一致时备份报 `host_internal_error`，而不是悄悄读出别的目录。
   * 传进来的名字已过白名单校验，不含任何路径分隔符。
   */
  readonly resolveDataDirectory: (dataDirectoryName: string) => string;
  /**
   * 创建一个不落盘的探针运行时，用来回答 `pg.engine`。
   *
   * @remarks
   * 例如 `new PGlite()`（内存实例）。必须与 `createRuntime` 用同一份 PGlite、带同一组扩展，
   * 否则回答的引擎版本对真实数据目录不成立。探针用完即关，结果在 host 生命周期内缓存；
   * 起不来时不缓存，下一次 `pg.engine` 重试。
   */
  readonly createProbeRuntime: () => Promise<ElectronPgliteProbeRuntime>;
  /**
   * `createRuntime` 为每个实例装载的扩展名。
   *
   * @remarks
   * 只列影响数据兼容性的扩展，不含 `live`（它不改变数据目录）；没有扩展时传空数组。
   * 归档据此声明所需扩展，恢复端不满足时在写入目标之前拒绝（AC#5）。
   */
  readonly extensions: readonly string[];
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
   * 同一个名字同一时刻至多只有一个活着的运行时（AC#7）；恢复校验同样经它打开目标目录。
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
  /** 备份与恢复支持；不传则不提供（见 {@link ElectronPgliteBackupOptions}）。 */
  readonly backup?: ElectronPgliteBackupOptions;
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
  /** 当前活着的 PGlite 实例数；同一个数据目录上的多个会话只算一个，恢复校验用的私有实例不计入。 */
  readonly openInstanceCount: number;
  /** 当前挂起的事务数；正常静止时应为 0。 */
  readonly openTransactionCount: number;
  /** 当前进行中的备份快照数；快照同样占着连接，但不计入 `openTransactionCount`。 */
  readonly openBackupCount: number;
  /** 当前进行中的恢复数。 */
  readonly openRestoreCount: number;
  /**
   * 回收某个窗口名下的全部会话、事务、快照与恢复。
   *
   * @remarks
   * 这是本方案的**前提而非收尾**：挂起的 callback 独占 PGlite 的连接锁，渲染进程崩在
   * 事务中间而没人回收的话，之后任何查询都会永远排队——表征是「数据库不响应」，
   * 与那次崩溃毫无关联线索。调用方必须把它挂到 `render-process-gone` 与 `destroyed`
   * 两个事件上（AC#3）。被打断的恢复保留恢复标记，之后的连接据此被拒绝（AC#11）。
   *
   * @param ownerId - 已崩溃或已销毁的 `webContents.id`
   * @returns 本次回滚掉的事务条数
   */
  releaseOwner(ownerId: number): Promise<number>;
  /** 关闭全部会话与实例、打断全部恢复，通常在应用退出前调用。 */
  closeAll(): Promise<void>;
}

/** 一个已经起来的运行时，以及启用备份时它在数据目录上持有的锁。 */
interface StartedRuntime {
  readonly runtime: ElectronPgliteRuntime;
  readonly lock: PgliteDirectoryLock | undefined;
}

/** 一个数据目录上的运行时及其会话。 */
interface InstanceEntry {
  readonly sessions: Set<string>;
  /** 正在等 `ready` 的 `pg.open` 数；不为 0 时最后一条会话关掉也不释放实例。 */
  pending: number;
  readonly ready: Promise<StartedRuntime>;
}

/** 一条会话。 */
interface SessionEntry {
  readonly dataDirectoryName: string;
  readonly owner: number;
}

/** 一条挂起中的事务。 */
type TransactionEntry = SuspendedTransaction & { readonly sessionId: string };

/** 一次进行中的备份快照。 */
interface BackupEntry {
  readonly sessionId: string;
  readonly iterator: AsyncGenerator<DesktopPgliteDataDirItem>;
  /** 读快照期间占住连接的空事务：它不结束，任何语句都改不了文件（AC#16）。 */
  readonly held: SuspendedTransaction;
}

/** 启用备份时的配置与状态。 */
interface BackupSupport {
  readonly options: ElectronPgliteBackupOptions;
  /** 去重并排序后的扩展名。 */
  readonly extensions: readonly string[];
  readonly restores: PgliteRestoreCoordinator;
}

/** 协议 v2 新增、只在启用备份时可用的请求。 */
type DesktopPgliteBackupRequest =
  | DesktopPgliteEngineRequest
  | DesktopPgliteBackupBeginRequest
  | DesktopPgliteBackupCursorRequest
  | DesktopPgliteRestoreRequest;

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

const openFailed = (dataDirectoryName: string, cause: unknown): RxDBAdapterDesktopError =>
  new RxDBAdapterDesktopError(
    'open_failed',
    `the application could not open a PGlite runtime for ${dataDirectoryName}`,
    {
      cause
    }
  );

/**
 * 创建一个桌面 PGlite host。
 *
 * @remarks
 * 与 SQLite host 相反，同一个数据目录上的多个会话**共享一个** PGlite 实例（AC#7）：
 * PGlite 是嵌入式单写者，同一份数据目录被两个实例同时打开会直接损坏它。同一 host 内跨窗口的
 * 并发因此由这一条连接的排队来串行化；启用备份时每个实例还在数据目录旁持有一把跨进程的
 * 目录锁，恢复据此确认目标没有被任何进程连着（AC#12）。
 *
 * @param options - host 配置
 * @returns host 实例
 */
export function createElectronPgliteHost(options: ElectronPgliteHostOptions): ElectronPgliteHost {
  const instances = new Map<string, InstanceEntry>();
  const sessions = new Map<string, SessionEntry>();
  const transactions = new Map<string, TransactionEntry>();
  const backups = new Map<string, BackupEntry>();
  /** 正在关闭的实例：关完之前，同名的新连接与恢复都要等它交还目录锁。 */
  const closing = new Map<string, Promise<void>>();
  let engineProbe: Promise<DesktopPgliteEngineResult> | undefined;

  /** 本 host 是否正连着该目录；正在关闭的实例先等它关完，免得恢复撞上自己 host 里的旧锁。 */
  const isInUse = async (dataDirectoryName: string): Promise<boolean> => {
    while (closing.has(dataDirectoryName)) await closing.get(dataDirectoryName);
    return instances.has(dataDirectoryName);
  };

  const backupOptions = options.backup;
  const support: BackupSupport | undefined =
    backupOptions === undefined ? undefined : (
      {
        options: backupOptions,
        extensions: [...new Set(backupOptions.extensions)].sort(),
        restores: createPgliteRestoreCoordinator({
          createRuntime: name => options.createRuntime(name),
          resolveDataDirectory: name => backupOptions.resolveDataDirectory(name),
          isInUse
        })
      }
    );

  const deliver = (sessionId: string, channel: string, payload: string): void => {
    try {
      options.postNotify({ kind: 'pg.notify', sessionId, channel, payload });
    } catch (error) {
      options.onDeliveryError?.(error);
    }
  };

  /**
   * 取数据目录锁，并确认目录上没有未完成的恢复。
   *
   * @remarks
   * 同步完成：`pg.open` 因此在第一个 tick 里就占住目录，之后才开始的恢复必然撞锁，
   * 不存在「恢复查完空状态、连接随即打开」的窗口（AC#12）。未启用备份时不取锁。
   */
  const lockDirectory = (dataDirectoryName: string): PgliteDirectoryLock | undefined => {
    if (support === undefined) return undefined;
    const lock = acquirePgliteDirectoryLock(support.options.resolveDataDirectory(dataDirectoryName));
    let marked: boolean;
    try {
      marked = lock.hasMarker();
    } catch (error) {
      lock.release();
      throw error;
    }
    if (!marked) return lock;
    lock.release();
    // 半恢复的目录一旦被 PGlite 打开，缺的文件会被当成「本来就没有」，于是连上一个看似正常的坏库（AC#11）。
    throw new RxDBAdapterDesktopError(
      'restore_incomplete',
      `a restore of "${dataDirectoryName}" did not finish; run pg.restore.cleanup before connecting`
    );
  };

  const subscribeChannels = async (runtime: ElectronPgliteRuntime, sessionIds: ReadonlySet<string>): Promise<void> => {
    // 订阅在这里一次性建好，而不是每开一个会话建一次：LISTEN 是连接级的，
    // 重复订阅只会让同一条 NOTIFY 被回调多次，进而让 renderer 侧的批量窗口收到重复事件。
    for (const channel of DESKTOP_PGLITE_WATCH_CHANNELS) {
      await runtime.listen(channel, payload => {
        for (const sessionId of sessionIds) deliver(sessionId, channel, payload);
      });
    }
  };

  const launchRuntime = async (
    dataDirectoryName: string,
    sessionIds: ReadonlySet<string>
  ): Promise<ElectronPgliteRuntime> => {
    let runtime: ElectronPgliteRuntime;
    try {
      runtime = await options.createRuntime(dataDirectoryName);
    } catch (error) {
      throw openFailed(dataDirectoryName, error);
    }
    try {
      await subscribeChannels(runtime, sessionIds);
    } catch (error) {
      // 订阅失败的运行时必须关掉：它开着数据目录，重试时起的新实例会与它争同一份文件。
      await runtime.close().catch(() => undefined);
      throw openFailed(dataDirectoryName, error);
    }
    return runtime;
  };

  const startRuntime = async (dataDirectoryName: string, sessionIds: ReadonlySet<string>): Promise<StartedRuntime> => {
    const lock = lockDirectory(dataDirectoryName);
    try {
      return { runtime: await launchRuntime(dataDirectoryName, sessionIds), lock };
    } catch (error) {
      lock?.release();
      throw error;
    }
  };

  const createInstance = (dataDirectoryName: string): InstanceEntry => {
    const sessionIds = new Set<string>();
    return { sessions: sessionIds, pending: 0, ready: startRuntime(dataDirectoryName, sessionIds) };
  };

  /** 关掉一个实例的运行时并交还目录锁；只有起来过、挂过会话的实例才会走到这里。 */
  const shutdownInstance = async (instance: InstanceEntry): Promise<void> => {
    const { runtime, lock } = await instance.ready;
    try {
      await runtime.close();
    } finally {
      lock?.release();
    }
  };

  /** 从表里摘掉实例并关掉它；摘表与登记「正在关闭」之间没有 await，同名的请求不会漏看。 */
  const releaseInstance = async (dataDirectoryName: string, instance: InstanceEntry): Promise<void> => {
    instances.delete(dataDirectoryName);
    const done = shutdownInstance(instance);
    const settled = done.then(
      () => undefined,
      () => undefined
    );
    closing.set(dataDirectoryName, settled);
    try {
      await done;
    } finally {
      if (closing.get(dataDirectoryName) === settled) closing.delete(dataDirectoryName);
    }
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
    return (await instance.ready).runtime;
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

  /**
   * 结掉一条挂起的事务，返回**提交失败**的原因（成功或回滚时为 `undefined`）。
   *
   * @remarks
   * 返回值只在 `failure === null` 那一路才可能有值，这个区分是本函数的全部要点：
   * 回滚是靠 `settle.reject(failure)` 让挂起的 callback 抛出来实现的，所以回滚路径上
   * `finished` **必然** reject——把它一并当成失败，每次正常回滚都会变成错误帧。
   * 而提交路径上 `finished` 一旦 reject 就是 COMMIT 自己失败（延迟约束、磁盘写满等），
   * 吞掉它意味着告诉调用方「写成功了」而数据库里什么都没有。
   */
  const settle = async (transactionId: string, failure: Error | null): Promise<Error | undefined> => {
    const entry = transactions.get(transactionId);
    if (!entry) return undefined;
    transactions.delete(transactionId);
    if (failure) entry.settle.reject(failure);
    else entry.settle.resolve();
    // 必须等 `transaction(...)` 自己落地：不等的话 COMMIT 还在飞，紧接着的读可能看不到
    // 刚写进去的数据，而那会被误读成「事务语义不成立」。
    const commitError = await entry.finished.then(
      () => undefined,
      (error: unknown) => error
    );
    if (failure || commitError === undefined) return undefined;
    if (commitError instanceof RxDBAdapterDesktopError) return commitError;
    return new RxDBAdapterDesktopError(
      'statement_failed',
      commitError instanceof Error ? commitError.message : String(commitError),
      { cause: commitError }
    );
  };

  const open = async (
    request: Extract<DesktopPgliteRequest, { kind: 'pg.open' }>,
    ownerId: number
  ): Promise<DesktopPgliteResponse> => {
    const { dataDirectoryName } = request.storage;
    while (closing.has(dataDirectoryName)) await closing.get(dataDirectoryName);
    if (support?.restores.isReserved(dataDirectoryName)) {
      throw new RxDBAdapterDesktopError('restore_in_progress', `"${dataDirectoryName}" is being restored`);
    }
    // 从上面的检查到登记实例之间没有 await：并发的恢复要么已经占了名字，要么会看见这个实例。
    const instance = instances.get(dataDirectoryName) ?? createInstance(dataDirectoryName);
    instances.set(dataDirectoryName, instance);
    instance.pending += 1;
    try {
      await instance.ready;
    } catch (error) {
      // 起不来的实例不能留在表里：留着的话下一次 `pg.open` 会拿到同一个已经 reject 的
      // promise，于是「修好配置再试一次」永远不可能成功。
      if (instances.get(dataDirectoryName) === instance) instances.delete(dataDirectoryName);
      throw error;
    } finally {
      instance.pending -= 1;
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

  /** 关掉一条会话；数据目录上最后一条会话消失、且没有正在加入的 `pg.open` 时连实例一起释放。 */
  const closeSession = async (sessionId: string): Promise<void> => {
    const session = sessions.get(sessionId);
    if (!session) return;
    sessions.delete(sessionId);
    const instance = instances.get(session.dataDirectoryName);
    if (!instance) return;
    instance.sessions.delete(sessionId);
    if (instance.sessions.size > 0 || instance.pending > 0) return;
    await releaseInstance(session.dataDirectoryName, instance);
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
    const held = await suspendTransaction(runtime, request.timeout);
    const transactionId = randomUUID();
    transactions.set(transactionId, { ...held, sessionId: request.sessionId });
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
    const commitError = await settle(request.transactionId, failure);
    // COMMIT 失败时事务已经被 PostgreSQL 回滚干净，这里只需把原因如实回给调用方——
    // 无条件回成功等于让上层把「一条都没写进去」当成「写完了」。
    if (commitError) throw commitError;
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

  const requireBackupSupport = (): BackupSupport => {
    if (support === undefined) {
      throw new RxDBAdapterDesktopError('unsupported_operation', 'this host was created without backup support');
    }
    return support;
  };

  /** 起一个探针问出引擎版本；探针不碰任何数据目录，也不占任何会话的连接。 */
  const probeEngine = async (backup: BackupSupport): Promise<DesktopPgliteEngineResult> => {
    let probe: ElectronPgliteProbeRuntime;
    try {
      probe = await backup.options.createProbeRuntime();
    } catch (error) {
      throw new RxDBAdapterDesktopError('open_failed', 'the application could not start the PGlite probe runtime', {
        cause: error
      });
    }
    try {
      const result = await runStatement(() => probe.query('SHOW server_version'));
      const serverVersion = result.rows[0]?.['server_version'];
      if (typeof serverVersion !== 'string' || serverVersion === '') {
        throw new RxDBAdapterDesktopError('host_internal_error', 'PostgreSQL did not report server_version');
      }
      return { serverVersion, extensions: backup.extensions };
    } finally {
      await probe.close().catch(() => undefined);
    }
  };

  const engine = async (backup: BackupSupport): Promise<DesktopPgliteResponse> => {
    const probe = (engineProbe ??= probeEngine(backup));
    try {
      return { kind: 'pg.engine', result: await probe };
    } catch (error) {
      // 失败不缓存：探针起不来多半是环境问题（内存、WASM 加载），修好之后应当能重试。
      if (engineProbe === probe) engineProbe = undefined;
      throw error;
    }
  };

  const backupBegin = async (
    backup: BackupSupport,
    request: DesktopPgliteBackupBeginRequest,
    ownerId: number
  ): Promise<DesktopPgliteResponse> => {
    const session = requireSession(request.sessionId, ownerId);
    // 先解析路径再占连接：解析抛错时不会留下一条没人收拾的挂起事务。
    const directory = backup.options.resolveDataDirectory(session.dataDirectoryName);
    const runtime = await requireRuntime(session);
    const held = await suspendTransaction(runtime, request.timeout);
    try {
      // 挂起的空事务占住唯一的连接，此后没有语句能改动文件；CHECKPOINT 再把已提交的数据刷进
      // 数据文件。目录树因此就是提交边界上的一致快照：在途事务要么已提交，要么还在排队（AC#16）。
      await runStatement(() => held.tx.query('CHECKPOINT'));
      if (!(await hasPgVersion(directory))) {
        throw new RxDBAdapterDesktopError(
          'host_internal_error',
          `resolveDataDirectory does not point at the data directory of "${session.dataDirectoryName}"`
        );
      }
    } catch (error) {
      held.settle.reject(new RxDBAdapterDesktopError('write_aborted', 'the snapshot was aborted'));
      await held.finished.catch(() => undefined);
      throw error;
    }
    const backupId = randomUUID();
    backups.set(backupId, { sessionId: request.sessionId, iterator: walkPgliteDataDirectory(directory), held });
    return { kind: 'pg.backup.begin', result: { backupId } };
  };

  /** 取一次进行中的快照；核对会话的理由与 {@link requireTransaction} 相同。 */
  const requireBackup = (backupId: string, sessionId: string): BackupEntry => {
    const entry = backups.get(backupId);
    if (!entry || entry.sessionId !== sessionId) {
      throw new RxDBAdapterDesktopError(
        'transaction_not_found',
        `backup ${backupId} is unknown, already finished, or not owned by session ${sessionId}`
      );
    }
    return entry;
  };

  /** 结束一次快照：先关遍历器（连同它开着的文件句柄），无论成败都放开连接。 */
  const finishBackup = async (backupId: string): Promise<void> => {
    const entry = backups.get(backupId);
    if (!entry) return;
    backups.delete(backupId);
    try {
      await entry.iterator.return(undefined);
    } finally {
      entry.held.settle.resolve();
      await entry.held.finished.catch(() => undefined);
    }
  };

  const backupNext = async (
    request: DesktopPgliteBackupCursorRequest,
    ownerId: number
  ): Promise<DesktopPgliteResponse> => {
    requireSession(request.sessionId, ownerId);
    const entry = requireBackup(request.backupId, request.sessionId);
    let next: IteratorResult<DesktopPgliteDataDirItem>;
    try {
      next = await entry.iterator.next();
    } catch (error) {
      // 读失败的快照续不下去：连接必须立刻交还，否则排在后面的写入会一直等。
      await finishBackup(request.backupId);
      throw error;
    }
    return { kind: 'pg.backup.next', result: next.done ? { type: 'end' } : next.value };
  };

  const backupEnd = async (
    request: DesktopPgliteBackupCursorRequest,
    ownerId: number
  ): Promise<DesktopPgliteResponse> => {
    requireSession(request.sessionId, ownerId);
    requireBackup(request.backupId, request.sessionId);
    await finishBackup(request.backupId);
    return { kind: 'pg.backup.end' };
  };

  const dispatchBackup = async (
    request: DesktopPgliteBackupRequest,
    ownerId: number
  ): Promise<DesktopPgliteResponse> => {
    const backup = requireBackupSupport();
    switch (request.kind) {
      case 'pg.engine':
        return engine(backup);
      case 'pg.backup.begin':
        return backupBegin(backup, request, ownerId);
      case 'pg.backup.next':
        return backupNext(request, ownerId);
      case 'pg.backup.end':
        return backupEnd(request, ownerId);
      default:
        return backup.restores.handle(request, ownerId);
    }
  };

  /** 收掉一条会话：先结束它的快照，再回滚它的事务，最后关会话；返回回滚掉的事务条数。 */
  const teardownSession = async (sessionId: string, reason: string): Promise<number> => {
    const doomed = [...backups.entries()].filter(([, entry]) => entry.sessionId === sessionId).map(([id]) => id);
    // 关遍历器失败只会漏一个只读句柄，连接在 finishBackup 里总会交还；不能因此把会话留着。
    for (const backupId of doomed) await finishBackup(backupId).catch(() => undefined);
    const rolledBack = await rollbackSessionTransactions(sessionId, reason);
    await closeSession(sessionId);
    return rolledBack;
  };

  const close = async (
    request: Extract<DesktopPgliteRequest, { kind: 'pg.close' }>,
    ownerId: number
  ): Promise<DesktopPgliteResponse> => {
    requireSession(request.sessionId, ownerId);
    await teardownSession(request.sessionId, `session ${request.sessionId} was closed`);
    return { kind: 'pg.close' };
  };

  /**
   * 按种类派发一条已通过协议校验的请求。
   *
   * @remarks
   * 协议加了新种类而这里忘记补分支时，`default` 把它交给 `dispatchBackup`，后者的参数类型
   * 不接受它，于是在 `tsc` 阶段就红，而不是在运行期变成怪异失败——与 SQLite host 的穷尽
   * `switch` 同一个目的。
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
      default:
        return dispatchBackup(request, ownerId);
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
    get openBackupCount(): number {
      return backups.size;
    },
    get openRestoreCount(): number {
      return support === undefined ? 0 : support.restores.openCount;
    },
    releaseOwner: async (ownerId: number): Promise<number> => {
      const doomed = [...sessions.entries()].filter(([, session]) => session.owner === ownerId).map(([id]) => id);
      let rolledBack = 0;
      for (const sessionId of doomed) {
        rolledBack += await teardownSession(sessionId, `owner ${ownerId} is gone`);
      }
      await support?.restores.releaseOwner(ownerId);
      return rolledBack;
    },
    closeAll: async (): Promise<void> => {
      for (const sessionId of [...sessions.keys()]) {
        await teardownSession(sessionId, 'the host is shutting down');
      }
      await support?.restores.closeAll();
    }
  };
}
