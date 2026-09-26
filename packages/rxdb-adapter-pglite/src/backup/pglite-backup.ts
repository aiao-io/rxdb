import type { RxDB, RxDBBackupManifest, RxDBBackupOptions, RxDBBackupResult, RxDBBackupTrailer } from '@aiao/rxdb';
import {
  classifyBackupIoError,
  RXDB_BACKUP_FORMAT,
  RXDB_BACKUP_FORMAT_VERSION,
  RXDB_BACKUP_SCOPE,
  RxDBBackupArchiveWriter,
  RxDBBackupError
} from '@aiao/rxdb';
import type { AsyncQueueExecutor } from '@aiao/utils';
import { ADAPTER_NAME, type PGliteClientOptions } from '../pglite.interface.js';
import type { IPGliteClient } from '../PGliteClient.js';
import {
  PGLITE_BACKUP_ENGINE,
  pgliteBackupAuthDomain,
  pgliteBackupExtensions,
  pgliteBackupFingerprint,
  readPGliteEngineInfo,
  readPGliteSystemVersionState,
  type PGliteBackupStorage
} from './pglite-backup-compat.js';
import { writeDataDirSnapshot } from './pglite-data-dir.js';

/** {@link RxDBBackupOptions.lockTimeoutMs} 的默认值。 */
export const PGLITE_BACKUP_LOCK_TIMEOUT_MS = 30_000;

/** 备份一次需要的全部上下文。 */
export interface PGliteBackupInput {
  readonly rxdb: RxDB;
  readonly options: PGliteClientOptions;
  readonly client: IPGliteClient;
  readonly storage: PGliteBackupStorage;
  readonly queue: AsyncQueueExecutor;
}

/**
 * 在 adapter 的串行队列里执行任务，排队本身有时限、可取消。
 *
 * @remarks
 * 只有「还在排队」这一段受超时与取消控制：任务一旦开始执行就交给它自己的取消逻辑（归档写入器
 * 会在每次写之前检查信号），否则超时回调会在快照写到一半时把调用方放走，而任务仍占着数据库。
 * 超时或取消后任务轮到时直接跳过，不会在没人等待的情况下再做一次快照。
 */
const runWhenQueued = <T>(
  queue: AsyncQueueExecutor,
  task: () => Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    let waiting = true;
    const stopWaiting = (): void => {
      waiting = false;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const giveUp = (error: RxDBBackupError): void => {
      if (!waiting) return;
      stopWaiting();
      reject(error);
    };
    const onAbort = (): void =>
      giveUp(new RxDBBackupError('aborted', 'PGlite backup was aborted', { cause: signal?.reason }));
    const timer = setTimeout(
      () =>
        giveUp(
          new RxDBBackupError('lock_timeout', `PGlite backup waited more than ${timeoutMs}ms for the database`, {
            details: { field: 'lockTimeoutMs', expected: timeoutMs }
          })
        ),
      timeoutMs
    );
    signal?.addEventListener('abort', onAbort, { once: true });
    void queue.addTask(async () => {
      if (!waiting) return;
      stopWaiting();
      await task().then(resolve, reject);
    });
  });

const snapshot = async (
  input: PGliteBackupInput,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  signal: AbortSignal | undefined
): Promise<{ trailer: RxDBBackupTrailer; manifest: RxDBBackupManifest }> => {
  const { client, rxdb } = input;
  const snapshotDataDir = client.snapshotDataDir?.bind(client);
  if (!snapshotDataDir) {
    throw new RxDBBackupError('unsupported_combination', 'The current PGlite client cannot read its data directory');
  }
  const engine = await readPGliteEngineInfo(client);
  const versions = await readPGliteSystemVersionState(client);
  const authDomain = pgliteBackupAuthDomain(rxdb);
  const manifest: RxDBBackupManifest = {
    format: RXDB_BACKUP_FORMAT,
    formatVersion: RXDB_BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    scope: RXDB_BACKUP_SCOPE,
    adapter: {
      name: ADAPTER_NAME,
      engine: PGLITE_BACKUP_ENGINE,
      engineVersion: engine.version,
      engineCompatibility: engine.compatibility,
      extensions: pgliteBackupExtensions(input.options),
      storage: input.storage.kind
    },
    rxdb: {
      version: rxdb.version,
      systemSchemaVersion: versions.schemaVersion,
      changeCodecVersion: versions.codecVersion
    },
    schemaFingerprint: pgliteBackupFingerprint(rxdb),
    encryption: authDomain === null ? null : { authDomain }
  };
  const trailer = await snapshotDataDir(async FS => {
    const archive = new RxDBBackupArchiveWriter(writer, signal);
    await archive.writeManifest(manifest);
    await writeDataDirSnapshot(FS, archive);
    return archive.finish();
  });
  return { trailer, manifest };
};

/**
 * 把已连接的 PGlite 库写成一份归档。
 *
 * @param input - adapter 上下文
 * @param sink - 输出流；成功时被 close，失败时被 abort
 * @param options - 取消信号与排队时限
 * @returns 结束标记与 manifest
 */
export const writePGliteBackup = async (
  input: PGliteBackupInput,
  sink: WritableStream<Uint8Array>,
  options: RxDBBackupOptions
): Promise<RxDBBackupResult> => {
  const signal = options.signal;
  const writer = sink.getWriter();
  try {
    const { trailer, manifest } = await runWhenQueued(
      input.queue,
      () => snapshot(input, writer, signal),
      signal,
      options.lockTimeoutMs ?? PGLITE_BACKUP_LOCK_TIMEOUT_MS
    );
    await writer.close().catch((error: unknown) => {
      throw classifyBackupIoError(error, 'Failed to close the backup output');
    });
    return { ...trailer, manifest, scope: manifest.scope };
  } catch (error) {
    await writer.abort(error).catch(() => undefined);
    throw error;
  } finally {
    writer.releaseLock();
  }
};
