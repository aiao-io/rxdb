import { describe, expect, it } from 'vitest';

import {
  makeSearchParityArticles,
  makeSearchParityComments,
  SEARCH_PARITY_ARTICLES,
  SEARCH_PARITY_COMMENTS
} from '../../cross-framework-fixtures/search-parity.js';

describe('search parity seed', () => {
  // RXT-008：导出的基础 Article 曾经完全没有 id，而 Comment 却引用 `article-0..99`；
  // 现在 ID 已内建到基础种子，不再需要 _WITH_IDS 派生版。
  it('binds every comment to an article that exists in the companion set', () => {
    const articleIds = new Set(SEARCH_PARITY_ARTICLES.map(article => article.id));

    expect(articleIds.size).toBe(SEARCH_PARITY_ARTICLES.length);
    for (const comment of SEARCH_PARITY_COMMENTS) {
      expect(articleIds).toContain(comment.articleId);
    }
  });

  it('assigns stable, collision-free ids to both sides', () => {
    expect(SEARCH_PARITY_ARTICLES[0].id).toBe('search-article-001');
    expect(SEARCH_PARITY_ARTICLES.at(-1)?.id).toBe('search-article-030');
    expect(SEARCH_PARITY_COMMENTS[0].id).toBe('search-comment-001');
    expect(SEARCH_PARITY_COMMENTS.at(-1)?.id).toBe('search-comment-040');
    expect(new Set(SEARCH_PARITY_COMMENTS.map(comment => comment.id)).size).toBe(SEARCH_PARITY_COMMENTS.length);
  });

  it('wraps comment→article references when comments outnumber articles', () => {
    const comments = makeSearchParityComments(7, 3);

    expect(comments.map(comment => comment.articleId)).toEqual([
      'search-article-001',
      'search-article-002',
      'search-article-003',
      'search-article-001',
      'search-article-002',
      'search-article-003',
      'search-article-001'
    ]);
  });

  it('rejects a comment count generated against an empty article set', () => {
    expect(() => makeSearchParityComments(1, 0)).toThrow(/articleCount/);
  });

  // RXT-009：本包声称 seed 固定，却没有任何快照/parity 测试。
  // 与 `packages/rxdb-plugin-search/src/__tests__/fixtures/seed.ts` 的复制实现漂移时，
  // 三端 e2e 会静默换掉输入语料而全绿。逐字段锁住确定性算法的输出。
  it('locks the deterministic article corpus', () => {
    expect(makeSearchParityArticles(3)).toEqual([
      {
        id: 'search-article-001',
        title: 'Article 0: typescript and rxjs',
        body: 'typescript introduction. We discuss rxjs in depth, including typescript pitfalls and rxjs best practices. Article number 0.',
        category: 'tech',
        tags: ['typescript', 'rxjs'],
        authorId: 'author-0',
        viewCount: 0
      },
      {
        id: 'search-article-002',
        title: 'Article 1: reading and cooking',
        body: 'reading introduction. We discuss cooking in depth, including reading pitfalls and cooking best practices. Article number 1.',
        category: 'life',
        tags: ['reading', 'cooking'],
        authorId: 'author-1',
        viewCount: 7
      },
      {
        id: 'search-article-003',
        title: 'Article 2: iceland and patagonia',
        body: 'iceland introduction. We discuss patagonia in depth, including iceland pitfalls and patagonia best practices. Article number 2.',
        category: 'travel',
        tags: ['iceland', 'patagonia'],
        authorId: 'author-2',
        viewCount: 14
      }
    ]);
  });

  it('locks the deterministic comment corpus', () => {
    expect(makeSearchParityComments(2, 30)).toEqual([
      {
        id: 'search-comment-001',
        articleId: 'search-article-001',
        content: 'Comment 0: I really enjoyed this read about typescript.',
        authorName: 'User 0'
      },
      {
        id: 'search-comment-002',
        articleId: 'search-article-002',
        content: 'Comment 1: I really enjoyed this read about rxjs.',
        authorName: 'User 1'
      }
    ]);
  });
});
