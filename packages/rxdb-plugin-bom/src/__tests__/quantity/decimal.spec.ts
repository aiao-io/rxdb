/**
 * @fileoverview 十进制 kernel 单测（US-511 阶段 A 的计算底座）
 *
 * 纯 BigInt 定点，不经 JS number：34 位有效数字、中间量 half-even、需求行向上取整。
 * golden 按「同一精度、同一顺序手算」位级对账。
 */

import { describe, expect, it } from 'vitest';
import {
  ceilToDecimalPlaces,
  decimalAdd,
  decimalCmp,
  decimalDiv,
  decimalFromCanonical,
  decimalIsNegative,
  decimalIsZero,
  decimalMul,
  decimalSub,
  decimalToCanonical,
  roundToSignificant,
  type Decimal
} from '../../quantity/decimal.js';

const d = (canonical: string): Decimal => decimalFromCanonical(canonical);

const s = (decimal: Decimal): string => decimalToCanonical(decimal);

describe('十进制 kernel 解析与序列化', () => {
  it('规范串往返逐字一致', () => {
    for (const value of [
      '0',
      '1',
      '1.5',
      '100',
      '0.0015',
      '9999999999999999999999999999999999',
      '216.4948453608247422680412371134021'
    ]) {
      expect(s(d(value))).toBe(value);
    }
  });

  it('零值比较与符号判断', () => {
    expect(decimalIsZero(d('0'))).toBe(true);
    expect(decimalIsZero(d('0.0'))).toBe(true);
    expect(decimalIsZero(d('1'))).toBe(false);
    expect(decimalIsNegative(d('-1'))).toBe(true);
    expect(decimalIsNegative(d('1'))).toBe(false);
  });
});

describe('十进制 kernel 四则（34 位 half-even golden）', () => {
  it('加法指数对齐：0.1 + 0.2 = 0.3', () => {
    expect(s(decimalAdd(d('0.1'), d('0.2')))).toBe('0.3');
  });

  it('减法：1 − 0.97 = 0.03', () => {
    expect(s(decimalSub(d('1'), d('0.97')))).toBe('0.03');
  });

  it('乘法：1000 × 0.001 = 1；2 × 100 = 200', () => {
    expect(s(decimalMul(d('1000'), d('0.001')))).toBe('1');
    expect(s(decimalMul(d('2'), d('100')))).toBe('200');
  });

  it('除法 golden：210 ÷ 0.97（AC#20 的 34 位 golden）', () => {
    expect(s(decimalDiv(d('210'), d('0.97')))).toBe('216.4948453608247422680412371134021');
  });

  it('除法 half-even：1/3 与 2/3 的 34 位尾位', () => {
    expect(s(decimalDiv(d('1'), d('3')))).toBe('0.3333333333333333333333333333333333');
    expect(s(decimalDiv(d('2'), d('3')))).toBe('0.6666666666666666666666666666666667');
  });

  it('乘法超 34 位收敛：34 个 9 × 2 = 2 后 33 个 0', () => {
    expect(s(decimalMul(d('9999999999999999999999999999999999'), d('2')))).toBe('20000000000000000000000000000000000');
  });

  it('除数为零拒绝', () => {
    expect(() => decimalDiv(d('1'), d('0'))).toThrow();
  });

  it('roundToSignificant 的 half-even 边界', () => {
    expect(s(roundToSignificant(d('2.45'), 2))).toBe('2.4');
    expect(s(roundToSignificant(d('2.35'), 2))).toBe('2.4');
    expect(s(roundToSignificant(d('2.55'), 2))).toBe('2.6');
  });
});

describe('十进制 kernel 向上取整（需求行舍入）', () => {
  it('ceilTo(0)：10.0001 → 11、2.5 → 3、2.1 → 3、3 → 3、0 → 0', () => {
    expect(s(ceilToDecimalPlaces(d('10.0001'), 0))).toBe('11');
    expect(s(ceilToDecimalPlaces(d('2.5'), 0))).toBe('3');
    expect(s(ceilToDecimalPlaces(d('2.1'), 0))).toBe('3');
    expect(s(ceilToDecimalPlaces(d('3'), 0))).toBe('3');
    expect(s(ceilToDecimalPlaces(d('0'), 0))).toBe('0');
  });

  it('ceilTo(2)：1.001 → 1.01、1.005 → 1.01、1 → 1', () => {
    expect(s(ceilToDecimalPlaces(d('1.001'), 2))).toBe('1.01');
    expect(s(ceilToDecimalPlaces(d('1.005'), 2))).toBe('1.01');
    expect(s(ceilToDecimalPlaces(d('1'), 2))).toBe('1');
  });

  it('小数位足够时不改值', () => {
    expect(s(ceilToDecimalPlaces(d('2.15'), 3))).toBe('2.15');
  });
});

describe('十进制 kernel 比较', () => {
  it('跨指数比较', () => {
    expect(decimalCmp(d('1'), d('0.999999'))).toBe(1);
    expect(decimalCmp(d('0.999999'), d('1'))).toBe(-1);
    expect(decimalCmp(d('1.5'), d('1.50'))).toBe(0);
    expect(decimalCmp(d('0'), d('0'))).toBe(0);
    expect(decimalCmp(d('100'), d('99.99'))).toBe(1);
  });
});
