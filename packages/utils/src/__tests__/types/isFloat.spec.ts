import { describe, expect, it } from 'vitest';
import { isFloat } from '../../types/isFloat.js';

describe('isFloat', () => {
  it('1', () => {
    expect(isFloat(22)).toEqual(false);
    expect(isFloat(22.0)).toEqual(false);
    expect(isFloat(undefined)).toEqual(false);
    expect(isFloat(null)).toEqual(false);
    expect(isFloat(false)).toEqual(false);
    expect(isFloat(NaN)).toEqual(false);
    expect(isFloat([1, 2, 3])).toEqual(false);
    expect(isFloat({})).toEqual(false);
    expect(isFloat('abc')).toEqual(false);
    expect(isFloat(String('abc'))).toEqual(false);
  });

  it('1', () => {
    expect(isFloat(22.2)).toEqual(true);
    expect(isFloat(22.2)).toEqual(true);
  });
});

// UTL-029：`Infinity % 1` 求值为 NaN，`NaN !== 0` 为真 → ±Infinity 被判成浮点数
describe('isFloat 非有限数', () => {
  it('±Infinity 不是浮点数', () => {
    expect(isFloat(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFloat(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it('NaN 不是浮点数', () => {
    expect(isFloat(Number.NaN)).toBe(false);
  });

  it('有限小数仍然是浮点数', () => {
    expect(isFloat(1.5)).toBe(true);
    expect(isFloat(-0.25)).toBe(true);
    expect(isFloat(2)).toBe(false);
  });
});
