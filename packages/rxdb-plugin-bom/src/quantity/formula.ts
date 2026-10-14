/**
 * @fileoverview 公式求值器（US-511 阶段 A）
 *
 * 受限语法：十进制字面量（含指数写法，入口规范化）、`+ − × ÷`、括号、命名参数。
 * 持久化时同时记 {@link FORMULA_GRAMMAR_VERSION}，语法升级不改旧公式的含义。
 * 缺参、语法错、除零、负结果都拒绝整次展开（US-511 AC#14），不以 0 或跳过兜底。
 * 运算全程经十进制 kernel（34 位有效数字、half-even），不经 JS `number`。
 */

import { normalizeDecimalString } from '../decimal.utils.js';
import { BomQuantityError } from '../types.js';
import {
  decimalAdd,
  decimalDiv,
  decimalFromCanonical,
  decimalIsNegative,
  decimalIsZero,
  decimalMul,
  decimalSub,
  decimalToCanonical,
  type Decimal
} from './decimal.js';

/** 公式语法版本：语法升级时递增，旧公式按旧版本求值。 */
export const FORMULA_GRAMMAR_VERSION = '1';

type Token =
  | { kind: 'number'; text: string }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; text: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

/** 词法：数字（含指数写法）、标识符、四则与括号；其余一律语法错。 */
const tokenize = (formula: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;
  while (index < formula.length) {
    const char = formula[index];
    if (char === ' ' || char === '\t' || char === '\n') {
      index += 1;
      continue;
    }
    if (char === '(') {
      tokens.push({ kind: 'lparen' });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ kind: 'rparen' });
      index += 1;
      continue;
    }
    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ kind: 'op', text: char });
      index += 1;
      continue;
    }
    const number = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(formula.slice(index));
    if (number) {
      tokens.push({ kind: 'number', text: number[0] });
      index += number[0].length;
      continue;
    }
    // 参数名允许 Unicode 字母（业务参数名如 长/宽/厚/密度）
    const ident = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(formula.slice(index));
    if (ident) {
      tokens.push({ kind: 'ident', name: ident[0] });
      index += ident[0].length;
      continue;
    }
    throw new BomQuantityError(`公式 ${formula} 位置 ${index} 语法错误`);
  }
  return tokens;
};

/** 解析期上下文：公式原文与参数表（报错点名用）。 */
interface ParseContext {
  formula: string;
  params: Record<string, string>;
  tokens: Token[];
  position: number;
}

const literalValue = (context: ParseContext, text: string): Decimal => {
  try {
    return decimalFromCanonical(normalizeDecimalString(text, `公式 ${context.formula} 的字面量`));
  } catch (error) {
    throw new BomQuantityError(String((error as Error).message).replace(/^\[rxdb-plugin-bom\]\s*/, ''));
  }
};

/** factor := literal | ident | '(' expr ')' */
const parseFactor = (context: ParseContext): Decimal => {
  const token = context.tokens[context.position];
  if (!token) throw new BomQuantityError(`公式 ${context.formula} 意外结束`);
  if (token.kind === 'number') {
    context.position += 1;
    return literalValue(context, token.text);
  }
  if (token.kind === 'ident') {
    context.position += 1;
    const value = context.params[token.name];
    if (value === undefined) {
      throw new BomQuantityError(`公式 ${context.formula} 缺参数 ${token.name}`);
    }
    return literalValue(context, value);
  }
  if (token.kind === 'lparen') {
    context.position += 1;
    const inner = parseExpr(context);
    const closing = context.tokens[context.position];
    if (!closing || closing.kind !== 'rparen') {
      throw new BomQuantityError(`公式 ${context.formula} 缺右括号`);
    }
    context.position += 1;
    return inner;
  }
  throw new BomQuantityError(`公式 ${context.formula} 位置 ${context.position} 语法错误`);
};

/** term := factor (('*'|'/') factor)* */
const parseTerm = (context: ParseContext): Decimal => {
  let value = parseFactor(context);
  for (;;) {
    const token = context.tokens[context.position];
    if (!token || token.kind !== 'op' || (token.text !== '*' && token.text !== '/')) break;
    context.position += 1;
    const right = parseFactor(context);
    if (token.text === '*') {
      value = decimalMul(value, right);
    } else {
      try {
        value = decimalDiv(value, right);
      } catch (error) {
        throw new BomQuantityError(`公式 ${context.formula} 除数为零`);
      }
    }
  }
  return value;
};

/** expr := term (('+'|'-') term)* */
const parseExpr = (context: ParseContext): Decimal => {
  let value = parseTerm(context);
  for (;;) {
    const token = context.tokens[context.position];
    if (!token || token.kind !== 'op' || (token.text !== '+' && token.text !== '-')) break;
    context.position += 1;
    const right = parseTerm(context);
    value =
      token.text === '+' ?
        decimalAdd(value, right)
      : decimalSub(value, right);
  }
  return value;
};

/**
 * 求值公式（受限语法），返回规范十进制串。
 *
 * @param formula - 公式文本（持久化时连同 {@link FORMULA_GRAMMAR_VERSION} 一起记）
 * @param params - 命名参数（值走入口规范化，接受指数写法）
 * @returns 规范十进制串（34 位有效数字、half-even 中间量）
 *
 * @throws {@link BomQuantityError} 缺参 / 语法错 / 除零 / 负结果
 */
export const evaluateFormula = (formula: string, params: Record<string, string>): string => {
  const context: ParseContext = { formula, params, tokens: tokenize(formula), position: 0 };
  const value = parseExpr(context);
  if (context.position !== context.tokens.length) {
    throw new BomQuantityError(`公式 ${formula} 位置 ${context.position} 有多余记号`);
  }
  if (decimalIsNegative(value)) {
    throw new BomQuantityError(`公式 ${formula} 结果为负（首期没有负需求）`);
  }
  // 除零已在 decimalDiv 拒绝；BigInt kernel 恒有限
  if (decimalIsZero(value)) return '0';
  return decimalToCanonical(value);
};
