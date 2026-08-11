import { describe, expect, it } from 'vitest';
import { findExistingFilePaths } from './find-path-conflicts';

interface DirectoryFixture {
  directories?: Record<string, DirectoryFixture>;
  files?: string[];
}

function createDirectoryHandle(fixture: DirectoryFixture): FileSystemDirectoryHandle {
  return {
    getDirectoryHandle: async (name: string) => {
      const child = fixture.directories?.[name];
      if (!child) throw new DOMException('missing', 'NotFoundError');
      return createDirectoryHandle(child);
    },
    getFileHandle: async (name: string) => {
      if (!fixture.files?.includes(name)) throw new DOMException('missing', 'NotFoundError');
      return { kind: 'file', name } as FileSystemFileHandle;
    }
  } as unknown as FileSystemDirectoryHandle;
}

describe('findExistingFilePaths', () => {
  it('返回所有已存在的嵌套目标文件', async () => {
    const root = createDirectoryHandle({
      directories: {
        upload: {
          files: ['a.txt'],
          directories: { nested: { files: ['b.txt'] } }
        }
      }
    });

    await expect(
      findExistingFilePaths(root, ['upload/a.txt', 'upload/new.txt', 'upload/nested/b.txt'])
    ).resolves.toEqual(['upload/a.txt', 'upload/nested/b.txt']);
  });

  it('目录不存在时视为无冲突', async () => {
    const root = createDirectoryHandle({});
    await expect(findExistingFilePaths(root, ['new/path/file.txt'])).resolves.toEqual([]);
  });
});
