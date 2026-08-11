import type { EntityType } from '@aiao/rxdb';
import type { SearchResult } from '@aiao/rxdb-plugin-search';
import { useSearch } from '@aiao/rxdb-plugin-search-react';
import { useRxDB } from '@aiao/rxdb-react';
import { createLockedSeeder } from '@aiao/rxdb-test';
import { Article, Comment } from '@aiao/rxdb-test/entities';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { firstValueFrom } from 'rxjs';
import { seedSearchParityData } from '../rxdb/search-parity-seed.js';
import { CancellationCheck, initializeSearchRecords, runExclusive } from './search-lifecycle';

const SEARCH_DEMO_COLLECTIONS = ['article', 'comment', 'todos'] as const;
const SEARCH_DEMO_PAGE_SIZE = 20;
const SEARCH_DEMO_SNIPPET_LENGTH = 64;

type SearchDemoCollection = (typeof SEARCH_DEMO_COLLECTIONS)[number];
type SearchDemoMode = 'global' | 'custom';
type ArticleCreateDraft = {
  title: string;
  body: string;
  category: 'tech' | 'life' | 'travel';
  tagsText: string;
  authorId: string;
  viewCount: number;
};
type CommentCreateDraft = { articleId: string; content: string; authorName: string };

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

function localizeCollection(collection: string): string {
  if (collection === 'article') return '文章';
  if (collection === 'comment') return '评论';
  if (collection === 'todos') return 'Todo';
  return collection;
}

function localizeField(field: string): string {
  const map: Record<string, string> = {
    title: '标题',
    body: '正文',
    content: '内容',
    authorName: '作者',
    authorId: '作者 ID',
    category: '分类',
    tags: '标签'
  };
  return map[field] ?? field;
}

function collectionBadgeClass(collection: string): string {
  if (collection === 'article') return 'badge-primary';
  if (collection === 'comment') return 'badge-secondary';
  if (collection === 'todos') return 'badge-accent';
  return 'badge-ghost';
}

// 优先取查询词（kebab-case）作为 token，保证新建内容可被当前关键词命中
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

      {/* Records panel */}
      <section className='card bg-base-200/60' data-testid='search-records-panel'>
        <button
          type='button'
          className='flex w-full items-center justify-between gap-2 p-3 text-left'
          aria-expanded={!recordsCollapsed}
          onClick={() => setRecordsCollapsed(v => !v)}
          data-testid='search-records-toggle'
        >
          <span className='flex items-center gap-2 text-sm font-medium'>
            <svg
              className={`transition-transform ${!recordsCollapsed ? 'rotate-90' : ''}`}
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
              <path d='m9 18 6-6-6-6' />
            </svg>
            数据记录
            <span className='text-base-content/60 text-xs font-normal'>
              文章 {articleRecords.length} · 评论 {commentRecords.length}
            </span>
          </span>
        </button>

        {!recordsCollapsed && (
          <div className='px-3 pb-3'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='tabs tabs-border w-full sm:w-auto' role='tablist'>
                {(['article', 'comment'] as const).map(tab => (
                  <button
                    key={tab}
                    type='button'
                    role='tab'
                    aria-selected={activeRecordTab === tab}
                    className={`tab text-base-content${activeRecordTab === tab ? 'tab-active' : ''}`}
                    onClick={() => {
                      setActiveRecordTab(tab);
                      setMutationMessage(null);
                    }}
                    data-testid={`search-tab-${tab}`}
                  >
                    {tab === 'article' ? '文章' : '评论'} (
                    {tab === 'article' ? articleRecords.length : commentRecords.length})
                  </button>
                ))}
              </div>
              <button
                type='button'
                className='btn btn-sm btn-primary gap-1 self-start sm:self-center'
                disabled={mutationBusy}
                onClick={() => openCreateModal(activeRecordTab)}
                aria-label={`新建${activeRecordTab === 'article' ? '文章' : '评论'}`}
                data-testid={activeRecordTab === 'article' ? 'search-create-article' : 'search-create-comment'}
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
                  <path d='M5 12h14' />
                  <path d='M12 5v14' />
                </svg>
                新建{activeRecordTab === 'article' ? '文章' : '评论'}
              </button>
            </div>

            {activeRecordTab === 'article' ?
              articleRecords.length === 0 ?
                <p className='text-base-content/60 mt-3 text-sm italic'>暂无文章</p>
              : <ul className='divide-base-300 rounded-box bg-base-100 mt-3 max-h-96 divide-y overflow-y-auto'>
                  {articleRecords.map(article => (
                    <li
                      key={article.id}
                      className='flex items-start justify-between gap-3 px-4 py-3'
                      data-testid={`search-record-article-${article.id}`}
                    >
                      <div className='min-w-0 flex-1'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='font-medium'>{article.title}</span>
                          <span className='badge badge-primary badge-sm'>{article.category}</span>
                          <span className='text-base-content/80 text-xs'>#{article.id}</span>
                        </div>
                        <p className='text-base-content/80 mt-1 text-sm'>{article.body}</p>
                        <div className='mt-2 flex flex-wrap gap-1'>
                          {article.tags?.map(tag => (
                            <span key={tag} className='badge badge-outline badge-xs'>
                              {tag}
                            </span>
                          ))}
                        </div>
                        <p className='text-base-content/80 mt-2 text-xs'>
                          {article.authorId} · {article.viewCount} 次浏览
                        </p>
                      </div>
                      <button
                        type='button'
                        className='btn btn-xs btn-ghost text-error'
                        disabled={mutationBusy}
                        onClick={() => void removeArticle(String(article.id))}
                        data-testid={`search-delete-article-${article.id}`}
                      >
                        删除
                      </button>
                    </li>
                  ))}
                </ul>

            : commentRecords.length === 0 ?
              <p className='text-base-content/60 mt-3 text-sm italic'>暂无评论</p>
            : <ul className='divide-base-300 rounded-box bg-base-100 mt-3 max-h-96 divide-y overflow-y-auto'>
                {commentRecords.map(comment => (
                  <li
                    key={comment.id}
                    className='flex items-start justify-between gap-3 px-4 py-3'
                    data-testid={`search-record-comment-${comment.id}`}
                  >
                    <div className='min-w-0 flex-1'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='font-medium'>{comment.authorName}</span>
                        <span className='text-base-content/80 text-xs'>文章 {comment.articleId}</span>
                        <span className='text-base-content/80 text-xs'>#{comment.id}</span>
                      </div>
                      <p className='text-base-content/80 mt-1 text-sm'>{comment.content}</p>
                    </div>
                    <button
                      type='button'
                      className='btn btn-xs btn-ghost text-error'
                      disabled={mutationBusy}
                      onClick={() => void removeComment(String(comment.id))}
                      data-testid={`search-delete-comment-${comment.id}`}
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            }

            {mutationMessage && (
              <p className='text-base-content/70 mt-3 text-xs' data-testid='search-mutation-message' role='status'>
                {mutationMessage}
              </p>
            )}
          </div>
        )}
      </section>

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

      {/* Create modal */}
      {createModalOpen && (
        <div
          className='modal modal-open'
          data-testid='search-create-modal'
          tabIndex={-1}
          onKeyDown={e => {
            if (e.key === 'Escape') setCreateModalOpen(false);
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submitCreateModal();
          }}
        >
          <div className='modal-box max-w-2xl' aria-labelledby='search-create-title' aria-modal='true' role='dialog'>
            <div className='flex items-start justify-between gap-3'>
              <h2 className='text-lg font-semibold' id='search-create-title'>
                新建{createModalType === 'article' ? '文章' : '评论'}
              </h2>
              <button
                type='button'
                className='btn btn-ghost btn-sm btn-circle'
                onClick={() => setCreateModalOpen(false)}
                aria-label='关闭'
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
            </div>

            {createModalType === 'article' ?
              <div className='mt-4 grid gap-3 sm:grid-cols-2'>
                <label className='floating-label sm:col-span-2'>
                  <input
                    type='text'
                    className='input input-bordered w-full'
                    placeholder='标题'
                    value={articleDraft.title}
                    onChange={e => setArticleDraft(d => ({ ...d, title: e.target.value }))}
                    autoFocus
                  />
                  <span>标题</span>
                </label>
                <label className='floating-label sm:col-span-2'>
                  <textarea
                    className='textarea textarea-bordered min-h-28 w-full'
                    placeholder='正文'
                    value={articleDraft.body}
                    onChange={e => setArticleDraft(d => ({ ...d, body: e.target.value }))}
                  />
                  <span>正文</span>
                </label>
                <label className='floating-label'>
                  <select
                    className='select select-bordered w-full'
                    value={articleDraft.category}
                    onChange={e =>
                      setArticleDraft(d => ({ ...d, category: e.target.value as ArticleCreateDraft['category'] }))
                    }
                  >
                    <option value='tech'>tech</option>
                    <option value='life'>life</option>
                    <option value='travel'>travel</option>
                  </select>
                  <span>分类</span>
                </label>
                <label className='floating-label'>
                  <input
                    type='number'
                    className='input input-bordered w-full'
                    placeholder='浏览数'
                    value={articleDraft.viewCount}
                    onChange={e => {
                      const n = Number(e.target.value);
                      setArticleDraft(d => ({ ...d, viewCount: Number.isFinite(n) ? n : 0 }));
                    }}
                  />
                  <span>浏览数</span>
                </label>
                <label className='floating-label'>
                  <input
                    type='text'
                    className='input input-bordered w-full'
                    placeholder='作者 ID'
                    value={articleDraft.authorId}
                    onChange={e => setArticleDraft(d => ({ ...d, authorId: e.target.value }))}
                  />
                  <span>作者 ID</span>
                </label>
                <label className='floating-label'>
                  <input
                    type='text'
                    className='input input-bordered w-full'
                    placeholder='标签1, 标签2'
                    value={articleDraft.tagsText}
                    onChange={e => setArticleDraft(d => ({ ...d, tagsText: e.target.value }))}
                  />
                  <span>标签（逗号分隔）</span>
                </label>
              </div>
            : <div className='mt-4 grid gap-3'>
                <label className='floating-label'>
                  <input
                    type='text'
                    className='input input-bordered w-full'
                    placeholder='文章 ID'
                    value={commentDraft.articleId}
                    onChange={e => setCommentDraft(d => ({ ...d, articleId: e.target.value }))}
                    autoFocus
                  />
                  <span>文章 ID</span>
                </label>
                <label className='floating-label'>
                  <input
                    type='text'
                    className='input input-bordered w-full'
                    placeholder='作者'
                    value={commentDraft.authorName}
                    onChange={e => setCommentDraft(d => ({ ...d, authorName: e.target.value }))}
                  />
                  <span>作者</span>
                </label>
                <label className='floating-label'>
                  <textarea
                    className='textarea textarea-bordered min-h-28 w-full'
                    placeholder='内容'
                    value={commentDraft.content}
                    onChange={e => setCommentDraft(d => ({ ...d, content: e.target.value }))}
                  />
                  <span>内容</span>
                </label>
              </div>
            }

            <div className='modal-action'>
              <button type='button' className='btn btn-ghost' onClick={() => setCreateModalOpen(false)}>
                取消
              </button>
              <button
                type='button'
                className='btn btn-primary'
                disabled={mutationBusy || !canSubmitCreateModal}
                onClick={() => void submitCreateModal()}
                data-testid='search-create-submit'
              >
                创建
              </button>
            </div>
          </div>
          <button
            type='button'
            className='modal-backdrop'
            onClick={() => setCreateModalOpen(false)}
            aria-label='关闭'
          />
        </div>
      )}

      {/* Results */}
      <section className='flex flex-col gap-2' aria-live='polite' data-testid='search-results'>
        <div
          className={`rounded-box border-base-300 bg-base-100 flex items-center gap-2 border px-3 py-2 text-sm${
            displayState === 'loading' ? 'border-primary'
            : displayState === 'error' ? 'border-warning'
            : ''
          }`}
        >
          {displayState === 'loading' && <span className='loading loading-spinner loading-xs text-primary' />}
          {displayState === 'error' && <span className='text-warning'>⚠</span>}
          {displayState === 'empty' && <span className='text-base-content/50'>∅</span>}
          {displayState === 'success' && <span className='text-success'>✓</span>}
          {displayState === 'idle' && <span className='text-base-content/50'>⌕</span>}
          <span className='text-base-content/80' data-testid='search-results-count' role='status'>
            {resultAnnouncement}
          </span>
          <span className='text-base-content/50 text-xs'>·</span>
          <span className='text-base-content/60 text-xs' data-testid='search-state'>
            {displayState}
          </span>
          {displayError && <span className='text-warning text-xs'>— {displayError}</span>}
        </div>

        {displayState === 'empty' && query.trim() && (
          <p className='text-sm italic' data-testid='search-empty'>
            未找到 "{query}" 相关结果
          </p>
        )}

        <ul className='flex flex-col gap-2'>
          {results.map(r => (
            <li
              key={`${r.collection}:${r.id}`}
              className='group card bg-base-200 hover:bg-base-300 relative p-3 transition-colors'
              data-testid='search-result'
              data-collection={r.collection}
              data-id={r.id}
              data-rank={r.rank}
            >
              <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0 flex-1'>
                  <div className='flex flex-wrap items-center gap-1.5 text-xs'>
                    <span className={`badge badge-sm ${collectionBadgeClass(r.collection)}`}>
                      {localizeCollection(r.collection)}
                    </span>
                    <span className='text-base-content/80 font-mono'>#{r.id}</span>
                    <span className='text-base-content/30'>·</span>
                    <span className='text-base-content/60'>
                      匹配：<span className='text-base-content/90 font-medium'>{localizeField(r.matchedField)}</span>
                    </span>
                    <span className='text-base-content/30'>·</span>
                    {/* FTS5 bm25() 返回负值，越负越相关；取反后展示为正数，数值越大相关度越高 */}
                    <span className='badge badge-outline badge-sm font-mono'>相关度 {(-r.rank).toFixed(4)}</span>
                  </div>
                  <p className='mt-1.5 text-sm leading-relaxed break-words'>{r.snippet}</p>
                </div>
                {(r.collection === 'article' || r.collection === 'comment') && (
                  <div className='flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'>
                    <button
                      type='button'
                      className='btn btn-xs btn-ghost'
                      disabled={mutationBusy}
                      onClick={() => void updateResultRecord(r)}
                      aria-label='更新'
                      title='更新'
                      data-testid={`search-result-update-${r.collection}`}
                    >
                      <svg
                        fill='none'
                        height='12'
                        stroke='currentColor'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth='2'
                        viewBox='0 0 24 24'
                        width='12'
                        xmlns='http://www.w3.org/2000/svg'
                      >
                        <path d='M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' />
                        <path d='M3 3v5h5' />
                        <path d='M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16' />
                        <path d='M16 16h5v5' />
                      </svg>
                    </button>
                    <button
                      type='button'
                      className='btn btn-xs btn-ghost text-error'
                      disabled={mutationBusy}
                      onClick={() => void removeResultRecord(r)}
                      aria-label='删除'
                      title='删除'
                      data-testid={`search-result-delete-${r.collection}`}
                    >
                      <svg
                        fill='none'
                        height='12'
                        stroke='currentColor'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth='2'
                        viewBox='0 0 24 24'
                        width='12'
                        xmlns='http://www.w3.org/2000/svg'
                      >
                        <path d='M3 6h18' />
                        <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' />
                        <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>

        {hasMore && (
          <button type='button' className='btn btn-sm' onClick={() => void loadMore()} data-testid='search-load-more'>
            加载更多
          </button>
        )}

        {displayState === 'error' && (
          <button type='button' className='btn btn-sm btn-warning' onClick={retrySearch} data-testid='search-retry'>
            重试
          </button>
        )}
      </section>
    </main>
  );
}
