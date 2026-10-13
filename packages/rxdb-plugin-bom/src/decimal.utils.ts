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

/** 入口接受的十进制语法：可选符号 + 数字（可带小数点）+ 可选指数。 */
const DECIMAL_INPUT_RE = /^([+-]?)([0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE]([+-]?[0-9]+))?$/;

/** 有效数字上限（34 位，decimal128 语义）。 */
export const DECIMAL_MAX_SIGNIFICANT_DIGITS = 34;

/** 把无指数形式规范成规范串（去前导零、去尾随零、去小数点）。 */
const canonicalizePlain = (plain: string): string => {
  const dotIndex = plain.indexOf('.');
  const intPart = dotIndex === -1 ? plain : plain.slice(0, dotIndex);
  const fracPart = dotIndex === -1 ? '' : plain.slice(dotIndex + 1);
  const intPartStripped = intPart.replace(/^0+/, '') || '0';
  const fracPartStripped = fracPart.replace(/0+$/, '');
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
 * @throws {@link BomDecimalFormatError} 非有限值、空串、语法错、超 34 位有效数字、负值（首期）
 */
export const normalizeDecimalString = (input: unknown, field: string): string => {
  if (typeof input !== 'string' || input.length === 0) {
    throw new BomDecimalFormatError(field, `必须是十进制字符串，实际为 ${JSON.stringify(input)}`);
  }
  const match = DECIMAL_INPUT_RE.exec(input);
  if (!match) {
    throw new BomDecimalFormatError(field, `非法十进制语法：${input}`);
  }
  const sign = match[1];
  const mantissa = match[2];
  const exponentText = match[3];
  const exponent = exponentText ? Number(exponentText) : 0;
  // `-0` 写作 `0`：值为零时符号无意义，先归零再拒绝其余负值（首期没有允许负值的字段）
  if (sign === '-' && !/^0*\.?0*$/.test(mantissa)) {
    throw new BomDecimalFormatError(field, '负值不受支持（首期没有允许负值的字段）');
  }
  const canonical = canonicalizePlain(expandExponent(mantissa, exponent));
  const significant = canonical.replace('.', '').replace(/^0+/, '');
  if (significant.length > DECIMAL_MAX_SIGNIFICANT_DIGITS) {
    throw new BomDecimalFormatError(
      field,
      `超过 ${DECIMAL_MAX_SIGNIFICANT_DIGITS} 位有效数字：${significant.length} 位，不截断不舍入`
    );
  }
  return canonical;
};
