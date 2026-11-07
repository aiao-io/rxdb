import { RxDBBackupError } from '@aiao/rxdb';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { createWorkbenchI18n } from '../i18n/workbench-i18n';
import { BackupController, restoreFailureMessage } from './backup-controller';

vi.mock('./backup-ops', async original => ({
  ...(await original<typeof import('./backup-ops')>()),
  downloadBlob: vi.fn()
}));

function fixture() {
  const adapter = {
    backup: vi.fn().mockResolvedValue({ sha256: 'backup-sha', bytes: 7 }),
    restore: vi.fn().mockResolvedValue({ sha256: 'restore-sha' }),
    cleanupIncompleteRestore: vi.fn().mockResolvedValue(true)
  };
  const database = {
    getAdapter: vi.fn().mockResolvedValue(adapter),
    adapterConnected$: vi.fn().mockReturnValue(of(false)),
    connect: vi.fn().mockResolvedValue(undefined)
  };
  const i18n = createWorkbenchI18n();
  const controller = new BackupController(database, i18n);
  const file = new File(['archive'], 'test.rxdb-backup');
  Object.defineProperty(file, 'stream', { value: () => new ReadableStream<Uint8Array>() });
  return { adapter, database, i18n, controller, file };
}

describe('备份恢复控制器', () => {
  it('不选择文件不创建适配器，也不连接数据库', async () => {
    const { controller, database } = fixture();
    await controller.restore(undefined);
    expect(database.getAdapter).not.toHaveBeenCalled();
    expect(database.connect).not.toHaveBeenCalled();
    expect((await firstValueFrom(controller.state)).busy).toBe(false);
  });
  it('备份成功保留摘要并恢复可操作状态', async () => {
    const { controller, adapter } = fixture();
    await controller.backup();
    expect(adapter.backup).toHaveBeenCalledOnce();
    expect(controller.state.value).toMatchObject({
      busy: false,
      backup: { kind: 'success', sha256: 'backup-sha', bytes: 7 }
    });
  });
  it('操作未完成时阻止重复备份、恢复和清理', async () => {
    const { controller, adapter, file } = fixture();
    let finish: (() => void) | undefined;
    adapter.backup.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = () => resolve({ sha256: 'sha', bytes: 0 });
        })
    );
    const pending = controller.backup();
    await vi.waitFor(() => expect(adapter.backup).toHaveBeenCalledOnce());
    await Promise.all([controller.backup(), controller.restore(file), controller.cleanup()]);
    expect(adapter.backup).toHaveBeenCalledOnce();
    expect(adapter.restore).not.toHaveBeenCalled();
    expect(adapter.cleanupIncompleteRestore).not.toHaveBeenCalled();
    finish?.();
    await pending;
    expect(controller.state.value.busy).toBe(false);
  });
  it('恢复成功后连接数据库', async () => {
    const { controller, adapter, database, file } = fixture();
    await controller.restore(file);
    expect(adapter.restore).toHaveBeenCalledOnce();
    expect(database.connect).toHaveBeenCalledWith('sqlite-wasm');
    expect(controller.state.value.restore).toEqual({ kind: 'success', sha256: 'restore-sha' });
  });
  it('已经连接时拒绝恢复，不写入已有数据库', async () => {
    const { controller, adapter, database, file } = fixture();
    database.adapterConnected$.mockReturnValue(of(true));
    await controller.restore(file);
    expect(adapter.restore).not.toHaveBeenCalled();
    expect(controller.state.value.restore).toEqual({
      kind: 'failed',
      failure: { kind: 'initialized' },
      needsCleanup: false
    });
  });
  it.each(['restore_incomplete', 'cleanup_pending'] as const)('%s 保留清理入口，清理失败后仍可重试', async code => {
    const { controller, adapter, file } = fixture();
    adapter.restore.mockRejectedValue(new RxDBBackupError(code, 'restore failed'));
    await controller.restore(file);
    expect(controller.state.value.restore).toMatchObject({ kind: 'failed', needsCleanup: true });
    adapter.cleanupIncompleteRestore.mockRejectedValueOnce(new Error('cleanup failed'));
    await controller.cleanup();
    expect(controller.state.value.restore).toMatchObject({ kind: 'failed', needsCleanup: true });
    await controller.cleanup();
    expect(controller.state.value.restore).toEqual({ kind: 'idle' });
  });
  it('恢复后的重连错误单独展示，不误报恢复成功', async () => {
    const { controller, database, file, i18n } = fixture();
    const error = new Error('cannot connect');
    database.connect.mockRejectedValue(error);
    await controller.restore(file);
    expect(controller.state.value.restore).toEqual({
      kind: 'failed',
      failure: { kind: 'reconnect', error },
      needsCleanup: false
    });
    expect(restoreFailureMessage({ kind: 'reconnect', error }, i18n.t)).toContain('cannot connect');
  });
  it('失败原因保留原始错误，语言变化后可重新翻译', async () => {
    const { controller, adapter, i18n } = fixture();
    const error = new RxDBBackupError('io_error', 'write failed');
    adapter.backup.mockRejectedValue(error);
    await controller.backup();
    expect(controller.state.value.backup).toEqual({ kind: 'failed', error });
    expect(restoreFailureMessage({ kind: 'initialized' }, i18n.t)).toBe(i18n.t('backup.error.target_busy'));
    await i18n.setLocale('en');
    expect(restoreFailureMessage({ kind: 'initialized' }, i18n.t)).toBe(i18n.t('backup.error.target_busy'));
    expect(restoreFailureMessage({ kind: 'operation', error }, i18n.t)).toBe(i18n.t('backup.error.io_error'));
  });
});
