import { describe, expect, it } from 'vitest';
import { intersection } from '../../array/index.js';

describe('intersection', () => {
  it('1', () => {
    const actual = intersection([1, 2, 3], [2, 3, 4]);
    expect(actual).toEqual([2, 3]);
  });

  it('should return an empty array when called without arguments', () => {
    expect(intersection()).toEqual([]);
  });
});
