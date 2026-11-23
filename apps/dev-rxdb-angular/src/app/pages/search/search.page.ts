import { RxDB } from '@aiao/rxdb';
import { useI18n } from '@aiao/rxdb-i18n-angular';
import {
  useSearch,
  type SearchOptions,
  type SearchResult,
  type SearchSourceLike
} from '@aiao/rxdb-plugin-search-angular';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  signal,
  untracked,
  viewChild
} from '@angular/core';

import { I18nPipe } from '../../pipes/i18n.pipe';
import { SearchRecordsService } from './search-records.service';
import { seedAndRefreshRecords } from './search-seed-refresh';
import { SearchSeedService } from './search-seed.service';

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
type CommentCreateDraft = {
  articleId: string;
  content: string;
  authorName: string;
};

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

/**
 * `/search` — rxdb-plugin-search 三端 parity demo（Angular 版）。
 *
 * 与 React (`apps/dev-rxdb-react/src/app/pages/search.tsx`) 与
 * Vue (`apps/dev-rxdb-vue/src/pages/SearchPage.vue`) 共享 seed
 * (`@aiao/rxdb-test` `SEARCH_PARITY_*`)。
 *
 * 组件本身只关心搜索 UI / scope 切换 / 创建对话框；CRUD 与 seed 各自抽到
 * {@link SearchRecordsService} 与 {@link SearchSeedService}。
 */
@Component({
  selector: 'app-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search.page.html',
  imports: [I18nPipe],
  providers: [SearchRecordsService, SearchSeedService]
})
export default class SearchPage implements OnInit, AfterViewInit {
  private readonly rxdb = inject(RxDB);
  private readonly searchableDb = this.rxdb as RxDB & SearchSourceLike;
  private readonly records = inject(SearchRecordsService);
  private readonly seedService = inject(SearchSeedService);
  private readonly i18n = useI18n();

  readonly searchInputEl = viewChild<ElementRef<HTMLInputElement>>('searchInputEl');
  readonly articleTitleInput = viewChild<ElementRef<HTMLInputElement>>('articleTitleInput');
  readonly commentArticleIdInput = viewChild<ElementRef<HTMLInputElement>>('commentArticleIdInput');

  // ----- 记录面板（直接转发到 service signals，模板可继续按属性访问） -----
  readonly articleRecords = this.records.articleRecords;
  readonly commentRecords = this.records.commentRecords;
  readonly mutationBusy = this.records.mutationBusy;
  readonly mutationMessage = this.records.mutationMessage;
  readonly seedCount = this.records.seedCount;
  readonly seeding = this.seedService.seeding;
  readonly recordsCollapsed = signal(false);
  readonly activeRecordTab = signal<SearchDemoCollection>('article');

  // ----- 搜索范围 -----
  readonly scopeCollections = SEARCH_DEMO_COLLECTIONS;
  readonly scopeMode = signal<SearchDemoMode>('global');
  readonly customScope = signal<Record<SearchDemoCollection, boolean>>({
    article: true,
    comment: true,
    todos: true
  });
  readonly activeCollections = computed<readonly SearchDemoCollection[] | undefined>(() => {
    if (this.scopeMode() === 'global') return undefined;
    const scope = this.customScope();
    return SEARCH_DEMO_COLLECTIONS.filter(collection => scope[collection]);
  });
  readonly scopeSummary = computed(() => {
    const collections = this.activeCollections();
    if (collections === undefined) return this.i18n.t('page.search.scopeSummaryAll');
    if (collections.length === 0) return this.i18n.t('page.search.scopeSummaryNone');
    return collections.map(collection => this.scopeCollectionLabel(collection)).join(' + ');
  });

  // ----- 搜索（由 @aiao/rxdb-plugin-search-angular 提供） -----
  // scope 变化时重建 handle、并保留用户当前 query，是绑定包的契约（SRA-008 收口后落地），
  // 组件不再手写四路订阅、handle 生命周期与 query 同步 effect。
  // options 传 computed：绑定层按语义（collections/debounce/pageSize/snippetLength）比较，
  // 每次重算新建的字面量不会触发重建。
  readonly search = useSearch(
    this.searchableDb,
    computed<SearchOptions>(() => ({
      collections: this.activeCollections(),
      debounce: 300,
      pageSize: SEARCH_DEMO_PAGE_SIZE,
      snippetLength: SEARCH_DEMO_SNIPPET_LENGTH
    }))
  );

  // ----- 创建对话框 -----
  readonly createModalOpen = signal(false);
  readonly createModalType = signal<SearchDemoCollection>('article');
  readonly articleDraft = signal<ArticleCreateDraft>(createArticleDraft('article'));
  readonly commentDraft = signal<CommentCreateDraft>(createCommentDraft('search-demo-article', 'comment'));
  readonly canSubmitCreateModal = computed(() => {
    if (this.createModalType() === 'article') {
      const draft = this.articleDraft();
      return Boolean(draft.title.trim() && draft.body.trim() && draft.authorId.trim());
    }
    const draft = this.commentDraft();
    return Boolean(draft.articleId.trim() && draft.authorName.trim() && draft.content.trim());
  });

  // ----- 状态显示 -----
  readonly simulatedError = signal<string | null>(null);
  readonly displayState = computed(() => (this.simulatedError() ? 'error' : this.search.state()));
  readonly displayError = computed(() => this.simulatedError() ?? this.search.error()?.message ?? null);
  readonly resultAnnouncement = computed(() => {
    const state = this.displayState();
    if (state === 'loading') return this.i18n.t('page.search.loading');
    if (state === 'success') return this.i18n.t('page.search.stateSuccess', { count: this.search.results().length });
    if (state === 'empty') return this.i18n.t('page.search.stateEmpty');
    if (state === 'error') return this.i18n.t('page.search.stateError');
    return this.i18n.t('page.search.stateIdle');
  });
  readonly seedLabel = computed(() => {
    const c = this.seedCount();
    if (!c) return this.i18n.t('common.loading');
    const label = this.i18n.t('page.search.articleTotal', { count: c.article });
    return c.comment ? `${label} · ${this.i18n.t('page.search.commentTotal', { count: c.comment })}` : label;
  });

  constructor() {
    // 打开创建对话框时聚焦首字段
    effect(() => {
      if (!this.createModalOpen()) return;
      const type = this.createModalType();
      untracked(() => {
        queueMicrotask(() => {
          const target = type === 'article' ? this.articleTitleInput() : this.commentArticleIdInput();
          target?.nativeElement.focus();
          target?.nativeElement.select?.();
        });
      });
    });
  }

  async ngOnInit(): Promise<void> {
    await this.seedService.removeLegacySeedData();
    await this.records.refreshCounts();
  }

  ngAfterViewInit(): void {
    this.searchInputEl()?.nativeElement.focus();
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.searchInputEl()?.nativeElement.focus();
      this.searchInputEl()?.nativeElement.select();
      return;
    }
    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      event.preventDefault();
      this.searchInputEl()?.nativeElement.focus();
    }
  }

  // ===== UI handlers =====

  toggleRecordsPanel(): void {
    this.recordsCollapsed.update(v => !v);
  }

  selectRecordTab(tab: SearchDemoCollection): void {
    this.activeRecordTab.set(tab);
    this.records.resetMessage();
  }

  setScopeMode(mode: SearchDemoMode): void {
    this.scopeMode.set(mode);
    this.records.resetMessage();
  }

  toggleCollection(collection: SearchDemoCollection, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.customScope.update(scope => ({ ...scope, [collection]: checked }));
  }

  scopeCollectionLabel(collection: SearchDemoCollection): string {
    if (collection === 'article') return this.i18n.t('page.search.collectionArticle');
    if (collection === 'comment') return this.i18n.t('page.search.collectionComment');
    return 'Todo';
  }

  onInput(event: Event): void {
    this.simulatedError.set(null);
    this.search.query.set((event.target as HTMLInputElement).value);
  }

  loadMore(): Promise<void> {
    return this.search.loadMore();
  }

  clearSearch(): void {
    this.simulatedError.set(null);
    this.search.clear();
  }

  simulateError(): void {
    if (!this.search.query().trim()) return;
    this.simulatedError.set(this.i18n.t('page.search.simulatedErrorMessage'));
  }

  retrySearch(): void {
    if (this.simulatedError()) {
      this.simulatedError.set(null);
      this.search.retry();
      return;
    }
    this.search.retry();
  }

  async seed(): Promise<void> {
    await seedAndRefreshRecords(
      () => this.seedService.seed(),
      () => this.records.refreshCounts()
    );
  }

  // ===== Create modal =====

  openCreateModal(type: SearchDemoCollection): void {
    const token = this.buildMutationToken(type);
    this.createModalType.set(type);
    if (type === 'article') {
      this.articleDraft.set(createArticleDraft(token));
    } else {
      this.commentDraft.set(createCommentDraft(this.defaultArticleId(), token));
    }
    this.createModalOpen.set(true);
    this.records.resetMessage();
  }

  closeCreateModal(): void {
    this.createModalOpen.set(false);
  }

  updateArticleDraftField<K extends keyof ArticleCreateDraft>(field: K, value: ArticleCreateDraft[K]): void {
    this.articleDraft.update(draft => ({ ...draft, [field]: value }));
  }

  updateCommentDraftField<K extends keyof CommentCreateDraft>(field: K, value: CommentCreateDraft[K]): void {
    this.commentDraft.update(draft => ({ ...draft, [field]: value }));
  }

  toNumber(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async submitCreateModal(): Promise<void> {
    if (!this.canSubmitCreateModal()) return;
    if (this.createModalType() === 'article') {
      const draft = this.articleDraft();
      await this.records.createArticle({
        title: draft.title.trim(),
        body: draft.body.trim(),
        category: draft.category,
        tags: draft.tagsText
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean),
        authorId: draft.authorId.trim(),
        viewCount: draft.viewCount
      });
      this.createModalOpen.set(false);
      this.activeRecordTab.set('article');
      return;
    }
    const draft = this.commentDraft();
    await this.records.createComment({
      articleId: draft.articleId.trim(),
      content: draft.content.trim(),
      authorName: draft.authorName.trim()
    });
    this.createModalOpen.set(false);
    this.activeRecordTab.set('comment');
  }

  // ===== Per-result actions =====

  async updateResultRecord(result: SearchResult): Promise<void> {
    const token = this.buildMutationToken(`${result.collection}-update`);
    if (result.collection === 'article') return this.records.updateArticle(result.id, token);
    if (result.collection === 'comment') return this.records.updateComment(result.id, token);
  }

  async removeResultRecord(result: SearchResult): Promise<void> {
    if (result.collection === 'article') return this.records.removeArticle(result.id);
    if (result.collection === 'comment') return this.records.removeComment(result.id);
  }

  async removeListedRecord(collection: SearchDemoCollection, id: string): Promise<void> {
    if (collection === 'article') return this.records.removeArticle(id);
    return this.records.removeComment(id);
  }

  // ===== Display helpers =====

  localizeCollection(collection: string): string {
    if (collection === 'article') return this.i18n.t('page.search.collectionArticle');
    if (collection === 'comment') return this.i18n.t('page.search.collectionComment');
    if (collection === 'todos') return 'Todo';
    return collection;
  }

  localizeField(field: string): string {
    const keys: Record<string, string> = {
      title: 'page.search.titleField',
      body: 'page.search.bodyField',
      content: 'page.search.contentField',
      authorName: 'page.search.authorField',
      authorId: 'page.search.authorIdField',
      category: 'page.search.categoryField',
      tags: 'page.search.tags'
    };
    const key = keys[field];
    return key ? this.i18n.t(key) : field;
  }

  collectionBadgeClass(collection: string): string {
    if (collection === 'article') return 'badge-primary';
    if (collection === 'comment') return 'badge-secondary';
    if (collection === 'todos') return 'badge-accent';
    return 'badge-ghost';
  }

  // ===== Helpers =====

  // 优先取查询词（kebab-case）作为 token，保证新建内容可被当前关键词命中
  private buildMutationToken(prefix: string): string {
    const query = this.search.query().trim().replace(/\s+/g, '-').slice(0, 24);
    return query || `${prefix}-${Date.now().toString(36)}`;
  }

  private defaultArticleId(): string {
    const first = this.records.articleRecords()[0];
    return String(first?.id ?? 'search-demo-article');
  }
}
