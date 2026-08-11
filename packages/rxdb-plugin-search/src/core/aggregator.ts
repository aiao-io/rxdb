/**
 * T032 [US1] —— 聚合器。
 *
 * 跨 collection 结果归并：
 *  - 收集各 collection 的部分结果
 *  - 按 per-collection Reciprocal Rank Fusion（RRF）分数降序 + tie-break 排序
 *  - 截断到 `pageSize`
 *  - 不去重：不同 collection 的同 id 视为不同实体
 *  - 内部 `_prefixPenalty` / `_rrfScore` 字段不暴露到对外 `SearchResult`
 *
 * @see specs/001-add-global-search/research.md §5
 * @see specs/001-add-global-search/data-model.md §4.2
 */
import type { SearchResult } from '../types.js';

/** 内部结果，可携带 prefix penalty 用于 tie-break。 */
export type ResultWithPenalty = SearchResult & {
  readonly _prefixPenalty?: number;
  readonly _rrfScore?: number;
};

/** 单个 collection 提交的部分结果。 */
export interface CollectionPartial {
  /** collection 表名 */
  readonly collection: string;
  /** 已经过 result-mapper 处理但未截断的本 collection 结果 */
  readonly results: readonly ResultWithPenalty[];
}

/** 聚合参数。 */
export interface AggregateOptions {
  /** 输出最大结果数 */
  readonly pageSize: number;
}

const RRF_K = 60;

/**
 * 跨 collection 归并 + 全局排序 + pageSize 截断。
 */
export const aggregateResults = (parts: readonly CollectionPartial[], opts: AggregateOptions): SearchResult[] => {
  if (parts.length === 0 || opts.pageSize <= 0) return [];
  const merged: ResultWithPenalty[] = [];
  for (const p of parts) {
    for (const [index, r] of p.results.entries()) {
      merged.push({ ...r, _rrfScore: 1 / (RRF_K + index + 1) });
    }
  }
  merged.sort((a, b) => {
    if (a._rrfScore !== b._rrfScore) return (b._rrfScore ?? 0) - (a._rrfScore ?? 0);
    if ((a._prefixPenalty ?? 0) !== (b._prefixPenalty ?? 0)) {
      return (a._prefixPenalty ?? 0) - (b._prefixPenalty ?? 0);
    }
    const collectionOrder = a.collection.localeCompare(b.collection);
    return collectionOrder !== 0 ? collectionOrder : a.id.localeCompare(b.id);
  });
  const len = Math.min(merged.length, opts.pageSize);
  const out: SearchResult[] = new Array(len);
  for (let i = 0; i < len; i++) {
    const { entity, collection, id, rank, matchedField, snippet } = merged[i];
    out[i] = { entity, collection, id, rank, matchedField, snippet };
  }
  return out;
};
