/**
 * @fileoverview 配置选择条件的最小语法（US-517）
 *
 * 语法版本 {@link CONDITION_GRAMMAR_VERSION}：原子谓词 `特征 = 值` / `特征 != 值` /
 * `特征 in (值, 值, …)`，以 `AND` / `OR` / `NOT` 与括号组合，优先级 NOT > AND > OR。
 * 特征与值是标识符（中文 / 字母 / 数字 / 下划线）或引号字符串（`'…'` / `"…"`，无转义，
 * 内容可含空白）。`AND` / `OR` / `NOT` / `in` 是保留词：须与相邻标识符以空白或括号分隔，
 * 特征与值不得与保留词同名（同名可改用引号字符串书写值）。
 *
 * 词法与语法都是手写实现（无正则——CodeQL ReDoS 教训，同 decimal.utils.ts 的
 * parseDecimalInput 先例）；语法错误抛 {@link BomConfigSyntaxError}，点名行 / 列与原因。
 * 语法升级时递增版本号、旧条件按旧版本求值（同 US-511 的 FORMULA_GRAMMAR_VERSION）。
 */

import { BomError } from '../types.js';

/** 选择条件语法版本：语法升级时递增，旧条件按旧版本求值（与 US-511 公式语法版本同构）。 */
export const CONDITION_GRAMMAR_VERSION = '1';

/**
 * 配置违约（US-517）：保存期引用校验发现未知特征 / 值等。
 */
export class BomConfigError extends BomError {
  constructor(
    /** 违约点（如「条件 颜色=红」）。 */
    readonly subject: string,
    /** 具体说明（如「未知特征「颜色」（第 1 行第 1 列）」）。 */
    readonly detail: string
  ) {
    super(`配置违约：${subject}${detail.length > 0 ? ` ${detail}` : ''}`, 'BomConfigError');
  }
}

/**
 * 选择条件语法错误（US-517 AC#5）：不合最小语法，点名行 / 列与原因。
 *
 * @remarks
 * 是 {@link BomConfigError} 的子类——保存期校验的调用方抓一个基类即可覆盖两类违约。
 */
export class BomConfigSyntaxError extends BomConfigError {
  constructor(
    /** 出错的表达式原文。 */
    readonly expression: string,
    /** 出错位置（字符偏移，按 UTF-16 码元计）。 */
    readonly offset: number,
    /** 语法错误说明。 */
    override readonly detail: string
  ) {
    super(`条件 ${expression}`, `语法错误（${positionText(expression, offset)}）：${detail}`);
    this.name = 'BomConfigSyntaxError';
  }
}

/**
 * 把字符偏移换算成「第 L 行第 C 列」（1 起）的人读位置；换行按 `\n` 计，
 * 列按 UTF-16 码元计（中文标识符一个字占一列）。
 */
export const positionText = (source: string, offset: number | undefined): string => {
  if (offset === undefined) return '';
  let line = 1;
  let column = 1;
  const end = Math.min(offset, source.length);
  for (let index = 0; index < end; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return `第 ${line} 行第 ${column} 列`;
};

/** 原子谓词的公共字段：特征标识与解析位置（手工构造的 AST 可省略位置信息）。 */
interface ConditionAtomBase {
  kind: 'atom';
  charCode: string;
  /** 特征标识的字符偏移（解析器补齐；保存期校验点名位置用）。 */
  offset?: number;
  /** 各值标识的字符偏移，与 `value` 一一对应（解析器补齐）。 */
  valueOffsets?: number[];
}

/**
 * 选择条件 AST。
 *
 * @remarks
 * 原子谓词按运算符判别：`eq` / `ne` 取单值，`in` 取值列表（与最小语法的
 * `特征 = 值` / `特征 != 值` / `特征 in (值, 值, …)` 一一对应）；
 * 同层 `AND` / `OR` 在解析时拍平成 n 元节点。
 */
export type ConditionAst =
  | (ConditionAtomBase & { op: 'eq' | 'ne'; value: string })
  | (ConditionAtomBase & { op: 'in'; value: string[] })
  | { kind: 'and' | 'or'; operands: ConditionAst[] }
  | { kind: 'not'; operand: ConditionAst };

/** ASCII 数字 / 字母 / 下划线的逐码点判断（词法线性扫描，无正则）。 */
const isAsciiIdentChar = (code: number): boolean =>
  (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;

/** 非 ASCII 空白码点（全角空格、NBSP、行 / 段分隔符、BOM 等）。 */
const isNonAsciiWhitespace = (code: number): boolean =>
  code === 0x00a0 ||
  code === 0x1680 ||
  (code >= 0x2000 && code <= 0x200a) ||
  code === 0x2028 ||
  code === 0x2029 ||
  code === 0x202f ||
  code === 0x205f ||
  code === 0x3000 ||
  code === 0xfeff;

/** 空白：ASCII 空格 / 制表 / 换行 / 回车 + 非 ASCII 空白。 */
const isWhitespace = (code: number): boolean =>
  code === 32 || code === 9 || code === 10 || code === 13 || isNonAsciiWhitespace(code);

/**
 * 标识符字符：ASCII 字母 / 数字 / 下划线，或非 ASCII 且非空白的码点（中文等）。
 * 最小语法的标点都是 ASCII 的；非 ASCII 标点（如全角逗号）会被收进标识符，
 * 由保存期引用校验按未知标识点名——不静默放行。
 */
const isIdentChar = (code: number): boolean => isAsciiIdentChar(code) || (code > 127 && !isNonAsciiWhitespace(code));

/** 词法记号：标识符 / 引号字符串 / 运算符与括号，均带字符偏移。 */
type ConditionToken =
  | { kind: 'ident'; text: string; offset: number }
  | { kind: 'string'; text: string; offset: number }
  | { kind: 'eq' | 'ne' | 'lparen' | 'rparen' | 'comma'; offset: number };

/**
 * 词法：标识符、引号字符串、`=` / `!=`、括号与逗号，跳过空白；
 * 其余字符一律 {@link BomConfigSyntaxError}（点名行 / 列）。
 * `AND` / `OR` / `NOT` / `in` 不单独成词——语法层按位置识别保留词。
 */
const tokenize = (expression: string): ConditionToken[] => {
  const tokens: ConditionToken[] = [];
  let index = 0;
  while (index < expression.length) {
    const offset = index;
    const code = expression.codePointAt(index) ?? 0;
    const char = String.fromCodePoint(code);
    if (isWhitespace(code)) {
      index += char.length;
      continue;
    }
    if (code === 40 /* ( */) {
      tokens.push({ kind: 'lparen', offset });
      index += 1;
      continue;
    }
    if (code === 41 /* ) */) {
      tokens.push({ kind: 'rparen', offset });
      index += 1;
      continue;
    }
    if (code === 44 /* , */) {
      tokens.push({ kind: 'comma', offset });
      index += 1;
      continue;
    }
    if (code === 61 /* = */) {
      tokens.push({ kind: 'eq', offset });
      index += 1;
      continue;
    }
    if (code === 33 /* ! */) {
      if (expression.codePointAt(index + 1) === 61) {
        tokens.push({ kind: 'ne', offset });
        index += 2;
        continue;
      }
      throw new BomConfigSyntaxError(expression, offset, '「!」后必须跟「=」组成「!=」');
    }
    if (code === 39 /* ' */ || code === 34 /* " */) {
      // 引号字符串：读到同一引号为止（最小语法无转义）；内容可含中文 / 空白。
      let end = index + 1;
      while (end < expression.length && expression.codePointAt(end) !== code) {
        end += String.fromCodePoint(expression.codePointAt(end) ?? 0).length;
      }
      if (end >= expression.length) {
        throw new BomConfigSyntaxError(expression, offset, '字符串未闭合');
      }
      tokens.push({ kind: 'string', text: expression.slice(index + 1, end), offset });
      index = end + 1;
      continue;
    }
    if (isIdentChar(code)) {
      let end = index;
      while (end < expression.length) {
        const next = expression.codePointAt(end) ?? 0;
        if (!isIdentChar(next)) break;
        end += String.fromCodePoint(next).length;
      }
      tokens.push({ kind: 'ident', text: expression.slice(index, end), offset });
      index = end;
      continue;
    }
    throw new BomConfigSyntaxError(expression, offset, `意外字符「${char}」`);
  }
  return tokens;
};

/** 解析期上下文：原文、记号流与当前位置。 */
interface ConditionParseContext {
  expression: string;
  tokens: ConditionToken[];
  position: number;
}

/** 当前记号（无更多记号时为 undefined）。 */
const peekToken = (context: ConditionParseContext): ConditionToken | undefined => context.tokens[context.position];

/** 记号的人读描述（语法错误点名用）。 */
const describeToken = (token: ConditionToken): string => {
  switch (token.kind) {
    case 'ident':
      return `标识「${token.text}」`;
    case 'string':
      return `字符串「${token.text}」`;
    case 'eq':
      return '「=」';
    case 'ne':
      return '「!=」';
    case 'lparen':
      return '「(」';
    case 'rparen':
      return '「)」';
    case 'comma':
      return '「,」';
  }
};

/** 当前记号是指定保留词时消费之。 */
const matchKeyword = (context: ConditionParseContext, keyword: string): boolean => {
  const token = peekToken(context);
  if (token !== undefined && token.kind === 'ident' && token.text === keyword) {
    context.position += 1;
    return true;
  }
  return false;
};

/** 意外结束的语法错误（位置取表达式末尾）。 */
const unexpectedEnd = (context: ConditionParseContext, detail: string): BomConfigSyntaxError =>
  new BomConfigSyntaxError(context.expression, context.expression.length, detail);

/** value := 标识符 | 引号字符串 */
const parseValue = (context: ConditionParseContext): { text: string; offset: number } => {
  const token = peekToken(context);
  if (token === undefined) throw unexpectedEnd(context, '意外结束：期望值（标识符或引号字符串）');
  if (token.kind === 'ident' || token.kind === 'string') {
    context.position += 1;
    return { text: token.text, offset: token.offset };
  }
  throw new BomConfigSyntaxError(
    context.expression,
    token.offset,
    `期望值（标识符或引号字符串），实际为${describeToken(token)}`
  );
};

/** atom := 标识符 ('=' 值 | '!=' 值 | 'in' '(' 值 (',' 值)* ')') */
const parseAtom = (context: ConditionParseContext): ConditionAst => {
  const token = peekToken(context);
  if (token === undefined) throw unexpectedEnd(context, '意外结束：期望特征标识');
  if (token.kind !== 'ident') {
    throw new BomConfigSyntaxError(context.expression, token.offset, `期望特征标识，实际为${describeToken(token)}`);
  }
  const charCode = token.text;
  const offset = token.offset;
  context.position += 1;
  const operator = peekToken(context);
  if (operator === undefined) {
    throw unexpectedEnd(context, '意外结束：特征后期望 =、!= 或 in');
  }
  if (operator.kind === 'eq' || operator.kind === 'ne') {
    context.position += 1;
    const value = parseValue(context);
    return {
      kind: 'atom',
      charCode,
      op: operator.kind,
      value: value.text,
      offset,
      valueOffsets: [value.offset]
    };
  }
  if (operator.kind === 'ident' && operator.text === 'in') {
    context.position += 1;
    const leftParen = peekToken(context);
    if (leftParen === undefined) throw unexpectedEnd(context, '意外结束：in 后期望 (值, 值, …)');
    if (leftParen.kind !== 'lparen') {
      throw new BomConfigSyntaxError(
        context.expression,
        leftParen.offset,
        `in 后期望 (值, 值, …)，实际为${describeToken(leftParen)}`
      );
    }
    context.position += 1;
    const values: string[] = [];
    const valueOffsets: number[] = [];
    const first = peekToken(context);
    if (first === undefined) throw unexpectedEnd(context, '意外结束：in 列表期望值');
    if (first.kind === 'rparen') {
      throw new BomConfigSyntaxError(context.expression, first.offset, 'in 列表至少需要一个值');
    }
    for (;;) {
      const value = parseValue(context);
      values.push(value.text);
      valueOffsets.push(value.offset);
      const separator = peekToken(context);
      if (separator === undefined) throw unexpectedEnd(context, '意外结束：in 列表缺右括号');
      if (separator.kind === 'comma') {
        context.position += 1;
        continue;
      }
      if (separator.kind === 'rparen') {
        context.position += 1;
        break;
      }
      throw new BomConfigSyntaxError(
        context.expression,
        separator.offset,
        `in 列表期望逗号或右括号，实际为${describeToken(separator)}`
      );
    }
    return { kind: 'atom', charCode, op: 'in', value: values, offset, valueOffsets };
  }
  throw new BomConfigSyntaxError(
    context.expression,
    operator.offset,
    `期望 =、!= 或 in，实际为${describeToken(operator)}`
  );
};

/** primary := '(' orExpr ')' | atom */
const parsePrimary = (context: ConditionParseContext): ConditionAst => {
  const token = peekToken(context);
  if (token === undefined) throw unexpectedEnd(context, '意外结束：期望 ( 或原子谓词');
  if (token.kind === 'lparen') {
    context.position += 1;
    const inner = parseOr(context);
    const closing = peekToken(context);
    if (closing === undefined) throw unexpectedEnd(context, '意外结束：缺右括号');
    if (closing.kind !== 'rparen') {
      throw new BomConfigSyntaxError(context.expression, closing.offset, `缺右括号，实际为${describeToken(closing)}`);
    }
    context.position += 1;
    return inner;
  }
  return parseAtom(context);
};

/** notExpr := 'NOT' notExpr | primary（NOT 优先级最高，右结合） */
const parseNot = (context: ConditionParseContext): ConditionAst => {
  if (matchKeyword(context, 'NOT')) {
    return { kind: 'not', operand: parseNot(context) };
  }
  return parsePrimary(context);
};

/** andExpr := notExpr ('AND' notExpr)*（AND 次之；同层 AND 拍平成 n 元节点） */
const parseAnd = (context: ConditionParseContext): ConditionAst => {
  let left = parseNot(context);
  while (matchKeyword(context, 'AND')) {
    const right = parseNot(context);
    left =
      left.kind === 'and' ?
        { kind: 'and', operands: [...left.operands, right] }
      : { kind: 'and', operands: [left, right] };
  }
  return left;
};

/** orExpr := andExpr ('OR' andExpr)*（OR 最低；同层 OR 拍平成 n 元节点） */
const parseOr = (context: ConditionParseContext): ConditionAst => {
  let left = parseAnd(context);
  while (matchKeyword(context, 'OR')) {
    const right = parseAnd(context);
    left =
      left.kind === 'or' ?
        { kind: 'or', operands: [...left.operands, right] }
      : { kind: 'or', operands: [left, right] };
  }
  return left;
};

/**
 * 解析选择条件（语法版本 {@link CONDITION_GRAMMAR_VERSION}）
 *
 * @param expression - 条件表达式文本（持久化时连同语法版本一起记入 config_condition）
 * @returns 解析结果（AST 的原子谓词带特征 / 值的位置信息，保存期校验点名用）
 *
 * @throws {@link BomConfigSyntaxError} 不合最小语法（点名行 / 列与原因）
 */
export const parseCondition = (expression: string): { ast: ConditionAst } => {
  const tokens = tokenize(expression);
  if (tokens.length === 0) {
    throw new BomConfigSyntaxError(expression, 0, '条件为空');
  }
  const context: ConditionParseContext = { expression, tokens, position: 0 };
  const ast = parseOr(context);
  if (context.position !== context.tokens.length) {
    const extra = context.tokens[context.position];
    throw new BomConfigSyntaxError(context.expression, extra.offset, `多余记号${describeToken(extra)}`);
  }
  return { ast };
};

/**
 * 求值选择条件：特征未选中 = 该特征的值集合为空。
 *
 * @remarks
 * `=` 要求选中集合恰含该值；`!=` 要求选中集合不含该值（未选中的特征也算不含）；
 * `in` 要求选中集合与列表交集非空。三值语义只体现在原子层：未选中特征在 `=` 下为假、
 * 其 `NOT` 为真——布尔组合不再引入「未知」。
 *
 * @param ast - 已解析的条件 AST
 * @param selection - 配置输入（特征 code → 选中值集合；未给的特征按未选中求值）
 * @returns 条件是否满足
 */
export const evaluateCondition = (ast: ConditionAst, selection: Record<string, string[]>): boolean => {
  switch (ast.kind) {
    case 'atom': {
      const selected = selection[ast.charCode] ?? [];
      switch (ast.op) {
        case 'eq':
          return selected.includes(ast.value);
        case 'ne':
          return !selected.includes(ast.value);
        case 'in':
          return selected.some(value => ast.value.includes(value));
        default:
          throw new BomConfigError('选择条件求值', `未知原子运算符（AST：${JSON.stringify(ast)}）`);
      }
    }
    case 'not':
      return !evaluateCondition(ast.operand, selection);
    case 'and':
      return ast.operands.every(operand => evaluateCondition(operand, selection));
    case 'or':
      return ast.operands.some(operand => evaluateCondition(operand, selection));
  }
};
