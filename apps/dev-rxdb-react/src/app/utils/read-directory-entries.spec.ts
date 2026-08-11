import { describe, expect, it, vi } from 'vitest';
import { readAllDirectoryEntries } from './read-directory-entries';

describe('readAllDirectoryEntries', () => {
  it('读取所有批次直到空批次', async () => {
    const first = [{ name: 'a' }] as FileSystemEntry[];
    const second = [{ name: 'b' }] as FileSystemEntry[];
    const batches = [first, second, []];
    const reader = {
      readEntries: vi.fn((success: FileSystemEntriesCallback) => success(batches.shift() ?? []))
    } as unknown as FileSystemDirectoryReader;

    await expect(readAllDirectoryEntries(reader)).resolves.toEqual([...first, ...second]);
    expect(reader.readEntries).toHaveBeenCalledTimes(3);
  });
});
