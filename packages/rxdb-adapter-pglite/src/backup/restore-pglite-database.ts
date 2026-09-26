import type { RxDB, RxDBRestoreOptions, RxDBRestoreResult } from '@aiao/rxdb';
import {
  assertRxDBBackupCompatible,
  classifyBackupIoError,
  isRxDBBackupError,
  RxDBBackupArchiveReader,
  RxDBBackupError,
  type RxDBBackupManifest,
  type RxDBBackupTrailer
} from '@aiao/rxdb';
import { PGlite } from '@electric-sql/pglite';
import { firstValueFrom } from 'rxjs';
import type { PGliteClientOptions } from '../pglite.interface.js';
import { resolvePGliteInitOptions } from '../PGliteClient.js';
import {
  pgliteTargetCompatibility,
  readPGliteEngineInfo,
  readPGliteSystemVersionState,
  resolvePGliteBackupStorage,
  type PGliteBackupStorage
} from './pglite-backup-compat.js';
import { restoreDataDirEntries } from './pglite-data-dir.js';
import { pgliteIdbDatabaseName, RestoreIdbFs, RestoreMemoryFs, type PGliteRestoreFeed } from './pglite-restore-fs.js';
import {
  deleteIdbDatabase,
  deleteRestoreMarker,
  hasRestoreMarker,
  hasWebLocks,
  isIdbStorageEmpty,
  pgliteStorageLockName,
  tryAcquireLock,
  writeRestoreMarker,
  type HeldLock
} from './pglite-restore-lock.js';
import { PGliteRestoredDatabase } from './pglite-restored-database.js';

/**
 * 恢复目标：一个**尚未连接**的 RxDB 实例，加上它将来连接时使用的 adapter 选项。
 *
 * @remarks
 * 兼容性（结构指纹、扩展、加密认证域）按目标自己的配置判定，所以必须和之后
 * `new RxDBAdapterPGlite(rxdb, options)` 传入的是同一份选项。
 */
export interface PGliteRestoreTarget {
  readonly rxdb: RxDB;
  readonly options: PGliteClientOptions;
}

/**
 * 恢复进行到的阶段，按顺序各触发一次。
 *
 * - `marker-written`：「恢复进行中」标记已持久化，下面开始写目标
 * - `files-written`：归档已完整写入并通过摘要校验，PostgreSQL 已在其上启动
 * - `verified`：引擎与系统表水位已与 manifest 核对一致
 * - `persisted`：数据已刷入持久化存储，只剩删除标记
 *
 * 内存目标没有标记也没有持久化，只触发 `files-written` 与 `verified`。
 */
export type PGliteRestoreStage = 'marker-written' | 'files-written' | 'verified' | 'persisted';

/** PGlite 恢复选项。 */
export interface PGliteRestoreOptions extends RxDBRestoreOptions {
  /**
   * 阶段回调，会被 `await`。
   *
   * @remarks
   * 用于进度展示与崩溃注入测试；回调抛错等同恢复失败，会走完整的失败清理。
   */
  readonly onStage?: (stage: PGliteRestoreStage) => void | Promise<void>;
}

/** PGlite 恢复结果。 */
export interface PGliteRestoreResult extends RxDBRestoreResult {
  /**
   * 内存目标恢复出来的数据库，交给 {@link PGliteClientOptions.restoredDatabase} 领取；
   * IndexedDB 目标的数据已在存储里，此项为空。
   */
  readonly database?: PGliteRestoredDatabase;
}

type IdbStorage = Extract<PGliteBackupStorage, { kind: 'idb' }>;

const targetStorage = (target: PGliteRestoreTarget, operation: string): PGliteBackupStorage =>
  resolvePGliteBackupStorage(resolvePGliteInitOptions(target.rxdb.config.dbName, target.options).dataDir, operation);

const aborted = (signal: AbortSignal): RxDBBackupError =>
  new RxDBBackupError('aborted', 'PGlite restore was aborted', { cause: signal.reason });

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) throw aborted(signal);
};

const requireWebLocks = (operation: string): void => {
  if (hasWebLocks()) return;
  throw new RxDBBackupError('unsupported_combination', `PGlite ${operation} to IndexedDB requires Web Locks`, {
    details: { field: 'navigator.locks' }
  });
};

/**
 * 目标实例本身必须还没连接：已连接的实例有自己的库，恢复结果既不能替换它、也不能被它领取。
 *
 * @remarks
 * `connected$` 是 BehaviorSubject 派生流，订阅时同步给出当前值。
 */
const assertTargetDisconnected = async (rxdb: RxDB): Promise<void> => {
  if (!(await firstValueFrom(rxdb.connected$))) return;
  throw new RxDBBackupError('target_busy', `RxDB "${rxdb.config.dbName}" is already connected`, {
    details: { field: 'rxdb', actual: rxdb.config.dbName }
  });
};

const acquireExclusive = async (storageKey: string): Promise<HeldLock> => {
  const lock = await tryAcquireLock(pgliteStorageLockName(storageKey), 'exclusive');
  if (lock) return lock;
  throw new RxDBBackupError('target_busy', `PGlite storage "${storageKey}" is in use`, {
    details: { field: 'dataDir', actual: storageKey }
  });
};

/** 恢复运行时：归档写进数据目录，PostgreSQL 在其上启动。 */
interface RestoreSession {
  readonly reader: RxDBBackupArchiveReader;
  readonly manifest: RxDBBackupManifest;
  readonly signal: AbortSignal | undefined;
}

const feedFrom = (session: RestoreSession) => {
  const state: { trailer?: RxDBBackupTrailer; error?: unknown } = {};
  const feed: PGliteRestoreFeed = async FS => {
    try {
      state.trailer = await restoreDataDirEntries(FS, session.reader);
    } catch (error) {
      state.error = error;
      throw error;
    }
  };
  return { state, feed };
};

/**
 * 启动 PostgreSQL 并返回归档结束标记。
 *
 * @remarks
 * 归档写入发生在 PGlite 初始化内部，写入失败会被 PGlite 包一层再抛出；这里把原始的归档错误
 * 取回来，保证调用方看到的是 `corrupt_archive` / `truncated_archive` 这类稳定分类。
 * 归档完整、PostgreSQL 却起不来，说明数据目录本身不可用，同样归为 `corrupt_archive`。
 */
const startPostgres = async (
  pg: PGlite,
  state: { trailer?: RxDBBackupTrailer; error?: unknown }
): Promise<RxDBBackupTrailer> => {
  try {
    await pg.waitReady;
  } catch (error) {
    if (state.error !== undefined) throw state.error;
    throw new RxDBBackupError('corrupt_archive', 'PostgreSQL failed to start on the restored data directory', {
      cause: error
    });
  }
  if (!state.trailer) throw new RxDBBackupError('corrupt_archive', 'PGlite started without reading the archive');
  return state.trailer;
};

/** 恢复出来的库必须真的是 manifest 声明的那个库，而不只是一堆摘要正确的字节。 */
const verifyRestored = async (pg: PGlite, manifest: RxDBBackupManifest): Promise<void> => {
  const engine = await readPGliteEngineInfo(pg);
  if (engine.compatibility !== manifest.adapter.engineCompatibility) {
    throw new RxDBBackupError('corrupt_archive', 'Restored database reports a different engine', {
      details: {
        field: 'adapter.engineCompatibility',
        expected: manifest.adapter.engineCompatibility,
        actual: engine.compatibility
      }
    });
  }
  const state = await readPGliteSystemVersionState(pg);
  if (state.schemaVersion !== manifest.rxdb.systemSchemaVersion) {
    throw new RxDBBackupError('corrupt_archive', 'Restored database has a different system schema version', {
      details: {
        field: 'rxdb.systemSchemaVersion',
        expected: manifest.rxdb.systemSchemaVersion,
        actual: state.schemaVersion
      }
    });
  }
  if (state.codecVersion !== manifest.rxdb.changeCodecVersion) {
    throw new RxDBBackupError('corrupt_archive', 'Restored database has a different change codec version', {
      details: {
        field: 'rxdb.changeCodecVersion',
        expected: manifest.rxdb.changeCodecVersion,
        actual: state.codecVersion
      }
    });
  }
};

const resultOf = (
  trailer: RxDBBackupTrailer,
  manifest: RxDBBackupManifest,
  database?: PGliteRestoredDatabase
): PGliteRestoreResult => ({ ...trailer, manifest, scope: manifest.scope, database });

const restoreToMemory = async (
  session: RestoreSession,
  target: PGliteRestoreTarget,
  options: PGliteRestoreOptions
): Promise<PGliteRestoreResult> => {
  const dbName = target.rxdb.config.dbName;
  const { state, feed } = feedFrom(session);
  const pg = new PGlite({
    ...resolvePGliteInitOptions(dbName, target.options),
    dataDir: undefined,
    fs: new RestoreMemoryFs(feed)
  });
  try {
    const trailer = await startPostgres(pg, state);
    await options.onStage?.('files-written');
    throwIfAborted(session.signal);
    await verifyRestored(pg, session.manifest);
    await options.onStage?.('verified');
    throwIfAborted(session.signal);
    return resultOf(trailer, session.manifest, new PGliteRestoredDatabase(pg, dbName));
  } catch (error) {
    await pg.close().catch(() => undefined);
    throw error;
  }
};

/**
 * 失败后把目标退回「从未恢复过」。
 *
 * @remarks
 * 顺序不能换：先删数据再删标记。只删了标记而数据还在，下一次连接会把半截库当成正常库打开。
 */
const discardIdbTarget = async (storageKey: string, name: string, cause: unknown): Promise<never> => {
  try {
    await deleteIdbDatabase(pgliteIdbDatabaseName(name));
    await deleteRestoreMarker(storageKey);
  } catch (cleanupError) {
    throw new RxDBBackupError(
      'cleanup_pending',
      'PGlite restore failed and its partial data could not be removed; call cleanupIncompletePGliteRestore()',
      { cause: new AggregateError([cause, cleanupError], 'Restore and cleanup both failed') }
    );
  }
  throw cause;
};

const writeIdbTarget = async (
  session: RestoreSession,
  target: PGliteRestoreTarget,
  name: string,
  options: PGliteRestoreOptions
): Promise<RxDBBackupTrailer> => {
  const { state, feed } = feedFrom(session);
  const fs = new RestoreIdbFs(name, feed);
  const pg = new PGlite({
    ...resolvePGliteInitOptions(target.rxdb.config.dbName, target.options),
    dataDir: undefined,
    fs
  });
  try {
    const trailer = await startPostgres(pg, state);
    await options.onStage?.('files-written');
    throwIfAborted(session.signal);
    await verifyRestored(pg, session.manifest);
    await options.onStage?.('verified');
    throwIfAborted(session.signal);
    // 提交点：此前 RestoreIdbFs 不写 IndexedDB；close 在 PostgreSQL 正常关闭后等待完整落盘。
    fs.commit();
    await pg.close().catch((error: unknown) => {
      throw classifyBackupIoError(error, 'Failed to persist the restored PGlite database to IndexedDB');
    });
    return trailer;
  } catch (error) {
    await pg.close().catch(() => undefined);
    fs.releaseConnection();
    throw error;
  }
};

const restoreToIdb = async (
  session: RestoreSession,
  target: PGliteRestoreTarget,
  storage: IdbStorage,
  options: PGliteRestoreOptions
): Promise<PGliteRestoreResult> => {
  await writeRestoreMarker(storage.storageKey);
  try {
    await options.onStage?.('marker-written');
    throwIfAborted(session.signal);
    const trailer = await writeIdbTarget(session, target, storage.name, options);
    await options.onStage?.('persisted');
    await deleteRestoreMarker(storage.storageKey);
    return resultOf(trailer, session.manifest);
  } catch (error) {
    return discardIdbTarget(storage.storageKey, storage.name, error);
  }
};

const assertIdbTargetClean = async (storageKey: string, name: string): Promise<void> => {
  if (await hasRestoreMarker(storageKey)) {
    throw new RxDBBackupError(
      'restore_incomplete',
      `A previous restore into "${storageKey}" did not finish; call cleanupIncompletePGliteRestore()`,
      { details: { field: 'dataDir', actual: storageKey } }
    );
  }
  if (!(await isIdbStorageEmpty(pgliteIdbDatabaseName(name)))) {
    throw new RxDBBackupError('target_not_empty', `PGlite storage "${storageKey}" already contains a database`, {
      details: { field: 'dataDir', actual: storageKey }
    });
  }
};

const openSession = async (
  source: ReadableStreamDefaultReader<Uint8Array>,
  target: PGliteRestoreTarget,
  signal: AbortSignal | undefined
): Promise<RestoreSession> => {
  const expected = await pgliteTargetCompatibility(target.rxdb, target.options);
  throwIfAborted(signal);
  const reader = new RxDBBackupArchiveReader(source, signal);
  const manifest = await reader.readManifest();
  assertRxDBBackupCompatible(manifest, expected);
  return { reader, manifest, signal };
};

const restoreLocked = async (
  source: ReadableStreamDefaultReader<Uint8Array>,
  target: PGliteRestoreTarget,
  storage: IdbStorage,
  options: PGliteRestoreOptions
): Promise<PGliteRestoreResult> => {
  const lock = await acquireExclusive(storage.storageKey);
  try {
    throwIfAborted(options.signal);
    await assertIdbTargetClean(storage.storageKey, storage.name);
    const session = await openSession(source, target, options.signal);
    return await restoreToIdb(session, target, storage, options);
  } finally {
    lock.release();
  }
};

const restoreIdbTarget = (
  source: ReadableStreamDefaultReader<Uint8Array>,
  target: PGliteRestoreTarget,
  storage: IdbStorage,
  options: PGliteRestoreOptions
): Promise<PGliteRestoreResult> => {
  requireWebLocks('restore');
  return restoreLocked(source, target, storage, options);
};

/**
 * 把 {@link RxDBAdapterPGlite.backup} 产出的归档恢复成一个新的 PGlite 数据库。
 *
 * @remarks
 * 只写入**空**目标，不做合并或覆盖。兼容性（引擎大版本、扩展、系统表 / 变更编码版本、实体结构指纹、
 * 加密认证域）在写入第一个字节之前判定；归档摘要要读到结尾才知道，所以数据先写进暂存区，
 * 通过摘要与内容核对之后才提交：
 *
 * - IndexedDB 目标：独占 Web Lock 挡住并发连接与并发恢复，持久标记挡住「恢复中途页面被关」后的
 *   下一次连接（报 `restore_incomplete`，需 {@link cleanupIncompletePGliteRestore}）。数据在
 *   验证通过后一次性刷入 IndexedDB，任何失败都删除目标与标记，目标回到从未恢复过的状态。
 * - 内存目标：没有可以「之后再打开」的位置，恢复出的实例经 {@link PGliteRestoreResult.database}
 *   交给目标 adapter 领取。
 *
 * 目标 RxDB 实例会被 `init()`（计算实体集合），但不会被连接。输入流在失败时被取消，成功时只释放读锁。
 *
 * @param source - 归档字节流
 * @param target - 尚未连接的目标实例与其 adapter 选项
 * @param options - 取消信号与阶段回调
 * @returns 结束标记、manifest，以及内存目标的数据库句柄
 * @throws RxDBBackupError 见 {@link RxDBBackupErrorCode}；`cleanup_pending` 表示失败后连清理也没做完
 *
 * @example
 * ```typescript
 * const target = { rxdb, options: { store: 'idb' } };
 * await restorePGliteDatabase(file.stream(), target);
 * rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, target.options));
 * await rxdb.connect('pglite');
 * ```
 */
export const restorePGliteDatabase = async (
  source: ReadableStream<Uint8Array>,
  target: PGliteRestoreTarget,
  options: PGliteRestoreOptions = {}
): Promise<PGliteRestoreResult> => {
  const sourceReader = source.getReader();
  try {
    throwIfAborted(options.signal);
    const storage = targetStorage(target, 'restore');
    await assertTargetDisconnected(target.rxdb);
    const result =
      storage.kind === 'memory' ?
        await restoreToMemory(await openSession(sourceReader, target, options.signal), target, options)
      : await restoreIdbTarget(sourceReader, target, storage, options);
    sourceReader.releaseLock();
    return result;
  } catch (error) {
    await sourceReader.cancel(error).catch(() => undefined);
    throw error;
  }
};

/**
 * 清理一次没做完的恢复（页面在恢复中途关闭、或恢复失败后清理本身也失败）。
 *
 * @remarks
 * 拿不到独占锁说明目标正被连接或正在恢复，报 `target_busy` 而不是去删别人正在用的库。
 * 没有标记时什么都不做——一个正常的库永远不会被这里删掉。
 *
 * @param target - 恢复时使用的同一个目标
 * @returns 确实清理了残留时为 `true`
 * @throws RxDBBackupError `target_busy` / `unsupported_combination` / `cleanup_pending`
 */
export const cleanupIncompletePGliteRestore = async (target: PGliteRestoreTarget): Promise<boolean> => {
  const storage = targetStorage(target, 'restore cleanup');
  if (storage.kind === 'memory') return false;
  requireWebLocks('restore cleanup');
  const { storageKey } = storage;
  const lock = await acquireExclusive(storageKey);
  try {
    if (!(await hasRestoreMarker(storageKey))) return false;
    await deleteIdbDatabase(pgliteIdbDatabaseName(storage.name));
    await deleteRestoreMarker(storageKey);
    return true;
  } catch (error) {
    if (isRxDBBackupError(error)) throw error;
    throw new RxDBBackupError('cleanup_pending', `Failed to clean up the incomplete restore of "${storageKey}"`, {
      cause: error
    });
  } finally {
    lock.release();
  }
};
