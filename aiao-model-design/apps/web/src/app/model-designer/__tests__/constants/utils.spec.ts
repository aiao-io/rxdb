import { describe, expect, it } from 'vitest';
import { toggleArrayItem } from '../../constants/utils';

describe('toggleArrayItem', () => {
  it('MUST add item when not present', () => {
    expect(toggleArrayItem([1, 2, 3], 4)).toEqual([1, 2, 3, 4]);
  });

  it('MUST remove item when present', () => {
    expect(toggleArrayItem([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('MUST not mutate the original array', () => {
    const original = [1, 2, 3];
    toggleArrayItem(original, 2);
    expect(original).toEqual([1, 2, 3]);
  });

  it('MUST handle empty array', () => {
    expect(toggleArrayItem([], 'a')).toEqual(['a']);
  });

  it('MUST work with strings', () => {
    expect(toggleArrayItem(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleArrayItem(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });
});
