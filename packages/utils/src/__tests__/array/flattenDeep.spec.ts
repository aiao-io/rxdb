import { describe, expect, it } from 'vitest';
import { flattenDeep } from '../../array/index.js';

describe('flattenDeep', () => {
  it('1', () => {
    const actual = flattenDeep([1, [2, 3], [4, [5, 6]]]);
    expect(actual).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('should throw on circular array references', () => {
    const circular: unknown[] = [1];
    circular.push(circular);
    expect(() => flattenDeep(circular)).toThrow('flattenDeep does not support circular references');
  });
});
