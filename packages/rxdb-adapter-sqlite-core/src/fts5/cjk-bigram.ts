/**
 * CJK bigram 切分：FTS5 内置分词器对中日韩文本的补偿层。
 *
 * @remarks
 * `unicode61` 把 CJK 表意文字全部归为「词字符」，因此一整段连续中文会被切成**一个** token
 * （`全文搜索引擎设计` → 单 token），中缀查询 100% 零召回。
 * `trigram` 看似能解决，实测（SQLite 3.53.1）却对**少于 3 字**的查询一律零召回——
 * 而中文词绝大多数是 2 字（搜索 / 全文 / 设计），因此不可用。
 *
 * 这里改为在索引侧与查询侧同时做 bigram 切分，并额外写入 unigram：
 * `全文搜索引擎设计` → `全 文 全文 文搜 搜索 索引 引擎 擎设 设计`，
 * 查询 `搜索` 即可精确命中，`引擎设计` 拆成 `引擎 AND 擎设 AND 设计` 得到近似子串语义。
 *
 * **索引侧与查询侧必须共用本模块**：两侧切法只要有一点不一致，就会整体失配。
 *
 * @module
 */

/**
 * 连续 CJK 段的匹配式。
 *
 * 覆盖：CJK 统一表意文字（含扩展 A）、兼容表意文字、日文平假名/片假名、韩文音节。
 * 不覆盖拉丁/数字——它们由 `unicode61` 自己按空白与标点正常切词。
 */
const CJK_RUN = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]+/g;

/** 把一段连续 CJK 文本切成 unigram + bigram 序列；单字原样返回。 */
const toIndexTokens = (run: string): string[] => {
  if (run.length <= 1) return [run];
  const out: string[] = Array.from(run);
  for (let i = 0; i < run.length - 1; i += 1) out.push(run.slice(i, i + 2));
  return out;
};

/**
 * 判断字符串是否含有连续 CJK 文本。
 *
 * @param value 待检测文本
 * @returns 含任意 CJK 字符时为 `true`
 */
export const hasCjk = (value: string): boolean => {
  CJK_RUN.lastIndex = 0;
  return CJK_RUN.test(value);
};

/** 该位置是否已构成 token 边界：越界（串首/串尾）或空白都算。 */
const isTokenBoundary = (char: string | undefined): boolean => char === undefined || /\s/.test(char);

/**
 * 索引侧变换：把文本中的每段连续 CJK 替换为空格分隔的 unigram + bigram 序列。
 *
 * @param value 原始字段文本
 * @returns 供 FTS5 索引的文本；非 CJK 部分原样保留
 *
 * @remarks
 * 只改写进 FTS 索引的内容，**不改源表**。摘要仍由 `search-engine` 从源表原文截取，
 * 因此用户看到的 snippet 不会出现 bigram 痕迹。
 *
 * CJK 段与紧邻的拉丁/数字之间会补一个空格（SQLC-013）：`unicode61` 不在脚本边界切词，
 * `rxdb搜索` 不补空格就是**一个** token，而查询侧 {@link compileCjkToken} 分段编译成
 * `("rxdb" OR "rxdb"*) AND "搜索"`，两个 token 在索引里都不存在 —— 零召回。
 * 已经是空白的边界不重复补，因此 `'rxdb 全文搜索 guide'` 不会产生连续空格。
 *
 * @example
 * ```ts
 * indexTextForFts('rxdb 全文搜索'); // 'rxdb 全文 文搜 搜索'
 * indexTextForFts('rxdb搜索');      // 'rxdb 搜索'
 * ```
 */
export const indexTextForFts = (value: string): string =>
  value.replace(CJK_RUN, (run: string, offset: number, whole: string) => {
    const head = isTokenBoundary(whole[offset - 1]) ? '' : ' ';
    const tail = isTokenBoundary(whole[offset + run.length]) ? '' : ' ';
    return `${head}${toIndexTokens(run).join(' ')}${tail}`;
  });

/**
 * 查询侧变换：把一个查询 token 编译成 FTS5 MATCH 片段。
 *
 * @param token 已清洗的查询 token（不含 FTS5 保留字符）
 * @returns MATCH 片段；非 CJK token 返回 `undefined`，交由调用方按原有规则编译
 *
 * @remarks
 * - ≥2 字的 CJK 段切成 bigram 后用 `AND` 连接，得到「近似连续子串」语义：
 *   `数据库优化` 不会命中 `数据库索引优化`（缺 `库优`），符合直觉。
 * - 单字无法构成 bigram，退化为 `("X" OR "X"*)` 前缀匹配，命中以该字开头的 bigram。
 */
export const compileCjkToken = (token: string): string | undefined => {
  if (!hasCjk(token)) return undefined;
  const parts: string[] = [];
  let lastIndex = 0;
  CJK_RUN.lastIndex = 0;
  for (let match = CJK_RUN.exec(token); match !== null; match = CJK_RUN.exec(token)) {
    const latin = token.slice(lastIndex, match.index);
    if (latin.length > 0) parts.push(`("${latin}" OR "${latin}"*)`);
    const run = match[0];
    parts.push(
      run.length === 1 ?
        `("${run}" OR "${run}"*)`
      : Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2))
          .map(bigram => `"${bigram}"`)
          .join(' AND ')
    );
    lastIndex = match.index + run.length;
  }
  const tail = token.slice(lastIndex);
  if (tail.length > 0) parts.push(`("${tail}" OR "${tail}"*)`);
  return parts.join(' AND ');
};

/** 注册到 SQLite 的索引侧变换函数名，trigger 与 backfill 共用。 */
export const FTS_BIGRAM_SQL_FUNCTION = 'rxdb_fts_bigram' as const;
