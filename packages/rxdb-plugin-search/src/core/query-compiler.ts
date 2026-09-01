/**
 * T028 [US1] — FTS5 查询编译器
 *
 * 将用户输入的自由文本编译为 FTS5 MATCH 表达式：
 *  - 所有 Unicode 非索引字符（含 FTS5 保留字符）都作为 token 分隔符
 *  - token 自身不含 FTS5 保留字符，phrase 包裹不会引入 column-filter 语法
 *  - 单个 token 编译为 `("kw" OR "kw"*)`（完整命中 OR 前缀命中）
 *  - 多 token 之间用 ` AND ` 连接
 *
 * 经归一化后 token 列表为空时返回 `null`，调用方据此跳过 SQL，
 * 状态机回到 `idle`（不视为错误）。
 *
 * @see specs/001-add-global-search/research.md §3
 */

import { compileCjkToken } from '@aiao/rxdb-adapter-sqlite-core';

import { SearchQueryLimitError } from '../types.js';

/** 原始查询最大 UTF-16 code unit 数，限制编译和 FTS 表达式的内存增长。 */
export const MAX_QUERY_LENGTH = 4096;
/** 单次查询最多保留的 token 数，远低于 SQLite bind / expression 硬上限。 */
export const MAX_QUERY_TOKENS = 256;
/** 单个 token 最大 UTF-16 code unit 数，避免超长 phrase 压垮 FTS tokenizer。 */
export const MAX_TOKEN_LENGTH = 256;

/**
 * 非索引字符：标点、符号、空白与各类格式控制字符（含零宽空格）。作为 token 分隔符使用。
 *
 * @remarks
 * 仅删除 FTS5 的 5 个保留字符是不够的：`-`、`!`、`。`、`#` 等都会变成合法 token。
 * FTS5 对这类「空 phrase」表达式返回 0 行且**不报错**，查询于是顺利落到 contains
 * fallback，`instr(lower(body), lower('-')) > 0` 几乎匹配全表 —— 用户敲一个标点
 * 就会拉回整库噪音。这里按 Unicode 类目统一切分，只保留真正可索引的字符。
 */
const NON_INDEXABLE_RE = /[\p{P}\p{S}\p{Z}\p{C}]/gu;

/**
 * 编译后的查询表达式。
 */
export interface CompiledQuery {
  /** FTS5 MATCH 子句正文，例如 `("foo" OR "foo"*) AND ("bar" OR "bar"*)`。 */
  readonly match: string;
  /** 归一化后的 token 列表，按出现顺序保留。 */
  readonly tokens: readonly string[];
}

/**
 * 归一化并校验预算，产出 token 列表。
 *
 * 抽出来是为了让 PostgreSQL backend 的 `compilePgQuery` 复用**同一套**切分规则与预算上限：
 * 两套后端只在「token → 后端表达式」这一步分岔，前面的输入面必须完全一致，
 * 否则同一个查询词在两种存储上会因为切分差异得到不同的结果集（US-703 AC#2）。
 *
 * @param query - 原始输入字符串
 * @returns 归一化后的 token 列表；全为非索引字符时返回 `null`
 * @throws {SearchQueryLimitError} 查询长度 / token 数 / 单 token 长度任一超限
 * @internal
 */
export const tokenizeQuery = (query: string): readonly string[] | null => {
  if (!query) return null;
  // 按非索引字符**切分**而非删除：unicode61 在索引侧同样把它们当分隔符，
  // 删除会把 `local-first` 粘成 `localfirst`，与索引里的 `local` / `first` 两个 token 全都对不上。
  // 切分后纯标点输入自然得到空 token 列表，仍然走下面的 null 短路。
  const tokens = query.split(NON_INDEXABLE_RE).filter(token => token.length > 0);
  if (tokens.length === 0) return null;
  if (query.length > MAX_QUERY_LENGTH) {
    throw new SearchQueryLimitError('queryLength', MAX_QUERY_LENGTH, query.length);
  }
  if (tokens.length > MAX_QUERY_TOKENS) {
    throw new SearchQueryLimitError('tokenCount', MAX_QUERY_TOKENS, tokens.length);
  }
  const oversizedToken = tokens.find(token => token.length > MAX_TOKEN_LENGTH);
  if (oversizedToken) {
    throw new SearchQueryLimitError('tokenLength', MAX_TOKEN_LENGTH, oversizedToken.length);
  }
  return tokens;
};

/**
 * 将自由文本编译为 FTS5 MATCH 表达式。
 *
 * @param query 原始输入字符串
 * @returns 编译结果；若归一化后为空则返回 `null`
 */
export const compile = (query: string): CompiledQuery | null => {
  const tokens = tokenizeQuery(query);
  if (!tokens) return null;
  // CJK token 走 bigram 编译（索引侧同样以 bigram 写入）；其余维持「精确 OR 前缀」
  const match = tokens.map(t => compileCjkToken(t) ?? `("${t}" OR "${t}"*)`).join(' AND ');
  return { match, tokens };
};
