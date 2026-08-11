import { describe, expect, expectTypeOf, it } from 'vitest';
import { MSTime, msTimeToMilliseconds } from '../../date/msTimeToMilliseconds.js';

describe('msTimeToMilliseconds', () => {
  it('1', () => expect(msTimeToMilliseconds('2 days')).toEqual(172800000));
  it('2', () => expect(msTimeToMilliseconds('1d')).toEqual(86400000));
  it('3', () => expect(msTimeToMilliseconds('10h')).toEqual(36000000));
  it('4', () => expect(msTimeToMilliseconds('2.5 hrs')).toEqual(9000000));
  it('5', () => expect(msTimeToMilliseconds('2h')).toEqual(7200000));
  it('6', () => expect(msTimeToMilliseconds('1m')).toEqual(60000));
  it('7', () => expect(msTimeToMilliseconds('5s')).toEqual(5000));
  it('8', () => expect(msTimeToMilliseconds('1y')).toEqual(31557600000));
  it('9', () => expect(msTimeToMilliseconds('100')).toEqual(100));

  describe('UTL-005 返回值必须真的是 Milliseconds', () => {
    it('number 入参原样返回，而不是被 ms() 变成字符串', () => {
      // ms(200) 返回字符串 '200ms'，而函数声明的返回类型是 number
      const result = msTimeToMilliseconds(200);

      expectTypeOf(result).toEqualTypeOf<number>();
      expect(result).toEqual(200);
      expect(typeof result).toEqual('number');
    });

    it.each([['2 days'], ['1d'], ['100']] as const)('%s 的返回值 typeof 是 number', value => {
      expect(typeof msTimeToMilliseconds(value)).toEqual('number');
    });

    it.each([['abc'], [' '], ['']])('无法解析的 %s 抛 TypeError 而不是返回 undefined', value => {
      expect(() => msTimeToMilliseconds(value as MSTime)).toThrow(TypeError);
    });

    it.each([[Number.NaN], [Number.POSITIVE_INFINITY]])('非有限数 %s 抛 TypeError', value => {
      expect(() => msTimeToMilliseconds(value)).toThrow(TypeError);
    });
  });
});
