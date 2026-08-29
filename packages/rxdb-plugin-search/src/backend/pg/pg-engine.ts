/**
 * PostgreSQL 搜索引擎。
 *
 * 与 `core/search-engine.ts` **结构同构**：逐字段发一条 SQL 拿到正确的 `matched_field`，
 * 合并排序，全字段零命中时再退化到 contains 兜底。差异全部收敛在 SQL 构造器里，
 * 结果映射（`mapRowsToResults`）与合并（`mergeAndSortResults`）两层原样复用。
 *
 * 之所以不把两个 engine 合成一个「传 SQL 构造器进来」的泛型实现：两边的参数序列、
 * snippet 预算单位（FTS5 是 token 数、PG 是词数选项串）、rank 表达式都不同，
 * 抽象出来的公共骨架只剩三行 `Promise.all`，却要多一层间接让两边的差异都变成配置项。
 *
 * @packageDocumentation
 */

import { DEFAULT_FTS_REGCONFIG } from './pg-fts-contract.js';

import type { ResultWithPenalty } from '../../core/aggregator.js';
import { mergeAndSortResults } from '../../core/merge-results.js';
import { mapRowsToResults } from '../../core/result-mapper.js';
import { MAX_CONTAINS_FALLBACK_ROWS, type FtsExecutor, type SearchEngine, type SearchEngineQuery } from '../../core/search-engine.js';
import { SearchExecutionError, SearchQueryLimitError } from '../../types.js';
import {
  buildPgFieldContainsSql,
  buildPgFieldSearchSql,
  buildPgHeadlineOptions,
  buildPgSourceRowCountSql
} from './pg-search-sql.js';

const DEFAULT_SNIPPET_LENGTH = 120;

/**
 * PostgreSQL 扩展查询协议的绑定参数上限（`int16` 参数计数）。
 *
 * 与 SQLite 的 `SQLITE_MAX_BIND_VARIABLES` 同一用途：contains 兜底的每个 token
 * 各占一个参数，超限会在协议层报错而不是抛出可读异常，所以提前拦。
 */
const PG_MAX_BIND_PARAMETERS = 65535;

/**
 * 构造一个绑定了执行器的 PostgreSQL `SearchEngine`。
 *
 * @param executor - 查询期 SQL 执行器
 * @returns 与 FTS5 后端行为对齐的 engine
 * @public
 */
export const createPgSearchEngine = (executor: FtsExecutor): SearchEngine => ({
  async search(q: SearchEngineQuery): Promise<ResultWithPenalty[]> {
    if (!q.compiled || q.fields.length === 0) return [];
    const compiled = q.compiled;
    const limit = q.offset + q.pageSize;
    const snippetLength = q.snippetLength ?? DEFAULT_SNIPPET_LENGTH;
    const headlineOptions = buildPgHeadlineOptions(snippetLength);
    const baseMapOptions = {
      entity: q.entity,
      collection: q.table,
      fields: q.fields,
      snippetLength: q.snippetLength
    };
    const sqlBaseOpts = {
      table: q.table,
      sqlTable: q.sqlTable,
      primaryKey: q.primaryKey,
      regconfig: DEFAULT_FTS_REGCONFIG
    };
    const maxContainsTokens = PG_MAX_BIND_PARAMETERS - 4;
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
      const sql = buildPgFieldSearchSql({
        ...sqlBaseOpts,
        field,
        fieldIsArray: q.fieldSpecs?.[fieldIndex]?.isArray
      });
      return executor(sql, [field, compiled.match, headlineOptions, limit, 0]).then(rows =>
        mapRowsToResults(rows, baseMapOptions)
      );
    });
    const mergedFts = mergeAndSortResults(ftsBatches);
    // 与 FTS5 后端同一条语义边界：任一字段有索引命中就不跑无索引的全表 contains
    if (mergedFts.length > 0) return mergedFts;

    const sourceTable = q.sqlTable ?? q.table;
    const countRows = await executor(buildPgSourceRowCountSql(sourceTable), []);
    const rowCount = Number((countRows[0] as { readonly count?: unknown } | undefined)?.count);
    if (!Number.isFinite(rowCount) || rowCount > MAX_CONTAINS_FALLBACK_ROWS) return [];

    const tokenCount = compiled.tokens.length;
    const containsBatches = await dispatch((field, fieldIndex) => {
      const containsSql = buildPgFieldContainsSql({
        ...sqlBaseOpts,
        field,
        fieldIsArray: q.fieldSpecs?.[fieldIndex]?.isArray,
        tokenCount
      });
      return executor(containsSql, [field, ...compiled.tokens, snippetLength, limit, 0]).then(rows =>
        mapRowsToResults(rows, baseMapOptions)
      );
    });
    return mergeAndSortResults(containsBatches);
  }
});
