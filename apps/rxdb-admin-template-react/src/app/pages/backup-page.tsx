import { isRxDBBackupError } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { useRxDB } from '@aiao/rxdb-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { firstValueFrom } from 'rxjs';
import {
  backupDownloadName,
  backupErrorMessage,
  collectBackup,
  downloadBlob,
  RESTORE_TARGET_INITIALIZED_MESSAGE
} from '../backup/backup-ops';

type BackupStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; sha256: string; bytes: number }
  | { kind: 'failed'; message: string };

type RestoreStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; sha256: string }
  | { kind: 'failed'; message: string; needsCleanup: boolean };

/**
 * 备份 / 恢复页（US-527）：备份产出可下载归档；恢复只支持空工作台
 * （引擎契约：恢复必须在 connect 之前、只写空目标，已有数据时报 target_busy），
 * 失败给出可读原因并保留当前数据。
 */
export default function BackupPage() {
  const db = useRxDB();
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
      downloadBlob(collected.blob, backupDownloadName());
      setBackup({ kind: 'success', sha256: collected.sha256, bytes: collected.bytes });
    } catch (error) {
      setBackup({ kind: 'failed', message: backupErrorMessage(error) });
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
          message: RESTORE_TARGET_INITIALIZED_MESSAGE,
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
          message: `恢复已完成，但工作台重新连接失败：${backupErrorMessage(connectError)}。请刷新页面后继续`,
          needsCleanup: false
        });
        return;
      }
      setRestore({ kind: 'success', sha256: result.sha256 });
    } catch (error) {
      setRestore({
        kind: 'failed',
        message: backupErrorMessage(error),
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
      setRestore({ kind: 'failed', message: backupErrorMessage(error), needsCleanup: true });
    }
  }

  return (
    <div className='page-host gap-4 overflow-auto p-6' aria-busy={busy}>
      <h2 className='text-base font-semibold'>备份</h2>
      <section className='bg-base-200 rounded-box flex flex-col gap-2 p-4'>
        <p className='text-sm opacity-80'>
          把工作台的全部数据导出为一致性归档文件。换设备或浏览器清数据后，可在空工作台用下方「恢复」导入。
        </p>
        <button
          className='btn btn-primary w-fit'
          disabled={busy}
          onClick={() => void runExclusive(handleBackup)}
          data-testid='backup-start'
        >
          {backup.kind === 'running' ?
            <>
              <span className='loading loading-spinner loading-sm'></span>备份中…
            </>
          : '备份并下载'}
        </button>
        <div data-testid='backup-result'>
          {backup.kind === 'success' && (
            <span className='text-success'>
              备份成功：{backup.bytes} 字节，sha256 {backup.sha256}
            </span>
          )}
          {backup.kind === 'failed' && (
            <span className='text-error' role='alert'>
              {backup.message}
            </span>
          )}
        </div>
      </section>

      <h2 className='text-base font-semibold'>恢复</h2>
      <section className='bg-base-200 rounded-box flex flex-col gap-2 p-4'>
        <p className='text-sm opacity-80'>
          从归档文件恢复整个工作台。请在新浏览器环境中打开首页，先选择「从备份恢复」，再导入归档。
          已打开实体列表、搜索或执行过备份的工作台不能直接恢复，已有数据保持不变。
        </p>
        <input
          disabled={busy}
          type='file'
          className='file-input file-input-bordered w-full max-w-sm'
          data-testid='restore-input'
          aria-label='选择备份归档'
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
              <span className='loading loading-spinner loading-sm'></span>处理中…
            </span>
          )}
          {restore.kind === 'success' && (
            <span className='text-success'>
              恢复成功（sha256 {restore.sha256}），
              <Link className='link' to='/entities'>
                去实体列表继续编辑
              </Link>
            </span>
          )}
          {restore.kind === 'failed' && (
            <span className='text-error' role='alert'>
              {restore.message}
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
            清理恢复残留
          </button>
        )}
      </section>
    </div>
  );
}
