import { describe, expect, expectTypeOf, it } from 'vitest';
import { isMilliseconds } from '../../date/isMilliseconds.js';
import { isMSTime } from '../../date/isMSTime.js';
import { MSTime } from '../../date/msTimeToMilliseconds.js';

describe('isMSTime', () => {
  it('1', () => expect(isMSTime('2 days')).toBeTruthy());
  it('2', () => expect(isMSTime('1d')).toBeTruthy());
  it('3', () => expect(isMSTime('10h')).toBeTruthy());
  it('4', () => expect(isMSTime('2.5 hrs')).toBeTruthy());
  it('5', () => expect(isMSTime('2h')).toBeTruthy());
  it('6', () => expect(isMSTime('1m')).toBeTruthy());
  it('7', () => expect(isMSTime('5s')).toBeTruthy());
  it('8', () => expect(isMSTime('1y')).toBeTruthy());
  it('9', () => expect(isMSTime('100')).toBeTruthy());
  it('10', () => expect(isMSTime('-3 days')).toBeTruthy());
  it('11', () => expect(isMSTime('-1h')).toBeTruthy());
  it('12', () => expect(isMSTime('-200')).toBeTruthy());
  it('13', () => expect(isMSTime(new Date() as unknown as string)).toEqual(false));
  it('13', () => expect(isMSTime(' ')).toEqual(false));

  describe('UTL-005 收窄集合必须与 MSTime 一致', () => {
    // 原用例 `it('13', () => expect(isMSTime(200)).toBeTruthy())` 把缺陷锁成了契约：
    // MSTime 是 ms.StringValue，number 不在其中，谓词却对 number 返回 true。
    it.each([[200], [0], [-1], [Number.NaN], [Number.POSITIVE_INFINITY]])('number %s 不是 MSTime', value => {
      expect(isMSTime(value)).toBe(false);
    });

    it.each([[null], [undefined], [{}], [[]], [true], ['abc'], ['']])('非 ms 字符串 %s 不是 MSTime', value => {
      expect(isMSTime(value)).toBe(false);
    });

    it('收窄后的类型就是 MSTime', () => {
      const value: unknown = '1d';
      if (isMSTime(value)) {
        expectTypeOf(value).toEqualTypeOf<MSTime>();
      }
      expect(isMSTime(value)).toBe(true);
    });
  });
});

describe('isMilliseconds', () => {
  it.each([[200], [0], [-1], [1.5]])('有限数 %s 是毫秒', value => {
    expect(isMilliseconds(value)).toBe(true);
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], ['200'], ['1d'], [null], [undefined]])('%s 不是毫秒', value => {
    expect(isMilliseconds(value)).toBe(false);
  });

  it('收窄后的类型是 number', () => {
    const value: unknown = 200;
    if (isMilliseconds(value)) {
      expectTypeOf(value).toEqualTypeOf<number>();
    }
    expect(isMilliseconds(value)).toBe(true);
  });
});
