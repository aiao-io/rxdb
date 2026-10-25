/**
 * @fileoverview 十进制 kernel（US-511 阶段 A 的计算底座）
 *
 * 纯 BigInt 定点十进制：值 = `coeff × 10^exp`，全程不经 JS `number`。34 位有效数字
 * （decimal128 语义）、中间量 half-even 舍入；需求行的向上取整是另一个入口
 * （{@link ceilToDecimalPlaces}），不进四则。规范化后 `coeff` 无尾随零（零值 coeff = 0）。
 * 入口只认**规范十进制串**（可选负号；字段层的非负约束在入口规范化与存储触发器），
 * 负值参与四则用于公式中间量，负结果由调用方按域拒绝。
 */

/** kernel 的工作有效数字（decimal128 语义）。 */
export const DECIMAL_KERNEL_SIGNIFICANT_DIGITS = 34;

/** 定点十进制：值 = coeff × 10^exp。 */
export interface Decimal {
  readonly coeff: bigint;
  readonly exp: number;
}

const pow10 = (exp: number): bigint => 10n ** BigInt(exp);

/** 去尾随零：`100 × 10^0` → `1 × 10^2`（零值不处理）。 */
const stripTrailingZeros = (decimal: Decimal): Decimal => {
  let { coeff } = decimal;
  let { exp } = decimal;
  while (coeff !== 0n && coeff % 10n === 0n) {
    coeff /= 10n;
    exp += 1;
  }
  return { coeff, exp };
};

/** 十进制串的位数（coeff 绝对值的位数）。 */
const digitCount = (coeff: bigint): number => (coeff < 0n ? -coeff : coeff).toString().length;

/**
 * 收敛到 `digits` 位有效数字（half-even）。
 *
 * @param decimal - 待收敛值（可为负）
 * @param digits - 有效数字位数（默认 34）
 */
export const roundToSignificant = (decimal: Decimal, digits: number = DECIMAL_KERNEL_SIGNIFICANT_DIGITS): Decimal => {
  const stripped = stripTrailingZeros(decimal);
  if (stripped.coeff === 0n) return { coeff: 0n, exp: 0 };
  const negative = stripped.coeff < 0n;
  const abs = negative ? -stripped.coeff : stripped.coeff;
  const length = abs.toString().length;
  if (length <= digits) return stripped;
  const scale = length - digits;
  const divisor = pow10(scale);
  let quotient = abs / divisor;
  const remainder = abs % divisor;
  // half-even：恰好一半时向偶数位（BigInt 整除向零截断，先按截断商判断）
  if (remainder * 2n > divisor || (remainder * 2n === divisor && (quotient & 1n) === 1n)) {
    quotient += 1n;
  }
  return { coeff: negative ? -quotient : quotient, exp: stripped.exp + scale };
};

/**
 * 解析规范十进制串（可选负号、无指数、无前导/尾随零，见 `DECIMAL_CANONICAL_RE`）。
 */
export const decimalFromCanonical = (canonical: string): Decimal => {
  const negative = canonical.startsWith('-');
  const unsigned = negative ? canonical.slice(1) : canonical;
  const dotIndex = unsigned.indexOf('.');
  const intPart = dotIndex === -1 ? unsigned : unsigned.slice(0, dotIndex);
  const fracPart = dotIndex === -1 ? '' : unsigned.slice(dotIndex + 1);
  const coeff = BigInt(`${negative ? '-' : ''}${intPart}${fracPart}`);
  return stripTrailingZeros({ coeff, exp: -fracPart.length });
};

/** 序列化为规范十进制串（与 `DECIMAL_CANONICAL_RE` 同形）。 */
export const decimalToCanonical = (decimal: Decimal): string => {
  const { coeff, exp } = stripTrailingZeros(decimal);
  if (coeff === 0n) return '0';
  const negative = coeff < 0n;
  const digits = (negative ? -coeff : coeff).toString();
  const sign = negative ? '-' : '';
  if (exp >= 0) return `${sign}${digits}${'0'.repeat(exp)}`;
  const point = digits.length + exp;
  if (point > 0) return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
  return `${sign}0.${'0'.repeat(-point)}${digits}`;
};

/** 是否为零。 */
export const decimalIsZero = (decimal: Decimal): boolean => decimal.coeff === 0n;

/** 是否为负。 */
export const decimalIsNegative = (decimal: Decimal): boolean => decimal.coeff < 0n;

/**
 * 加法（指数对齐后整数相加，收敛到 34 位）。
 */
export const decimalAdd = (a: Decimal, b: Decimal): Decimal => {
  const minExp = Math.min(a.exp, b.exp);
  const aligned = { coeff: a.coeff * pow10(a.exp - minExp) + b.coeff * pow10(b.exp - minExp), exp: minExp };
  return roundToSignificant(aligned);
};

/**
 * 减法（指数对齐后整数相减，收敛到 34 位）。
 */
export const decimalSub = (a: Decimal, b: Decimal): Decimal => decimalAdd(a, { coeff: -b.coeff, exp: b.exp });

/**
 * 乘法（系数相乘、指数相加，收敛到 34 位）。
 */
export const decimalMul = (a: Decimal, b: Decimal): Decimal =>
  roundToSignificant({ coeff: a.coeff * b.coeff, exp: a.exp + b.exp });

/**
 * 非负精确商 `quotient + remainder / divisor` 一次性 half-even 收敛到 34 位有效数字。
 *
 * @remarks
 * 整数商超出 34 位时，被舍去的低位与余数合在一起同「一半」比较（交叉相乘，不先按余数进位）——
 * 先进位再收敛是双重舍入，平局附近会差 1 ulp。
 *
 * @returns 收敛后的系数与需追加到指数上的位移
 */
const roundExactQuotient = (quotient: bigint, remainder: bigint, divisor: bigint): { coeff: bigint; shift: number } => {
  const shift = Math.max(0, digitCount(quotient) - DECIMAL_KERNEL_SIGNIFICANT_DIGITS);
  const unit = pow10(shift);
  const kept = quotient / unit;
  // 被舍部分 = (quotient % unit + remainder / divisor) / unit，与 1/2 交叉相乘比较
  const twice = 2n * ((quotient % unit) * divisor + remainder);
  const whole = unit * divisor;
  const up = twice > whole || (twice === whole && (kept & 1n) === 1n);
  return { coeff: up ? kept + 1n : kept, shift };
};

/**
 * 除法（34 位有效数字 half-even；除数为零抛错）。
 *
 * @remarks
 * 在绝对值上放大被除数到商至少 34 位有效数字，整除后连同余数只舍入一次，最后再补符号——
 * 中间不产生浮点，舍入方向与符号象限无关。
 */
export const decimalDiv = (a: Decimal, b: Decimal): Decimal => {
  if (b.coeff === 0n) throw new Error('十进制除法：除数为零');
  if (a.coeff === 0n) return { coeff: 0n, exp: 0 };
  const dividend = a.coeff < 0n ? -a.coeff : a.coeff;
  const divisor = b.coeff < 0n ? -b.coeff : b.coeff;
  // 商的有效位数 ≈ 被除数位数 − 除数位数（+1）；补足到 34（被除数本身已超 34 位时不缩放）
  const scale = Math.max(0, DECIMAL_KERNEL_SIGNIFICANT_DIGITS - (digitCount(dividend) - digitCount(divisor)));
  const numerator = dividend * pow10(scale);
  const rounded = roundExactQuotient(numerator / divisor, numerator % divisor, divisor);
  const negative = a.coeff < 0n !== b.coeff < 0n;
  return stripTrailingZeros({
    coeff: negative ? -rounded.coeff : rounded.coeff,
    exp: a.exp - b.exp - scale + rounded.shift
  });
};

/**
 * 比例缩放：保留乘积的精确系数，除法结束后一次性收敛到 34 位 half-even。
 *
 * @param quantity - 待缩放数量
 * @param planned - 本次计划量
 * @param base - 基准批量
 * @returns 一次舍入后的 quantity × planned ÷ base
 */
export const decimalMulDiv = (quantity: Decimal, planned: Decimal, base: Decimal): Decimal =>
  decimalDiv({ coeff: quantity.coeff * planned.coeff, exp: quantity.exp + planned.exp }, base);

/**
 * 三态比较（−1 / 0 / 1）。
 */
export const decimalCmp = (a: Decimal, b: Decimal): -1 | 0 | 1 => {
  if (a.coeff === 0n && b.coeff === 0n) return 0;
  if (a.coeff < 0n && b.coeff >= 0n) return -1;
  if (a.coeff >= 0n && b.coeff < 0n) return 1;
  const minExp = Math.min(a.exp, b.exp);
  const alignedA = a.coeff * pow10(a.exp - minExp);
  const alignedB = b.coeff * pow10(b.exp - minExp);
  if (alignedA === alignedB) return 0;
  return alignedA < alignedB ? -1 : 1;
};

/**
 * 向上取整到指定小数位（需求行舍入；零值不动）。
 *
 * @param decimal - 待舍入值（负值向零方向取整，即数学 ceil 语义）
 * @param places - 保留小数位（非负）
 */
export const ceilToDecimalPlaces = (decimal: Decimal, places: number): Decimal => {
  if (decimal.coeff === 0n) return { coeff: 0n, exp: 0 };
  const shift = -(decimal.exp + places);
  if (shift <= 0) return decimal;
  const divisor = pow10(shift);
  let quotient = decimal.coeff / divisor;
  if (decimal.coeff > 0n && decimal.coeff % divisor !== 0n) {
    quotient += 1n;
  }
  return stripTrailingZeros({ coeff: quotient, exp: -places });
};
