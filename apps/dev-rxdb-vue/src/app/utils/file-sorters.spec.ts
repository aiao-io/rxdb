import { describe, expect, it } from 'vitest';
import { getSortComparator, SortMode } from './file-sorters';

describe('getSortComparator', () => {
  it('Manual 返回 null（保留查询顺序）', () => {
    expect(getSortComparator(SortMode.Manual)).toBeNull();
  });

  it('其余模式返回比较器', () => {
    for (const mode of Object.values(SortMode).filter(value => value !== SortMode.Manual)) {
      expect(getSortComparator(mode)).toBeTypeOf('function');
    }
  });

  it('使用调用方传入的界面语言比较名称', () => {
    const comparator = getSortComparator(SortMode.NameAsc, 'en-US');
    if (comparator === null) throw new Error('NameAsc 应有比较器');

    const left = { name: 'a', type: 'file' as const };
    const right = { name: 'b', type: 'file' as const };
    expect(comparator(left, right)).toBe(left.name.localeCompare(right.name, 'en-US'));
  });
});
