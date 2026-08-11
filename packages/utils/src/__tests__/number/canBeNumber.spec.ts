import { describe, expect, it } from 'vitest';
import { canBeNumber } from '../../number/canBeNumber.js';

describe('canBeNumber', () => {
  it('should return true for valid numbers', () => {
    expect(canBeNumber(1)).toBeTruthy();
    expect(canBeNumber(1.1)).toBeTruthy();
    expect(canBeNumber('1')).toBeTruthy();
    expect(canBeNumber('1.1')).toBeTruthy();
    expect(canBeNumber(Number.MAX_SAFE_INTEGER)).toBeTruthy();
    expect(canBeNumber(Number.MAX_VALUE)).toBeTruthy();
    expect(canBeNumber('  123  ')).toBeTruthy(); // 带空格的数字字符串
    expect(canBeNumber('-123')).toBeTruthy(); // 负数
    expect(canBeNumber('-123.45')).toBeTruthy(); // 负小数
  });

  it('should return false for invalid numbers', () => {
    expect(canBeNumber('a')).toBeFalsy();

    expect(canBeNumber('')).toBeFalsy();
    expect(canBeNumber(' ')).toBeFalsy();
    expect(canBeNumber(Infinity)).toBeFalsy();
    expect(canBeNumber(-Infinity)).toBeFalsy();
  });

  it('should handle edge cases', () => {
    expect(canBeNumber('0')).toBeTruthy();
    expect(canBeNumber('+0')).toBeTruthy();
    expect(canBeNumber('-0')).toBeTruthy();
    expect(canBeNumber('0.0')).toBeTruthy();
    expect(canBeNumber('.1')).toBeTruthy(); // 小数点开头
    expect(canBeNumber('1.')).toBeTruthy(); // 小数点结尾
    expect(canBeNumber('1e10')).toBeTruthy(); // 科学计数法
    expect(canBeNumber('1E10')).toBeTruthy(); // 大写科学计数法
    expect(canBeNumber('1.23e-4')).toBeTruthy(); // 带负指数的科学计数法
  });
});

it.each(['12a3', '1.2.3', '1e', '0x10', 'NaN', 'Infinity'])('rejects malformed numeric input: %s', value => {
  expect(canBeNumber(value)).toBe(false);
});
