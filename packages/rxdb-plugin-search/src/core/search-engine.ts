/**
 * T031 [US1] —— 搜索引擎。
 *
 * 构造 FTS5 SQL + 执行 + 映射为 `SearchResult`：
 *  - 为每个可搜索字段构造一条 SQL（列过滤 MATCH `<field> : (...)`），
 *    以便拿到正确的 `matched_field`（SQLite FTS5 原生不直接暴露命中列）
 *  - 多字段查询结果按 `id` 合并，保留 rank 最优者
 *  - 排序 = `rank` 升序；BM25 越小越相关
 *  - 截取 snippet 到 `snippetLength`（默认 120）
 *
 * 执行层通过 {@link FtsExecutor} 注入，便于在无 SQLite 运行时的环境下单元测试。
 *
 * @see specs/001-add-global-search/research.md §3
 * @see specs/001-add-global-search/data-model.md §4.1
 */
import { quote_sql_identifier, SQLITE_MAX_BIND_VARIABLES, type FtsField } from '@aiao/rxdb-adapter-sqlite-core';
import { SearchExecutionError, SearchQueryLimitError } from '../types.js';
import type { ResultWithPenalty } from './aggregator.js';
import { mergeAndSortResults } from './merge-results.js';
import type { CompiledQuery } from './query-compiler.js';
import { mapRowsToResults, SNIPPET_MATCH_END, SNIPPET_MATCH_START, type RawFtsRow } from './result-mapper.js';

const DEFAULT_SNIPPET_LENGTH = 120;
const MAX_FTS_SNIPPET_TOKENS = 64;
/** 超过此源表行数时不执行无索引的 contains fallback。 */
export const MAX_CONTAINS_FALLBACK_ROWS = 5000;

/**
 * SQL 执行适配器：接受参数化 SQL 返回 FTS 行。
 *
 * @public
 */
export type FtsExecutor = (sql: string, params: readonly unknown[]) => Promise<readonly RawFtsRow[]>;

/**
 * `createSearchEngine().search(...)` 入参。
 *
 * @public
 */
export interface SearchEngineQuery {
  /** 业务表名 */
  readonly table: string;
  /** SQLite 物理表名（含 namespace 前缀） */
  readonly sqlTable?: string;
  /** 业务实体名（面向展示） */
  readonly entity: string;
  /** 业务表主键列名（= FTS5 rowid） */
  readonly primaryKey: string;
  /** 参与搜索的字段列表；顺序 = FTS5 列声明顺序（列索引从 0 起） */
  readonly fields: readonly string[];
  /** 字段元数据，用于构造 array/scalar 安全 snippet */
  readonly fieldSpecs?: readonly FtsField[];
  /** 已编译查询；`null` 直接返回空数组 */
  readonly compiled: CompiledQuery | null;
  /** 单页结果数上限 */
  readonly pageSize: number;
  /** 内存 over-fetch 偏移。每字段子查询取 `offset + pageSize` 行，SQL OFFSET 固定为 0 */
  readonly offset: number;
  /** snippet 长度（字符），默认 120 */
  readonly snippetLength?: number;
}

/**
 * 由 `createSearchEngine(...)` 返回的 engine 句柄。
 *
 * @public
 */
export interface SearchEngine {
  /** 对单个 collection 执行搜索，返回带 `_prefixPenalty` 的结果供 aggregator 进一步处理。 */
  search(query: SearchEngineQuery): Promise<ResultWithPenalty[]>;
}

/** FTS5 列过滤表达式：`<field> : (<compiled.match>)` */
export const buildFieldMatchExpression = (field: string, compiled: CompiledQuery): string =>
  `${quote_sql_identifier(field)} : (${compiled.match})`;

/**
 * 构造源表字段的文本表达式。
 * - 标量列：`COALESCE(src.<field>, '')`
 * - 数组列：通过 `json_each + group_concat` 把 JSON 数组打平为换行分隔字符串
 */
const buildFieldTextExpression = (fieldColumn: string, isArray: boolean | undefined): string =>
  isArray ?
    `COALESCE((SELECT group_concat(value, char(10)) FROM json_each(src.${fieldColumn})), '')`
  : `COALESCE(src.${fieldColumn}, '')`;

/**
 * 单字段搜索 SQL。
 *
 * 参数顺序（unnamed `?`）：
 *  1. `field` — 命中列名（仅作为字符串字面量回写到结果，不参与 SQL 解析）
 *  2. `snippetLength` — FTS5 snippet 的 token 窗口上限
 *  3. `matchExpr` — FTS5 MATCH 表达式
 *  4. `limit`
 *  5. `offset`
 */
export const buildFieldSearchSql = (opts: {
  readonly table: string;
  readonly sqlTable?: string;
  readonly primaryKey: string;
  readonly field: string;
  readonly fieldIndex: number;
}): string => {
  const physicalTable = opts.sqlTable ?? opts.table;
  const fts = quote_sql_identifier(`_fts_${physicalTable}`);
  const sourceTable = quote_sql_identifier(physicalTable);
  const idColumn = quote_sql_identifier(opts.primaryKey);
  return [
    `SELECT`,
    `  src.${idColumn} AS id,`,
    `  bm25(${fts}) AS rank,`,
    `  0 AS prefix_penalty,`,
    `  ? AS matched_field,`,
    `  snippet(${fts}, ${opts.fieldIndex}, char(${SNIPPET_MATCH_START.charCodeAt(0)}), char(${SNIPPET_MATCH_END.charCodeAt(0)}), '…', ?) AS snippet`,
    `FROM ${fts}`,
    `JOIN ${sourceTable} src ON src.rowid = ${fts}.rowid`,
    `WHERE ${fts} MATCH ?`,
    `ORDER BY rank`,
    `LIMIT ? OFFSET ?`
  ].join('\n');
};

/**
 * 单字段 contains fallback SQL。
 *
 * 当该 collection 的 FTS5 完整词 / 前缀词**全部零命中**时，退化到源表上的
 * `instr(lower(...), lower(?))` 中缀匹配，覆盖 `including` 被 `ncluding` 查询命中的场景。
 *
 * 语义边界（刻意如此，非缺陷）：这是"全局 miss 时的宽松兜底"，**不承诺中缀召回完整性**——
 * 只要同 collection 任一字段有 FTS 命中，contains 就不执行（仅可中缀命中的记录不会出现）。
 * 若始终执行，则每次查询每个字段都要做一次无索引的 `instr` 全表扫描，大表上不可接受。
 * fallback 排序权重整体劣后于 FTS 结果（rank 基数 1000000 + prefix_penalty 2）。
 *
 * 参数顺序（named-positional `?N`）：
 *  - `?1` = `field`（命中列名字面量）
 *  - `?2 .. ?(tokenCount + 1)` = tokens（每个被 rank/where 共享引用）
 *  - `?(tokenCount + 2)` = snippetLength
 *  - `?(tokenCount + 3)` = limit
 *  - `?(tokenCount + 4)` = offset
 */
export const buildFieldContainsSql = (opts: {
  readonly table: string;
  readonly sqlTable?: string;
  readonly primaryKey: string;
  readonly field: string;
  readonly fieldIsArray?: boolean;
  readonly tokenCount: number;
}): string => {
  const { tokenCount } = opts;
  const physicalTable = opts.sqlTable ?? opts.table;
  const sourceTable = quote_sql_identifier(physicalTable);
  const idColumn = quote_sql_identifier(opts.primaryKey);
  const fieldColumn = quote_sql_identifier(opts.field);
  const fieldTextExpr = buildFieldTextExpression(fieldColumn, opts.fieldIsArray);
  const normalizedExpr = `lower(${fieldTextExpr})`;
  // tokens 占用 ?2..?(tokenCount+1)；?1 留给 field 名
  const rankTerms: string[] = new Array(tokenCount);
  const whereTerms: string[] = new Array(tokenCount);
  for (let i = 0; i < tokenCount; i++) {
    const probe = `instr(${normalizedExpr}, lower(?${i + 2}))`;
    rankTerms[i] = probe;
    whereTerms[i] = `${probe} > 0`;
  }
  const snippetLengthParam = `?${tokenCount + 2}`;
  const limitParam = `?${tokenCount + 3}`;
  const offsetParam = `?${tokenCount + 4}`;
  const firstTokenMatch = `instr(${normalizedExpr}, lower(?2))`;
  const snippetStart = `max(1, ${firstTokenMatch} - ((${snippetLengthParam} - 1) / 2))`;
  const snippetExpr = `substr(${fieldTextExpr}, ${snippetStart}, ${snippetLengthParam})`;

  return [
    `SELECT`,
    `  src.${idColumn} AS id,`,
    `  1000000 + ${rankTerms.join(' + ')} AS rank,`,
    `  2 AS prefix_penalty,`,
    `  ?1 AS matched_field,`,
    `  ${snippetExpr} AS snippet`,
    `FROM ${sourceTable} src`,
    `WHERE ${whereTerms.join(' AND ')}`,
    `ORDER BY rank, src.${idColumn}`,
    `LIMIT ${limitParam} OFFSET ${offsetParam}`
  ].join('\n');
};

/** contains fallback 前的行数预算探针。 */
export const buildSourceRowCountSql = (table: string): string =>
  `SELECT count(*) AS count FROM ${quote_sql_identifier(table)}`;

/**
 * 构造一个 `SearchEngine`，绑定 SQL 执行器。
 *
 * @public
 */
export const createSearchEngine = (executor: FtsExecutor): SearchEngine => ({
  async search(q: SearchEngineQuery): Promise<ResultWithPenalty[]> {
    if (!q.compiled || q.fields.length === 0) return [];
    const compiled = q.compiled;
    const limit = q.offset + q.pageSize;
    const snippetLength = q.snippetLength ?? DEFAULT_SNIPPET_LENGTH;
    const snippetTokenLimit = Math.min(snippetLength, MAX_FTS_SNIPPET_TOKENS);
    const baseMapOptions = {
      entity: q.entity,
      collection: q.table,
      fields: q.fields,
      snippetLength: q.snippetLength
    };
    const sqlBaseOpts = {
      table: q.table,
      sqlTable: q.sqlTable,
      primaryKey: q.primaryKey
    };
    const maxContainsTokens = SQLITE_MAX_BIND_VARIABLES - 4;
    if (compiled.tokens.length > maxContainsTokens) {
      throw new SearchQueryLimitError('tokenCount', maxContainsTokens, compiled.tokens.length);
    }

    const dispatch = async <T>(makeQuery: (field: string, idx: number) => Promise<T>): Promise<T[]> => {
      try {
        return await Promise.all(q.fields.map(makeQuery));
      } catch (err) {
        if (err instanceof SearchExecutionError) throw err;
        throw new SearchExecutionError(`search execution failed on collection "${q.table}"`, err);
      }
    };

    const ftsBatches = await dispatch((field, fieldIndex) => {
      const sql = buildFieldSearchSql({ ...sqlBaseOpts, field, fieldIndex });
      const matchExpr = buildFieldMatchExpression(field, compiled);
      return executor(sql, [field, snippetTokenLimit, matchExpr, limit, 0]).then(rows =>
        mapRowsToResults(rows, baseMapOptions)
      );
    });
    const mergedFts = mergeAndSortResults(ftsBatches);
    // 任一字段有 FTS 命中即返回，跳过 contains——见 buildFieldContainsSql 的语义边界说明
    if (mergedFts.length > 0) return mergedFts;

    const sourceTable = q.sqlTable ?? q.table;
    const countRows = await executor(buildSourceRowCountSql(sourceTable), []);
    const rowCount = Number((countRows[0] as { readonly count?: unknown } | undefined)?.count);
    if (!Number.isFinite(rowCount) || rowCount > MAX_CONTAINS_FALLBACK_ROWS) return [];

    const tokenCount = compiled.tokens.length;
    const containsBatches = await dispatch((field, fieldIndex) => {
      const fieldIsArray = q.fieldSpecs?.[fieldIndex]?.isArray;
      const containsSql = buildFieldContainsSql({ ...sqlBaseOpts, field, fieldIsArray, tokenCount });
      return executor(containsSql, [field, ...compiled.tokens, snippetLength, limit, 0]).then(rows =>
        mapRowsToResults(rows, baseMapOptions)
      );
    });
    return mergeAndSortResults(containsBatches);
  }
});
