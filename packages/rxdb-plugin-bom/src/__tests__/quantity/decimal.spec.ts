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

describe('十进制 kernel 除法舍入回归', () => {
  it('四个符号象限的 half-even 一致（余数符号跟随被除数，不跟随商）', () => {
    expect(s(decimalDiv(d('2'), d('3')))).toBe('0.6666666666666666666666666666666667');
    expect(s(decimalDiv(d('-2'), d('3')))).toBe('-0.6666666666666666666666666666666667');
    expect(s(decimalDiv(d('2'), d('-3')))).toBe('-0.6666666666666666666666666666666667');
    expect(s(decimalDiv(d('-2'), d('-3')))).toBe('0.6666666666666666666666666666666667');
  });

  it('35 位商只舍入一次：(41×10^32 + 6) ÷ 41 = 10^32 + 0.1（双重舍入会得 0.2）', () => {
    const dividend = { coeff: 41n * 10n ** 32n + 6n, exp: 0 };
    expect(s(decimalDiv(dividend, d('41')))).toBe('100000000000000000000000000000000.1');
  });

  it('被除数超 34 位（缩放夹到 0）时同样只舍入一次', () => {
    // 精确商 10^34 + 14.75：34 位应舍去尾位 4.75 → 10^34 + 10；先按余数进位成 …15 再收敛会得 …20
    const dividend = { coeff: 4n * 10n ** 34n + 59n, exp: 0 };
    expect(s(decimalDiv(dividend, d('4')))).toBe('10000000000000000000000000000000010');
  });
});

// -----------------------------------------------------[ 性质测试：对拍 BigInt 有理数参考实现 ]

/** 精确有理数（分母恒正）。 */
interface Rational {
  num: bigint;
  den: bigint;
}

const pow10n = (exponent: number): bigint => 10n ** BigInt(exponent);

const absBig = (value: bigint): bigint => (value < 0n ? -value : value);

const rationalOf = (decimal: Decimal): Rational =>
  decimal.exp >= 0 ?
    { num: decimal.coeff * pow10n(decimal.exp), den: 1n }
  : { num: decimal.coeff, den: pow10n(-decimal.exp) };

/** 参考格式化：系数 × 10^指数 → 规范串（独立于 kernel 的 decimalToCanonical）。 */
const formatReference = (coeff: bigint, exponent: number): string => {
  if (coeff === 0n) return '0';
  let digits = absBig(coeff).toString();
  let exp = exponent;
  while (digits.length > 1 && digits.endsWith('0')) {
    digits = digits.slice(0, -1);
    exp += 1;
  }
  const sign = coeff < 0n ? '-' : '';
  if (exp >= 0) return `${sign}${digits}${'0'.repeat(exp)}`;
  const point = digits.length + exp;
  if (point > 0) return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
  return `${sign}0.${'0'.repeat(-point)}${digits}`;
};

/** 参考舍入：精确有理数一次性 half-even 收敛到 `digits` 位有效数字。 */
const roundReference = ({ num, den }: Rational, digits = 34): string => {
  if (num === 0n) return '0';
  const magnitude = absBig(num);
  const lower = pow10n(digits - 1);
  const upper = pow10n(digits);
  let exponent = magnitude.toString().length - den.toString().length - digits;
  for (;;) {
    const scaledNum = exponent >= 0 ? magnitude : magnitude * pow10n(-exponent);
    const scaledDen = exponent >= 0 ? den * pow10n(exponent) : den;
    const kept = scaledNum / scaledDen;
    if (kept >= upper) exponent += 1;
    else if (kept < lower) exponent -= 1;
    else {
      const twice = 2n * (scaledNum % scaledDen);
      const up = twice > scaledDen || (twice === scaledDen && (kept & 1n) === 1n);
      const rounded = up ? kept + 1n : kept;
      return formatReference(num < 0n ? -rounded : rounded, exponent);
    }
  }
};

/** 参考向上取整（数学 ceil）到 `places` 位小数。 */
const ceilReference = ({ num, den }: Rational, places: number): string => {
  const scaled = num * pow10n(places);
  const floor = scaled / den - (scaled % den !== 0n && scaled < 0n ? 1n : 0n);
  return formatReference(scaled % den === 0n ? floor : floor + 1n, -places);
};

/** 固定种子伪随机（mulberry32，不引依赖）。 */
const seededRandom = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

/** 随机系数：普通随机位、全 9（进位边界）、10 的幂、以 5 结尾（half-even 平局）四种形状。 */
const randomCoefficient = (random: () => number, maxDigits: number): bigint => {
  const length = 1 + Math.floor(random() * maxDigits);
  const shape = Math.floor(random() * 4);
  if (shape === 1) return pow10n(length) - 1n;
  if (shape === 2) return pow10n(length - 1);
  let text = String(1 + Math.floor(random() * 9));
  for (let index = 1; index < length; index += 1) text += String(Math.floor(random() * 10));
  if (shape === 3) text = `${text.slice(0, -1)}5`;
  return BigInt(text);
};

const randomDecimal = (random: () => number, maxDigits = 34): Decimal => {
  const coeff = randomCoefficient(random, maxDigits);
  return { coeff: random() < 0.5 ? -coeff : coeff, exp: Math.floor(random() * 81) - 40 };
};

const describeDecimal = (decimal: Decimal): string => `${decimal.coeff}e${decimal.exp}`;

const CASES = 3000;

describe('十进制 kernel 性质测试（对拍有理数参考实现，34 位 half-even）', () => {
  it('加减乘：结果等于精确值的一次 half-even 舍入', () => {
    const random = seededRandom(20261019);
    for (let index = 0; index < CASES; index += 1) {
      const a = randomDecimal(random);
      const b = randomDecimal(random);
      const ra = rationalOf(a);
      const rb = rationalOf(b);
      const label = `${describeDecimal(a)} ∘ ${describeDecimal(b)}`;
      expect(s(decimalAdd(a, b)), `add ${label}`).toBe(
        roundReference({ num: ra.num * rb.den + rb.num * ra.den, den: ra.den * rb.den })
      );
      expect(s(decimalSub(a, b)), `sub ${label}`).toBe(
        roundReference({ num: ra.num * rb.den - rb.num * ra.den, den: ra.den * rb.den })
      );
      expect(s(decimalMul(a, b)), `mul ${label}`).toBe(roundReference({ num: ra.num * rb.num, den: ra.den * rb.den }));
    }
  });

  it('除法：四个符号象限、被除数超 34 位都只舍入一次', () => {
    const random = seededRandom(5112026);
    for (let index = 0; index < CASES; index += 1) {
      const a = randomDecimal(random, 40);
      const b = randomDecimal(random);
      const ra = rationalOf(a);
      const rb = rationalOf(b);
      const num = ra.num * rb.den * (rb.num < 0n ? -1n : 1n);
      expect(s(decimalDiv(a, b)), `div ${describeDecimal(a)} ÷ ${describeDecimal(b)}`).toBe(
        roundReference({ num, den: ra.den * absBig(rb.num) })
      );
    }
  });

  it('roundToSignificant 任意位数、ceilToDecimalPlaces 任意小数位与参考一致', () => {
    const random = seededRandom(34);
    for (let index = 0; index < CASES; index += 1) {
      const value = randomDecimal(random, 40);
      const digits = 1 + Math.floor(random() * 34);
      const places = Math.floor(random() * 12);
      expect(s(roundToSignificant(value, digits)), `round ${describeDecimal(value)} @${digits}`).toBe(
        roundReference(rationalOf(value), digits)
      );
      expect(s(ceilToDecimalPlaces(value, places)), `ceil ${describeDecimal(value)} @${places}`).toBe(
        ceilReference(rationalOf(value), places)
      );
    }
  });

  it('比较：与精确差值的符号一致；规范串往返逐字一致', () => {
    const random = seededRandom(7);
    for (let index = 0; index < CASES; index += 1) {
      const a = randomDecimal(random);
      const b = random() < 0.2 ? { coeff: a.coeff * 10n, exp: a.exp - 1 } : randomDecimal(random);
      const ra = rationalOf(a);
      const rb = rationalOf(b);
      const difference = ra.num * rb.den - rb.num * ra.den;
      const expected =
        difference === 0n ? 0
        : difference < 0n ? -1
        : 1;
      expect(decimalCmp(a, b), `cmp ${describeDecimal(a)} ${describeDecimal(b)}`).toBe(expected);
      const canonical = formatReference(a.coeff, a.exp);
      expect(s(d(canonical))).toBe(canonical);
    }
  });
});
