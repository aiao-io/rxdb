import { describe, expect, it } from 'vitest';
import { sortBy } from '../../array/sortBy.js';

describe('sortBy', () => {
  it('should sort array by string property in ascending order', () => {
    const data = [
      { a: 'c', b: 3 },
      { a: 'a', b: 1 },
      { a: 'b', b: 2 }
    ];
    const result = [...data].sort(sortBy('a'));
    expect(result).toEqual([
      { a: 'a', b: 1 },
      { a: 'b', b: 2 },
      { a: 'c', b: 3 }
    ]);
  });

  it('should sort array by numeric property in ascending order', () => {
    const data = [
      { a: 'a', b: 3 },
      { a: 'b', b: 1 },
      { a: 'c', b: 2 }
    ];
    const result = [...data].sort(sortBy('b'));
    expect(result).toEqual([
      { a: 'b', b: 1 },
      { a: 'c', b: 2 },
      { a: 'a', b: 3 }
    ]);
  });

  it('should handle null and undefined values', () => {
    const data = [
      { a: 'b', b: null },
      { a: 'a', b: 2 },
      { a: 'c', b: undefined },
      { a: 'd', b: 1 }
    ];
    const result = [...data].sort(sortBy('b'));
    expect(result).toEqual([
      { a: 'd', b: 1 },
      { a: 'a', b: 2 },
      { a: 'b', b: null },
      { a: 'c', b: undefined }
    ]);
  });

  it('should handle missing properties', () => {
    const data = [
      { a: 'b', b: 2 },
      { a: 'a' }, // 缺少属性 b
      { a: 'c', b: 1 }
    ];
    const result = [...data].sort(sortBy('b'));
    expect(result).toEqual([
      { a: 'c', b: 1 },
      { a: 'b', b: 2 },
      { a: 'a' } // 缺少属性 b
    ]);
  });

  it('should handle empty array', () => {
    const data: object[] = [];
    const result = data.sort(sortBy('a'));
    expect(result).toEqual([]);
  });

  it('should handle array with one element', () => {
    const data = [{ a: 'b', b: 2 }];
    const result = [...data].sort(sortBy('a'));
    expect(result).toEqual([{ a: 'b', b: 2 }]);
  });
});
