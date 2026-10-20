/**
 * @fileoverview 十进制值合同（US-511 的存储段）
 *
 * 数量等十进制字段以**规范十进制串**承载：可选负号、整数部分无前导零（单个 `0` 除外）、
 * 无指数、小数部分无尾随零、`-0` 写作 `0`，至多 34 位有效数字。入口接受指数写法并在此
 * 规范化；存储层的格式触发器只做逐字节谓词判断，不做数值运算（两后端同口径）。
 * 首期没有允许负值的字段，负号语法留给日后字段。
 */

import { BomDecimalFormatError } from './types.js';

/**
 * 规范十进制串的逐字节形状（存储层触发器与入口校验共用同一份定义）：
 * 无符号、无指数、无前导零（单个 `0` 除外）、小数无尾随零。
 */
export const DECIMAL_CANONICAL_RE = /^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;

/**
 * 指数写法的指数绝对值上限（6144 = decimal128 的 Emax）。
 *
 * @remarks
 * kernel 是 34 位有效数字的 decimal128 语义，指数超出这一量级的值本就不可表示；正向幅值另受
 * 34 位有效数字规则约束（整数部分至多 34 位），本上限只为展开设界：展开后的串长 ≤ 输入长度 + 6144，
 * `1e1000000000` 这类 12 字符的外部载荷不再放大成 GB 级字符串。
 */
const DECIMAL_MAX_EXPONENT = 6144;

/** 入口十进制语法的手写解析（线性扫描，无正则——正则版是 CodeQL ReDoS 告警面）。 */
const parseDecimalInput = (input: string): { sign: string; mantissa: string; exponent: number } | null => {
  let index = 0;
  const sign = input[0] === '+' || input[0] === '-' ? input[index++] : '';
  let intDigits = 0;
  while (index < input.length && input[index] >= '0' && input[index] <= '9') {
    index += 1;
    intDigits += 1;
  }
  let fracDigits = 0;
  if (index < input.length && input[index] === '.') {
    index += 1;
    while (index < input.length && input[index] >= '0' && input[index] <= '9') {
      index += 1;
      fracDigits += 1;
    }
  }
  if (intDigits === 0 && fracDigits === 0) return null;
  const mantissa = input.slice(sign.length, index);
  let exponent = 0;
  if (index < input.length && (input[index] === 'e' || input[index] === 'E')) {
    index += 1;
    let expSign = 1;
    if (index < input.length && (input[index] === '+' || input[index] === '-')) {
      if (input[index] === '-') expSign = -1;
      index += 1;
    }
    let expDigits = 0;
    while (index < input.length && input[index] >= '0' && input[index] <= '9') {
      // 越过上限即饱和：超长指数串不累积成不精确的大浮点数，由调用方按上限拒绝
      exponent = Math.min(exponent * 10 + (input.charCodeAt(index) - 48), DECIMAL_MAX_EXPONENT + 1);
      index += 1;
      expDigits += 1;
    }
    if (expDigits === 0) return null;
    exponent *= expSign;
  }
  if (index !== input.length) return null;
  return { sign, mantissa, exponent };
};

/** 有效数字上限（34 位，decimal128 语义）。 */
export const DECIMAL_MAX_SIGNIFICANT_DIGITS = 34;

/** 把无指数形式规范成规范串（去前导零、去尾随零、去小数点）。 */
const canonicalizePlain = (plain: string): string => {
  const dotIndex = plain.indexOf('.');
  const intPart = dotIndex === -1 ? plain : plain.slice(0, dotIndex);
  const fracPart = dotIndex === -1 ? '' : plain.slice(dotIndex + 1);
  let intLead = 0;
  while (intLead < intPart.length && intPart[intLead] === '0') intLead += 1;
  const intPartStripped = intPart.slice(intLead) || '0';
  let fracEnd = fracPart.length;
  while (fracEnd > 0 && fracPart[fracEnd - 1] === '0') fracEnd -= 1;
  const fracPartStripped = fracPart.slice(0, fracEnd);
  return fracPartStripped.length > 0 ? `${intPartStripped}.${fracPartStripped}` : intPartStripped;
};

/** 展开指数到无指数形式（纯字符串运算，不经 JS `number`）。 */
const expandExponent = (mantissa: string, exponent: number): string => {
  const dotIndex = mantissa.indexOf('.');
  const intPart = dotIndex === -1 ? mantissa : mantissa.slice(0, dotIndex);
  const fracPart = dotIndex === -1 ? '' : mantissa.slice(dotIndex + 1);
  const digits = intPart + fracPart;
  const point = intPart.length + exponent;
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${digits}${'0'.repeat(point - digits.length)}`;
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
};

/**
 * 把入口输入规范化为规范十进制串
 *
 * @param input - 入口值（接受指数写法、前导零、尾随零、`-0`）
 * @param field - 字段名（错误消息点名用）
 * @returns 规范十进制串
 *
 * @throws {@link BomDecimalFormatError} 非有限值、空串、语法错、指数绝对值超 6144、超 34 位有效数字、负值（首期）
 */
export const normalizeDecimalString = (input: unknown, field: string): string => {
  if (typeof input !== 'string' || input.length === 0) {
    throw new BomDecimalFormatError(field, `必须是十进制字符串，实际为 ${JSON.stringify(input)}`);
  }
  const parsed = parseDecimalInput(input);
  if (parsed === null) {
    throw new BomDecimalFormatError(field, `非法十进制语法：${input}`);
  }
  const { sign, mantissa, exponent } = parsed;
  if (Math.abs(exponent) > DECIMAL_MAX_EXPONENT) {
    throw new BomDecimalFormatError(field, `指数绝对值超过 ${DECIMAL_MAX_EXPONENT}（decimal128 指数上限），不展开`);
  }
  // `-0` 写作 `0`：值为零时符号无意义，先归零再拒绝其余负值（首期没有允许负值的字段）。
  // 全零判定不用正则（`0*\.?0*` 对长串是多项式回溯，CodeQL ReDoS 告警面）
  const mantissaIsZero = [...mantissa].every(ch => ch === '0' || ch === '.');
  if (sign === '-' && !mantissaIsZero) {
    throw new BomDecimalFormatError(field, '负值不受支持（首期没有允许负值的字段）');
  }
  const canonical = canonicalizePlain(expandExponent(mantissa, exponent));
  const withoutDot = canonical.replace('.', '');
  // 去前导零走线性扫描（正则 `^0+` 同样是 ReDoS 告警面）
  let firstNonZero = 0;
  while (firstNonZero < withoutDot.length && withoutDot[firstNonZero] === '0') firstNonZero += 1;
  const significant = withoutDot.slice(firstNonZero);
  if (significant.length > DECIMAL_MAX_SIGNIFICANT_DIGITS) {
    throw new BomDecimalFormatError(
      field,
      `超过 ${DECIMAL_MAX_SIGNIFICANT_DIGITS} 位有效数字：${significant.length} 位，不截断不舍入`
    );
  }
  return canonical;
};
