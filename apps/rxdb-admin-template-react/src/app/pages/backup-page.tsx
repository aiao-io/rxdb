import { isRxDBBackupError } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import type { I18n } from '@aiao/rxdb-i18n';
import { useI18n } from '@aiao/rxdb-i18n-react';
import { useRxDB } from '@aiao/rxdb-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { firstValueFrom } from 'rxjs';
import { backupDownloadName, backupErrorMessage, collectBackup, downloadBlob } from '../backup/backup-ops';

type BackupStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; sha256: string; bytes: number }
  | { kind: 'failed'; error: unknown };

type RestoreFailure = { kind: 'initialized' } | { kind: 'operation' | 'reconnect'; error: unknown };

type RestoreStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; sha256: string }
  | { kind: 'failed'; failure: RestoreFailure; needsCleanup: boolean };

function restoreFailureMessage(failure: RestoreFailure, t: I18n['t']): string {
  if (failure.kind === 'initialized') return t('backup.error.target_busy');
  const message = backupErrorMessage(failure.error, t);
  return failure.kind === 'reconnect' ? t('backup.reconnectFailed', { message }) : message;
}

/**
 * 备份 / 恢复页（US-527）：备份产出可下载归档；恢复只支持空工作台
 * （引擎契约：恢复必须在 connect 之前、只写空目标，已有数据时报 target_busy），
 * 失败给出可读原因并保留当前数据。
 */
export default function BackupPage() {
  const db = useRxDB();
  const { t, formatNumber } = useI18n();
  const [backup, setBackup] = useState<BackupStatus>({ kind: 'idle' });
  const [restore, setRestore] = useState<RestoreStatus>({ kind: 'idle' });
  const operationPending = useRef(false);
  const busy = backup.kind === 'running' || restore.kind === 'running';

  async function runExclusive(operation: () => Promise<void>): Promise<void> {
    if (operationPending.current) return;
    operationPending.current = true;
    try {
      await operation();
    } finally {
      operationPending.current = false;
    }
  }

  const adapterOf = async (): Promise<RxDBAdapterSqlite> => (await db.getAdapter('sqlite-wasm')) as RxDBAdapterSqlite;

  async function handleBackup(): Promise<void> {
    setBackup({ kind: 'running' });
    try {
      const collected = await collectBackup(await adapterOf());
      downloadBlob(collected.blob, backupDownloadName(new Date(), t('backup.filePrefix')));
      setBackup({ kind: 'success', sha256: collected.sha256, bytes: collected.bytes });
    } catch (error) {
      setBackup({ kind: 'failed', error });
    }
  }

  async function handleRestoreFile(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    setRestore({ kind: 'running' });
    try {
      const adapter = await adapterOf();
      const connected = await firstValueFrom(db.adapterConnected$('sqlite-wasm'));
      if (connected) {
        setRestore({
          kind: 'failed',
          failure: { kind: 'initialized' },
          needsCleanup: false
        });
        return;
      }
      const result = await adapter.restore(file.stream());
      try {
        await db.connect('sqlite-wasm');
      } catch (connectError) {
        setRestore({
          kind: 'failed',
          failure: { kind: 'reconnect', error: connectError },
          needsCleanup: false
        });
        return;
      }
      setRestore({ kind: 'success', sha256: result.sha256 });
    } catch (error) {
      setRestore({
        kind: 'failed',
        failure: { kind: 'operation', error },
        needsCleanup: isRxDBBackupError(error, 'restore_incomplete') || isRxDBBackupError(error, 'cleanup_pending')
      });
    }
  }

  async function handleCleanup(): Promise<void> {
    setRestore({ kind: 'running' });
    try {
      await (await adapterOf()).cleanupIncompleteRestore();
      setRestore({ kind: 'idle' });
    } catch (error) {
      // 清理失败也保留清理入口：按钮是页面唯一的清理途径，消失会让恢复流程死锁
      setRestore({ kind: 'failed', failure: { kind: 'operation', error }, needsCleanup: true });
    }
  }

  return (
    <div className='page-host gap-4 overflow-auto p-6' aria-busy={busy}>
      <h2 className='text-base font-semibold'>{t('backup.title')}</h2>
      <section className='bg-base-200 rounded-box flex flex-col gap-2 p-4'>
        <p className='text-sm opacity-80'>{t('backup.description')}</p>
        <button
          className='btn btn-primary w-fit'
          disabled={busy}
          onClick={() => void runExclusive(handleBackup)}
          data-testid='backup-start'
        >
          {backup.kind === 'running' ?
            <>
              <span className='loading loading-spinner loading-sm'></span>
              {t('backup.running')}
            </>
          : t('backup.download')}
        </button>
        <div data-testid='backup-result'>
          {backup.kind === 'success' && (
            <span className='text-success'>
              {t('backup.success', { bytes: formatNumber(backup.bytes), sha256: backup.sha256 })}
            </span>
          )}
          {backup.kind === 'failed' && (
            <span className='text-error' role='alert'>
              {backupErrorMessage(backup.error, t)}
            </span>
          )}
        </div>
      </section>

      <h2 className='text-base font-semibold'>{t('backup.restoreTitle')}</h2>
      <section className='bg-base-200 rounded-box flex flex-col gap-2 p-4'>
        <p className='text-sm opacity-80'>{t('backup.restoreDescription')}</p>
        <input
          disabled={busy}
          type='file'
          className='file-input file-input-bordered w-full max-w-sm'
          data-testid='restore-input'
          aria-label={t('backup.selectArchive')}
          onChange={event => {
            const file = event.target.files?.[0];
            // 清空 value：同一归档再次选择才会再次触发 change
            event.target.value = '';
            void runExclusive(() => handleRestoreFile(file));
          }}
        />
        <div data-testid='restore-result'>
          {restore.kind === 'running' && (
            <span>
              <span className='loading loading-spinner loading-sm'></span>
              {t('backup.processing')}
            </span>
          )}
          {restore.kind === 'success' && (
            <span className='text-success'>
              {t('backup.restored', { sha256: restore.sha256 })}
              <Link className='link' to='/entities'>
                {t('backup.continue')}
              </Link>
            </span>
          )}
          {restore.kind === 'failed' && (
            <span className='text-error' role='alert'>
              {restoreFailureMessage(restore.failure, t)}
            </span>
          )}
        </div>
        {restore.kind === 'failed' && restore.needsCleanup && (
          <button
            className='btn btn-outline btn-warning w-fit'
            disabled={busy}
            onClick={() => void runExclusive(handleCleanup)}
            data-testid='restore-cleanup'
          >
            {t('backup.cleanup')}
          </button>
        )}
      </section>
    </div>
  );
}
