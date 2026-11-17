import type { StorageFilesystem } from '@aiao/rxdb-plugin-storage';

import { DesktopBackupError, DesktopBackupFile } from './desktop-backup-archive';
import type { AuditedStorageBody, AuditedStorageMeta } from './desktop-storage-audit';

interface BodySource {
  listAllMetas(): Promise<readonly AuditedStorageMeta[]>;
  read(id: string): Promise<Blob>;
}

/** 元数据与字节在同一存储锁内读取；上限在分配文件内容前检查。 */
export async function collectDesktopBodies(
  source: BodySource,
  limit: number
): Promise<{
  metas: readonly AuditedStorageMeta[];
  files: readonly DesktopBackupFile[];
}> {
  const metas = await source.listAllMetas();
  if (metas.reduce((total, meta) => total + meta.size, 0) > limit)
    throw new DesktopBackupError('too_large', 'Desktop backups are limited to 256 MiB.');
  const files: DesktopBackupFile[] = [];
  for (const meta of metas) {
    const blob = await source.read(meta.id);
    if (blob.size !== meta.size) throw new Error(`Stored file size does not match: ${meta.opfsPath}`);
    files.push({ path: meta.opfsPath.split('/'), blob: new Blob([await blob.arrayBuffer()]) });
  }
  return { metas, files };
}

export function matchDesktopBodies(metas: readonly AuditedStorageMeta[], files: readonly DesktopBackupFile[]): void {
  const bodies = new Map(files.map(file => [file.path.join('/'), file.blob.size]));
  const paths = new Set(metas.map(meta => meta.opfsPath));
  if (
    bodies.size !== files.length ||
    paths.size !== metas.length ||
    metas.length !== files.length ||
    metas.some(meta => bodies.get(meta.opfsPath) !== meta.size)
  )
    throw new Error('Backup files do not match the database file list.');
}

export async function writeDesktopBodies(
  filesystem: Pick<StorageFilesystem, 'openWrite'>,
  files: readonly DesktopBackupFile[]
): Promise<void> {
  for (const file of files) {
    const writer = await filesystem.openWrite(file.path.join('/'));
    try {
      await writer.write(file.blob);
      await writer.close();
    } catch (error) {
      await writer.abort(error);
      throw error;
    }
  }
}

/** 枚举真实文件体，包括没有元数据的中断残留。 */
export async function storageInventory(
  filesystem: Pick<StorageFilesystem, 'list' | 'readBlob'>
): Promise<AuditedStorageBody[]> {
  const pending = ['/'];
  const bodies: AuditedStorageBody[] = [];
  while (pending.length) {
    const directory = pending.pop() as string;
    for await (const entry of filesystem.list(directory)) {
      const path = directory === '/' ? entry.name : `${directory}/${entry.name}`;
      if (entry.kind === 'directory') pending.push(path);
      else bodies.push({ path, size: (await filesystem.readBlob(path)).size });
    }
  }
  return bodies;
}
