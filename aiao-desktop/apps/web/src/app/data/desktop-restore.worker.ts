import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { createOpfsStorageFilesystem } from '@aiao/rxdb-plugin-storage';

import { DesktopFile } from '../disk/desktop-file.entity';
import { MAX_DESKTOP_BACKUP_BYTES, decodeDesktopBackup } from './desktop-backup-archive';
import { dataLocation, requireRestoreGeneration } from './desktop-data-location';
import { DESKTOP_ADAPTER, createDesktopDatabase } from './desktop-database';
import { assertCompletedDiskState, auditDesktopStorage } from './desktop-storage-audit';
import { collectDesktopBodies, matchDesktopBodies, writeDesktopBodies } from './desktop-storage-io';
import { DESKTOP_ENTITIES } from './entities';
import { adapterInspector, probeSchema } from './schema-probe';
import { DESKTOP_SCHEMA_VERSION, planSchema } from './schema-version';
import { SystemPreference } from './system-preference.entity';

export interface DesktopRestoreRequest {
  readonly generation: string;
  readonly baseHref: string;
  readonly archive?: Blob;
}

export type DesktopRestoreReply = { readonly ok: true } | { readonly ok: false; readonly message: string };

async function execute(scope: DedicatedWorkerGlobalScope, data: unknown): Promise<void> {
  const discard = scope.name === 'aiao-desktop-restore-discard';
  if (!discard && scope.name !== 'aiao-desktop-restore') throw new Error('Unknown restore worker.');
  if (!data || typeof data !== 'object') throw new Error('Invalid restore request.');
  const { generation, baseHref, archive } = data as Record<string, unknown>;
  const location = dataLocation(requireRestoreGeneration(generation));
  if (
    typeof baseHref !== 'string' ||
    new URL(`${baseHref}sqlite-wasm/wa-sqlite.wasm`, scope.location.href).origin !== scope.location.origin
  )
    throw new Error('Invalid restore base URL.');

  const database = createDesktopDatabase(baseHref, { location, inWorker: true });
  const filesystem = createOpfsStorageFilesystem(location.filesRoot, { localAdapterName: DESKTOP_ADAPTER });
  try {
    const adapter = await database.getAdapter(DESKTOP_ADAPTER);
    if (!(adapter instanceof RxDBAdapterSqlite)) throw new Error('The restore adapter is unavailable.');
    if (discard) {
      await adapter.cleanupIncompleteRestore();
      await adapter.disconnect();
      await adapter.dropStorage();
      await removeFilesRoot(location.filesRoot);
      return;
    }
    if (!(archive instanceof Blob)) throw new Error('No backup was selected.');
    const backup = await decodeDesktopBackup(archive, DESKTOP_SCHEMA_VERSION);
    await adapter.restore(backup.database.stream());
    await adapter.connect();
    const plan = planSchema(await probeSchema(adapterInspector(adapter), DESKTOP_ENTITIES));
    if (plan.kind !== 'current') throw new Error('The restored database does not have the expected desktop schema.');
    await database.connect(DESKTOP_ADAPTER);
    assertCompletedDiskState(
      await adapter.getRepository(SystemPreference).find({ where: { combinator: 'and', rules: [] } })
    );
    const metas = await database.storage.listAllMetas();
    const rows = await adapter.getRepository(DesktopFile).find({ where: { combinator: 'and', rules: [] } });
    matchDesktopBodies(metas, backup.files);
    const audit = auditDesktopStorage(
      rows,
      metas,
      backup.files.map(file => ({ path: file.path.join('/'), size: file.blob.size }))
    );
    if (audit.issues.length) throw new Error(audit.issues.join('\n'));
    await filesystem.ensureRoot();
    await writeDesktopBodies(filesystem, backup.files);
    const restored = await collectDesktopBodies(database.storage, MAX_DESKTOP_BACKUP_BYTES);
    await verifyContents(backup.files, restored.files);
  } finally {
    filesystem.dispose();
    await database.destroy();
  }
}

async function verifyContents(
  expected: readonly { path: readonly string[]; blob: Blob }[],
  actual: readonly { path: readonly string[]; blob: Blob }[]
): Promise<void> {
  const files = new Map(actual.map(file => [file.path.join('/'), file.blob]));
  for (const file of expected) {
    const restored = files.get(file.path.join('/'));
    if (!restored || restored.size !== file.blob.size) throw new Error('Restored file verification failed.');
    const before = new Uint8Array(await file.blob.arrayBuffer());
    const after = new Uint8Array(await restored.arrayBuffer());
    if (!before.every((byte, index) => after[index] === byte)) throw new Error('Restored file verification failed.');
  }
}

async function removeFilesRoot(name: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(name, { recursive: true });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
  }
}

if (self instanceof DedicatedWorkerGlobalScope) {
  const scope = self;
  scope.onmessage = (event: MessageEvent<unknown>) => {
    // 专用 Worker 只从创建者持有的端口接收消息，浏览器投递时 origin 为空、source 为 null。
    if (!event.isTrusted || event.origin !== '' || event.source !== null) return;
    scope.onmessage = null;
    void execute(scope, event.data).then(
      () => scope.postMessage({ ok: true } satisfies DesktopRestoreReply),
      (error: unknown) =>
        scope.postMessage({
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        } satisfies DesktopRestoreReply)
    );
  };
}
