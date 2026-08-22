import type { EntityType } from '@aiao/rxdb';
import type { SearchResult } from '@aiao/rxdb-plugin-search';
import { useSearch } from '@aiao/rxdb-plugin-search-react';
import { useRxDB } from '@aiao/rxdb-react';
import { createLockedSeeder } from '@aiao/rxdb-test';
import { Article, Comment } from '@aiao/rxdb-test/entities';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { firstValueFrom } from 'rxjs';
import { seedSearchParityData } from '../../rxdb/search-parity-seed.js';
import { CancellationCheck, initializeSearchRecords, runExclusive } from '../search-lifecycle';
import { SearchCreateModal } from './components/SearchCreateModal';
import { SearchRecordsPanel } from './components/SearchRecordsPanel';
import { SearchResultsList } from './components/SearchResultsList';
import {
  SEARCH_DEMO_COLLECTIONS,
  type ArticleCreateDraft,
  type CommentCreateDraft,
  type SearchDemoCollection,
  type SearchDemoMode
} from './types';

const SEARCH_DEMO_PAGE_SIZE = 20;
const SEARCH_DEMO_SNIPPET_LENGTH = 64;

const createArticleDraft = (token: string): ArticleCreateDraft => ({
  title: `${token} article demo`,
  body: `${token} body demonstrates global and scoped search refresh for articles.`,
  category: 'tech',
  tagsText: `${token}, demo`,
  authorId: 'search-demo',
  viewCount: 1
});
const createCommentDraft = (articleId: string, token: string): CommentCreateDraft => ({
  articleId,
  content: `${token} comment demo keeps scoped search easy to verify.`,
  authorName: `${token}-author`
});

function buildMutationToken(prefix: string, query: string): string {
  const q = query.trim().replace(/\s+/g, '-').slice(0, 24);
  return q || `${prefix}-${Date.now().toString(36)}`;
}

/**
 * `/search` — rxdb-plugin-search 三端 parity demo（React 版）。
 *
 * 与 Angular (`apps/dev-rxdb-angular/src/app/pages/search`) 与
 * Vue (`apps/dev-rxdb-vue/src/pages/SearchPage.vue`) 共享 seed
 * (`@aiao/rxdb-test` `SEARCH_PARITY_*`)。
 */
export default function SearchPage(): React.JSX.Element {
  const rxdb = useRxDB();

  // ----- Scope -----
  const [scopeMode, setScopeModeState] = useState<SearchDemoMode>('global');
  const [customScope, setCustomScope] = useState<Record<SearchDemoCollection, boolean>>({
    article: true,
    comment: true,
    todos: true
  });
  const activeCollections = useMemo<readonly SearchDemoCollection[] | undefined>(() => {
    if (scopeMode === 'global') return undefined;
    return SEARCH_DEMO_COLLECTIONS.filter(c => customScope[c]);
  }, [scopeMode, customScope]);
  const scopeSummary = useMemo(() => {
    if (activeCollections === undefined) return '全部可搜索集合';
    if (activeCollections.length === 0) return '未选择集合';
    return activeCollections
      .map(c =>
        c === 'article' ? '文章'
        : c === 'comment' ? '评论'
        : 'Todo'
      )
      .join(' + ');
  }, [activeCollections]);

  // ----- Search（由 @aiao/rxdb-plugin-search-react 提供） -----
  // scope 变化时重建 handle、并保留用户当前 query，是绑定包的契约（SRCHR-001 收口后落地），
  // 页面不再手写四路订阅与 handle 生命周期。options 每次渲染新建字面量即可：
  // hook 内部按语义（collections/debounce/pageSize/snippetLength）比较，不看引用。
  const {
    query,
    setQuery: setSearchQuery,
    results,
    state: searchState,
    error: searchError,
    hasMore,
    loadMore,
    clear: clearSearchHandle,
    retry: retrySearchHandle
  } = useSearch(rxdb, {
    collections: activeCollections,
    debounce: 300,
    pageSize: SEARCH_DEMO_PAGE_SIZE,
    snippetLength: SEARCH_DEMO_SNIPPET_LENGTH
  });

  // "latest ref" 模式：让下方几个 useCallback 读到最新 query 而依赖数组保持为空
  // （新建内容的 token、模拟错误的前置判断都要当前查询词）。
  // 用 useLayoutEffect 而非直接赋值，绕过 react/no-ref-object-assignments 规则。
  const queryRef = useRef(query);
  useLayoutEffect(() => {
    queryRef.current = query;
  }, [query]);

  // ----- Records -----
  const [articleRecords, setArticleRecords] = useState<Article[]>([]);
  const [commentRecords, setCommentRecords] = useState<Comment[]>([]);
  const [mutationBusy, setMutationBusy] = useState(false);
  const mutationLockRef = useRef(false);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [seedCount, setSeedCount] = useState<{ article: number; comment: number } | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [recordsCollapsed, setRecordsCollapsed] = useState(false);
  const [activeRecordTab, setActiveRecordTab] = useState<SearchDemoCollection>('article');

  // ----- Create modal -----
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState<SearchDemoCollection>('article');
  const [articleDraft, setArticleDraft] = useState<ArticleCreateDraft>(createArticleDraft('article'));
  const [commentDraft, setCommentDraft] = useState<CommentCreateDraft>(
    createCommentDraft('search-demo-article', 'comment')
  );

  // ----- Display state -----
  const [simulatedError, setSimulatedError] = useState<string | null>(null);
  const displayState = simulatedError ? 'error' : searchState;
  const displayError = simulatedError ?? searchError?.message ?? null;
  const resultAnnouncement = useMemo(() => {
    if (displayState === 'loading') return 'Searching…';
    if (displayState === 'success') return `${results.length} results`;
    if (displayState === 'empty') return '0 results';
    if (displayState === 'error') return 'Search failed';
    return 'Enter a query';
  }, [displayState, results.length]);

  // ----- Helpers -----
  const listEntities = useCallback(
    async <T extends EntityType>(Type: T): Promise<InstanceType<T>[]> => {
      const repo = rxdb.entityManager.getRepository(Type);
      return firstValueFrom(repo.findAll({ where: { combinator: 'and', rules: [] } }));
    },
    [rxdb]
  );

  const refreshCounts = useCallback(
    async (isCancelled: CancellationCheck = () => false) => {
      const [articles, comments] = await Promise.all([listEntities(Article), listEntities(Comment)]);
      if (isCancelled()) return;
      setArticleRecords(articles);
      setCommentRecords(comments);
      setSeedCount({ article: articles.length, comment: comments.length });
    },
    [listEntities]
  );

  const runMutation = useCallback(
    <T,>(action: () => Promise<T>): Promise<T | undefined> =>
      runExclusive(mutationLockRef, async () => {
        setMutationBusy(true);
        try {
          return await action();
        } finally {
          setMutationBusy(false);
        }
      }),
    []
  );

  const seed = useCallback(
    async (isCancelled: CancellationCheck = () => false) => {
      if (isCancelled()) return;
      setSeeding(true);
      try {
        await createLockedSeeder(rxdb, seedSearchParityData)();
        if (isCancelled()) return;
        await refreshCounts(isCancelled);
      } finally {
        if (!isCancelled()) setSeeding(false);
      }
    },
    [rxdb, refreshCounts]
  );

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    initializeSearchRecords({
      loadArticles: () => listEntities(Article),
      loadComments: () => listEntities(Comment),
      seed,
      commit: (articles, comments) => {
        setArticleRecords(articles);
        setCommentRecords(comments);
        setSeedCount({ article: articles.length, comment: comments.length });
      },
      isCancelled
    }).catch(err => {
      if (!cancelled) console.error('[SearchPage] initial seed failed', err);
    });
    return () => {
      cancelled = true;
    };
  }, [listEntities, seed]);

  // ----- Search handlers -----
  // 页面只在绑定包之上叠加"模拟错误"这一层演示态，查询词与 handle 命令都转发给 hook。
  const setQuery = useCallback(
    (q: string) => {
      setSimulatedError(null);
      setSearchQuery(q);
    },
    [setSearchQuery]
  );

  const clearSearch = useCallback(() => {
    setSimulatedError(null);
    clearSearchHandle();
  }, [clearSearchHandle]);

  const simulateError = useCallback(() => {
    if (!queryRef.current.trim()) return;
    setSimulatedError('模拟的搜索错误');
  }, []);

  const retrySearch = useCallback(() => {
    setSimulatedError(null);
    retrySearchHandle();
  }, [retrySearchHandle]);

  // ----- Keyboard shortcuts -----
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchInputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ----- Scope handlers -----
  const setScopeMode = useCallback((mode: SearchDemoMode) => {
    setScopeModeState(mode);
    setMutationMessage(null);
  }, []);

  const toggleCollection = useCallback((collection: SearchDemoCollection, checked: boolean) => {
    setCustomScope(s => ({ ...s, [collection]: checked }));
  }, []);

  // ----- Records CRUD -----
  const createArticle = useCallback(
    async (input: {
      title: string;
      body: string;
      category: Article['category'];
      tags: readonly string[];
      authorId: string;
      viewCount: number;
    }) => {
      await runMutation(async () => {
        const article = new Article({ ...input, tags: [...input.tags] });
        await rxdb.entityManager.getRepository(Article).create(article);
        await refreshCounts();
        setMutationMessage(`已创建文章 ${article.id}`);
      });
    },
    [runMutation, rxdb, refreshCounts]
  );

  const createComment = useCallback(
    async (input: { articleId: string; content: string; authorName: string }) => {
      await runMutation(async () => {
        const comment = new Comment(input);
        await rxdb.entityManager.getRepository(Comment).create(comment);
        await refreshCounts();
        setMutationMessage(`已创建评论 ${comment.id}`);
      });
    },
    [runMutation, rxdb, refreshCounts]
  );

  const updateArticle = useCallback(
    async (id: string, token: string) => {
      await runMutation(async () => {
        const all = await listEntities(Article);
        const article = all.find(a => String(a.id) === id);
        if (!article) {
          setMutationMessage(`未找到文章: ${id}`);
          return;
        }
        article.title = `${article.title} [updated]`;
        article.body = `${article.body} Updated with token ${token}.`;
        article.tags = [...new Set([...(article.tags ?? []), 'updated', token])];
        article.viewCount += 1;
        await article.save();
        await refreshCounts();
        setMutationMessage(`已更新文章 ${id}`);
      });
    },
    [runMutation, listEntities, refreshCounts]
  );

  const updateComment = useCallback(
    async (id: string, token: string) => {
      await runMutation(async () => {
        const all = await listEntities(Comment);
        const comment = all.find(c => String(c.id) === id);
        if (!comment) {
          setMutationMessage(`未找到评论: ${id}`);
          return;
        }
        comment.content = `${comment.content} Updated with token ${token}.`;
        comment.authorName = `${comment.authorName}-updated`;
        await comment.save();
        await refreshCounts();
        setMutationMessage(`已更新评论 ${id}`);
      });
    },
    [runMutation, listEntities, refreshCounts]
  );

  const removeArticle = useCallback(
    async (id: string) => {
      await runMutation(async () => {
        const all = await listEntities(Article);
        const article = all.find(a => String(a.id) === id);
        if (!article) {
          setMutationMessage(`未找到文章: ${id}`);
          return;
        }
        await article.remove();
        await refreshCounts();
        setMutationMessage(`已删除文章 ${id}`);
      });
    },
    [runMutation, listEntities, refreshCounts]
  );

  const removeComment = useCallback(
    async (id: string) => {
      await runMutation(async () => {
        const all = await listEntities(Comment);
        const comment = all.find(c => String(c.id) === id);
        if (!comment) {
          setMutationMessage(`未找到评论: ${id}`);
          return;
        }
        await comment.remove();
        await refreshCounts();
        setMutationMessage(`已删除评论 ${id}`);
      });
    },
    [runMutation, listEntities, refreshCounts]
  );

  // ----- Create modal handlers -----
  const openCreateModal = useCallback(
    (type: SearchDemoCollection) => {
      const token = buildMutationToken(type, queryRef.current);
      setCreateModalType(type);
      if (type === 'article') {
        setArticleDraft(createArticleDraft(token));
      } else {
        const firstArticleId = String(articleRecords[0]?.id ?? 'search-demo-article');
        setCommentDraft(createCommentDraft(firstArticleId, token));
      }
      setCreateModalOpen(true);
      setMutationMessage(null);
    },
    [articleRecords]
  );

  const submitCreateModal = useCallback(async () => {
    if (createModalType === 'article') {
      const d = articleDraft;
      if (!d.title.trim() || !d.body.trim() || !d.authorId.trim()) return;
      await createArticle({
        title: d.title.trim(),
        body: d.body.trim(),
        category: d.category,
        tags: d.tagsText
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
        authorId: d.authorId.trim(),
        viewCount: d.viewCount
      });
      setCreateModalOpen(false);
      setActiveRecordTab('article');
    } else {
      const d = commentDraft;
      if (!d.articleId.trim() || !d.authorName.trim() || !d.content.trim()) return;
      await createComment({
        articleId: d.articleId.trim(),
        content: d.content.trim(),
        authorName: d.authorName.trim()
      });
      setCreateModalOpen(false);
      setActiveRecordTab('comment');
    }
  }, [createModalType, articleDraft, commentDraft, createArticle, createComment]);

  const canSubmitCreateModal =
    createModalType === 'article' ?
      Boolean(articleDraft.title.trim() && articleDraft.body.trim() && articleDraft.authorId.trim())
    : Boolean(commentDraft.articleId.trim() && commentDraft.authorName.trim() && commentDraft.content.trim());

  // ----- Per-result actions -----
  const updateResultRecord = useCallback(
    (r: SearchResult) => {
      const token = buildMutationToken(`${r.collection}-update`, queryRef.current);
      if (r.collection === 'article') return updateArticle(r.id, token);
      if (r.collection === 'comment') return updateComment(r.id, token);
      return Promise.resolve();
    },
    [updateArticle, updateComment]
  );

  const removeResultRecord = useCallback(
    (r: SearchResult) => {
      if (r.collection === 'article') return removeArticle(r.id);
      if (r.collection === 'comment') return removeComment(r.id);
      return Promise.resolve();
    },
    [removeArticle, removeComment]
  );

  // ----- Render -----
  return (
    <main className='mx-auto flex w-full max-w-4xl flex-col gap-3 p-4' data-testid='search-page'>
      <header className='flex items-baseline gap-3'>
        <h1 className='text-xl font-semibold'>全局搜索</h1>
        <p className='text-base-content/80 text-sm'>Seeded articles and comments from the current RxDB only.</p>
      </header>

      {/* Search input */}
      <div className='relative w-full max-w-md'>
        <span
          className='text-base-content/50 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2'
          aria-hidden='true'
        >
          {displayState === 'loading' ?
            <span className='loading loading-spinner loading-xs' />
          : <svg
              fill='none'
              height='16'
              stroke='currentColor'
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='2'
              viewBox='0 0 24 24'
              width='16'
              xmlns='http://www.w3.org/2000/svg'
            >
              <circle cx='11' cy='11' r='8' />
              <path d='m21 21-4.3-4.3' />
            </svg>
          }
        </span>
        <input
          ref={searchInputRef}
          type='search'
          role='searchbox'
          className='input input-bordered w-full pr-24 pl-9 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none'
          placeholder='搜索…（⌘K 或 /）'
          aria-label='Global search'
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && clearSearch()}
          aria-busy={displayState === 'loading' ? 'true' : 'false'}
          data-testid='search-input'
        />
        <div className='absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5'>
          {(query.trim() || simulatedError) && (
            <button
              type='button'
              className='btn btn-ghost btn-xs btn-circle'
              onClick={clearSearch}
              aria-label='清空'
              data-testid='search-clear'
              title='清空 (Esc)'
            >
              <svg
                fill='none'
                height='14'
                stroke='currentColor'
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                viewBox='0 0 24 24'
                width='14'
                xmlns='http://www.w3.org/2000/svg'
              >
                <path d='M18 6 6 18' />
                <path d='m6 6 12 12' />
              </svg>
            </button>
          )}
          <button
            type='button'
            className='btn btn-ghost btn-xs btn-circle text-warning'
            disabled={!query.trim()}
            onClick={simulateError}
            aria-label='模拟错误'
            data-testid='search-simulate-error'
            title='模拟错误'
          >
            <svg
              fill='none'
              height='14'
              stroke='currentColor'
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='2'
              viewBox='0 0 24 24'
              width='14'
              xmlns='http://www.w3.org/2000/svg'
            >
              <path d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' />
              <path d='M12 9v4' />
              <path d='M12 17h.01' />
            </svg>
          </button>
          <kbd className='kbd kbd-xs mr-1 hidden sm:inline-flex'>⌘K</kbd>
        </div>
      </div>

      {/* Scope panel */}
      <section className='card bg-base-200/60 p-3' data-testid='search-scope-panel'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-sm font-medium'>范围</span>
          <button
            type='button'
            className={`btn btn-xs ${scopeMode === 'global' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setScopeMode('global')}
            data-testid='search-scope-mode-global'
          >
            全部
          </button>
          <button
            type='button'
            className={`btn btn-xs ${scopeMode === 'custom' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setScopeMode('custom')}
            data-testid='search-scope-mode-custom'
          >
            自定义
          </button>
          {scopeMode === 'custom' && (
            <>
              {SEARCH_DEMO_COLLECTIONS.map(col => (
                <label key={col} className='label cursor-pointer gap-1 py-0'>
                  <input
                    type='checkbox'
                    className='checkbox checkbox-xs'
                    checked={customScope[col]}
                    onChange={e => toggleCollection(col, e.target.checked)}
                    data-testid={`search-scope-${col}`}
                  />
                  <span className='label-text text-xs'>
                    {col === 'article' ?
                      '文章'
                    : col === 'comment' ?
                      '评论'
                    : 'Todo'}
                  </span>
                </label>
              ))}
            </>
          )}
          <span className='text-base-content/60 ml-auto text-xs' data-testid='search-scope-summary'>
            {scopeSummary}
          </span>
        </div>
      </section>

      <SearchRecordsPanel
        collapsed={recordsCollapsed}
        activeTab={activeRecordTab}
        articleRecords={articleRecords}
        commentRecords={commentRecords}
        mutationBusy={mutationBusy}
        mutationMessage={mutationMessage}
        onCollapsedChange={setRecordsCollapsed}
        onActiveTabChange={tab => {
          setActiveRecordTab(tab);
          setMutationMessage(null);
        }}
        onOpenCreate={openCreateModal}
        onRemoveArticle={id => void removeArticle(id)}
        onRemoveComment={id => void removeComment(id)}
      />

      {/* Seed info */}
      <div className='flex items-center gap-3 text-xs'>
        <span className='text-base-content/60' data-testid='search-seed-count'>
          数据：
          {seedCount ?
            `文章 ${seedCount.article}${seedCount.comment ? ` · 评论 ${seedCount.comment}` : ''}`
          : '加载中…'}
        </span>
        <button
          type='button'
          className='btn btn-sm btn-ghost'
          onClick={() => void seed()}
          disabled={seeding}
          data-testid='search-reseed'
        >
          {seeding ? '写入中…' : '重新写入'}
        </button>
      </div>

      <SearchCreateModal
        open={createModalOpen}
        type={createModalType}
        articleDraft={articleDraft}
        commentDraft={commentDraft}
        mutationBusy={mutationBusy}
        canSubmit={canSubmitCreateModal}
        onOpenChange={setCreateModalOpen}
        onArticleDraftChange={setArticleDraft}
        onCommentDraftChange={setCommentDraft}
        onSubmit={() => void submitCreateModal()}
      />

      {/* Results */}
      <SearchResultsList
        results={results}
        displayState={displayState}
        displayError={displayError}
        resultAnnouncement={resultAnnouncement}
        query={query}
        hasMore={hasMore}
        mutationBusy={mutationBusy}
        onLoadMore={loadMore}
        onRetry={retrySearch}
        onUpdateResult={r => void updateResultRecord(r)}
        onRemoveResult={r => void removeResultRecord(r)}
      />
    </main>
  );
}
