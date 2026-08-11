/**
 * @fileoverview Playwright e2e 与 demo 共享的 search API 注入工具。
 *
 * 把一组操作挂到 `window.__searchDemoTestApi`，让 Playwright spec 通过
 * `page.evaluate(() => window.__searchDemoTestApi.reset())` 直接驱动 demo 状态，
 * 而不必走 UI 操作 — UI 操作受网络/动画影响，不稳定。
 *
 * 三个 demo app（angular/react/vue）调用同一份 API，确保 spec 端共享行为契约。
 *
 * @module @aiao/rxdb-test/testing/search-demo-api
 */

import type { EntityType, RxDB } from '@aiao/rxdb';
import { filter, firstValueFrom, tap, throwError, timeout } from 'rxjs';
import { clearEntityRecords } from './clear-entity-records.js';
import { withSeedLock } from './seed-lock.js';

/** `reset()` 默认的计算属性沉淀等待时长（毫秒）。 */
const DEFAULT_SETTLE_MS = 50;

/** `runSearch()` 等待终态的默认总预算（毫秒）。 */
const DEFAULT_SEARCH_TIMEOUT_MS = 10_000;

/** `state$` 的终态；其余（`idle` / `loading`）都还会继续变化。 */
type TerminalSearchState = 'success' | 'empty' | 'error';

const TERMINAL_SEARCH_STATES: ReadonlySet<string> = new Set<TerminalSearchState>(['success', 'empty', 'error']);

/**
 * 判定 `state$` 是否已到终态。
 *
 * @remarks
 * RXT-002：搜索失败是**持续流上的 `'error'` 状态**，不是 Observable error。
 * 早先这里只放行 `success`/`empty`，`state='error'` 时 `firstValueFrom` 永不 settle，
 * `runSearch()` 挂起且 `finally` 不执行 —— search handle 泄漏。
 */
const isTerminalSearchState = (value: string): value is TerminalSearchState => TERMINAL_SEARCH_STATES.has(value);

/**
 * `@aiao/rxdb-plugin-search` 安装后挂到 RxDB 实例上的最小结构。
 *
 * @remarks
 * RXT-003：这里刻意**不用** `declare module '@aiao/rxdb'`。module augmentation 是全局的，
 * 只要有人 import `@aiao/rxdb-test` 就会生效 —— 即使没装 search 插件，消费者也会拿到
 * 虚假的 `db.search()` 类型（运行时并不存在），而且这份声明比真实 handle 少若干成员。
 * 权威声明属于 `packages/rxdb-plugin-search/src/plugin.ts`，本模块只做局部结构化断言。
 */
interface SearchCapableRxDB {
  search(
    query: string,
    options?: { pageSize?: number; debounce?: number; collections?: string[] }
  ): {
    state$: import('rxjs').Observable<string>;
    results$: import('rxjs').Observable<unknown[]>;
    destroy(): void;
  };
}

/**
 * 注入依赖：调用方提供 `Article`、`Comment` entity 类与 seed 函数，
 * 避免本模块直接 import entities subpath（subpath 在 src 编译期不可见）。
 */
export interface SearchDemoEntityDeps {
  /** Article entity 构造器，需对应当前 db 注册的实体类。 */
  Article: EntityType;
  /** Comment entity 构造器，需对应当前 db 注册的实体类。 */
  Comment: EntityType;
  /** reset() 调用时用来写入 fixture 种子数据的回调。 */
  seedData: (db: RxDB) => Promise<void>;
  /**
   * seed 之后等待框架计算属性沉淀的时长（毫秒）。
   *
   * @defaultValue 50
   * @remarks
   * 这段等待发生在 seed 锁**内部**：锁若提前释放，另一次 `reset()` 或页面自动 seed
   * 会在窗口期开始清库，第一个调用方拿到 resolve 时数据正被清空。
   * CI 负载高时可调大，本地想跑快可调小甚至设为 0。
   */
  settleMs?: number;
}

/**
 * `window.__searchDemoTestApi` 的形状契约。spec 端按此调用。
 */
export interface SearchDemoTestApi {
  /** 清空 Article + Comment 后重新 seed fixture；含一段锁内等待让计算属性沉淀（见 `settleMs`）。 */
  reset: () => Promise<void>;
  /** 用默认值 + partial 覆盖创建一篇 Article，返回 id。 */
  createArticle: (partial: Record<string, unknown>) => Promise<{ id: string }>;
  /** 找到指定 id 的 Article 并 patch、保存。 */
  updateArticle: (id: string, patch: Record<string, unknown>) => Promise<{ id: string }>;
  /** 找到并 remove 指定 id 的 Article。 */
  removeArticle: (id: string) => Promise<{ id: string }>;
  /**
   * 触发一次 search、等到 success/empty 终态，再返回归一化结果。
   *
   * @param timeoutMs 等待终态的总预算，默认 10000。超时或落到 `error` 终态一律 reject
   *   并 destroy handle —— 挂起会退化成一句没有线索的 Playwright `page.evaluate` 超时。
   */
  runSearch: (
    query: string,
    pageSize?: number,
    timeoutMs?: number
  ) => Promise<{
    state: 'success' | 'empty';
    results: Array<{ collection: string; id: string; rank: number }>;
  }>;
}

declare global {
  interface Window {
    __searchDemoTestApi?: SearchDemoTestApi;
  }
}

interface ArticleDraft {
  id: string;
}

interface ArticleLike extends ArticleDraft {
  save: () => Promise<unknown>;
  remove: () => Promise<unknown>;
}

/**
 * 把 search demo 的 test API 安装到 `window.__searchDemoTestApi`。
 *
 * - 非浏览器环境（SSR / Node 测试）no-op。
 * - 同一 window 重复调用会覆盖前一次注册（demo 切换 adapter / db 时不会泄漏）。
 *
 * @param db 已 `init` 的 RxDB 实例
 * @param deps Article / Comment entity 类与 seed 函数
 */
export function installSearchDemoTestApi(db: RxDB, deps: SearchDemoEntityDeps): void {
  if (typeof window === 'undefined') return;

  const { Article, Comment, seedData, settleMs = DEFAULT_SETTLE_MS } = deps;
  let dynamicArticleSequence = 0;

  window.__searchDemoTestApi = {
    reset: async () => {
      await withSeedLock(db, async () => {
        await clearEntityRecords(db, Comment);
        await clearEntityRecords(db, Article);
        await seedData(db);
        // 等待必须在锁内：锁一旦提前释放，下一次 reset / 页面自动 seed 会在窗口期内清库
        if (settleMs > 0) await new Promise(resolve => setTimeout(resolve, settleMs));
      });
    },
    createArticle: (partial: Record<string, unknown>) =>
      withSeedLock(db, async () => {
        const repo = db.entityManager.getRepository(Article);
        const article = Object.assign(new Article(), {
          id: `search-article-dynamic-${Date.now().toString(36)}-${(dynamicArticleSequence++).toString(36)}`,
          title: 'dynamic search article',
          body: 'dynamic search body',
          category: 'tech',
          tags: [],
          authorId: 'playwright',
          viewCount: 0,
          ...partial
        }) as ArticleDraft;
        await repo.create(article);
        return { id: article.id };
      }),
    updateArticle: (id: string, patch: Record<string, unknown>) =>
      withSeedLock(db, async () => {
        const repo = db.entityManager.getRepository(Article);
        const articles = (await firstValueFrom(
          repo.findAll({ where: { combinator: 'and', rules: [] } })
        )) as ArticleLike[];
        const article = articles.find(item => item.id === id);
        if (!article) throw new Error(`Article not found: ${id}`);
        Object.assign(article, patch);
        await article.save();
        return { id };
      }),
    removeArticle: (id: string) =>
      withSeedLock(db, async () => {
        const repo = db.entityManager.getRepository(Article);
        const articles = (await firstValueFrom(
          repo.findAll({ where: { combinator: 'and', rules: [] } })
        )) as ArticleLike[];
        const article = articles.find(item => item.id === id);
        if (!article) throw new Error(`Article not found: ${id}`);
        await article.remove();
        return { id };
      }),
    runSearch: async (query: string, pageSize = 10, timeoutMs = DEFAULT_SEARCH_TIMEOUT_MS) => {
      const handle = (db as unknown as SearchCapableRxDB).search(query, { pageSize, debounce: 0 });
      let lastState = 'idle';
      try {
        const state = await firstValueFrom(
          handle.state$.pipe(
            tap(value => {
              lastState = value;
            }),
            filter(isTerminalSearchState),
            timeout({
              first: timeoutMs,
              with: () =>
                throwError(
                  () =>
                    new Error(
                      `search did not reach a terminal state within ${String(timeoutMs)}ms (last state: ${lastState})`
                    )
                )
            })
          )
        );

        if (state === 'error') {
          throw new Error(`search failed: reached the "error" state for query ${JSON.stringify(query)}`);
        }

        const results = (await firstValueFrom(handle.results$)) as Array<{
          collection: string;
          id: string;
          rank: number;
        }>;
        return {
          state,
          results: results.map(result => ({
            collection: result.collection,
            id: result.id,
            rank: Number(result.rank.toFixed(4))
          }))
        };
      } finally {
        handle.destroy();
      }
    }
  };
}
