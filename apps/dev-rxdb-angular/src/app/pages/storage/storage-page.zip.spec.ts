import { describe, expect, it, vi } from 'vitest';
import { addEntryToZip, downloadEntriesAsZip, ensureZipDirectory, isZipDirectory } from './storage-page.zip';
import type { StorageBrowserItem } from './utils/storage-utils';

describe('ensureZipDirectory', () => {
  it('creates nested directory nodes', () => {
    const zipTree = {};
    const nested = ensureZipDirectory(zipTree, ['docs', 'api']);

    expect(isZipDirectory(zipTree['docs'])).toBe(true);
    expect(nested).toBe((zipTree['docs'] as Record<string, unknown>)['api']);
  });
});

describe('addEntryToZip', () => {
  it('skips files without metadata', async () => {
    const storage = {
      listEntries: vi.fn(),
      read: vi.fn()
    };

    const fileCount = await addEntryToZip(storage, {}, { kind: 'file', name: 'ghost', path: '/ghost' }, ['ghost']);

    expect(fileCount).toBe(0);
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('walks directory children through listEntries', async () => {
    const meta = {
      id: 'file-1',
      name: 'readme.md',
      mimeType: 'text/markdown',
      size: 4,
      opfsPath: 'docs/readme.md',
      contentVersion: 1
    };
    const storage = {
      listEntries: vi.fn().mockResolvedValue([
        {
          kind: 'file',
          name: 'readme.md',
          path: '/docs/readme.md',
          meta
        }
      ]),
      read: vi.fn().mockResolvedValue(new Blob(['ok']))
    };

    const directory: StorageBrowserItem = { kind: 'directory', name: 'docs', path: '/docs' };
    const zipTree = {};
    const fileCount = await addEntryToZip(storage, zipTree, directory, ['docs']);

    expect(fileCount).toBe(1);
    expect(storage.listEntries).toHaveBeenCalledWith({ path: '/docs' });
    expect(storage.read).toHaveBeenCalledWith('file-1');
  });
});

describe('downloadEntriesAsZip', () => {
  it('downloads an empty folder as a zero-file zip', async () => {
    const storage = {
      listEntries: vi.fn().mockResolvedValue([]),
      read: vi.fn()
    };
    const createObjectURL = vi.fn().mockReturnValue('blob:zip');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;

    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return { click, download: '', href: '' } as HTMLAnchorElement;
      }
      return document.createElement(tagName);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(node => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation(node => node);

    const fileCount = await downloadEntriesAsZip(
      storage,
      [{ kind: 'directory', name: 'empty', path: '/empty' }],
      'empty.zip'
    );

    expect(fileCount).toBe(0);
    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();

    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreate });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevoke });
  });
});
