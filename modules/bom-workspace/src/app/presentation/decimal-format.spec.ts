import { describe, expect, it } from 'vitest';
import { formatDecimal } from './decimal-format';

describe('十进制展示格式', () => {
  it.each([
    ['8.020408163265306122448979591836735', '8.02'],
    ['1234567890123456789012345678901234.125', '1,234,567,890,123,456,789,012,345,678,901,234.12'],
    ['9007199254740993.135', '9,007,199,254,740,993.14'],
    ['0.005', '0.00'],
    ['0.015', '0.02'],
    ['-0.005', '0.00'],
    ['-0.015', '-0.02'],
    ['1.225000000000000000000000000000001', '1.23'],
    ['999.995', '1,000.00'],
    ['0.000000000000000000000000000000001', '0.00'],
    ['0', '0.00']
  ])('%s 保留两位并按偶数舍入，完整整数不丢位', (raw, expected) => {
    expect(formatDecimal(raw, { fractionDigits: 2 })).toBe(expected);
  });

  it.each([
    ['8.020408163265306122448979591836735', '8.020408'],
    ['1.2345645', '1.234564'],
    ['1.2345655', '1.234566'],
    ['0.0000005', '0'],
    ['0.0000015', '0.000002'],
    ['-0.0000015', '-0.000002'],
    ['999.9999995', '1,000'],
    ['2.5', '2.5'],
    ['0', '0']
  ])('%s 最多保留六位并去掉无意义尾零', (raw, expected) => {
    expect(formatDecimal(raw, { fractionDigits: 6, trimTrailingZeros: true })).toBe(expected);
  });

  it.each([
    ['2.5', '2'],
    ['3.5', '4'],
    ['-2.5', '-2'],
    ['-3.5', '-4']
  ])('零位小数也遵守偶数舍入：%s', (raw, expected) => {
    expect(formatDecimal(raw, { fractionDigits: 0 })).toBe(expected);
  });

  it.each(['', 'NaN', 'Infinity', '1e3', '01.2'])('非法值 %s 明确拒绝，不变成零成本', raw => {
    expect(() => formatDecimal(raw, { fractionDigits: 2 })).toThrow(TypeError);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('非法展示位数 %s 明确拒绝', fractionDigits => {
    expect(() => formatDecimal('1', { fractionDigits })).toThrow(RangeError);
  });
});
