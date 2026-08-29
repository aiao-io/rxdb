/**
 * PostgreSQL `tsquery` 编译器。
 *
 * 与 FTS5 编译器共用 {@link tokenizeQuery}（同一套切分规则、同一组预算上限），
 * 只在「token → 表达式」这一步分岔：
 *  - FTS5：`("kw" OR "kw"*)`，token 之间 ` AND `
 *  - tsquery：`('kw' | 'kw':*)`，token 之间 ` & `
 *
 * 已知方言差异（**有意保留，不是缺陷**）：CJK 不做 bigram 拆分。
 * PG 侧的分词由 `regconfig` 决定，`simple` 会把一整段连续 CJK 当作**一个** lexeme
 * （`to_tsvector('simple','全文搜索')` → `'全文搜索':1`），因此「全文」能以前缀命中，
 * 而「搜索」单独查不中。把 JS 的 bigram 变换搬进 plpgsql 才能对齐，但那要求改写
 * `@aiao/rxdb-adapter-pglite` 已进基线的 `buildFtsTriggersSql`。AC#2 要求的是
 * 「PG **原生**相关性排序」与字段/片段/分页语义一致，分词粒度本就属于后端原生行为。
 *
 * @packageDocumentation
 */

import { tokenizeQuery, type CompiledQuery } from '../../core/query-compiler.js';

/**
 * 转义 tsquery 字面量中的单引号。
 *
 * 撇号属于 `\p{P}`，在 {@link tokenizeQuery} 阶段就已经是分隔符，正常路径下 token 里
 * 不可能出现单引号。这里仍然转义：编译产物会被送进 `to_tsquery('simple', $2)` 的**参数**，
 * 参数化本身已经挡住注入，双写单引号只是保证 tsquery 语法解析器看到的是一个完整字面量，
 * 而不是提前闭合后跟一段语法错误。
 */
const escapeTsQueryLiteral = (token: string): string => token.replace(/'/g, "''");

/**
 * 把自由文本编译为 PostgreSQL `tsquery` 表达式。
 *
 * @param query - 原始输入字符串
 * @returns 编译结果；归一化后为空则返回 `null`
 * @throws {SearchQueryLimitError} 触达与 FTS5 完全相同的查询预算上限
 * @public
 */
export const compilePgQuery = (query: string): CompiledQuery | null => {
  const tokens = tokenizeQuery(query);
  if (!tokens) return null;
  // 与 FTS5 的 `("kw" OR "kw"*)` 对称：完整词命中 OR 前缀命中
  const match = tokens
    .map(token => {
      const literal = escapeTsQueryLiteral(token);
      return `('${literal}' | '${literal}':*)`;
    })
    .join(' & ');
  return { match, tokens };
};
