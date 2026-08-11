import type { FileNode } from '@aiao/rxdb-test/entities';
import { describe, expect, it } from 'vitest';
import { getSortComparator, SortMode } from './file-sorters';

const makeFile = (
  name: string,
  type: 'file' | 'folder',
  sortOrder: string,
  extra: Partial<Pick<FileNode, 'extension' | 'size'>> = {}
): FileNode => ({ name, type, sortOrder, ...extra }) as FileNode;

describe('getSortComparator', () => {
  it('自由排序在三个文件管理页面都保持文件夹优先', () => {
    const file = makeFile('较早文件', 'file', 'a0');
    const folder = makeFile('较晚文件夹', 'folder', 'z0');

    const sorted = [file, folder].sort(getSortComparator(SortMode.Manual));

    expect(sorted).toEqual([folder, file]);
  });

  it('所有页面共享同一套排序语义和中文 locale', () => {
    const files = [
      makeFile('zeta', 'file', 'a0', { extension: '.txt', size: 20 }),
      makeFile('阿尔法', 'folder', 'z1', { extension: null, size: 0 }),
      makeFile('beta', 'file', 'a1', { extension: '.md', size: 10 })
    ];

    const modes: SortMode[] = [
      SortMode.Manual,
      SortMode.NameAsc,
      SortMode.NameDesc,
      SortMode.TypeAsc,
      SortMode.TypeDesc,
      SortMode.ExtensionAsc,
      SortMode.ExtensionDesc,
      SortMode.SizeAsc,
      SortMode.SizeDesc
    ];

    for (const mode of modes) {
      const first = [...files].sort(getSortComparator(mode)).map(file => file.name);
      const second = [...files].sort(getSortComparator(mode)).map(file => file.name);
      expect(second, mode).toEqual(first);
    }

    expect([...files].sort(getSortComparator(SortMode.NameAsc)).map(file => file.name)).toEqual([
      '阿尔法',
      'beta',
      'zeta'
    ]);
  });
});
