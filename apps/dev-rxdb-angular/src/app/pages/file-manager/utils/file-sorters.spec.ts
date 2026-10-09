import { describe, expect, it } from 'vitest';
import { getSortComparator, SortMode } from './file-sorters';

describe('getSortComparator', () => {
  it('Manual 返回 null（保留查询顺序）', () => {
    expect(getSortComparator(SortMode.Manual)).toBeNull();
  });

  it('其余模式返回比较器', () => {
    const a = { name: 'a', type: 'file' as const };
    const b = { name: 'b', type: 'file' as const };

    for (const mode of Object.values(SortMode).filter(mode => mode !== SortMode.Manual)) {
      expect(getSortComparator(mode)).toBeTypeOf('function');
    }
    expect(getSortComparator(SortMode.NameAsc)?.(a, b)).toBeLessThan(0);
    expect(getSortComparator(SortMode.NameDesc)?.(a, b)).toBeGreaterThan(0);
  });
});
