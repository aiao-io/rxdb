/**
 * SQL 脚本切分。
 *
 * @remarks
 * wasm 后端能拿到 `sqlite3_prepare_v3` 的 `pzTail`，由 SQLite 自己逐条吐出语句；`node:sqlite`
 * 没有对应出口——`prepare()` 只编译第一条语句并**静默丢掉**后面所有语句，`exec()` 跑完整个脚本
 * 却不返回任何结果集。多语句脚本里带 `RETURNING` 的那条因此会人间蒸发（分支切换正是这个形状）。
 *
 * 所以切分只能自己做。状态机逐字搬自 SQLite 的 `complete.c`（即 `sqlite3_complete()` 的实现），
 * 与 SQLite 对「一条语句到哪里结束」的判断同源；自己发明规则迟早会在触发器体或字符串字面量上分叉。
 *
 * @module sqlite-script
 */

const TOKEN_SEMI = 0;
const TOKEN_WS = 1;
const TOKEN_OTHER = 2;
const TOKEN_EXPLAIN = 3;
const TOKEN_CREATE = 4;
const TOKEN_TEMP = 5;
const TOKEN_TRIGGER = 6;
const TOKEN_END = 7;

/** 「刚好读完一条完整语句」的状态，即 `sqlite3_complete()` 的返回条件。 */
const STATE_COMPLETE = 1;

/**
 * `complete.c` 的状态转移表。
 *
 * @remarks
 * 行是状态（0 INVALID / 1 START / 2 NORMAL / 3 EXPLAIN / 4 CREATE / 5 TRIGGER / 6 SEMI / 7 END），
 * 列是记号（SEMI / WS / OTHER / EXPLAIN / CREATE / TEMP / TRIGGER / END）。
 * 状态 5、6 是 `CREATE [TEMP] TRIGGER` 的体内：这两行的 SEMI 列不回到 1，
 * 触发器体内的分号因此不会被当成语句边界。
 */
const TRANSITIONS: readonly (readonly number[])[] = [
  [1, 0, 2, 3, 4, 2, 2, 2],
  [1, 1, 2, 3, 4, 2, 2, 2],
  [1, 2, 2, 2, 2, 2, 2, 2],
  [1, 3, 3, 2, 4, 2, 2, 2],
  [1, 4, 2, 2, 2, 4, 5, 2],
  [6, 5, 5, 5, 5, 5, 5, 5],
  [6, 6, 5, 5, 5, 5, 5, 7],
  [1, 7, 5, 5, 5, 5, 5, 5]
];

/** 只有这几个关键字会影响状态机，其余标识符一律是 OTHER。 */
const KEYWORD_TOKENS = new Map<string, number>([
  ['create', TOKEN_CREATE],
  ['temp', TOKEN_TEMP],
  ['temporary', TOKEN_TEMP],
  ['trigger', TOKEN_TRIGGER],
  ['end', TOKEN_END],
  ['explain', TOKEN_EXPLAIN]
]);

const WHITESPACE = new Set([' ', '\t', '\n', '\r', '\f']);

/** 与 `complete.c` 的 `IdChar` 同集合：字母数字、`_`、`$`，以及一切非 ASCII 字符。 */
const ID_CHAR = /[A-Za-z0-9_$\u0080-\uFFFF]/u;

interface Lexeme {
  readonly token: number;
  /** 该记号之后的下一个下标。 */
  readonly next: number;
}

/**
 * 读出 `index` 处的记号。
 *
 * @remarks
 * 引号不做转义处理，与 `complete.c` 一致：`'a''b'` 会被读成两个相邻的字符串记号，
 * 落到状态机上与读成一个完全等价，因此不必额外分支。
 * 未闭合的引号 / 注释 / 方括号一路吃到串尾，让 SQLite 在 prepare 时报语法错。
 */
const readToken = (sql: string, index: number): Lexeme => {
  const char = sql[index];
  if (char === ';') return { token: TOKEN_SEMI, next: index + 1 };
  if (WHITESPACE.has(char)) return { token: TOKEN_WS, next: index + 1 };
  if (char === '/' && sql[index + 1] === '*') return { token: TOKEN_WS, next: closingIndex(sql, index + 2, '*/') };
  if (char === '-' && sql[index + 1] === '-') return { token: TOKEN_WS, next: closingIndex(sql, index + 2, '\n') };
  if (char === '[') return { token: TOKEN_OTHER, next: closingIndex(sql, index + 1, ']') };
  if (char === '"' || char === "'" || char === '`') {
    return { token: TOKEN_OTHER, next: closingIndex(sql, index + 1, char) };
  }
  if (!ID_CHAR.test(char)) return { token: TOKEN_OTHER, next: index + 1 };
  const end = identifierEnd(sql, index + 1);
  return { token: KEYWORD_TOKENS.get(sql.slice(index, end).toLowerCase()) ?? TOKEN_OTHER, next: end };
};

/** 闭合符之后的下标；没有闭合符时返回串尾。 */
const closingIndex = (sql: string, from: number, closing: string): number => {
  const found = sql.indexOf(closing, from);
  return found === -1 ? sql.length : found + closing.length;
};

const identifierEnd = (sql: string, from: number): number => {
  let end = from;
  while (end < sql.length && ID_CHAR.test(sql[end])) end++;
  return end;
};

/**
 * 把一段可能含多条语句的 SQL 脚本切成单条语句。
 *
 * @remarks
 * 切片保留原文（含语句间的空白与注释），因此把结果按顺序拼回去与原串等价，
 * 报错信息里的 SQL 也仍是调用方写的那一份。只含空白或注释的片段不会成为语句——
 * 它们 prepare 出来是空语句，`node:sqlite` 会直接抛错。
 *
 * @param sql - 一条或多条 SQL 组成的脚本
 * @returns 按出现顺序排列的语句原文；脚本里没有实质语句时为空数组
 */
export function splitSqliteScript(sql: string): string[] {
  const statements: string[] = [];
  let state = 0;
  let start = 0;
  let index = 0;
  let meaningful = false;

  while (index < sql.length) {
    const { token, next } = readToken(sql, index);
    state = TRANSITIONS[state][token];
    index = next;
    if (token !== TOKEN_WS && token !== TOKEN_SEMI) meaningful = true;
    if (token !== TOKEN_SEMI || state !== STATE_COMPLETE) continue;
    if (meaningful) statements.push(sql.slice(start, index));
    meaningful = false;
    start = index;
  }

  if (meaningful) statements.push(sql.slice(start));
  return statements;
}
