/**
 * host 侧 PGlite 恢复协调器（US-217 阶段 C）。
 *
 * @remarks
 * 一次恢复的生命周期：`pg.restore.begin` **先**取目录锁、**再**查恢复标记与空状态，独占一直保持到
 * `commit` 或 `abort`（AC#12）；`prepare` 在第一次落盘之前持久化恢复标记，标记直到整棵树 fsync
 * 之后才删除（AC#11）。步骤顺序固定为 prepare → write* → open → query* → persist → commit：
 * 乱序请求报 `protocol_violation` 且不改变恢复状态，其余任何失败之后只接受 `abort`。
 *
 * @module pglite-host/pglite-host-restore
 */

import {
  RxDBAdapterDesktopError,
  type DesktopPgliteDataDirEntry,
  type DesktopPgliteDataDirItem,
  type DesktopPgliteQueryResult,
  type DesktopPgliteResponse,
  type DesktopPgliteRestoreQueryRequest,
  type DesktopPgliteRestoreStepRequest,
  type DesktopPgliteRestoreTargetRequest,
  type DesktopPgliteRestoreWriteRequest
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { randomUUID } from 'node:crypto';
import { mkdir, open, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import {
  errnoOf,
  hasPgVersion,
  isEmptyOrMissing,
  removePgliteDataDirectory,
  syncPgliteDataDirectory,
  toHostIoError
} from './pglite-host-data-dir.js';
import { acquirePgliteDirectoryLock, type PgliteDirectoryLock } from './pglite-host-lock.js';
import { runStatement, toWireResult, type ElectronPgliteRuntime } from './pglite-host-runtime.js';

/** 恢复协调器处理的全部请求。 */
export type DesktopPgliteRestoreRequest =
  | DesktopPgliteRestoreTargetRequest
  | DesktopPgliteRestoreStepRequest
  | DesktopPgliteRestoreWriteRequest
  | DesktopPgliteRestoreQueryRequest;

/** 作用于一次已开始的恢复的请求。 */
type RestoreStepRequest = Exclude<DesktopPgliteRestoreRequest, DesktopPgliteRestoreTargetRequest>;

/** {@link createPgliteRestoreCoordinator} 的依赖。 */
export interface PgliteRestoreCoordinatorOptions {
  /** 起一个运行时；恢复校验经它打开目标目录，与普通连接用同一份 PGlite 与扩展。 */
  readonly createRuntime: (dataDirectoryName: string) => Promise<ElectronPgliteRuntime>;
  /** 逻辑名到物理路径；必须就是 `createRuntime` 打开的目录。 */
  readonly resolveDataDirectory: (dataDirectoryName: string) => string;
  /** 本 host 是否正连着该目录；正在关闭的实例要等它关完再回答。 */
  readonly isInUse: (dataDirectoryName: string) => Promise<boolean>;
}

/** 一个 host 内全部进行中的恢复。 */
export interface PgliteRestoreCoordinator {
  /** 进行中的恢复数。 */
  readonly openCount: number;
  /** 该名字是否正被本 host 的恢复占着（含正在取锁的）；`pg.open` 据此报 `restore_in_progress`。 */
  isReserved(dataDirectoryName: string): boolean;
  /**
   * 处理一条恢复请求。
   *
   * @throws {@link RxDBAdapterDesktopError} 失败以桌面错误抛出，由 host 统一转成错误应答
   */
  handle(request: DesktopPgliteRestoreRequest, ownerId: number): Promise<DesktopPgliteResponse>;
  /** 打断某个窗口名下的全部恢复：关资源、交还独占，**保留**恢复标记（AC#11）。 */
  releaseOwner(ownerId: number): Promise<void>;
  /** 打断全部恢复，语义同 {@link PgliteRestoreCoordinator.releaseOwner}。 */
  closeAll(): Promise<void>;
}

type RestoreStage = 'begun' | 'prepared' | 'opened' | 'persisted' | 'failed';

/** 正在写入的文件。 */
interface OpenFile {
  readonly handle: FileHandle;
  readonly path: string;
  readonly size: number;
  written: number;
}

interface RestoreEntry {
  readonly id: string;
  readonly owner: number;
  readonly dataDirectoryName: string;
  readonly directory: string;
  readonly lock: PgliteDirectoryLock;
  stage: RestoreStage;
  /** 恢复标记已落盘：此后中止必须删目录、清标记。 */
  marked: boolean;
  /** 条目声明的大小还没写满的文件。 */
  file: OpenFile | undefined;
  /** 校验用的私有实例；只在 `opened` 阶段存在。 */
  runtime: ElectronPgliteRuntime | undefined;
  /** 同一次恢复上的请求依次执行：上一步落地之前，下一步不会开始。 */
  tail: Promise<void>;
  /** 已提交、已中止或已被打断；排在后面的请求一律按恢复不存在处理。 */
  finished: boolean;
}

/**
 * 这几个 errno 说明归档描述的不是一棵合法的目录树：重复条目（`EEXIST`）、父目录不在归档里
 * （`ENOENT`）、文件占了目录的位置（`ENOTDIR`）。目标在 begin 时是空的且一直被独占，
 * 不存在别的来源。
 */
const CORRUPTING_ERRNOS: ReadonlySet<string> = new Set(['EEXIST', 'ENOENT', 'ENOTDIR']);

const corrupted = (detail: string, options?: ErrorOptions): RxDBAdapterDesktopError =>
  new RxDBAdapterDesktopError('database_corrupted', detail, options);

const toWriteError = (error: unknown): RxDBAdapterDesktopError => {
  if (error instanceof RxDBAdapterDesktopError) return error;
  if (!CORRUPTING_ERRNOS.has(errnoOf(error) ?? '')) {
    return toHostIoError(error, 'failed to write the restored PGlite data directory');
  }
  return corrupted('the archive does not describe a valid directory tree', { cause: error });
};

const outOfOrder = (entry: RestoreEntry, kind: RestoreStepRequest['kind']): RxDBAdapterDesktopError =>
  new RxDBAdapterDesktopError('protocol_violation', `${kind} is not allowed while the restore is ${entry.stage}`);

const expectStage = (entry: RestoreEntry, stage: RestoreStage, kind: RestoreStepRequest['kind']): void => {
  if (entry.stage !== stage) throw outOfOrder(entry, kind);
};

const writeData = async (entry: RestoreEntry, bytes: Uint8Array): Promise<void> => {
  const file = entry.file;
  if (file === undefined) throw corrupted('a data chunk arrived without a file entry');
  if (file.written + bytes.byteLength > file.size) {
    throw corrupted(`the data of "${file.path}" exceeds its declared size`);
  }
  // `writeFile` 在当前位置写并自己处理短写；文件以 `wx` 打开后只经这里顺序写入。
  await file.handle.writeFile(bytes);
  file.written += bytes.byteLength;
  if (file.written < file.size) return;
  entry.file = undefined;
  await file.handle.close();
};

const writeEntry = async (entry: RestoreEntry, header: DesktopPgliteDataDirEntry): Promise<void> => {
  if (entry.file !== undefined) throw corrupted(`the data of "${entry.file.path}" is incomplete`);
  const target = join(entry.directory, ...header.path.split('/'));
  // 不递归、不覆盖：父目录必须先出现在归档里，同一路径只能出现一次。
  if (header.kind === 'directory') {
    await mkdir(target, { mode: 0o700 });
    return;
  }
  const handle = await open(target, 'wx', 0o600);
  if (header.size === 0) {
    await handle.close();
    return;
  }
  entry.file = { handle, path: header.path, size: header.size, written: 0 };
};

/**
 * 创建一个 host 的恢复协调器。
 *
 * @param options - 运行时工厂、目录解析与本 host 的占用查询
 * @returns 恢复协调器
 */
export const createPgliteRestoreCoordinator = (options: PgliteRestoreCoordinatorOptions): PgliteRestoreCoordinator => {
  /** 被恢复占着的名字：从取锁之前一直到提交或中止。查与占之间没有 await，两次并发的 begin 只有一个能过。 */
  const reserved = new Set<string>();
  const entries = new Map<string, RestoreEntry>();

  const claimTarget = async (name: string, directory: string): Promise<PgliteDirectoryLock> => {
    if ((await options.isInUse(name)) || reserved.has(name)) {
      throw new RxDBAdapterDesktopError('database_busy', `"${name}" is open or being restored in this host`);
    }
    reserved.add(name);
    try {
      return acquirePgliteDirectoryLock(directory);
    } catch (error) {
      reserved.delete(name);
      throw error;
    }
  };

  const releaseTarget = (name: string, lock: PgliteDirectoryLock): void => {
    reserved.delete(name);
    lock.release();
  };

  /** 删掉写了一半的目录再清标记；删不掉时标记留着，之后的连接据此被拒绝，而不是连上一个半恢复的库。 */
  const discardTarget = async (name: string, directory: string, lock: PgliteDirectoryLock): Promise<void> => {
    try {
      await removePgliteDataDirectory(directory);
      lock.clearRestoring();
    } catch (error) {
      throw new RxDBAdapterDesktopError(
        'cleanup_pending',
        `the incomplete restore of "${name}" could not be removed; run pg.restore.cleanup to retry`,
        { cause: error }
      );
    }
  };

  const begin = async (request: DesktopPgliteRestoreTargetRequest, ownerId: number): Promise<DesktopPgliteResponse> => {
    const name = request.storage.dataDirectoryName;
    const directory = options.resolveDataDirectory(name);
    const lock = await claimTarget(name, directory);
    try {
      if (lock.hasMarker()) {
        throw new RxDBAdapterDesktopError(
          'restore_incomplete',
          `a restore of "${name}" did not finish; run pg.restore.cleanup first`
        );
      }
      if (!(await isEmptyOrMissing(directory))) {
        throw new RxDBAdapterDesktopError('target_not_empty', `"${name}" already holds data`);
      }
    } catch (error) {
      releaseTarget(name, lock);
      throw error;
    }
    const id = randomUUID();
    entries.set(id, {
      id,
      owner: ownerId,
      dataDirectoryName: name,
      directory,
      lock,
      stage: 'begun',
      marked: false,
      file: undefined,
      runtime: undefined,
      tail: Promise.resolve(),
      finished: false
    });
    return { kind: 'pg.restore.begin', result: { restoreId: id } };
  };

  const cleanup = async (request: DesktopPgliteRestoreTargetRequest): Promise<DesktopPgliteResponse> => {
    const name = request.storage.dataDirectoryName;
    const directory = options.resolveDataDirectory(name);
    const lock = await claimTarget(name, directory);
    try {
      if (!lock.hasMarker()) return { kind: 'pg.restore.cleanup', result: { cleaned: false } };
      await discardTarget(name, directory, lock);
      return { kind: 'pg.restore.cleanup', result: { cleaned: true } };
    } finally {
      releaseTarget(name, lock);
    }
  };

  const requireEntry = (restoreId: string, ownerId: number): RestoreEntry => {
    const entry = entries.get(restoreId);
    if (entry === undefined) {
      throw new RxDBAdapterDesktopError('transaction_not_found', `restore ${restoreId} is unknown or already finished`);
    }
    if (entry.owner !== ownerId) {
      throw new RxDBAdapterDesktopError('permission_denied', `restore ${restoreId} belongs to another window`);
    }
    return entry;
  };

  const runStep = <T>(entry: RestoreEntry, run: () => Promise<T>): Promise<T> => {
    const result = entry.tail.then(() => {
      if (entry.finished) {
        throw new RxDBAdapterDesktopError('transaction_not_found', `restore ${entry.id} is already finished`);
      }
      return run();
    });
    entry.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  /** 关掉本次恢复持有的文件与私有实例。尽力而为：调用方随后要么删目录，要么留着标记。 */
  const releaseResources = async (entry: RestoreEntry): Promise<void> => {
    const { file, runtime } = entry;
    entry.file = undefined;
    entry.runtime = undefined;
    await file?.handle.close().catch(() => undefined);
    await runtime?.close().catch(() => undefined);
  };

  const poisonOnFailure = async (entry: RestoreEntry, run: () => Promise<void>): Promise<void> => {
    try {
      await run();
    } catch (error) {
      if (!(error instanceof RxDBAdapterDesktopError && error.code === 'protocol_violation')) {
        entry.stage = 'failed';
        await releaseResources(entry);
      }
      throw error;
    }
  };

  const finish = (entry: RestoreEntry): void => {
    entry.finished = true;
    entries.delete(entry.id);
    releaseTarget(entry.dataDirectoryName, entry.lock);
  };

  const prepare = async (entry: RestoreEntry): Promise<void> => {
    expectStage(entry, 'begun', 'pg.restore.prepare');
    entry.lock.markRestoring();
    entry.marked = true;
    try {
      await mkdir(entry.directory, { recursive: true, mode: 0o700 });
    } catch (error) {
      throw toHostIoError(error, 'failed to create the restore target');
    }
    entry.stage = 'prepared';
  };

  const writeStep = async (entry: RestoreEntry, item: DesktopPgliteDataDirItem): Promise<void> => {
    expectStage(entry, 'prepared', 'pg.restore.write');
    try {
      await (item.type === 'data' ? writeData(entry, item.bytes) : writeEntry(entry, item.header));
    } catch (error) {
      throw toWriteError(error);
    }
  };

  /**
   * 起恢复专用的私有实例，并确认 PostgreSQL 真的起来了。
   *
   * @remarks
   * 归档完整、PostgreSQL 却起不来，说明数据目录本身不可用：与浏览器端一致归为损坏，而不是 host 故障。
   * 实例不登记会话，其他窗口与进程连不上它。
   */
  const startPrivateRuntime = async (name: string): Promise<ElectronPgliteRuntime> => {
    let runtime: ElectronPgliteRuntime | undefined;
    try {
      runtime = await options.createRuntime(name);
      await runtime.query('SELECT 1');
      return runtime;
    } catch (error) {
      await runtime?.close().catch(() => undefined);
      throw corrupted('the restored data directory cannot be opened', { cause: error });
    }
  };

  const openTarget = async (entry: RestoreEntry): Promise<void> => {
    expectStage(entry, 'prepared', 'pg.restore.open');
    if (entry.file !== undefined) throw corrupted(`the data of "${entry.file.path}" is incomplete`);
    // 没有 PG_VERSION 的目录会被 PGlite 就地 initdb 成一个空库，必须在起实例之前挡住。
    if (!(await hasPgVersion(entry.directory))) throw corrupted('the archive has no PG_VERSION');
    entry.runtime = await startPrivateRuntime(entry.dataDirectoryName);
    entry.stage = 'opened';
  };

  const openedRuntime = (entry: RestoreEntry, kind: RestoreStepRequest['kind']): ElectronPgliteRuntime => {
    const runtime = entry.runtime;
    if (runtime === undefined) throw outOfOrder(entry, kind);
    return runtime;
  };

  /** 校验查询失败只说明这条语句不成立，不作废恢复：是否中止由 renderer 的校验结论决定。 */
  const query = async (
    entry: RestoreEntry,
    request: DesktopPgliteRestoreQueryRequest
  ): Promise<DesktopPgliteQueryResult> => {
    const runtime = openedRuntime(entry, request.kind);
    return toWireResult(await runStatement(() => runtime.query(request.sql, [...request.params])));
  };

  const persist = async (entry: RestoreEntry): Promise<void> => {
    const runtime = openedRuntime(entry, 'pg.restore.persist');
    entry.runtime = undefined;
    try {
      await runtime.close();
    } catch (error) {
      throw toHostIoError(error, 'failed to close the restored PGlite instance');
    }
    await syncPgliteDataDirectory(entry.directory);
    entry.stage = 'persisted';
  };

  const commit = (entry: RestoreEntry): void => {
    expectStage(entry, 'persisted', 'pg.restore.commit');
    entry.lock.clearRestoring();
    finish(entry);
  };

  const abort = async (entry: RestoreEntry): Promise<void> => {
    try {
      await releaseResources(entry);
      if (entry.marked) await discardTarget(entry.dataDirectoryName, entry.directory, entry.lock);
    } finally {
      finish(entry);
    }
  };

  /** 窗口断开或 host 关闭：关资源、交还独占，**不**删目录也不清标记——重新打开时据标记拒绝连接（AC#11）。 */
  const interrupt = (entry: RestoreEntry): Promise<void> =>
    runStep(entry, async () => {
      await releaseResources(entry);
      finish(entry);
    }).catch(() => undefined);

  const runRequest = async (entry: RestoreEntry, request: RestoreStepRequest): Promise<DesktopPgliteResponse> => {
    switch (request.kind) {
      case 'pg.restore.prepare':
        await poisonOnFailure(entry, () => prepare(entry));
        return { kind: 'pg.restore.prepare' };
      case 'pg.restore.write':
        await poisonOnFailure(entry, () => writeStep(entry, request.item));
        return { kind: 'pg.restore.write' };
      case 'pg.restore.open':
        await poisonOnFailure(entry, () => openTarget(entry));
        return { kind: 'pg.restore.open' };
      case 'pg.restore.query':
        return { kind: 'pg.restore.query', result: await query(entry, request) };
      case 'pg.restore.persist':
        await poisonOnFailure(entry, () => persist(entry));
        return { kind: 'pg.restore.persist' };
      case 'pg.restore.commit':
        await poisonOnFailure(entry, async () => commit(entry));
        return { kind: 'pg.restore.commit' };
      case 'pg.restore.abort':
        await abort(entry);
        return { kind: 'pg.restore.abort' };
      default: {
        const _exhaustive: never = request;
        throw new RxDBAdapterDesktopError(
          'protocol_violation',
          `unsupported restore request kind: ${String((_exhaustive as { kind?: unknown }).kind)}`
        );
      }
    }
  };

  const step = async (request: RestoreStepRequest, ownerId: number): Promise<DesktopPgliteResponse> => {
    const entry = requireEntry(request.restoreId, ownerId);
    return runStep(entry, () => runRequest(entry, request));
  };

  return {
    get openCount(): number {
      return entries.size;
    },
    isReserved: name => reserved.has(name),
    handle: async (request, ownerId) => {
      switch (request.kind) {
        case 'pg.restore.begin':
          return begin(request, ownerId);
        case 'pg.restore.cleanup':
          return cleanup(request);
        default:
          return step(request, ownerId);
      }
    },
    releaseOwner: async ownerId => {
      await Promise.all([...entries.values()].filter(entry => entry.owner === ownerId).map(interrupt));
    },
    closeAll: async () => {
      await Promise.all([...entries.values()].map(interrupt));
    }
  };
};
