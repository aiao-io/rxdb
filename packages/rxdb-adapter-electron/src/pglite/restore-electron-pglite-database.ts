/**
 * Electron PGlite 的恢复入口（renderer 侧，US-217 阶段 C）。
 *
 * @module pglite/restore-electron-pglite-database
 */

import {
  assertRxDBBackupCompatible,
  getRxDBBackupAuthDomain,
  getRxDBBackupSchemaFingerprint,
  RXDB_CHANGE_CODEC_VERSION,
  RXDB_SYSTEM_SCHEMA_VERSION,
  RxDBBackupArchiveReader,
  RxDBBackupError,
  type RxDB,
  type RxDBBackupCompatibility,
  type RxDBBackupEntryHeader,
  type RxDBBackupManifest,
  type RxDBBackupTrailer,
  type RxDBRestoreResult
} from '@aiao/rxdb';
import {
  PGLITE_BACKUP_ENGINE,
  toPGliteEngineInfo,
  verifyPGliteRestored,
  type PGliteQueryable,
  type PGliteRestoreOptions
} from '@aiao/rxdb-adapter-pglite';
import {
  assertDesktopPgliteResponse,
  assertValidDesktopDatabaseName,
  parseDesktopPgliteBackupItem,
  parseDesktopPgliteEngineResult,
  parseDesktopPgliteHandshakeResult,
  resolveDesktopHostTransport,
  RxDBAdapterDesktopError,
  type DesktopHostTransport,
  type DesktopPgliteDataDirItem,
  type DesktopPgliteEngineResult,
  type DesktopPgliteParam,
  type DesktopPgliteQueryResult,
  type DesktopPgliteRestoreStepRequest
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { toDesktopPGliteResults } from './desktop-pglite-results.js';
import { toElectronPGliteBackupError } from './electron-pglite-backup-error.js';
import { ADAPTER_NAME, resolveDataDirectoryName, type ElectronPGliteOptions } from './pglite-adapter.interface.js';

/**
 * 恢复目标：一个**尚未连接**的 RxDB 实例，加上它将来连接时交给
 * {@link RxDBAdapterElectronPGlite} 的同一份选项。
 *
 * @remarks
 * 数据目录名、传输层、实体结构指纹与加密认证域都按这份配置判定；与之后连接时的选项不一致，
 * 恢复出来的库就会落在另一个目录，或者被判成不兼容。
 */
export interface ElectronPGliteRestoreTarget {
  readonly rxdb: RxDB;
  readonly options: ElectronPGliteOptions;
}

type RestoreStepKind = Exclude<DesktopPgliteRestoreStepRequest['kind'], 'pg.restore.abort'>;

const aborted = (signal: AbortSignal): RxDBBackupError =>
  new RxDBBackupError('aborted', 'Desktop PGlite restore was aborted', { cause: signal.reason });

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) throw aborted(signal);
};

/**
 * 目标实例本身必须还没连接：已连接的实例有自己的库，恢复结果既不能替换它、也不能被它领取。
 *
 * @remarks
 * `connected$` 是 BehaviorSubject 派生流，订阅时同步给出当前值；本包不依赖 rxjs，直接订阅一次再退订。
 */
const assertTargetDisconnected = (rxdb: RxDB): void => {
  let connected = false;
  rxdb.connected$
    .subscribe(value => {
      connected = value;
    })
    .unsubscribe();
  if (!connected) return;
  throw new RxDBBackupError('target_busy', `RxDB "${rxdb.config.dbName}" is already connected`, {
    details: { field: 'rxdb', actual: rxdb.config.dbName }
  });
};

/** 协议版本不一致时 host 与 renderer 对恢复步骤的理解不同，必须在发出任何恢复请求之前拒绝（AC#21）。 */
const handshake = async (transport: DesktopHostTransport): Promise<void> => {
  const response = assertDesktopPgliteResponse('pg.handshake', await transport.request({ kind: 'pg.handshake' }));
  parseDesktopPgliteHandshakeResult(response.result);
};

const engineOf = async (transport: DesktopHostTransport): Promise<DesktopPgliteEngineResult> => {
  const response = assertDesktopPgliteResponse('pg.engine', await transport.request({ kind: 'pg.engine' }));
  return parseDesktopPgliteEngineResult(response.result);
};

/**
 * 目标侧的兼容性期望。
 *
 * @remarks
 * 目标库此时还不存在，引擎版本与扩展只能问 host：它回答的是将来打开这个目录的那个运行时。
 * 目标实例会被 `init()`（计算实体集合），但不会连接。
 */
const targetCompatibility = (rxdb: RxDB, engine: DesktopPgliteEngineResult): RxDBBackupCompatibility => {
  rxdb.init();
  return {
    adapterName: ADAPTER_NAME,
    engine: PGLITE_BACKUP_ENGINE,
    engineCompatibility: toPGliteEngineInfo(engine.serverVersion).compatibility,
    extensions: engine.extensions,
    systemSchemaVersion: RXDB_SYSTEM_SCHEMA_VERSION,
    changeCodecVersion: RXDB_CHANGE_CODEC_VERSION,
    schemaFingerprint: getRxDBBackupSchemaFingerprint(rxdb),
    authDomain: getRxDBBackupAuthDomain(rxdb)
  };
};

/** 一次已取得独占权的 host 侧恢复。 */
interface HostRestore {
  step(kind: RestoreStepKind): Promise<void>;
  write(item: DesktopPgliteDataDirItem): Promise<void>;
  query(sql: string, params: readonly DesktopPgliteParam[]): Promise<DesktopPgliteQueryResult>;
  abort(): Promise<void>;
}

/**
 * 取得目标目录的独占权并检查它是否可以恢复。
 *
 * @remarks
 * host **先**取目录锁、**再**查未完成标记与空状态，独占一直保持到 `commit` 或 `abort`：
 * 目录正被打开或正在恢复报 `database_busy`，有未完成标记报 `restore_incomplete`，
 * 已有数据库（哪怕只是 initdb 的产物）报 `target_not_empty`。
 */
const beginHostRestore = async (transport: DesktopHostTransport, dataDirectoryName: string): Promise<HostRestore> => {
  const begun = assertDesktopPgliteResponse(
    'pg.restore.begin',
    await transport.request({ kind: 'pg.restore.begin', storage: { engine: 'pglite', dataDirectoryName } })
  );
  const { restoreId } = begun.result;
  return {
    step: async kind => {
      assertDesktopPgliteResponse(kind, await transport.request({ kind, restoreId }));
    },
    write: async item => {
      assertDesktopPgliteResponse(
        'pg.restore.write',
        await transport.request({ kind: 'pg.restore.write', restoreId, item })
      );
    },
    query: async (sql, params) => {
      const response = assertDesktopPgliteResponse(
        'pg.restore.query',
        await transport.request({ kind: 'pg.restore.query', restoreId, sql, params })
      );
      return response.result;
    },
    abort: async () => {
      assertDesktopPgliteResponse('pg.restore.abort', await transport.request({ kind: 'pg.restore.abort', restoreId }));
    }
  };
};

/**
 * 归档条目头转成 host 写入项。
 *
 * @remarks
 * 归档读取器只保证路径是安全的 POSIX 相对路径；host 还要求每一段在 Windows 上也合法、且不是运行态
 * 文件。由本 adapter 备份出来的归档必然满足（备份方向走同一套校验），不满足只能是归档被改过，
 * 所以在发给 host 之前按损坏拒绝，而不是让 host 以协议错误拒绝后被误判成「组合不支持」。
 */
const toHostEntry = (header: RxDBBackupEntryHeader): DesktopPgliteDataDirItem => {
  const item: DesktopPgliteDataDirItem = {
    type: 'entry',
    header: { path: header.path, kind: header.kind, size: header.size }
  };
  try {
    parseDesktopPgliteBackupItem(item);
  } catch (error) {
    throw new RxDBBackupError(
      'corrupt_archive',
      `Archive entry ${JSON.stringify(header.path)} cannot be restored into a desktop data directory`,
      { details: { field: 'path', actual: header.path }, cause: error }
    );
  }
  return item;
};

/**
 * 数据块必须独占自己的 `ArrayBuffer`。
 *
 * @remarks
 * 结构化克隆按整个底层 buffer 复制：一个视图过 IPC，会把它背后的整块内存一起带过去，
 * host 也会以超限拒绝。读取器产出的帧本来就独占 buffer，这里只在例外时复制一次。
 */
const ownedChunk = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ?
    (bytes as Uint8Array<ArrayBuffer>)
  : bytes.slice();

/**
 * 把归档逐项写进 host 的暂存目录。
 *
 * @remarks
 * 每一项都等 host 确认写入之后才读下一项：读取节奏跟着 host 的磁盘走，内存里最多停留一个数据帧，
 * 与归档大小无关（AC#9、AC#21）。
 */
const writeArchive = async (archive: RxDBBackupArchiveReader, host: HostRestore): Promise<RxDBBackupTrailer> => {
  let item = await archive.next();
  while (item.type !== 'end') {
    await host.write(
      item.type === 'entry' ? toHostEntry(item.header) : { type: 'data', bytes: ownedChunk(item.bytes) }
    );
    item = await archive.next();
  }
  return item.trailer;
};

/**
 * 在 host 的私有实例上核对引擎与系统表水位。
 *
 * @remarks
 * 校验语句在一个摘要正确的库上执行失败（比如缺系统表），说明归档里装的不是 manifest 声明的那个库，
 * 与浏览器端「PostgreSQL 起不来」同样归为损坏。
 */
const verifyOnHost = async (host: HostRestore, manifest: RxDBBackupManifest): Promise<void> => {
  const db: PGliteQueryable = {
    query: async <T>(sql: string, params: unknown[] = []) =>
      toDesktopPGliteResults<T>(await host.query(sql, params as readonly DesktopPgliteParam[]))
  };
  try {
    await verifyPGliteRestored(db, manifest);
  } catch (error) {
    if (!(error instanceof RxDBAdapterDesktopError && error.code === 'statement_failed')) throw error;
    throw new RxDBBackupError('corrupt_archive', 'Restored database cannot answer the verification queries', {
      cause: error
    });
  }
};

/** 恢复运行时：独占已取得，归档读到了 manifest 并判定兼容。 */
interface RestoreSession {
  readonly host: HostRestore;
  readonly archive: RxDBBackupArchiveReader;
  readonly manifest: RxDBBackupManifest;
  readonly options: PGliteRestoreOptions;
}

/**
 * 从未完成标记落盘到提交。
 *
 * @remarks
 * 顺序与浏览器端的 IndexedDB 目标一致：标记 → 写入 → 启动 → 校验 → 落盘 → 删标记。标记之后到
 * 删标记之前任何一刻进程被杀，下一次打开都会以 `restore_incomplete` 拒绝，而不是把半截库当成正常库。
 */
const runRestore = async (session: RestoreSession): Promise<RxDBBackupTrailer> => {
  const { host, archive, options } = session;
  await host.step('pg.restore.prepare');
  await options.onStage?.('marker-written');
  throwIfAborted(options.signal);
  const trailer = await writeArchive(archive, host);
  await host.step('pg.restore.open');
  await options.onStage?.('files-written');
  throwIfAborted(options.signal);
  await verifyOnHost(host, session.manifest);
  await options.onStage?.('verified');
  throwIfAborted(options.signal);
  await host.step('pg.restore.persist');
  await options.onStage?.('persisted');
  await host.step('pg.restore.commit');
  return trailer;
};

/**
 * 失败后让 host 把目标退回「从未恢复过」，并交还独占。
 *
 * @remarks
 * 未完成标记已写下之后连 abort 都没成功（host 断开、删目录失败），目标上就留着一份需要清理的残留：
 * 此时报 `cleanup_pending`。标记写下之前的 abort 失败不留残留，照原始失败的码报；但独占可能还在 host
 * 上（直到这个窗口断开才交还），清理失败因此不能丢。两种情况下 `cause` 都是装着原始失败与清理失败的
 * `AggregateError`。
 */
const abandon = async (
  host: HostRestore,
  marked: boolean,
  dataDirectoryName: string,
  cause: unknown
): Promise<never> => {
  try {
    await host.abort();
  } catch (cleanupError) {
    const both = new AggregateError([cause, cleanupError], 'Restore and cleanup both failed');
    if (!marked) {
      const failure = toElectronPGliteBackupError(cause, dataDirectoryName, 'restore');
      throw new RxDBBackupError(failure.code, failure.message, { details: failure.details, cause: both });
    }
    throw new RxDBBackupError(
      'cleanup_pending',
      `Desktop PGlite restore failed and its partial data could not be removed; call cleanupIncompleteElectronPGliteRestore()`,
      {
        details: { field: 'dataDirectoryName', actual: dataDirectoryName },
        cause: both
      }
    );
  }
  throw cause;
};

const restoreOnHost = async (
  sourceReader: ReadableStreamDefaultReader<Uint8Array>,
  target: ElectronPGliteRestoreTarget,
  dataDirectoryName: string,
  options: PGliteRestoreOptions
): Promise<RxDBRestoreResult> => {
  const transport = target.options.transport ?? resolveDesktopHostTransport();
  await handshake(transport);
  const expected = targetCompatibility(target.rxdb, await engineOf(transport));
  throwIfAborted(options.signal);
  const host = await beginHostRestore(transport, dataDirectoryName);
  let marked = false;
  try {
    const archive = new RxDBBackupArchiveReader(sourceReader, options.signal);
    const manifest = await archive.readManifest();
    assertRxDBBackupCompatible(manifest, expected);
    // 从这里起 host 可能已经写下未完成标记（请求发出去了、应答却没回来也算）。
    marked = true;
    const trailer = await runRestore({ host, archive, manifest, options });
    return { ...trailer, manifest, scope: manifest.scope };
  } catch (error) {
    return abandon(host, marked, dataDirectoryName, error);
  }
};

/**
 * 把 {@link RxDBAdapterElectronPGlite.backup} 产出的归档恢复进 host 上的一个新数据目录。
 *
 * @remarks
 * 只写入**空**目标，不做合并或覆盖。步骤：
 *
 * 1. 在读取归档之前拒绝已连接的目标实例（`target_busy`，`details.field` 为 `rxdb`）、协议版本不一致
 *    或未启用备份的 host（`unsupported_combination`）。
 * 2. host **先**取得目录的独占权，**再**检查未完成标记与空状态；独占一直保持到提交或失败处理结束，
 *    期间其他窗口的 `connect`、其他恢复与清理请求都被拒绝。
 * 3. 读 manifest，在写入第一个字节之前判定兼容性：适配器、引擎大版本、扩展（目标 host 必须全部提供）、
 *    系统表 / 变更编码版本、实体结构指纹与加密认证域（`incompatible_archive` /
 *    `auth_domain_mismatch`）。
 * 4. host 持久化未完成标记，归档逐项写进目录；读到结尾、摘要通过后才在私有实例上启动 PostgreSQL，
 *    核对引擎与系统表水位，关闭实例并逐一 fsync，最后删除标记、交还独占。
 *
 * 任一步失败都由 host 删除目录与标记，目标回到从未恢复过的状态；连这一步也失败时报
 * `cleanup_pending`，调 {@link cleanupIncompleteElectronPGliteRestore} 重试。恢复途中窗口或进程
 * 退出时标记留在盘上，下一次连接以 `restore_incomplete` 拒绝，同样用它清理后再恢复。
 *
 * 归档只含数据库：结果与 manifest 的 `scope.externalFiles` 恒为 `excluded`，外置文件须另行备份恢复。
 * 输入流在失败时被取消，成功时只释放读锁。桌面错误码按 {@link toElectronPGliteBackupError} 归一。
 *
 * @param source - 归档字节流
 * @param target - 尚未连接的目标实例与其 adapter 选项
 * @param options - 取消信号与阶段回调；四个阶段都会触发
 * @returns 结束标记（条目数、字节数、SHA-256）、manifest 与范围
 * @throws RxDBBackupError `target_busy` / `target_not_empty` / `restore_in_progress` / `restore_incomplete` /
 * `unsupported_combination` / `incompatible_archive` / `auth_domain_mismatch` / `corrupt_archive` /
 * `truncated_archive` / `aborted` / `io_error` / `storage_full` / `cleanup_pending`
 *
 * @example
 * ```typescript
 * const target = { rxdb, options: {} };
 * await restoreElectronPGliteDatabase(file.stream(), target);
 * rxdb.adapter(ELECTRON_PGLITE_ADAPTER_NAME, db => new RxDBAdapterElectronPGlite(db, target.options));
 * await rxdb.connect(ELECTRON_PGLITE_ADAPTER_NAME);
 * ```
 */
export const restoreElectronPGliteDatabase = async (
  source: ReadableStream<Uint8Array>,
  target: ElectronPGliteRestoreTarget,
  options: PGliteRestoreOptions = {}
): Promise<RxDBRestoreResult> => {
  const sourceReader = source.getReader();
  const dataDirectoryName = resolveDataDirectoryName(target.rxdb.config.dbName, target.options);
  try {
    throwIfAborted(options.signal);
    assertValidDesktopDatabaseName(dataDirectoryName);
    assertTargetDisconnected(target.rxdb);
    const result = await restoreOnHost(sourceReader, target, dataDirectoryName, options);
    sourceReader.releaseLock();
    return result;
  } catch (error) {
    await sourceReader.cancel(error).catch(() => undefined);
    throw toElectronPGliteBackupError(error, dataDirectoryName, 'restore');
  }
};

/**
 * 清理一次没做完的恢复（窗口或进程在恢复中途退出、或恢复失败后清理本身也失败）。
 *
 * @remarks
 * host 先取目录的独占权：目录正被打开或正在恢复时报 `target_busy`，从不删别人正在用的库。
 * 没有未完成标记时什么都不做——一个正常的库永远不会被这里删掉。
 *
 * @param target - 恢复时使用的同一个目标
 * @returns 确实清理了残留时为 `true`
 * @throws RxDBBackupError `target_busy` / `unsupported_combination` / `cleanup_pending`
 */
export const cleanupIncompleteElectronPGliteRestore = async (target: ElectronPGliteRestoreTarget): Promise<boolean> => {
  const dataDirectoryName = resolveDataDirectoryName(target.rxdb.config.dbName, target.options);
  try {
    assertValidDesktopDatabaseName(dataDirectoryName);
    const transport = target.options.transport ?? resolveDesktopHostTransport();
    await handshake(transport);
    const response = assertDesktopPgliteResponse(
      'pg.restore.cleanup',
      await transport.request({ kind: 'pg.restore.cleanup', storage: { engine: 'pglite', dataDirectoryName } })
    );
    return response.result.cleaned;
  } catch (error) {
    const mapped = toElectronPGliteBackupError(error, dataDirectoryName, 'restore');
    if (mapped.code !== 'io_error') throw mapped;
    throw new RxDBBackupError(
      'cleanup_pending',
      `Failed to clean up the incomplete restore of "${dataDirectoryName}"`,
      {
        details: { field: 'dataDirectoryName', actual: dataDirectoryName },
        cause: error
      }
    );
  }
};
