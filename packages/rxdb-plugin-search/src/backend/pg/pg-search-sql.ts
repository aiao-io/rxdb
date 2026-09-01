/**
 * PostgreSQL 全文查询与回填 SQL 构造。
 *
 * 与 SQLite 侧 `core/search-engine.ts` 一一对应，产出**完全相同的 5 个结果列**
 * （`id` / `rank` / `prefix_penalty` / `matched_field` / `snippet`），
 * 因此 `result-mapper` 与 `merge-results` 两层无需任何方言分支即可复用。
 *
 * 三处必须留意的方言差异：
 *  1. **rank 方向相反**。SQLite `bm25()` 为负、越小越相关；PG `ts_rank()` 为正、越大越相关。
 *     这里取 `-ts_rank(...)`，让 {@link SearchResult.rank} 「值越小越相关」的公开语义
 *     在两套后端上同时成立，排序与合并逻辑一行都不用改。
 *  2. **占位符是 `$N` 不是 `?`**，且大多需要显式 `::` 转型——`$1 AS matched_field`
 *     这种没有上下文的裸参数，PG 无法推断类型会直接报 42P18。
 *  3. **`max()` 是聚合函数**。SQLite 的 `max(1, x)` 在 PG 里必须写 `greatest(1, x)`，
 *     否则报「aggregate functions are not allowed in WHERE / 行表达式」。
 *
 * @packageDocumentation
 */

import { DEFAULT_FTS_ARRAY_KIND, FTS_COLUMN, type FtsArrayKind } from './pg-fts-contract.js';

import { SNIPPET_MATCH_END, SNIPPET_MATCH_START } from '../../core/result-mapper.js';
import { SearchExecutionError } from '../../types.js';

/** 单批回填的行数。批太小则 IPC/事务开销占比过高，太大则单条 UPDATE 持锁过久。 */
export const PG_BACKFILL_BATCH_SIZE = 500;

/** `ts_headline` 的分片词数下限与上限，避免极端 `snippetLength` 产出非法选项。 */
const MIN_HEADLINE_WORDS = 2;
const MAX_HEADLINE_WORDS = 200;
/** 经验值：一个英文词平均约 6 个字符（含分隔符），用于把字符预算折算成词数预算。 */
const CHARS_PER_WORD = 6;

/**
 * 合法的 PostgreSQL 文本搜索配置名。
 *
 * 与 `@aiao/rxdb-adapter-pglite` 的 `REGCONFIG_PATTERN` 保持一致。这里不复用那个常量，
 * 是因为它在适配器里是私有的，导出它会改动一个已进基线的包的公开面。
 */
const PG_REGCONFIG_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*(\.[A-Za-z_][A-Za-z0-9_$]*)?$/;

/**
 * 校验 `regconfig`，非法即抛。
 *
 * `regconfig` 被直接内联进 `to_tsvector('<regconfig>', ...)` 的单引号里——它是**语法位置**，
 * 不能参数化。所以这里做白名单校验而非转义：配置名本就只能是标识符，
 * 任何不符合的输入都是调用错误，应当 fail-fast 而不是被静默转义成一个不存在的配置名。
 *
 * @param regconfig - 文本搜索配置名
 * @returns 原值（校验通过）
 * @throws {SearchExecutionError} 不是合法的文本搜索配置标识符时
 * @public
 */
export const assertPgRegconfig = (regconfig: string): string => {
  if (!PG_REGCONFIG_PATTERN.test(regconfig)) {
    throw new SearchExecutionError(
      `invalid PostgreSQL regconfig ${JSON.stringify(regconfig)}: expected a text search configuration identifier ` +
        `such as "simple" or "pg_catalog.english"`
    );
  }
  return regconfig;
};

/** 双引号标识符转义，与 `pgDialect.escapeIdentifier` 同语义。 */
const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

/** 物化 tsvector 列名（`"_fts"`），由 `@aiao/rxdb-adapter-pglite` 的建表器定义。 */
const FTS_COLUMN_SQL = quote(FTS_COLUMN);

/**
 * 一张 PostgreSQL 表的定位。
 *
 * @remarks
 * schema 与表名必须**分开**存：`@aiao/rxdb-adapter-pglite` 把实体建成
 * `"<namespace>"."<table>"`，而 `"public.article"` 是一个名字里带点的表、
 * 不是 public schema 下的 article。把两段拼成一个字符串再转义，正是此前
 * 整个 pg 后端指向不存在的 `"public$article"` 的原因。
 *
 * @public
 */
export interface PgTableRef {
  /** schema 名；省略则由 `search_path` 解析 */
  readonly schema?: string;
  /** 表名（不含 schema） */
  readonly table: string;
}

/**
 * 把 {@link PgTableRef} 转义成可直接插入 SQL 的表引用。
 *
 * @param ref - 表定位
 * @returns `"schema"."table"`，或省略 schema 时的 `"table"`
 * @public
 */
export const quotePgTable = (ref: PgTableRef): string =>
  ref.schema === undefined ? quote(ref.table) : `${quote(ref.schema)}.${quote(ref.table)}`;

/** 单字段的取值来源。 */
export interface PgFieldSource {
  /** 业务表名 */
  readonly table: string;
  /** 表所在 schema（= 实体 `namespace`）；省略则由 `search_path` 解析 */
  readonly schema?: string;
  /** 主键列名 */
  readonly primaryKey: string;
  /** 字段列名 */
  readonly field: string;
  /** 是否为数组列 */
  readonly fieldIsArray?: boolean;
  /** 数组列的物理形态；默认 `text[]`，与适配器建表映射一致 */
  readonly arrayKind?: FtsArrayKind;
  /** 文本搜索配置名 */
  readonly regconfig: string;
}

/**
 * 单字段在查询侧的文本表达式，与 trigger 函数体里的 `valueExpr` 一一对应
 * （只是把 `NEW.` 换成了 `src.`）。表达式必须严格一致，否则「索引里是什么」
 * 与「查询时按什么收窄 matched_field」会对不上。
 *
 * @param field - 字段列名
 * @param isArray - 是否数组列
 * @param arrayKind - 数组列物理形态
 * @returns 求值为文本的 SQL 表达式
 * @internal
 */
export const buildPgFieldTextExpression = (field: string, isArray?: boolean, arrayKind?: FtsArrayKind): string => {
  const col = `src.${quote(field)}`;
  if (!isArray) return `COALESCE(${col}, '')`;
  if ((arrayKind ?? DEFAULT_FTS_ARRAY_KIND) === 'jsonb') {
    return `COALESCE((SELECT string_agg(value, ' ') FROM jsonb_array_elements_text(${col})), '')`;
  }
  return `COALESCE(array_to_string(${col}, ' '), '')`;
};

/**
 * 把字符级的 snippet 预算折算成 `ts_headline` 的词数选项串。
 *
 * 该串作为**绑定参数**传入（`ts_headline(cfg, text, query, $3::text)`），不进 SQL 语法位置。
 * `MaxFragments=1` 让 PG 以命中处为中心裁一段，而不是从头截取——与 FTS5 `snippet()` 的
 * 观感一致。命中标记沿用 `result-mapper` 约定的两个 Unicode noncharacter，
 * 它们不可能出现在正文里，映射层据此定位高亮区间。
 *
 * @param snippetLength - 期望的片段字符数
 * @returns `ts_headline` 选项串
 * @public
 */
export const buildPgHeadlineOptions = (snippetLength: number): string => {
  const words = Math.round(snippetLength / CHARS_PER_WORD);
  const maxWords = Math.min(MAX_HEADLINE_WORDS, Math.max(MIN_HEADLINE_WORDS, words));
  // MinWords 必须严格小于 MaxWords，否则 ts_headline 直接报错
  const minWords = Math.max(1, Math.floor(maxWords / 2));
  return [
    `StartSel="${SNIPPET_MATCH_START}"`,
    `StopSel="${SNIPPET_MATCH_END}"`,
    `MaxWords=${maxWords}`,
    `MinWords=${minWords}`,
    `MaxFragments=1`,
    `FragmentDelimiter=" … "`
  ].join(', ');
};

/**
 * 单字段全文搜索 SQL。
 *
 * 参数顺序（`$N`）：
 *  1. `field` —— 命中列名（只回写进结果，不参与解析）
 *  2. `match` —— {@link compilePgQuery} 产出的 tsquery 正文
 *  3. `headlineOptions` —— {@link buildPgHeadlineOptions} 产出的选项串
 *  4. `limit`
 *  5. `offset`
 *
 * `WHERE` 有两个条件不是冗余：`src."_fts" @@ q` 命中 GIN 索引负责**筛选行**，
 * 逐字段的 `to_tsvector(...) @@ q` 负责**确认是哪个字段命中**。只留前者会把
 * 其它字段的命中错标成本字段；只留后者则完全放弃索引，退化成全表扫描。
 *
 * @param opts - 字段来源
 * @returns 参数化 SQL
 * @public
 */
export const buildPgFieldSearchSql = (opts: PgFieldSource): string => {
  const regconfig = assertPgRegconfig(opts.regconfig);
  const physicalTable = quotePgTable(opts);
  const fieldExpr = buildPgFieldTextExpression(opts.field, opts.fieldIsArray, opts.arrayKind);
  const fieldVector = `to_tsvector('${regconfig}', ${fieldExpr})`;
  return [
    `SELECT`,
    `  src.${quote(opts.primaryKey)} AS id,`,
    // 取相反数：让「值越小越相关」在两套后端上是同一个含义
    `  -ts_rank(${fieldVector}, q) AS rank,`,
    `  0 AS prefix_penalty,`,
    `  $1::text AS matched_field,`,
    `  ts_headline('${regconfig}', ${fieldExpr}, q, $3::text) AS snippet`,
    `FROM ${physicalTable} src, to_tsquery('${regconfig}', $2) q`,
    `WHERE src.${FTS_COLUMN_SQL} @@ q AND ${fieldVector} @@ q`,
    `ORDER BY rank`,
    `LIMIT $4::int OFFSET $5::int`
  ].join('\n');
};

/**
 * 单字段 contains fallback SQL。
 *
 * 语义与 SQLite 侧 `buildFieldContainsSql` 完全一致：仅在整个 collection 全字段
 * FTS 零命中时执行，rank 基数 `1000000` + `prefix_penalty = 2` 保证整体劣后。
 * 差异只在函数名（`strpos` 对 `instr`、`greatest` 对 `max`）。
 *
 * 参数顺序（`$N`）：
 *  - `$1` = `field`
 *  - `$2 .. $(tokenCount + 1)` = tokens
 *  - `$(tokenCount + 2)` = `snippetLength`
 *  - `$(tokenCount + 3)` = `limit`
 *  - `$(tokenCount + 4)` = `offset`
 *
 * @param opts - 字段来源与 token 数
 * @returns 参数化 SQL
 * @public
 */
export const buildPgFieldContainsSql = (opts: PgFieldSource & { readonly tokenCount: number }): string => {
  const { tokenCount } = opts;
  const physicalTable = quotePgTable(opts);
  const fieldExpr = buildPgFieldTextExpression(opts.field, opts.fieldIsArray, opts.arrayKind);
  const normalized = `lower(${fieldExpr})`;
  const rankTerms: string[] = new Array(tokenCount);
  const whereTerms: string[] = new Array(tokenCount);
  for (let i = 0; i < tokenCount; i++) {
    // token 参数不加显式 ::text —— lower(unknown) 只有一个候选重载，PG 能自行定型
    const probe = `strpos(${normalized}, lower($${i + 2}))`;
    rankTerms[i] = probe;
    whereTerms[i] = `${probe} > 0`;
  }
  const snippetLengthParam = `$${tokenCount + 2}::int`;
  const limitParam = `$${tokenCount + 3}::int`;
  const offsetParam = `$${tokenCount + 4}::int`;
  const firstTokenMatch = `strpos(${normalized}, lower($2))`;
  // greatest 而非 max：PG 的 max 是聚合函数
  const snippetStart = `greatest(1, ${firstTokenMatch} - ((${snippetLengthParam} - 1) / 2))`;
  const snippetExpr = `substr(${fieldExpr}, ${snippetStart}, ${snippetLengthParam})`;

  return [
    `SELECT`,
    `  src.${quote(opts.primaryKey)} AS id,`,
    `  1000000 + ${rankTerms.join(' + ')} AS rank,`,
    `  2 AS prefix_penalty,`,
    `  $1::text AS matched_field,`,
    `  ${snippetExpr} AS snippet`,
    `FROM ${physicalTable} src`,
    `WHERE ${whereTerms.join(' AND ')}`,
    `ORDER BY rank, src.${quote(opts.primaryKey)}`,
    `LIMIT ${limitParam} OFFSET ${offsetParam}`
  ].join('\n');
};

/** contains fallback 前的行数预算探针。 */
export const buildPgSourceRowCountSql = (ref: PgTableRef): string =>
  `SELECT count(*) AS count FROM ${quotePgTable(ref)}`;

/**
 * 未回填行数探针。
 *
 * `_fts IS NULL` 就是回填进度的**持久化哨兵**：`ALTER TABLE ADD COLUMN` 给存量行留下 NULL，
 * 而 trigger 装上之后任何新写入都会立刻算出非 NULL 值。所以「还有多少行是 NULL」
 * 直接等于「还有多少行没回填」，无需额外记账，也不会因为进程被杀而与真实状态脱节。
 *
 * @param ref - 表定位
 * @returns 计数 SQL
 * @public
 */
export const buildPgPendingBackfillProbeSql = (ref: PgTableRef): string =>
  `SELECT count(*) AS count FROM ${quotePgTable(ref)} WHERE ${FTS_COLUMN_SQL} IS NULL`;

/**
 * 单批回填 SQL。
 *
 * 刻意写成「空更新」（`SET "id" = "id"`）而不是显式 `SET "_fts" = to_tsvector(...)`：
 * PG 的同步 trigger 是 `BEFORE INSERT OR UPDATE`，任何一次 UPDATE 都会让它重算 `_fts`。
 * 借它来回填的好处是**不可能与 trigger 的表达式产生漂移**——两条路径压根就是同一段
 * plpgsql。若在这里自己拼一份 `to_tsvector(concat_ws(...))`，就等于把
 * `buildFtsTriggersSql` 的私有 `valueExpr` 复制了一份，日后它一改，存量与增量两批数据
 * 的分词方式立刻不同，而症状只是「有些老数据搜不到」，极难归因。
 *
 * 分批 + `WHERE "_fts" IS NULL` 让它天然幂等且可续跑：每批只吃掉尚未回填的行，
 * 中断后重入从剩下的行继续，不重做已完成的部分（US-703 AC#7）。
 *
 * @param opts - 表定位、主键列与批大小
 * @returns 单批回填 SQL
 * @throws {SearchExecutionError} `batchSize` 不是正整数时（它被直接内联进 LIMIT）
 * @public
 */
export const buildPgBackfillSql = (
  opts: PgTableRef & {
    readonly primaryKey: string;
    readonly batchSize: number;
  }
): string => {
  if (!Number.isInteger(opts.batchSize) || opts.batchSize <= 0) {
    throw new SearchExecutionError(
      `invalid PostgreSQL backfill batch size ${String(opts.batchSize)}: expected a positive integer`
    );
  }
  const table = quotePgTable(opts);
  const id = quote(opts.primaryKey);
  return [
    `UPDATE ${table} SET ${id} = ${id}`,
    `WHERE ${id} IN (`,
    `  SELECT ${id} FROM ${table} WHERE ${FTS_COLUMN_SQL} IS NULL LIMIT ${opts.batchSize}`,
    `)`
  ].join('\n');
};

/**
 * 把 `_fts` 整列置空，强制下一轮回填重算全表。
 *
 * 仅用于「运行时对象缺失或被外部改动过、需要重建」的修复路径：签名一致但结构不可信时，
 * 保留旧向量会让新 trigger 与旧数据混在一起，查询结果取决于行的写入时间。
 *
 * @param ref - 表定位
 * @returns 清空 SQL
 * @public
 */
export const buildPgResetFtsSql = (ref: PgTableRef): string =>
  `UPDATE ${quotePgTable(ref)} SET ${FTS_COLUMN_SQL} = NULL WHERE ${FTS_COLUMN_SQL} IS NOT NULL`;
