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
});
