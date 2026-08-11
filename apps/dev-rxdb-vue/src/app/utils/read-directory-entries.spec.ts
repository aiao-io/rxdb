import { describe, expect, it, vi } from 'vitest';
import { readDirectoryEntries } from './read-directory-entries';

describe('readDirectoryEntries', () => {
  it('reads all directory batches', async () => {
    const first = { name: 'first' } as FileSystemEntry;
    const second = { name: 'second' } as FileSystemEntry;
    const batches = [[first], [second], []];
    const reader = {
      readEntries: vi.fn((success: FileSystemEntriesCallback) => success(batches.shift() ?? []))
    } as unknown as FileSystemDirectoryReader;

    await expect(readDirectoryEntries(reader)).resolves.toEqual([first, second]);
    expect(reader.readEntries).toHaveBeenCalledTimes(3);
  });
});
