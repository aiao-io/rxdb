import type { SortableFileNode } from '@aiao/rxdb-test/entities';
import { describe, expect, it } from 'vitest';
import { getSortComparator, SortMode } from './file-sorters';

const makeFile = (
  name: string,
  type: 'file' | 'folder',
  sortOrder: string,
  extra: Partial<Pick<SortableFileNode, 'extension' | 'size'>> = {}
): SortableFileNode => ({ name, type, sortOrder, ...extra }) as SortableFileNode;

describe('getSortComparator', () => {
  it('Manual 返回 null（保留查询顺序）', () => {
    // 手动顺序就是引擎的默认排序给出的查询顺序：页面不再排序，也不再文件夹优先
    expect(getSortComparator(SortMode.Manual)).toBeNull();
  });

  it('所有页面共享同一套排序语义和中文 locale', () => {
    const files = [
      makeFile('zeta', 'file', 'a0', { extension: '.txt', size: 20 }),
      makeFile('阿尔法', 'folder', 'z1', { extension: null, size: 0 }),
      makeFile('beta', 'file', 'a1', { extension: '.md', size: 10 })
    ];

    const modes: SortMode[] = [
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
      const comparator = getSortComparator(mode);
      if (comparator === null) throw new Error(`${mode} 应有比较器`);
      const first = [...files].sort(comparator).map(file => file.name);
      const second = [...files].sort(comparator).map(file => file.name);
      expect(second, mode).toEqual(first);
    }

    const nameAsc = getSortComparator(SortMode.NameAsc);
    if (nameAsc === null) throw new Error('NameAsc 应有比较器');
    expect([...files].sort(nameAsc).map(file => file.name)).toEqual(['阿尔法', 'beta', 'zeta']);
  });
});
