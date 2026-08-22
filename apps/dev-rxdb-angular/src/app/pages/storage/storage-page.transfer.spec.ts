import { STORAGE_LABELS } from '@aiao/utils';
import { describe, expect, it, vi } from 'vitest';
import { StoragePageTransfer } from './storage-page.transfer';
import type { StorageBrowserItem } from './utils/storage-utils';

function fileWithName(name: string, relativePath = ''): File {
  const file = new File(['ok'], name, { type: 'text/plain' });
  if (relativePath) {
    Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  }
  return file;
}

describe('StoragePageTransfer', () => {
  it('refreshes once after a successful file upload', async () => {
    const storage = {
      upload: vi.fn().mockResolvedValue(undefined),
      download: vi.fn()
    };
    const refresh = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    const transfer = new StoragePageTransfer(storage, {
      currentPath: () => '/',
      findExistingFileEntry: () => null,
      refresh,
      showToast
    });

    await transfer.handleUpload([fileWithName('readme.md')]);

    expect(storage.upload).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(showToast).toHaveBeenCalledWith(STORAGE_LABELS.UPLOAD_SUCCESS, 'success');
  });

  it('does not refresh when no file is uploaded', async () => {
    const refresh = vi.fn();
    const transfer = new StoragePageTransfer(
      { upload: vi.fn(), download: vi.fn(), listEntries: vi.fn(), read: vi.fn() },
      {
        currentPath: () => '/',
        findExistingFileEntry: () => null,
        refresh,
        showToast: vi.fn()
      }
    );

    await transfer.handleUpload([]);

    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes once after a folder upload even when some files fail', async () => {
    const storage = {
      upload: vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined),
      download: vi.fn(),
      listEntries: vi.fn(),
      read: vi.fn()
    };
    const refresh = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    const transfer = new StoragePageTransfer(storage, {
      currentPath: () => '/',
      findExistingFileEntry: () => null,
      refresh,
      showToast
    });

    await transfer.handleUploadFolder([fileWithName('a.txt', 'folder/a.txt'), fileWithName('b.txt', 'folder/b.txt')]);

    expect(refresh).toHaveBeenCalledOnce();
    expect(showToast).toHaveBeenCalledWith('Upload finished: 1 succeeded, 1 failed', 'error');
  });

  it('asks the resolver before overwriting an existing file', async () => {
    const existing: StorageBrowserItem = {
      kind: 'file',
      name: 'readme.md',
      path: '/readme.md',
      meta: { id: '1', name: 'readme.md', size: 1, mimeType: 'text/plain', opfsPath: 'readme.md' } as never
    };
    const storage = {,
      listEntries: vi.fn(),
      read: vi.fn()
      upload: vi.fn().mockResolvedValue(undefined),
      download: vi.fn()
    };
    const refresh = vi.fn().mockResolvedValue(undefined);
    const resolveOverwrite = vi.fn().mockResolvedValue(false);
    const transfer = new StoragePageTransfer(storage, {
      currentPath: () => '/',
      findExistingFileEntry: () => existing,
      refresh,
      showToast: vi.fn(),
      resolveOverwrite
    });

    await transfer.handleUpload([fileWithName('readme.md')]);

    expect(resolveOverwrite).toHaveBeenCalledOnce();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
