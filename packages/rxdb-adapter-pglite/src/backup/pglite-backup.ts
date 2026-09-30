import type { RxDB, RxDBBackupManifest, RxDBBackupOptions, RxDBBackupResult, RxDBBackupTrailer } from '@aiao/rxdb';
import {
  classifyBackupIoError,
  getRxDBBackupAuthDomain,
  getRxDBBackupSchemaFingerprint,
  runRxDBBackupWhenQueued,
  RXDB_BACKUP_FORMAT,
  RXDB_BACKUP_FORMAT_VERSION,
  RXDB_BACKUP_SCOPE,
  RxDBBackupArchiveWriter,
  RxDBBackupError
} from '@aiao/rxdb';
import type { AsyncQueueExecutor } from '@aiao/utils';
import type { IPGliteClient } from '../PGliteClient.js';
import { PGLITE_BACKUP_ENGINE, readPGliteEngineInfo, readPGliteSystemVersionState } from './pglite-backup-compat.js';
import { writeDataDirSnapshot } from './pglite-data-dir.js';

/** {@link RxDBBackupOptions.lockTimeoutMs} 的默认值。 */
export const PGLITE_BACKUP_LOCK_TIMEOUT_MS = 30_000;

/** 备份一次需要的全部上下文。 */
export interface PGliteBackupInput {
  readonly rxdb: RxDB;
  /** 写进 manifest 的 adapter 标识；恢复只接受同一标识的归档。 */
  readonly adapterName: string;
  readonly client: IPGliteClient;
  /** 写进 manifest 的存储后端，例如 `memory` / `idb` / `directory`。 */
  readonly storage: string;
  /** 运行时加载的扩展名，已排序。 */
  readonly extensions: readonly string[];
  readonly queue: AsyncQueueExecutor;
}

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
  const authDomain = getRxDBBackupAuthDomain(rxdb);
  const manifest: RxDBBackupManifest = {
    format: RXDB_BACKUP_FORMAT,
    formatVersion: RXDB_BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    scope: RXDB_BACKUP_SCOPE,
    adapter: {
      name: input.adapterName,
      engine: PGLITE_BACKUP_ENGINE,
      engineVersion: engine.version,
      engineCompatibility: engine.compatibility,
      extensions: input.extensions,
      storage: input.storage
    },
    rxdb: {
      version: rxdb.version,
      systemSchemaVersion: versions.schemaVersion,
      changeCodecVersion: versions.codecVersion
    },
    schemaFingerprint: getRxDBBackupSchemaFingerprint(rxdb),
    encryption: authDomain === null ? null : { authDomain }
  };
  const trailer = await snapshotDataDir(async items => {
    const archive = new RxDBBackupArchiveWriter(writer, signal);
    await archive.writeManifest(manifest);
    await writeDataDirSnapshot(items, archive);
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
    const { trailer, manifest } = await runRxDBBackupWhenQueued(input.queue, () => snapshot(input, writer, signal), {
      signal,
      timeoutMs: options.lockTimeoutMs ?? PGLITE_BACKUP_LOCK_TIMEOUT_MS,
      label: 'PGlite backup'
    });
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
