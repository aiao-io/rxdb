/**
 * 搜索一致性种子夹具 —— T055 [US2]。
 *
 * 由三端 e2e app（`dev-rxdb-angular-e2e` / `dev-rxdb-react-e2e` / `dev-rxdb-vue-e2e`）
 * 通过 `@aiao/rxdb-test` 包依赖引入，保证 `/search` parity E2E 输入完全一致。
 *
 * 与 `packages/rxdb-plugin-search/src/__tests__/fixtures/seed.ts` 等价的纯函数实现；
 * 因 rxdb-test 不反向依赖 rxdb-plugin-search，这里独立维护同一套确定性算法，
 * 由本包的 search-parity 快照测试固定行为。
 */

const TECH_TERMS = ['typescript', 'rxjs', 'sqlite', 'fts5', 'angular', 'react', 'vue', 'rxdb'];
const LIFE_TERMS = ['coffee', 'reading', 'cooking', 'gardening'];
const TRAVEL_TERMS = ['kyoto', 'paris', 'iceland', 'patagonia'];

const CATEGORIES = ['tech', 'life', 'travel'] as const;

/** 一致性 Article 行结构（与 `packages/rxdb-plugin-search/src/__tests__/fixtures/article.entity.ts` 对齐）。 */
export interface SearchParityArticle {
  /** 稳定 ID，供跨框架 E2E 比较 DOM `data-id`；由 {@link makeSearchParityArticles} 生成。 */
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly category: 'tech' | 'life' | 'travel';
  readonly tags: ReadonlyArray<string>;
  readonly authorId: string;
  readonly viewCount: number;
}

/** Parity Comment 行结构。 */
export interface SearchParityComment {
  /** 稳定 ID；由 {@link makeSearchParityComments} 生成。 */
  readonly id: string;
  /** 必定指向同批 Article 中真实存在的一条（见 {@link makeSearchParityComments}）。 */
  readonly articleId: string;
  readonly content: string;
  readonly authorName: string;
}

const articleParityId = (index: number): string => `search-article-${String(index + 1).padStart(3, '0')}`;
const commentParityId = (index: number): string => `search-comment-${String(index + 1).padStart(3, '0')}`;

/**
 * 生成 N 条 Article 确定性种子数据（无随机，供 parity E2E 使用）。
 *
 * @remarks
 * ID 在这里就写死，而不是留给下游后处理补：见 {@link makeSearchParityComments} 的 RXT-008 说明。
 */
export const makeSearchParityArticles = (count: number): SearchParityArticle[] => {
  const out: SearchParityArticle[] = [];
  for (let i = 0; i < count; i++) {
    const category = CATEGORIES[i % CATEGORIES.length];
    const terms =
      category === 'tech' ? TECH_TERMS
      : category === 'life' ? LIFE_TERMS
      : TRAVEL_TERMS;
    const t1 = terms[i % terms.length];
    const t2 = terms[(i + 1) % terms.length];
    out.push({
      id: articleParityId(i),
      title: `Article ${i}: ${t1} and ${t2}`,
      body: `${t1} introduction. We discuss ${t2} in depth, including ${t1} pitfalls and ${t2} best practices. Article number ${i}.`,
      category,
      tags: [t1, t2],
      authorId: `author-${i % 10}`,
      viewCount: i * 7
    });
  }
  return out;
};

/** Parity 场景默认的 Article 条数；`makeSearchParityComments` 的 FK 空间以此为准。 */
const DEFAULT_ARTICLE_COUNT = 30;

/**
 * 生成 N 条 Comment 确定性种子数据，`articleId` 循环绑定到配套的 Article ID 空间。
 *
 * @param count 生成条数
 * @param articleCount 配套 Article 的条数；决定 `articleId` 的取值空间，必须为正
 *
 * @remarks
 * RXT-008：早先这里写死 `articleId: \`article-${i % 100}\``，而 Article 侧根本不产 id ——
 * 导出的基础种子里每条 comment 的外键都是悬空的。现在两侧共用 {@link articleParityId}，
 * 并由 `articleCount` 显式限定取值空间，悬空外键在构造期就不可能出现。
 */
export const makeSearchParityComments = (count: number, articleCount: number): SearchParityComment[] => {
  if (!Number.isInteger(articleCount) || articleCount <= 0) {
    throw new RangeError(`makeSearchParityComments: articleCount must be a positive integer, got ${articleCount}`);
  }

  const out: SearchParityComment[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: commentParityId(i),
      articleId: articleParityId(i % articleCount),
      content: `Comment ${i}: I really enjoyed this read about ${TECH_TERMS[i % TECH_TERMS.length]}.`,
      authorName: `User ${i % 50}`
    });
  }
  return out;
};

/** Parity 场景默认种子：30 条 Article（含稳定 ID）。 */
export const SEARCH_PARITY_ARTICLES: ReadonlyArray<SearchParityArticle> =
  makeSearchParityArticles(DEFAULT_ARTICLE_COUNT);

/** Parity 场景默认种子：40 条 Comment（含稳定 ID，外键指向上面 30 条 Article）。 */
export const SEARCH_PARITY_COMMENTS: ReadonlyArray<SearchParityComment> = makeSearchParityComments(
  40,
  DEFAULT_ARTICLE_COUNT
);
