/**
 * T029 [US1] —— 结果映射器。
 *
 * 将 FTS5 SQL 查询返回的原始行映射为 `SearchResult`，并执行：
 *  - 按 BM25 `rank` 升序排序（值越小越相关）
 *  - rank 相同时按 `prefix_penalty` 升序（FTS 命中优先于 contains 兜底）
 *  - `snippet` 截断到 `snippetLength`（默认 120 字符）
 *
 * `snippet` 不含 HTML / Markdown 标记；高亮渲染由宿主应用负责。
 *
 * @see specs/001-add-global-search/data-model.md §4.1, §4.2
 */
import type { ResultWithPenalty } from './aggregator.js';

/**
 * SQLite FTS5 查询返回的原始行。
 */
export interface RawFtsRow {
  /** 业务表主键（string 化前） */
  readonly id: string;
  /** BM25 rank，值越小越相关 */
  readonly rank: number;
  /** 0 = FTS 命中，2 = contains 兜底命中 */
  readonly prefix_penalty: number;
  /** 命中字段名（FTS5 列名） */
  readonly matched_field: string;
  /** 已由 SQL 端截取的 snippet 原文 */
  readonly snippet: string;
}

/** Result mapper 入参元数据。 */
export interface MapOptions {
  /** 实体名（如 `Article`） */
  readonly entity: string;
  /** collection 表名（如 `article`） */
  readonly collection: string;
  /** 该 collection 的可搜索字段顺序，用于 tie-break */
  readonly fields: readonly string[];
  /** snippet 最大字符长度，默认 120 */
  readonly snippetLength?: number;
}

const DEFAULT_SNIPPET_LENGTH = 120;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export const SNIPPET_MATCH_START = '\uFDD0';
export const SNIPPET_MATCH_END = '\uFDD1';

const truncateSnippet = (snippet: string, length: number): string => {
  const matchStartOffset = snippet.indexOf(SNIPPET_MATCH_START);
  const matchEndOffset = snippet.indexOf(SNIPPET_MATCH_END, matchStartOffset + SNIPPET_MATCH_START.length);
  const plain = snippet.replaceAll(SNIPPET_MATCH_START, '').replaceAll(SNIPPET_MATCH_END, '');
  const graphemes = Array.from(graphemeSegmenter.segment(plain), part => part.segment);
  if (graphemes.length <= length) return plain;
  if (matchStartOffset < 0 || matchEndOffset < 0) return graphemes.slice(0, length).join('');

  const beforeMatch = snippet
    .slice(0, matchStartOffset)
    .replaceAll(SNIPPET_MATCH_START, '')
    .replaceAll(SNIPPET_MATCH_END, '');
  const matched = snippet
    .slice(matchStartOffset + SNIPPET_MATCH_START.length, matchEndOffset)
    .replaceAll(SNIPPET_MATCH_START, '')
    .replaceAll(SNIPPET_MATCH_END, '');
  const matchStart = Array.from(graphemeSegmenter.segment(beforeMatch)).length;
  const matchLength = Array.from(graphemeSegmenter.segment(matched)).length;
  const contextLength = Math.max(0, length - Math.min(length, matchLength));
  const maxStart = graphemes.length - length;
  const start = Math.min(maxStart, Math.max(0, matchStart - Math.floor(contextLength / 2)));
  return graphemes
    .slice(start, start + length)
    .join('')
    .trim();
};

/**
 * 将原始 FTS5 行批量映射为 `SearchResult` 数组。
 *
 * 输出携带内部 `_prefixPenalty`（取自 SQL 的 `prefix_penalty` 列），供 search-engine /
 * aggregator 在 rank 相同时做 tie-break；对外暴露时由 aggregator 剥离该字段。
 */
export const mapRowsToResults = (rows: readonly RawFtsRow[], opts: MapOptions): ResultWithPenalty[] => {
  if (rows.length === 0) return [];
  const snippetLen = opts.snippetLength ?? DEFAULT_SNIPPET_LENGTH;
  const { entity, collection } = opts;
  const sorted =
    rows.length === 1 ?
      (rows as RawFtsRow[])
    : [...rows].sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.prefix_penalty - b.prefix_penalty));
  const out: ResultWithPenalty[] = new Array(sorted.length);
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const snippet = row.snippet;
    out[i] = {
      entity,
      collection,
      id: String(row.id),
      rank: row.rank,
      matchedField: row.matched_field,
      snippet: truncateSnippet(snippet, snippetLen),
      _prefixPenalty: row.prefix_penalty
    };
  }
  return out;
};
