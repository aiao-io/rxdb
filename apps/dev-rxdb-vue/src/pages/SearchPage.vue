<script lang="ts" setup>
import type { EntityType } from '@aiao/rxdb';
import type { SearchResult } from '@aiao/rxdb-plugin-search';
import { useSearch } from '@aiao/rxdb-plugin-search-vue';
import { SEARCH_PARITY_ARTICLES, SEARCH_PARITY_COMMENTS, withSeedLock } from '@aiao/rxdb-test';
import { Article, Comment } from '@aiao/rxdb-test/entities';
import { injectRxDB } from '@aiao/rxdb-vue';
import { firstValueFrom } from 'rxjs';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import SearchCreateModal from './search/components/SearchCreateModal.vue';
import SearchRecordsPanel from './search/components/SearchRecordsPanel.vue';
import SearchResultsList from './search/components/SearchResultsList.vue';
import {
  SEARCH_DEMO_COLLECTIONS,
  type ArticleCreateDraft,
  type CommentCreateDraft,
  type SearchDemoCollection,
  type SearchDemoMode
} from './search/types';

const SEARCH_DEMO_PAGE_SIZE = 20;
const SEARCH_DEMO_SNIPPET_LENGTH = 64;

const SEARCH_PARITY_ARTICLE_IDS = new Set<string>(
  SEARCH_PARITY_ARTICLES.map(a => a.id).filter((id): id is string => Boolean(id))
);
const SEARCH_PARITY_COMMENT_IDS = new Set<string>(
  SEARCH_PARITY_COMMENTS.map(c => c.id).filter((id): id is string => Boolean(id))
);

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
 * `/search` — rxdb-plugin-search 三端 parity demo（Vue 版）。
 *
 * 与 Angular (`apps/dev-rxdb-angular/src/app/pages/search`) 与
 * React (`apps/dev-rxdb-react/src/app/pages/search.tsx`) 共享 seed
 * (`@aiao/rxdb-test` `SEARCH_PARITY_*`)。
 */
const rxdb = injectRxDB()!;

// ----- Scope -----
const scopeMode = ref<SearchDemoMode>('global');
const customScope = ref<Record<SearchDemoCollection, boolean>>({ article: true, comment: true, todos: true });
const activeCollections = computed<readonly SearchDemoCollection[] | undefined>(() => {
  if (scopeMode.value === 'global') return undefined;
  return SEARCH_DEMO_COLLECTIONS.filter(c => customScope.value[c]);
});
const scopeSummary = computed(() => {
  const cols = activeCollections.value;
  if (cols === undefined) return '全部可搜索集合';
  if (cols.length === 0) return '未选择集合';
  return cols
    .map(c =>
      c === 'article' ? '文章'
      : c === 'comment' ? '评论'
      : 'Todo'
    )
    .join(' + ');
});

// ----- Search（由 @aiao/rxdb-plugin-search-vue 提供） -----
// scope 变化时重建 handle、并保留用户当前 query，是绑定包的契约（SRCHV-004 收口后落地），
// 页面不再手写四路订阅、handle 生命周期与 onUnmounted 清理。
// options 传 getter：hook 按语义（collections/debounce/pageSize/snippetLength）比较，
// 每次重算新建的字面量不会触发重建。
const {
  query,
  results,
  state: searchState,
  error: searchError,
  hasMore,
  loadMore: loadMoreResults,
  clear: clearSearchHandle,
  retry: retrySearchHandle
} = useSearch(rxdb, () => ({
  collections: activeCollections.value,
  debounce: 300,
  pageSize: SEARCH_DEMO_PAGE_SIZE,
  snippetLength: SEARCH_DEMO_SNIPPET_LENGTH
}));

// ----- Records -----
const articleRecords = ref<Article[]>([]);
const commentRecords = ref<Comment[]>([]);
const mutationBusy = ref(false);
const mutationMessage = ref<string | null>(null);
const seedCount = ref<{ article: number; comment: number } | null>(null);
const seeding = ref(false);
const recordsCollapsed = ref(false);
const activeRecordTab = ref<SearchDemoCollection>('article');

// ----- Create modal -----
const createModalOpen = ref(false);
const createModalType = ref<SearchDemoCollection>('article');
const articleDraft = ref<ArticleCreateDraft>(createArticleDraft('article'));
const commentDraft = ref<CommentCreateDraft>(createCommentDraft('search-demo-article', 'comment'));
const canSubmitCreateModal = computed(() => {
  if (createModalType.value === 'article') {
    const d = articleDraft.value;
    return Boolean(d.title.trim() && d.body.trim() && d.authorId.trim());
  }
  const d = commentDraft.value;
  return Boolean(d.articleId.trim() && d.authorName.trim() && d.content.trim());
});

// ----- Display state -----
const simulatedError = ref<string | null>(null);
const displayState = computed(() => (simulatedError.value ? 'error' : searchState.value));
const displayError = computed(() => simulatedError.value ?? searchError.value?.message ?? null);
const resultAnnouncement = computed(() => {
  if (displayState.value === 'loading') return 'Searching…';
  if (displayState.value === 'success') return `${results.value.length} results`;
  if (displayState.value === 'empty') return '0 results';
  if (displayState.value === 'error') return 'Search failed';
  return 'Enter a query';
});

// ----- Helpers -----
async function listEntities<T extends EntityType>(Type: T): Promise<InstanceType<T>[]> {
  const repo = rxdb.entityManager.getRepository(Type);
  return firstValueFrom(repo.findAll({ where: { combinator: 'and', rules: [] } }));
}

async function refreshCounts() {
  const [articles, comments] = await Promise.all([listEntities(Article), listEntities(Comment)]);
  articleRecords.value = articles;
  commentRecords.value = comments;
  seedCount.value = { article: articles.length, comment: comments.length };
}

// mutationBusy 门控：同一时间只允许一个写操作运行
async function runMutation<T>(action: () => Promise<T>): Promise<T | undefined> {
  if (mutationBusy.value) return undefined;
  mutationBusy.value = true;
  try {
    return await action();
  } finally {
    mutationBusy.value = false;
  }
}

// ----- Seed -----
async function seed() {
  if (seeding.value) return;
  seeding.value = true;
  try {
    await withSeedLock(rxdb, async () => {
      const articleRepo = rxdb.entityManager.getRepository(Article);
      const commentRepo = rxdb.entityManager.getRepository(Comment);
      const [existingArticles, existingComments] = await Promise.all([
        firstValueFrom(articleRepo.findAll({ where: { combinator: 'and', rules: [] } })),
        firstValueFrom(commentRepo.findAll({ where: { combinator: 'and', rules: [] } }))
      ]);
      const existingArticleIds = new Set<string>(existingArticles.map((a: Article) => String(a.id)));
      const existingCommentIds = new Set<string>(existingComments.map((c: Comment) => String(c.id)));

      const articleSetComplete =
        SEARCH_PARITY_ARTICLE_IDS.size > 0 && [...SEARCH_PARITY_ARTICLE_IDS].every(id => existingArticleIds.has(id));
      const commentSetComplete =
        SEARCH_PARITY_COMMENT_IDS.size > 0 && [...SEARCH_PARITY_COMMENT_IDS].every(id => existingCommentIds.has(id));

      if (!articleSetComplete) {
        for (const a of SEARCH_PARITY_ARTICLES) {
          if (a.id && existingArticleIds.has(a.id)) continue;
          await articleRepo.create(Object.assign(new Article(), a));
        }
      }
      if (!commentSetComplete) {
        for (const c of SEARCH_PARITY_COMMENTS) {
          if (c.id && existingCommentIds.has(c.id)) continue;
          await commentRepo.create(Object.assign(new Comment(), c));
        }
      }
    });
  } finally {
    seeding.value = false;
  }
  await refreshCounts();
}

// ----- Init -----
onMounted(async () => {
  const [articles, comments] = await Promise.all([listEntities(Article), listEntities(Comment)]);
  if (articles.length === 0 && comments.length === 0) {
    await seed();
  } else {
    articleRecords.value = articles;
    commentRecords.value = comments;
    seedCount.value = { article: articles.length, comment: comments.length };
  }
});

// ----- Keyboard shortcuts -----
const searchInputRef = ref<HTMLInputElement | null>(null);
function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
    return;
  }
  if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
    e.preventDefault();
    searchInputRef.value?.focus();
  }
}
onMounted(() => {
  document.addEventListener('keydown', onGlobalKeydown);
  searchInputRef.value?.focus();
});
onUnmounted(() => document.removeEventListener('keydown', onGlobalKeydown));

// ----- Scope handlers -----
function setScopeMode(mode: SearchDemoMode) {
  scopeMode.value = mode;
  mutationMessage.value = null;
}
function toggleCollection(col: SearchDemoCollection, checked: boolean) {
  customScope.value = { ...customScope.value, [col]: checked };
}

// ----- Search handlers -----
// 页面只在绑定包之上叠加"模拟错误"这一层演示态，查询词与 handle 命令都转发给 composable。
function onInput(value: string) {
  simulatedError.value = null;
  query.value = value;
}
function clearSearch() {
  simulatedError.value = null;
  clearSearchHandle();
}
function simulateError() {
  if (!query.value.trim()) return;
  simulatedError.value = '模拟的搜索错误';
}
function retrySearch() {
  simulatedError.value = null;
  retrySearchHandle();
}

// ----- Records CRUD -----
async function createArticle(input: {
  title: string;
  body: string;
  category: Article['category'];
  tags: readonly string[];
  authorId: string;
  viewCount: number;
}) {
  await runMutation(async () => {
    const article = new Article({ ...input, tags: [...input.tags] });
    await rxdb.entityManager.getRepository(Article).create(article);
    await refreshCounts();
    mutationMessage.value = `已创建文章 ${article.id}`;
  });
}

async function createComment(input: { articleId: string; content: string; authorName: string }) {
  await runMutation(async () => {
    const comment = new Comment(input);
    await rxdb.entityManager.getRepository(Comment).create(comment);
    await refreshCounts();
    mutationMessage.value = `已创建评论 ${comment.id}`;
  });
}

async function updateArticle(id: string, token: string) {
  await runMutation(async () => {
    const all = await listEntities(Article);
    const article = all.find(a => String(a.id) === id);
    if (!article) {
      mutationMessage.value = `未找到文章: ${id}`;
      return;
    }
    article.title = `${article.title} [updated]`;
    article.body = `${article.body} Updated with token ${token}.`;
    article.tags = [...new Set([...(article.tags ?? []), 'updated', token])];
    article.viewCount += 1;
    await article.save();
    await refreshCounts();
    mutationMessage.value = `已更新文章 ${id}`;
  });
}

async function updateComment(id: string, token: string) {
  await runMutation(async () => {
    const all = await listEntities(Comment);
    const comment = all.find(c => String(c.id) === id);
    if (!comment) {
      mutationMessage.value = `未找到评论: ${id}`;
      return;
    }
    comment.content = `${comment.content} Updated with token ${token}.`;
    comment.authorName = `${comment.authorName}-updated`;
    await comment.save();
    await refreshCounts();
    mutationMessage.value = `已更新评论 ${id}`;
  });
}

async function removeArticle(id: string) {
  await runMutation(async () => {
    const all = await listEntities(Article);
    const article = all.find(a => String(a.id) === id);
    if (!article) {
      mutationMessage.value = `未找到文章: ${id}`;
      return;
    }
    await article.remove();
    await refreshCounts();
    mutationMessage.value = `已删除文章 ${id}`;
  });
}

async function removeComment(id: string) {
  await runMutation(async () => {
    const all = await listEntities(Comment);
    const comment = all.find(c => String(c.id) === id);
    if (!comment) {
      mutationMessage.value = `未找到评论: ${id}`;
      return;
    }
    await comment.remove();
    await refreshCounts();
    mutationMessage.value = `已删除评论 ${id}`;
  });
}

// ----- Create modal -----
function openCreateModal(type: SearchDemoCollection) {
  const token = buildMutationToken(type, query.value);
  createModalType.value = type;
  if (type === 'article') {
    articleDraft.value = createArticleDraft(token);
  } else {
    const firstId = String(articleRecords.value[0]?.id ?? 'search-demo-article');
    commentDraft.value = createCommentDraft(firstId, token);
  }
  createModalOpen.value = true;
  mutationMessage.value = null;
}

async function submitCreateModal() {
  if (!canSubmitCreateModal.value) return;
  if (createModalType.value === 'article') {
    const d = articleDraft.value;
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
    createModalOpen.value = false;
    activeRecordTab.value = 'article';
  } else {
    const d = commentDraft.value;
    await createComment({ articleId: d.articleId.trim(), content: d.content.trim(), authorName: d.authorName.trim() });
    createModalOpen.value = false;
    activeRecordTab.value = 'comment';
  }
}

// ----- Per-result actions -----
async function updateResultRecord(r: SearchResult) {
  const token = buildMutationToken(`${r.collection}-update`, query.value);
  if (r.collection === 'article') return updateArticle(r.id, token);
  if (r.collection === 'comment') return updateComment(r.id, token);
}
function loadMore() {
  void loadMoreResults();
}

async function removeResultRecord(r: SearchResult) {
  if (r.collection === 'article') return removeArticle(r.id);
  if (r.collection === 'comment') return removeComment(r.id);
}
</script>

<template>
  <main
    class="mx-auto flex w-full max-w-4xl flex-col gap-3 p-4"
    data-testid="search-page"
  >
    <header class="flex items-baseline gap-3">
      <h1 class="text-xl font-semibold">全局搜索</h1>
      <p class="text-base-content/80 text-sm">Seeded articles and comments from the current RxDB only.</p>
    </header>

    <!-- Search input -->
    <div class="relative w-full max-w-md">
      <span
        class="text-base-content/50 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        aria-hidden="true"
      >
        <span
          class="loading loading-spinner loading-xs"
          v-if="displayState === 'loading'"
        />
        <svg
          v-else
          fill="none"
          height="16"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
          width="16"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="11"
            cy="11"
            r="8"
          />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </span>
      <input
        class="input input-bordered w-full pr-24 pl-9 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        :aria-busy="displayState === 'loading' ? 'true' : 'false'"
        :value="query"
        @input="onInput(($event.target as HTMLInputElement).value)"
        @keydown.esc.prevent="clearSearch"
        aria-label="Global search"
        data-testid="search-input"
        placeholder="搜索…（⌘K 或 /）"
        ref="searchInputRef"
        role="searchbox"
        type="search"
      />
      <div class="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5">
        <button
          class="btn btn-ghost btn-xs btn-circle"
          v-if="query.trim() || simulatedError"
          @click="clearSearch"
          aria-label="清空"
          data-testid="search-clear"
          title="清空 (Esc)"
          type="button"
        >
          <svg
            fill="none"
            height="14"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
            width="14"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        <button
          class="btn btn-ghost btn-xs btn-circle text-warning"
          :disabled="!query.trim()"
          @click="simulateError"
          aria-label="模拟错误"
          data-testid="search-simulate-error"
          title="模拟错误"
          type="button"
        >
          <svg
            fill="none"
            height="14"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
            width="14"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </button>
        <kbd class="kbd kbd-xs mr-1 hidden sm:inline-flex">⌘K</kbd>
      </div>
    </div>

    <!-- Scope panel -->
    <section
      class="card bg-base-200/60 p-3"
      data-testid="search-scope-panel"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-medium">范围</span>
        <button
          :class="`btn btn-xs ${scopeMode === 'global' ? 'btn-primary' : 'btn-outline'}`"
          @click="setScopeMode('global')"
          data-testid="search-scope-mode-global"
          type="button"
        >
          全部
        </button>
        <button
          :class="`btn btn-xs ${scopeMode === 'custom' ? 'btn-primary' : 'btn-outline'}`"
          @click="setScopeMode('custom')"
          data-testid="search-scope-mode-custom"
          type="button"
        >
          自定义
        </button>
        <template v-if="scopeMode === 'custom'">
          <label
            class="label cursor-pointer gap-1 py-0"
            v-for="col in SEARCH_DEMO_COLLECTIONS"
            :key="col"
          >
            <input
              class="checkbox checkbox-xs"
              :checked="customScope[col]"
              :data-testid="`search-scope-${col}`"
              @change="toggleCollection(col, ($event.target as HTMLInputElement).checked)"
              type="checkbox"
            />
            <span class="label-text text-xs">
              {{
                col === 'article' ? '文章'
                : col === 'comment' ? '评论'
                : 'Todo'
              }}
            </span>
          </label>
        </template>
        <span
          class="text-base-content/60 ml-auto text-xs"
          data-testid="search-scope-summary"
        >
          {{ scopeSummary }}
        </span>
      </div>
    </section>

    <!-- Records panel -->
    <SearchRecordsPanel
      :active-tab="activeRecordTab"
      :article-records="articleRecords"
      :collapsed="recordsCollapsed"
      :comment-records="commentRecords"
      :mutation-busy="mutationBusy"
      :mutation-message="mutationMessage"
      @open-create="openCreateModal"
      @remove-article="removeArticle"
      @remove-comment="removeComment"
      @update:active-tab="
        tab => {
          activeRecordTab = tab;
          mutationMessage = null;
        }
      "
      @update:collapsed="recordsCollapsed = $event"
    />

    <!-- Seed info -->
    <div class="flex items-center gap-3 text-xs">
      <span
        class="text-base-content/60"
        data-testid="search-seed-count"
      >
        数据：
        <template v-if="seedCount">
          文章 {{ seedCount.article }}<template v-if="seedCount.comment"> · 评论 {{ seedCount.comment }}</template>
        </template>
        <template v-else>加载中…</template>
      </span>
      <button
        class="btn btn-sm btn-ghost"
        :disabled="seeding"
        @click="seed"
        data-testid="search-reseed"
        type="button"
      >
        {{ seeding ? '写入中…' : '重新写入' }}
      </button>
    </div>

    <!-- Create modal -->
    <SearchCreateModal
      :article-draft="articleDraft"
      :can-submit="canSubmitCreateModal"
      :comment-draft="commentDraft"
      :mutation-busy="mutationBusy"
      :open="createModalOpen"
      :type="createModalType"
      @submit="submitCreateModal"
      @update:article-draft="articleDraft = $event"
      @update:comment-draft="commentDraft = $event"
      @update:open="createModalOpen = $event"
    />

    <!-- Results -->
    <SearchResultsList
      :display-error="displayError"
      :display-state="displayState"
      :has-more="hasMore"
      :mutation-busy="mutationBusy"
      :query="query"
      :result-announcement="resultAnnouncement"
      :results="results"
      @load-more="loadMore"
      @remove-result="removeResultRecord"
      @retry="retrySearch"
      @update-result="updateResultRecord"
    />
  </main>
</template>
