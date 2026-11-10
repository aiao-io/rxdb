/**
 * 顶层指令序言（directive prologue）扫描。
 *
 * @remarks
 * 只服务于构建期在 chunk 开头插语句：插入点必须落在整段序言之后，否则序言里的 `use strict`
 * 变成普通表达式，chunk 静默变成非严格。按 ECMAScript 词法跳过空白、行终结符、注释与开头的
 * hashbang，逐条读「只有一个字符串字面量的语句」，读到第一条别的语句就停；之后的代码一概不读，
 * 不是完整的 JS 解析器。
 *
 * 拿不准时一律判「不是指令」：把真指令误判成表达式，结果与修复前一样插在最前面；反过来把
 * `"a"\n+ b` 这类表达式误判成指令再插语句，会改掉程序语义。
 */

/** 扫描结果。 */
export interface DirectivePrologue {
  /** 序言之后、第一条普通语句之前的插入点；没有指令时是 0（或 hashbang 行尾）。 */
  readonly end: number;
  /** 末条指令没写分号、靠自动分号插入结束：在 `end` 处插语句前要先补一个分号。 */
  readonly needsSemicolon: boolean;
  /** 各条指令引号之间的原文，不解码转义（`use strict` 指令要求逐字匹配，转义写法不算）。 */
  readonly directives: readonly string[];
}

const LINE_TERMINATOR = /[\n\r\u2028\u2029]/;

/**
 * 字符串语句后隔着换行、能触发自动分号插入的下一条语句开头：标识符、关键字、数字、字符串、块。
 * 运算符、括号、成员访问、模板字面量都可能把前面的字符串接成更大的表达式，不在此列。
 */
const STATEMENT_START = /[\p{ID_Start}$_\\0-9"'{]/uy;

/** 以 `in` / `instanceof` 开头时字符串仍是更大表达式的左操作数。 */
const RELATIONAL_KEYWORD = /(?:in|instanceof)(?![\p{ID_Continue}$\u200c\u200d])/uy;

const matchesAt = (pattern: RegExp, code: string, index: number): boolean => {
  pattern.lastIndex = index;
  return pattern.test(code);
};

/** 开头的 hashbang 行（`#!...`）之后的位置。 */
const hashbangEnd = (code: string): number => {
  if (!code.startsWith('#!')) return 0;
  const lineEnd = code.slice(2).search(LINE_TERMINATOR);
  return lineEnd === -1 ? code.length : lineEnd + 2;
};

/** 跳过一段注释；返回注释之后的位置与其中是否有换行，未闭合的块注释返回 `undefined`。 */
const skipComment = (code: string, index: number): { index: number; newline: boolean } | undefined => {
  if (code.startsWith('//', index)) {
    const lineEnd = code.slice(index).search(LINE_TERMINATOR);
    return { index: lineEnd === -1 ? code.length : index + lineEnd, newline: false };
  }
  const close = code.indexOf('*/', index + 2);
  if (close === -1) return undefined;
  return { index: close + 2, newline: LINE_TERMINATOR.test(code.slice(index, close)) };
};

/** 跳过空白、行终结符与注释；返回下一个记号的位置，以及途中是否跨过换行。 */
const skipTrivia = (code: string, start: number): { index: number; newline: boolean } => {
  let index = start;
  let newline = false;
  while (index < code.length) {
    const char = code.charAt(index);
    const comment = code.startsWith('//', index) || code.startsWith('/*', index) ? skipComment(code, index) : undefined;
    if (comment) {
      index = comment.index;
      newline ||= comment.newline;
    } else if (/\s/.test(char)) {
      newline ||= LINE_TERMINATOR.test(char);
      index += 1;
    } else {
      break;
    }
  }
  return { index, newline };
};

/** 读 `start` 处的字符串字面量；不是字符串、未闭合或含裸换行时返回 `undefined`。 */
const readString = (code: string, start: number): { raw: string; end: number } | undefined => {
  const quote = code.charAt(start);
  if (quote !== '"' && quote !== "'") return undefined;
  let index = start + 1;
  while (index < code.length && code.charAt(index) !== quote) {
    if (code.charAt(index) === '\n' || code.charAt(index) === '\r') return undefined;
    index += code.charAt(index) === '\\' ? 2 : 1;
  }
  if (index >= code.length) return undefined;
  return { raw: code.slice(start + 1, index), end: index + 1 };
};

/** 字符串之后的语句结尾：显式分号、文件末尾，或换行后接着一条新语句；否则它不是指令。 */
const directiveEnd = (code: string, from: number): { end: number; explicit: boolean } | undefined => {
  const { index, newline } = skipTrivia(code, from);
  if (code.charAt(index) === ';') return { end: index + 1, explicit: true };
  if (index >= code.length) return { end: from, explicit: false };
  const startsStatement = matchesAt(STATEMENT_START, code, index) && !matchesAt(RELATIONAL_KEYWORD, code, index);
  return newline && startsStatement ? { end: from, explicit: false } : undefined;
};

/**
 * 扫描 `code` 顶层的指令序言。
 *
 * @param code - chunk 源码（脚本或 CommonJS 模块函数体）
 * @returns 见 {@link DirectivePrologue}
 */
export function scanDirectivePrologue(code: string): DirectivePrologue {
  let end = hashbangEnd(code);
  let needsSemicolon = false;
  const directives: string[] = [];
  for (;;) {
    const literal = readString(code, skipTrivia(code, end).index);
    const statementEnd = literal && directiveEnd(code, literal.end);
    if (!literal || !statementEnd) break;
    directives.push(literal.raw);
    end = statementEnd.end;
    needsSemicolon = !statementEnd.explicit;
  }
  return { end, needsSemicolon, directives };
}
