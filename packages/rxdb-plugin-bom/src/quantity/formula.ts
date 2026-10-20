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

/**
 * 括号嵌套深度上限：业务公式（如 长×宽×厚×密度）远用不到；递归下降每层占三帧，
 * 超深嵌套在爆炸期会撑爆调用栈（RangeError），解析期按此拒绝为领域错误。
 */
const FORMULA_MAX_DEPTH = 64;

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

/** 因子：字面量（解析期已规范化）、命名参数或括号内的子表达式。 */
type Factor = { kind: 'literal'; value: Decimal } | { kind: 'param'; name: string } | { kind: 'group'; expr: Expr };

/** 左结合链：首项依次与后续项运算——求值逐项循环，递归深度只随括号增长、不随链长增长。 */
interface Chain<Operand, Operator> {
  first: Operand;
  rest: { op: Operator; operand: Operand }[];
}

type Term = Chain<Factor, '*' | '/'>;
type Expr = Chain<Term, '+' | '-'>;

/** 解析期上下文：公式原文（报错点名用）与记号游标。 */
interface ParseContext {
  formula: string;
  tokens: Token[];
  position: number;
  /** 当前括号嵌套深度。 */
  depth: number;
}

const literalValue = (formula: string, text: string): Decimal => {
  try {
    return decimalFromCanonical(normalizeDecimalString(text, `公式 ${formula} 的字面量`));
  } catch (error) {
    throw new BomQuantityError(String((error as Error).message).replace(/^\[rxdb-plugin-bom\]\s*/, ''));
  }
};

/** factor := literal | ident | '(' expr ')' */
const parseFactor = (context: ParseContext): Factor => {
  const token = context.tokens[context.position];
  if (!token) throw new BomQuantityError(`公式 ${context.formula} 意外结束`);
  if (token.kind === 'number') {
    context.position += 1;
    return { kind: 'literal', value: literalValue(context.formula, token.text) };
  }
  if (token.kind === 'ident') {
    context.position += 1;
    return { kind: 'param', name: token.name };
  }
  if (token.kind === 'lparen') {
    if (context.depth >= FORMULA_MAX_DEPTH) {
      throw new BomQuantityError(`公式 ${context.formula} 括号嵌套深度超过 ${FORMULA_MAX_DEPTH}`);
    }
    context.position += 1;
    context.depth += 1;
    const expr = parseExpr(context);
    context.depth -= 1;
    const closing = context.tokens[context.position];
    if (!closing || closing.kind !== 'rparen') {
      throw new BomQuantityError(`公式 ${context.formula} 缺右括号`);
    }
    context.position += 1;
    return { kind: 'group', expr };
  }
  throw new BomQuantityError(`公式 ${context.formula} 位置 ${context.position} 语法错误`);
};

/** 解析一条左结合链：`operand (op operand)*`，op 取自 `operators`。 */
const parseChain = <Operand, Operator extends '+' | '-' | '*' | '/'>(
  context: ParseContext,
  operators: readonly Operator[],
  parseOperand: (context: ParseContext) => Operand
): Chain<Operand, Operator> => {
  const chain: Chain<Operand, Operator> = { first: parseOperand(context), rest: [] };
  for (;;) {
    const token = context.tokens[context.position];
    if (!token || token.kind !== 'op' || !(operators as readonly string[]).includes(token.text)) return chain;
    context.position += 1;
    chain.rest.push({ op: token.text as Operator, operand: parseOperand(context) });
  }
};

/** term := factor (('*'|'/') factor)* */
const parseTerm = (context: ParseContext): Term => parseChain(context, ['*', '/'] as const, parseFactor);

/** expr := term (('+'|'-') term)* */
const parseExpr = (context: ParseContext): Expr => parseChain(context, ['+', '-'] as const, parseTerm);

/** 解析整条公式：语法错、非法字面量、括号超深、多余记号都在这里拒绝（不需要参数值）。 */
const parseFormula = (formula: string): Expr => {
  const context: ParseContext = { formula, tokens: tokenize(formula), position: 0, depth: 0 };
  const expr = parseExpr(context);
  if (context.position !== context.tokens.length) {
    throw new BomQuantityError(`公式 ${formula} 位置 ${context.position} 有多余记号`);
  }
  return expr;
};

/** 求值期作用域：公式原文与参数表（报错点名用）。 */
interface EvaluationScope {
  formula: string;
  params: Record<string, string>;
}

const evaluateFactor = (factor: Factor, scope: EvaluationScope): Decimal => {
  if (factor.kind === 'literal') return factor.value;
  if (factor.kind === 'group') return evaluateExpr(factor.expr, scope);
  const value = scope.params[factor.name];
  if (value === undefined) throw new BomQuantityError(`公式 ${scope.formula} 缺参数 ${factor.name}`);
  return literalValue(scope.formula, value);
};

const evaluateTerm = (term: Term, scope: EvaluationScope): Decimal => {
  let value = evaluateFactor(term.first, scope);
  for (const { op, operand } of term.rest) {
    const right = evaluateFactor(operand, scope);
    if (op === '*') {
      value = decimalMul(value, right);
      continue;
    }
    try {
      value = decimalDiv(value, right);
    } catch {
      throw new BomQuantityError(`公式 ${scope.formula} 除数为零`);
    }
  }
  return value;
};

const evaluateExpr = (expr: Expr, scope: EvaluationScope): Decimal => {
  let value = evaluateTerm(expr.first, scope);
  for (const { op, operand } of expr.rest) {
    const right = evaluateTerm(operand, scope);
    value = op === '+' ? decimalAdd(value, right) : decimalSub(value, right);
  }
  return value;
};

/**
 * 公式的纯语法校验（写入期用）：不需要参数值，只判定语法、字面量与括号深度。
 *
 * @remarks
 * 与 {@link evaluateFormula} 同一解析器，判定不会漂移；缺参、除零与负结果依赖参数值，只能在求值期判定。
 *
 * @param formula - 公式文本
 *
 * @throws {@link BomQuantityError} 语法错 / 非法字面量 / 括号嵌套超 64 层 / 多余记号
 */
export const assertFormulaSyntax = (formula: string): void => {
  parseFormula(formula);
};

/**
 * 求值公式（受限语法），返回规范十进制串。
 *
 * @param formula - 公式文本（持久化时连同 {@link FORMULA_GRAMMAR_VERSION} 一起记）
 * @param params - 命名参数（值走入口规范化，接受指数写法）
 * @returns 规范十进制串（34 位有效数字、half-even 中间量）
 *
 * @throws {@link BomQuantityError} 缺参 / 语法错 / 括号嵌套超 64 层 / 除零 / 负结果
 */
export const evaluateFormula = (formula: string, params: Record<string, string>): string => {
  const value = evaluateExpr(parseFormula(formula), { formula, params });
  if (decimalIsNegative(value)) {
    throw new BomQuantityError(`公式 ${formula} 结果为负（首期没有负需求）`);
  }
  // 除零已在 decimalDiv 拒绝；BigInt kernel 恒有限
  if (decimalIsZero(value)) return '0';
  return decimalToCanonical(value);
};
