/**
 * 多字段命中合并与排序。
 *
 * 与方言无关：两套 backend（SQLite FTS5 / PostgreSQL tsvector）都为**每个字段**各发一条
 * SQL 以拿到正确的 `matched_field`，再用本模块把 per-field 结果按 `id` 去重合并。
 * 因此它被刻意抽在 `core/` 而不是任何一个 backend 内部——同一份合并语义是两套后端
 * 「字段/排序/分页语义一致」（US-703 AC#2）的实现基础。
 *
 * 排序契约：`rank` 升序（值越小越相关），同 rank 再按 `_prefixPenalty` 升序。
 * SQLite 的 `bm25()` 天然为负且越小越相关；PostgreSQL 的 `ts_rank` 相反，
 * 由 PG backend 在 SQL 里取相反数后再进入本模块，见 `pg-search-sql.ts`。
 *
 * @packageDocumentation
 */

import type { ResultWithPenalty } from './aggregator.js';

/**
 * 合并多个字段各自的命中列表：同 `id` 保留 rank 最优者，整体按 rank 升序。
 *
 * @param perField - 每个字段一批、批内已按 rank 升序的结果
 * @returns 去重合并后的结果，按 `rank` 再按 `_prefixPenalty` 升序
 * @internal
 */
export const mergeAndSortResults = (perField: readonly ResultWithPenalty[][]): ResultWithPenalty[] => {
  // 单分支命中时跳过去重 + Map 构造，直接复用已排序数组。
  if (perField.length === 1) return [...perField[0]];

  const byId = new Map<string, ResultWithPenalty>();
  for (const batch of perField) {
    for (const result of batch) {
      const existing = byId.get(result.id);
      if (!existing || result.rank < existing.rank) byId.set(result.id, result);
    }
  }
  if (byId.size === 0) return [];

  const merged = [...byId.values()];
  merged.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return (a._prefixPenalty ?? 0) - (b._prefixPenalty ?? 0);
  });
  return merged;
};
