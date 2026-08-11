import { describe, expect, it } from 'vitest';
import { flatten } from '../../array/index.js';

describe('flatten', () => {
  it('1', () => {
    const actual = flatten([1, [2, 3], [4, [5, 6]]]);
    expect(actual).toEqual([1, 2, 3, 4, [5, 6]]);
  });
});

// UTL-019：`concat([], ...array)` 把每个元素当成一个实参展开，
// 数组长度超过引擎实参上限（V8 约 12 万）时直接 RangeError。
describe('UTL-019 大数组', () => {
  it('20 万元素不得抛 RangeError', () => {
    const large = Array.from({ length: 200_000 }, (_, i) => i);
    expect(() => flatten(large)).not.toThrow();
    expect(flatten(large)).toHaveLength(200_000);
  });

  it('嵌套的大数组同样展平一层', () => {
    const large = Array.from({ length: 150_000 }, (_, i) => [i]);
    const result = flatten(large);
    expect(result).toHaveLength(150_000);
    expect(result[0]).toBe(0);
  });
});
