import { isRxDBBackupError, type RxDB } from '@aiao/rxdb';
import type { I18n } from '@aiao/rxdb-i18n';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import {
  backupDownloadName,
  backupErrorMessage,
  collectBackup,
  downloadBlob,
  type BackupAdapterLike
} from './backup-ops';

export type BackupStatus =
  | { kind: 'idle' | 'running' }
  | { kind: 'success'; sha256: string; bytes: number }
  | { kind: 'failed'; error: unknown };
export type RestoreFailure = { kind: 'initialized' } | { kind: 'operation' | 'reconnect'; error: unknown };
export type RestoreStatus =
  | { kind: 'idle' | 'running' }
  | { kind: 'success'; sha256: string }
  | { kind: 'failed'; failure: RestoreFailure; needsCleanup: boolean };

export interface BackupState {
  backup: BackupStatus;
  restore: RestoreStatus;
  busy: boolean;
}
interface RestoreAdapter extends BackupAdapterLike {
  cleanupIncompleteRestore(): Promise<boolean>;
}
type Database = Pick<RxDB, 'getAdapter' | 'adapterConnected$' | 'connect'>;

/** 按当前语言解释恢复失败，同时保留错误本身供语言切换后重译。 */
export function restoreFailureMessage(failure: RestoreFailure, t: I18n['t']): string {
  if (failure.kind === 'initialized') return t('backup.error.target_busy');
  const message = backupErrorMessage(failure.error, t);
  return failure.kind === 'reconnect' ? t('backup.reconnectFailed', { message }) : message;
}

/** 备份与空库恢复的互斥状态机，不提前连接数据库。 */
export class BackupController {
  readonly state = new BehaviorSubject<BackupState>({
    backup: { kind: 'idle' },
    restore: { kind: 'idle' },
    busy: false
  });
  constructor(
    private readonly database: Database,
    private readonly i18n: Pick<I18n, 't'>
  ) {}

  backup(): Promise<void> {
    return this.exclusive(async () => {
      this.patch({ backup: { kind: 'running' } });
      try {
        const result = await collectBackup(await this.adapter());
        downloadBlob(result.blob, backupDownloadName(new Date(), this.i18n.t('backup.filePrefix')));
        this.patch({ backup: { kind: 'success', sha256: result.sha256, bytes: result.bytes } });
      } catch (error) {
        this.patch({ backup: { kind: 'failed', error } });
      }
    });
  }
  async restore(file: File | undefined): Promise<void> {
    if (!file) return;
    await this.exclusive(() => this.restoreFile(file));
  }
  cleanup(): Promise<void> {
    return this.exclusive(async () => {
      this.patch({ restore: { kind: 'running' } });
      try {
        await (await this.adapter()).cleanupIncompleteRestore();
        this.patch({ restore: { kind: 'idle' } });
      } catch (error) {
        this.patch({ restore: { kind: 'failed', failure: { kind: 'operation', error }, needsCleanup: true } });
      }
    });
  }
  private patch(patch: Partial<BackupState>): void {
    this.state.next({ ...this.state.value, ...patch });
  }
  private async exclusive(operation: () => Promise<void>): Promise<void> {
    if (this.state.value.busy) return;
    this.patch({ busy: true });
    try {
      await operation();
    } finally {
      this.patch({ busy: false });
    }
  }
  private async adapter(): Promise<RestoreAdapter> {
    return (await this.database.getAdapter('sqlite-wasm')) as RestoreAdapter;
  }
  private async restoreFile(file: File): Promise<void> {
    this.patch({ restore: { kind: 'running' } });
    try {
      const adapter = await this.adapter();
      if (await firstValueFrom(this.database.adapterConnected$('sqlite-wasm'))) {
        this.patch({ restore: { kind: 'failed', failure: { kind: 'initialized' }, needsCleanup: false } });
        return;
      }
      const result = await adapter.restore(file.stream());
      await this.connectRestored(result.sha256);
    } catch (error) {
      this.patch({
        restore: {
          kind: 'failed',
          failure: { kind: 'operation', error },
          needsCleanup: isRxDBBackupError(error, 'restore_incomplete') || isRxDBBackupError(error, 'cleanup_pending')
        }
      });
    }
  }
  private async connectRestored(sha256: string): Promise<void> {
    try {
      await this.database.connect('sqlite-wasm');
      this.patch({ restore: { kind: 'success', sha256 } });
    } catch (error) {
      this.patch({ restore: { kind: 'failed', failure: { kind: 'reconnect', error }, needsCleanup: false } });
    }
  }
}
