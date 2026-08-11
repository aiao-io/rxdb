import { describe, expect, it } from 'vitest';
import { chunk } from '../../array/chunk.js';

describe('chunk', () => {
  it('should split array into chunks of specified size', () => {
    const result = chunk(['a', 'b', 'c', 'd'], 2);
    expect(result).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ]);
  });

  it('should return an empty array when given an empty array', () => {
    expect(chunk([], 2)).toEqual([]);
  });

  it('should return the original array as a single chunk when size is greater than array length', () => {
    expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
  });

  it('should return an array of single-element arrays when size is 1', () => {
    expect(chunk([1, 2, 3, 4], 1)).toEqual([[1], [2], [3], [4]]);
  });

  it('should handle last chunk with fewer elements than chunk size', () => {
    expect(chunk([1, 2, 3, 4, 5], 3)).toEqual([
      [1, 2, 3],
      [4, 5]
    ]);
  });

  it('should work with different data types', () => {
    expect(chunk(['a', 1, true, null, undefined], 2)).toEqual([['a', 1], [true, null], [undefined]]);
  });

  it('should reject non-positive chunk sizes', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow(RangeError);
    expect(() => chunk([1, 2, 3], -1)).toThrow(RangeError);
  });
});
