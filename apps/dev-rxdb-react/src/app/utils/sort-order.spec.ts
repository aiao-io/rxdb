import { generateKeyBetween } from '@aiao/utils';
import { describe, expect, it } from 'vitest';
import { compareSortOrder } from './sort-order';

describe('compareSortOrder', () => {
  it('按码点字典序比较，与数据库顺序一致而不是 localeCompare', () => {
    const first = generateKeyBetween(null, null);
    const last = generateKeyBetween(first, null);
    const middle = generateKeyBetween(first, last);
    const afterMiddle = generateKeyBetween(middle, last);
    const nodes = [last, afterMiddle, middle, first].map(sortOrder => ({ sortOrder }));

    const sorted = nodes.sort(compareSortOrder).map(node => node.sortOrder);

    expect(sorted).toEqual(['a0', 'a0V', 'a0l', 'a1']);
  });

  it('缺键视为空串，排在最前', () => {
    const nodes = [{ sortOrder: 'a0' }, { sortOrder: null }, {}];

    const sorted = nodes.sort(compareSortOrder);

    expect(sorted.map(node => node.sortOrder ?? null)).toEqual([null, null, 'a0']);
  });
});
