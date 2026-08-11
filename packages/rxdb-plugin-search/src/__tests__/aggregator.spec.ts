/**
 * T022 [US1] — Aggregator 单测（先红）
 *
 * 覆盖：
 *  - 跨 collection 结果归并 → 按全局 rank 升序 + prefix_penalty tie-break
 *  - pageSize 截断（默认 50）
 *  - 不去重（不同 collection 的同一个 id 视作不同 entity）
 *  - 单 collection 入参直通
 *  - 空入参 → 空数组
 *
 * @see specs/001-add-global-search/research.md §5
 * @see specs/001-add-global-search/data-model.md §4.2
 */
import { describe, expect, it } from 'vitest';

import { aggregateResults, type CollectionPartial } from '../core/aggregator.js';
import type { SearchResult } from '../types.js';

const makeResult = (
  id: string,
  collection: string,
  rank: number,
  prefixPenalty = 0
): SearchResult & { _prefixPenalty: number } => ({
  entity: collection,
  collection,
  id,
  rank,
  matchedField: 'title',
  snippet: id,
  _prefixPenalty: prefixPenalty
});

describe('aggregator.aggregateResults', () => {
  it('空输入 → 空数组', () => {
    expect(aggregateResults([], { pageSize: 50 })).toEqual([]);
  });

  it('单 collection 直通（按入参顺序保留）', () => {
    const partial: CollectionPartial = {
      collection: 'article',
      results: [makeResult('a', 'article', -1.0), makeResult('b', 'article', -0.5)]
    };
    const out = aggregateResults([partial], { pageSize: 50 });
    expect(out.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('跨 collection 按各自名次的 RRF 分数归并', () => {
    const articles: CollectionPartial = {
      collection: 'article',
      results: [makeResult('a1', 'article', -0.8), makeResult('a2', 'article', -0.3)]
    };
    const comments: CollectionPartial = {
      collection: 'comment',
      results: [makeResult('c1', 'comment', -1.0), makeResult('c2', 'comment', -0.5)]
    };
    const out = aggregateResults([articles, comments], { pageSize: 50 });
    expect(out.map(r => `${r.collection}:${r.id}`)).toEqual(['article:a1', 'comment:c1', 'article:a2', 'comment:c2']);
  });

  it('跨 collection 使用各自名次而不是直接比较原始 BM25', () => {
    const zeta: CollectionPartial = {
      collection: 'zeta',
      results: [makeResult('z1', 'zeta', -100), makeResult('z2', 'zeta', -99)]
    };
    const alpha: CollectionPartial = {
      collection: 'alpha',
      results: [makeResult('a1', 'alpha', -1), makeResult('a2', 'alpha', -0.9)]
    };

    const out = aggregateResults([zeta, alpha], { pageSize: 50 });

    expect(out.map(r => `${r.collection}:${r.id}`)).toEqual(['alpha:a1', 'zeta:z1', 'alpha:a2', 'zeta:z2']);
  });

  it('rank 相同时 prefix_penalty 升序', () => {
    const articles: CollectionPartial = {
      collection: 'article',
      results: [makeResult('a-prefix', 'article', -1.0, 1)]
    };
    const comments: CollectionPartial = {
      collection: 'comment',
      results: [makeResult('c-exact', 'comment', -1.0, 0)]
    };
    const out = aggregateResults([articles, comments], { pageSize: 50 });
    expect(out.map(r => r.id)).toEqual(['c-exact', 'a-prefix']);
  });

  it('pageSize 截断生效', () => {
    const articles: CollectionPartial = {
      collection: 'article',
      results: Array.from({ length: 80 }, (_, i) => makeResult(`a${i}`, 'article', -1.0 + i * 0.001))
    };
    const out = aggregateResults([articles], { pageSize: 30 });
    expect(out).toHaveLength(30);
  });

  it('pageSize 跨 collection 总和截断', () => {
    const articles: CollectionPartial = {
      collection: 'article',
      results: Array.from({ length: 40 }, (_, i) => makeResult(`a${i}`, 'article', -1.0 + i * 0.001))
    };
    const comments: CollectionPartial = {
      collection: 'comment',
      results: Array.from({ length: 40 }, (_, i) => makeResult(`c${i}`, 'comment', -1.0 + i * 0.001))
    };
    const out = aggregateResults([articles, comments], { pageSize: 50 });
    expect(out).toHaveLength(50);
  });

  it('不去重：不同 collection 的同 id 都保留', () => {
    const articles: CollectionPartial = {
      collection: 'article',
      results: [makeResult('shared', 'article', -1.0)]
    };
    const comments: CollectionPartial = {
      collection: 'comment',
      results: [makeResult('shared', 'comment', -0.9)]
    };
    const out = aggregateResults([articles, comments], { pageSize: 50 });
    expect(out).toHaveLength(2);
    expect(out.map(r => r.collection).sort()).toEqual(['article', 'comment']);
  });

  it('SearchResult 不暴露内部 _prefixPenalty 字段', () => {
    const articles: CollectionPartial = {
      collection: 'article',
      results: [makeResult('a', 'article', -1.0, 1)]
    };
    const out = aggregateResults([articles], { pageSize: 50 });
    expect(out[0]).not.toHaveProperty('_prefixPenalty');
  });
});
