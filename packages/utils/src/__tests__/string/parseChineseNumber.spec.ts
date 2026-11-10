import { describe, expect, it } from 'vitest';
import { parseChineseNumber } from '../../string/parseChineseNumber.js';

describe('parseChineseNumber', () => {
  describe('基础用例（修复前已正确，不得回归）', () => {
    it.each([
      ['一万一', 10001],
      ['一百', 100],
      ['十', 10],
      ['一千', 1000],
      ['一万', 10000],
      ['一万一百一', 10101],
      ['10000', 10000]
    ])('%s -> %i', (input, expected) => {
      expect(parseChineseNumber(input)).toEqual(expected);
    });
  });

  describe('UTL-015 万级复合单位', () => {
    it.each([
      ['十五万', 150_000],
      ['一百零一万', 1_010_000],
      ['二十万', 200_000],
      ['三千五百万', 35_000_000],
      ['15万', 150_000]
    ])('%s -> %i', (input, expected) => {
      expect(parseChineseNumber(input)).toEqual(expected);
    });
  });

  describe('UTL-015 亿级单位', () => {
    it.each([
      ['一亿', 100_000_000],
      ['一亿二千万', 120_000_000],
      ['十二亿三千四百万', 1_234_000_000],
      ['一万亿', 1_000_000_000_000]
    ])('%s -> %i', (input, expected) => {
      expect(parseChineseNumber(input)).toEqual(expected);
    });
  });

  describe('UTL-015 支持字符集：两 / 财务大写 / 负号', () => {
    it.each([
      ['两', 2],
      ['两万', 20_000],
      ['两千三百', 2300],
      ['壹万贰仟', 12_000],
      ['贰拾', 20],
      ['负一百', -100],
      ['-100', -100],
      ['负十五万', -150_000],
      ['〇', 0],
      ['零', 0]
    ])('%s -> %i', (input, expected) => {
      expect(parseChineseNumber(input)).toEqual(expected);
    });
  });

  // 段级单位用 `section || 1` 取系数：显式的 0 与「没写数量」都变成 1，零万解析成 10000（RV-01a1bbb523567bc1b61d7728e99cea4c）
  describe('显式零系数照算，只有完全省略数量时才按 1 计', () => {
    it.each([
      ['0万', 0],
      ['零万', 0],
      ['〇万', 0],
      ['00万', 0],
      ['0亿', 0],
      ['零亿', 0],
      ['零万亿', 0],
      ['一亿零万', 100_000_000],
      ['零十万', 0]
    ])('%s -> %i', (input, expected) => {
      expect(parseChineseNumber(input)).toBe(expected);
    });

    it('负零与段级单位组合仍为零', () => {
      expect(parseChineseNumber('负零万') === 0).toBe(true);
      expect(parseChineseNumber('-0亿') === 0).toBe(true);
    });

    it.each([
      ['万', 10_000],
      ['亿', 100_000_000],
      ['万亿', 1_000_000_000_000],
      ['一亿万', 100_010_000]
    ])('省略数量 %s -> %i', (input, expected) => {
      expect(parseChineseNumber(input)).toBe(expected);
    });
  });

  describe('UTL-015 非法/歧义输入确定抛错', () => {
    it.each([['❤️'], [''], ['   '], ['十十'], ['一百千'], ['一万二万'], ['负'], ['一--百']])('%s 抛错', input => {
      expect(() => parseChineseNumber(input)).toThrowError();
    });
  });
});
