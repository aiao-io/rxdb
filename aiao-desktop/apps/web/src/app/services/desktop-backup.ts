import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { StorageFileMeta, createOpfsStorageFilesystem } from '@aiao/rxdb-plugin-storage';
import { PlatformLocation } from '@angular/common';
import { Service, inject } from '@angular/core';

import {
  DesktopBackupError,
  MAX_DESKTOP_BACKUP_BYTES,
  decodeDesktopBackup,
  encodeDesktopBackup
} from '../data/desktop-backup-archive';
import { DesktopData } from '../data/desktop-data';
import { DESKTOP_ADAPTER } from '../data/desktop-database';
import { DATA_WRITE_LOCK } from '../data/desktop-location-guard';
import { RESTORE_LOCK, recoverPendingRestore, restoreDesktopData } from '../data/desktop-restore';
import { runRestoreWorker } from '../data/desktop-restore-client';
import type { DesktopRestoreRequest } from '../data/desktop-restore.worker';
import { DesktopStorageAudit, assertCompletedDiskState, auditDesktopStorage } from '../data/desktop-storage-audit';
import { collectDesktopBodies, storageInventory } from '../data/desktop-storage-io';
import { DESKTOP_SCHEMA_VERSION } from '../data/schema-version';
import { SystemPreference } from '../data/system-preference.entity';
import { DesktopFile } from '../disk/desktop-file.entity';
import { FileSystem } from './file-system';

const ALL = { combinator: 'and' as const, rules: [] };

export interface DesktopStorageHealth {
  readonly usage: number | null;
  readonly quota: number | null;
  readonly persisted: boolean;
  readonly opfs: boolean;
  readonly error: string | null;
}

@Service({ autoProvided: false })
export class DesktopBackup {
  private readonly data = inject(DesktopData);
  private readonly fs = inject(FileSystem);
  private readonly baseHref = inject(PlatformLocation).getBaseHrefFromDOM();

  inspect(archive: Blob) {
    return decodeDesktopBackup(archive, DESKTOP_SCHEMA_VERSION);
  }

  /** 磁盘操作、存储文件体与快照互斥；应用记录由 SQLite 的一致读取事务保证。 */
  async export(): Promise<Blob> {
    return this.fs.run(async () =>
      this.data.database.storage.runExclusive(async () => {
        const adapter = await this.data.database.getAdapter(DESKTOP_ADAPTER);
        if (!(adapter instanceof RxDBAdapterSqlite)) throw new Error('The backup adapter is unavailable.');
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        let size = 0;
        await adapter.backup(
          new WritableStream({
            write: chunk => {
              size += chunk.byteLength;
              if (size > MAX_DESKTOP_BACKUP_BYTES)
                throw new DesktopBackupError('too_large', 'Desktop backups are limited to 256 MiB.');
              chunks.push(chunk.slice());
            }
          })
        );
        const { metas, files } = await collectDesktopBodies(
          this.data.database.storage,
          MAX_DESKTOP_BACKUP_BYTES - size
        );
        assertCompletedDiskState(await (await this.data.repository(SystemPreference)).find({ where: ALL }));
        const rows = await (await this.data.repository(DesktopFile)).find({ where: ALL });
        const audit = auditDesktopStorage(
          rows,
          metas,
          files.map(file => ({ path: file.path.join('/'), size: file.blob.size }))
        );
        if (audit.issues.length) throw new Error(`Run First Aid before exporting: ${audit.issues.join(' ')}`);
        return encodeDesktopBackup({
          schema: DESKTOP_SCHEMA_VERSION,
          createdAt: new Date().toISOString(),
          sourceOrigin: location.origin,
          database: new Blob(chunks),
          files
        });
      })
    );
  }

  /** 确认和未保存协商由界面先完成；恢复锁覆盖临时目标清理与新目标创建。 */
  async restore(archive: Blob): Promise<void> {
    await this.inspect(archive);
    this.data.locationGuard.assertCurrent();
    await this.data.tabs.exclusive(
      () =>
        restoreDesktopData(
          {
            storage: localStorage,
            generation: () =>
              [...crypto.getRandomValues(new Uint8Array(6))].map(byte => byte.toString(16).padStart(2, '0')).join(''),
            prepare: generation => this.worker({ action: 'prepare', generation, archive }),
            discard: generation => this.worker({ action: 'discard', generation }),
            exclusiveWrite: task =>
              this.fs.run(() => navigator.locks.request(DATA_WRITE_LOCK, { mode: 'exclusive' }, task))
          },
          this.data.locationGuard.location.generation
        ),
      RESTORE_LOCK
    );
  }

  cleanupInterruptedRestore(): Promise<void> {
    return this.data.tabs.exclusive(
      () =>
        recoverPendingRestore({
          storage: localStorage,
          discard: generation => this.worker({ action: 'discard', generation })
        }),
      RESTORE_LOCK
    );
  }

  async health(): Promise<DesktopStorageHealth> {
    try {
      const estimate = await navigator.storage.estimate();
      const persisted = await navigator.storage.persisted();
      await navigator.storage.getDirectory();
      return { usage: estimate.usage ?? null, quota: estimate.quota ?? null, persisted, opfs: true, error: null };
    } catch (error) {
      return {
        usage: null,
        quota: null,
        persisted: false,
        opfs: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  persist(): Promise<boolean> {
    return navigator.storage.persist();
  }

  async check(repair = false): Promise<DesktopStorageAudit> {
    return this.fs.run(() =>
      this.data.database.storage.runExclusive(async () => {
        const filesystem = createOpfsStorageFilesystem(this.data.locationGuard.location.filesRoot, {
          localAdapterName: DESKTOP_ADAPTER
        });
        try {
          const rows = await (await this.data.repository(DesktopFile)).find({ where: ALL });
          const metas = await this.data.database.storage.listAllMetas();
          const audit = auditDesktopStorage(rows, metas, await storageInventory(filesystem));
          if (!repair) return audit;
          if (audit.issues.length)
            throw new Error('Repair stopped because file references are damaged. Restore a known-good backup first.');
          const repository = await this.data.repository(StorageFileMeta);
          for (const meta of metas.filter(item => audit.orphanMetaIds.includes(item.id))) {
            await repository.remove(meta);
            await filesystem.removeFile(meta.opfsPath);
          }
          for (const path of audit.orphanPaths) await filesystem.removeFile(path);
          return auditDesktopStorage(
            rows,
            await this.data.database.storage.listAllMetas(),
            await storageInventory(filesystem)
          );
        } finally {
          filesystem.dispose();
        }
      })
    );
  }

  private worker(request: Omit<DesktopRestoreRequest, 'baseHref'>): Promise<void> {
    return runRestoreWorker(
      new Worker(new URL('../data/desktop-restore.worker', import.meta.url), {
        type: 'module',
        name: 'aiao-desktop-restore'
      }),
      { ...request, baseHref: this.baseHref }
    );
  }
}
