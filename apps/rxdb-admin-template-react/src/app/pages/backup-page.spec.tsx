import { RxDBBackupError } from '@aiao/rxdb';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BackupPage from './backup-page';

const mocks = vi.hoisted(() => ({
  getAdapter: vi.fn(),
  connect: vi.fn(),
  adapterConnected$: vi.fn(),
  backup: vi.fn(),
  restore: vi.fn(),
  cleanupIncompleteRestore: vi.fn()
}));

vi.mock('@aiao/rxdb-react', () => ({ useRxDB: () => mocks }));
vi.mock('../backup/backup-ops', async importOriginal => ({
  ...(await importOriginal<typeof import('../backup/backup-ops')>()),
  downloadBlob: vi.fn()
}));

function archive(): File {
  const file = new File(['archive'], 'workbench.rxdb-backup');
  Object.defineProperty(file, 'stream', { value: () => new ReadableStream() });
  return file;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BackupPage />
    </MemoryRouter>
  );
}

describe('备份恢复操作互斥', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getAdapter.mockResolvedValue(mocks);
    mocks.connect.mockResolvedValue(undefined);
    mocks.adapterConnected$.mockReturnValue(of(false));
  });

  afterEach(cleanup);

  it('恢复期间禁用备份和文件输入，重复选择不会发起第二次恢复', async () => {
    const pending = Promise.withResolvers<{ sha256: string }>();
    mocks.restore.mockReturnValue(pending.promise);
    const view = renderPage();
    const input = view.getByTestId('restore-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [archive()] } });
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledTimes(1));

    expect(input.disabled).toBe(true);
    expect((view.getByTestId('backup-start') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { files: [archive()] } });
    await act(async () => undefined);
    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('restore-result').textContent).toContain('处理中');

    await act(async () => pending.resolve({ sha256: 'first-archive' }));
    await waitFor(() => expect(view.getByTestId('restore-result').textContent).toContain('first-archive'));
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(input.disabled).toBe(false);
  });

  it('备份期间不能发起恢复，失败后解除互斥并允许重试', async () => {
    const pending = Promise.withResolvers<{ sha256: string; bytes: number }>();
    mocks.backup.mockReturnValueOnce(pending.promise);
    const view = renderPage();
    fireEvent.click(view.getByTestId('backup-start'));
    await waitFor(() => expect(mocks.backup).toHaveBeenCalledTimes(1));
    const input = view.getByTestId('restore-input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    fireEvent.change(input, { target: { files: [archive()] } });
    await act(async () => undefined);
    expect(mocks.restore).not.toHaveBeenCalled();

    await act(async () => pending.reject(new RxDBBackupError('io_error', 'write failed')));
    await waitFor(() => expect(view.getByTestId('backup-result').textContent).toContain('文件读写失败'));
    expect(input.disabled).toBe(false);
    mocks.restore.mockResolvedValueOnce({ sha256: 'retry' });
    fireEvent.change(input, { target: { files: [archive()] } });
    await waitFor(() => expect(view.getByTestId('restore-result').textContent).toContain('恢复成功'));
  });

  it('清理恢复残留期间禁用备份和恢复，清理失败仍保留重试入口', async () => {
    const pending = Promise.withResolvers<boolean>();
    mocks.restore.mockRejectedValueOnce(new RxDBBackupError('restore_incomplete', 'interrupted'));
    mocks.cleanupIncompleteRestore.mockReturnValueOnce(pending.promise);
    const view = renderPage();
    fireEvent.change(view.getByTestId('restore-input'), { target: { files: [archive()] } });
    await waitFor(() => expect(view.queryByTestId('restore-cleanup')).not.toBeNull());
    fireEvent.click(view.getByTestId('restore-cleanup'));
    await waitFor(() => expect(mocks.cleanupIncompleteRestore).toHaveBeenCalledTimes(1));
    expect((view.getByTestId('restore-input') as HTMLInputElement).disabled).toBe(true);
    expect((view.getByTestId('backup-start') as HTMLButtonElement).disabled).toBe(true);

    await act(async () => pending.reject(new RxDBBackupError('io_error', 'cleanup failed')));
    await waitFor(() => expect(view.queryByTestId('restore-cleanup')).not.toBeNull());
    expect((view.getByTestId('restore-input') as HTMLInputElement).disabled).toBe(false);
  });

  it('已初始化的工作台给出新浏览器环境指引，不承诺刷新后可以恢复', async () => {
    mocks.adapterConnected$.mockReturnValue(of(true));
    const view = renderPage();
    fireEvent.change(view.getByTestId('restore-input'), { target: { files: [archive()] } });
    await waitFor(() => expect(view.getByTestId('restore-result').textContent).toContain('新浏览器'));
    expect(view.getByTestId('restore-result').textContent).not.toContain('刷新页面后');
    expect(mocks.restore).not.toHaveBeenCalled();
  });
});
