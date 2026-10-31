import { RxDB } from '@aiao/rxdb';
import { useCount, useFind } from '@aiao/rxdb-angular';
import { useI18nOptional } from '@aiao/rxdb-i18n-angular';
import { type WorkspaceCacheEntry } from '@aiao/rxdb-plugin-workspace';
import { Todo, type TodoStaticTypes } from '@aiao/rxdb-test/entities';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { I18nPipe } from '../../pipes/i18n.pipe';

/**
 * Todo 主表每页条数。此前页面订阅的是 `findAll`（整表、不带 limit），
 * 记录一多就是「一次性拉全表 + 渲染全部 <tr>」，主线程直接卡住。
 */
const TODO_PAGE_SIZE = 20;

/**
 * 清空主表时每轮取多少条来删。刻意与页大小解耦：
 * 「页面显示多少」和「一次删多少」是两回事，删除不该被前者限制。
 */
const TODO_DELETE_BATCH_SIZE = 200;

type NoticeTone = 'info' | 'success' | 'warning' | 'error';

type Notice = {
  tone: NoticeTone;
  text: string;
};

function formatDateTime(value: Date | string | null | undefined, locale = 'zh-CN'): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString(locale);
}

@Component({
  selector: 'app-workspace-demo-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page-host' },
  imports: [I18nPipe],
  template: `
    <div class="flex h-full flex-col overflow-hidden">
      <!-- 顶部 toolbar -->
      <div class="border-base-300 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-lg font-semibold">{{ 'page.workspace.title' | i18n }}</h1>
          <span class="badge badge-ghost badge-sm">{{
            'page.workspace.drafts' | i18n: { count: workspaceEntries().length }
          }}</span>
          <span class="text-base-content/55 hidden text-xs lg:inline">
            {{ 'page.workspace.cacheHint' | i18n }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="refreshWorkspace()" type="button">
            {{ 'common.refresh' | i18n }}
          </button>
          <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="reloadPage()" type="button">
            {{ 'page.workspace.reloadVerify' | i18n }}
          </button>
          <button class="btn btn-ghost btn-sm text-error" [disabled]="busy()" (click)="resetDemo()" type="button">
            {{ 'common.reset' | i18n }}
          </button>
        </div>
      </div>

      <!-- 主体（可滚动） -->
      <div class="min-h-0 flex-1 overflow-auto p-4">
        @if (notice(); as currentNotice) {
          <div [class]="alertClass(currentNotice.tone) + ' mb-4'" role="alert">
            <span class="text-sm">{{ currentNotice.text }}</span>
          </div>
        }

        <!-- 紧凑统计行 -->
        <div class="stats stats-vertical bg-base-100 border-base-300 md:stats-horizontal mb-4 w-full border shadow-sm">
          <div class="stat py-3">
            <div class="stat-title text-xs">{{ 'page.workspace.draftStat' | i18n }}</div>
            <div class="stat-value text-primary text-2xl">{{ workspaceEntries().length }}</div>
            <div class="stat-desc">{{ 'page.workspace.draftStatDescription' | i18n }}</div>
          </div>
          <div class="stat py-3">
            <div class="stat-title text-xs">{{ 'page.workspace.todoStat' | i18n }}</div>
            <div class="stat-value text-2xl">{{ savedTodoTotal() }}</div>
            <div class="stat-desc">{{ 'page.workspace.todoStatDescription' | i18n }}</div>
          </div>
          <div class="stat py-3">
            <div class="stat-title text-xs">{{ 'page.workspace.activeDraftStat' | i18n }}</div>
            <div class="stat-value text-secondary text-2xl">{{ activeDraftEntry() ? 1 : 0 }}</div>
            <div class="stat-desc">{{ 'page.workspace.activeDraftStatDescription' | i18n }}</div>
          </div>
        </div>

        <div class="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_360px]">
          <div class="flex flex-col gap-4">
            <!-- 创建草稿 -->
            <section class="card border-base-300 bg-base-100 border shadow-sm">
              <div class="card-body gap-3 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h2 class="text-base font-semibold">{{ 'page.workspace.createDraft' | i18n }}</h2>
                  <span class="badge badge-outline badge-sm">{{ 'page.workspace.workspaceOnly' | i18n }}</span>
                </div>
                <p class="text-base-content/65 text-xs">
                  {{ 'page.workspace.createDescription' | i18n }}
                </p>

                <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                  <label class="floating-label">
                    <input
                      class="input input-sm w-full"
                      [placeholder]="'page.workspace.titlePlaceholder' | i18n"
                      [value]="draftTitle()"
                      (input)="draftTitle.set($any($event.target).value)"
                      type="text"
                    />
                    <span>{{ 'page.workspace.draftTitle' | i18n }}</span>
                  </label>
                  <label class="label rounded-box border-base-300 cursor-pointer gap-2 border px-3 py-2">
                    <span class="label-text text-xs">{{ 'page.workspace.completed' | i18n }}</span>
                    <input
                      class="checkbox checkbox-sm checkbox-primary"
                      [checked]="draftCompleted()"
                      (change)="draftCompleted.set($any($event.target).checked)"
                      type="checkbox"
                    />
                  </label>
                  <button
                    class="btn btn-primary btn-sm"
                    [disabled]="!canCreateDraft() || busy()"
                    (click)="createDraft()"
                    type="button"
                  >
                    {{ 'page.workspace.createButton' | i18n }}
                  </button>
                </div>
              </div>
            </section>

            <!-- 草稿列表 -->
            <section class="card border-base-300 bg-base-100 border shadow-sm">
              <div class="card-body gap-3 p-4">
                <div class="flex items-center justify-between">
                  <h2 class="text-base font-semibold">{{ 'page.workspace.draftList' | i18n }}</h2>
                  <span class="badge badge-ghost badge-sm">{{
                    'page.workspace.draftsCount' | i18n: { count: workspaceEntries().length }
                  }}</span>
                </div>

                @if (workspaceEntries().length === 0) {
                  <div
                    class="border-base-300 text-base-content/55 rounded-box border border-dashed p-6 text-center text-sm"
                  >
                    {{ 'page.workspace.emptyDrafts' | i18n }}
                  </div>
                } @else {
                  <div class="space-y-2">
                    @for (entry of workspaceEntries(); track entry.cacheId) {
                      <article
                        class="rounded-box border-base-300 space-y-2 border p-3 transition-colors"
                        [class]="entry.id === activeDraftId() ? 'bg-primary/5 border-primary' : 'bg-base-100'"
                      >
                        <div class="flex flex-wrap items-center justify-between gap-2">
                          <div class="flex min-w-0 flex-1 items-center gap-2">
                            <h3 class="truncate text-sm font-medium">{{ titleOf(entry) }}</h3>
                            @if (recoveredIds().has(entry.id)) {
                              <span class="badge badge-secondary badge-soft badge-xs">{{
                                'page.workspace.recovered' | i18n
                              }}</span>
                            }
                          </div>
                          <div class="flex flex-wrap gap-1.5">
                            <button class="btn btn-xs btn-ghost" (click)="selectDraft(entry.id)" type="button">
                              {{ 'page.workspace.view' | i18n }}
                            </button>
                            <button
                              class="btn btn-xs btn-primary"
                              [disabled]="busy()"
                              (click)="saveDraft(entry)"
                              type="button"
                            >
                              {{ 'common.save' | i18n }}
                            </button>
                            <button
                              class="btn btn-xs btn-ghost text-error"
                              [disabled]="busy()"
                              (click)="discardDraft(entry)"
                              type="button"
                            >
                              {{ 'common.discard' | i18n }}
                            </button>
                          </div>
                        </div>
                        <div class="text-base-content/55 grid gap-1 font-mono text-xs sm:grid-cols-3">
                          <span class="truncate">{{
                            'page.workspace.completedValue' | i18n: { value: completedText(entry) }
                          }}</span>
                          <span class="truncate">{{ formatDateTime(createdAtOf(entry)) }}</span>
                          <span class="truncate">{{ entry.cacheId }}</span>
                        </div>
                      </article>
                    }
                  </div>
                }
              </div>
            </section>

            <!-- Todo 主表 -->
            <section class="card border-base-300 bg-base-100 border shadow-sm">
              <div class="card-body gap-3 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 class="text-base font-semibold">{{ 'page.workspace.todoTable' | i18n }}</h2>
                    <p class="text-base-content/55 text-xs">
                      {{ 'page.workspace.todoDescription' | i18n: { size: todoPageSize } }}
                    </p>
                  </div>
                  <button
                    class="btn btn-ghost btn-sm"
                    [disabled]="busy() || savedTodoTotal() === 0"
                    (click)="clearSavedTodos()"
                    type="button"
                  >
                    {{ 'page.workspace.clearTable' | i18n }}
                  </button>
                </div>
                <div class="rounded-box border-base-300 overflow-x-auto border">
                  <table class="table-zebra table-sm table">
                    <thead>
                      <tr>
                        <th>{{ 'page.workspace.titleColumn' | i18n }}</th>
                        <th>{{ 'page.workspace.statusColumn' | i18n }}</th>
                        <th>ID</th>
                        <th>{{ 'page.workspace.updatedAtColumn' | i18n }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @if (savedTodos().length === 0) {
                        <tr>
                          <td class="text-base-content/55 text-center text-sm" colspan="4">
                            {{ 'page.workspace.emptyTodos' | i18n }}
                          </td>
                        </tr>
                      } @else {
                        @for (todo of savedTodos(); track todo.id) {
                          <tr>
                            <td class="font-medium">{{ todo.title }}</td>
                            <td>
                              <span class="badge badge-outline badge-sm">{{
                                todo.completed ?
                                  ('page.workspace.statusCompleted' | i18n)
                                : ('page.workspace.statusOpen' | i18n)
                              }}</span>
                            </td>
                            <td class="font-mono text-xs">{{ todo.id.slice(0, 8) }}</td>
                            <td class="text-xs">{{ formatDateTime(todo.updatedAt) }}</td>
                          </tr>
                        }
                      }
                    </tbody>
                  </table>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-base-content/55 text-xs">
                    {{
                      'page.workspace.pagination'
                        | i18n: { count: savedTodoTotal(), current: todoPage() + 1, total: todoPageCount() }
                    }}
                  </span>
                  <div class="join">
                    <button
                      class="btn btn-sm join-item"
                      [disabled]="todoPage() === 0"
                      (click)="previousTodoPage()"
                      type="button"
                    >
                      {{ 'common.previous' | i18n }}
                    </button>
                    <button
                      class="btn btn-sm join-item"
                      [disabled]="todoPage() >= todoPageCount() - 1"
                      (click)="nextTodoPage()"
                      type="button"
                    >
                      {{ 'common.next' | i18n }}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <!-- 侧栏 -->
          <aside class="flex flex-col gap-4">
            <section class="card border-base-300 bg-base-100 border shadow-sm">
              <div class="card-body gap-3 p-4">
                <h2 class="text-base font-semibold">{{ 'page.workspace.recoveryPanel' | i18n }}</h2>
                @if (activeDraftEntry(); as entry) {
                  <div class="space-y-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="font-semibold">{{ titleOf(entry) }}</h3>
                      @if (recoveredIds().has(entry.id)) {
                        <span class="badge badge-secondary badge-soft badge-sm">{{
                          'page.workspace.recoveredAfterRefresh' | i18n
                        }}</span>
                      }
                    </div>
                    <div class="space-y-1.5 text-sm">
                      <div class="flex items-center justify-between gap-3">
                        <span class="text-base-content/55">{{ 'page.workspace.draftId' | i18n }}</span>
                        <span class="font-mono text-xs">{{ entry.id }}</span>
                      </div>
                      <div class="flex items-center justify-between gap-3">
                        <span class="text-base-content/55">{{ 'page.workspace.completedStatus' | i18n }}</span>
                        <span>{{ completedText(entry) }}</span>
                      </div>
                      <div class="flex items-center justify-between gap-3">
                        <span class="text-base-content/55">{{ 'page.workspace.createdAt' | i18n }}</span>
                        <span>{{ formatDateTime(createdAtOf(entry)) }}</span>
                      </div>
                    </div>
                    <div class="flex gap-2">
                      <button
                        class="btn btn-primary btn-sm flex-1"
                        [disabled]="busy()"
                        (click)="saveDraft(entry)"
                        type="button"
                      >
                        {{ 'common.save' | i18n }}
                      </button>
                      <button
                        class="btn btn-ghost btn-sm text-error"
                        [disabled]="busy()"
                        (click)="discardDraft(entry)"
                        type="button"
                      >
                        {{ 'common.discard' | i18n }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <div class="border-base-300 text-base-content/55 rounded-box border border-dashed p-4 text-sm">
                    {{ 'page.workspace.emptySelection' | i18n }}
                  </div>
                }
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  `
})
export default class WorkspaceDemoPage {
  private readonly rxdb = inject(RxDB);
  private readonly i18n = useI18nOptional();
  private readonly destroyRef = inject(DestroyRef);

  /** 用户点出来的页码。记录被删后可能越界，对外一律读 {@link todoPage}。 */
  private readonly requestedTodoPage = signal(0);

  readonly todoPageSize = TODO_PAGE_SIZE;

  /** 主表总数走 count，不再靠「把整表拉下来数数组长度」。 */
  readonly savedTodoTotal = useCount(Todo, { where: { combinator: 'and', rules: [] } }).value;

  readonly todoPageCount = computed(() => Math.max(1, Math.ceil(this.savedTodoTotal() / TODO_PAGE_SIZE)));

  /**
   * 越界自愈：清空主表、或删到剩下的页数比当前页少时，总数一变页码自己回落，
   * 不需要再挂一个副作用去纠正 {@link requestedTodoPage}。
   */
  readonly todoPage = computed(() => Math.min(this.requestedTodoPage(), this.todoPageCount() - 1));

  readonly savedTodos = useFind(Todo, (): TodoStaticTypes['findOptions'] => ({
    where: { combinator: 'and', rules: [] },
    orderBy: [
      { field: 'updatedAt', sort: 'desc' },
      { field: 'id', sort: 'desc' }
    ],
    limit: TODO_PAGE_SIZE,
    offset: this.todoPage() * TODO_PAGE_SIZE
  })).value;

  readonly workspaceEntries = signal<WorkspaceCacheEntry[]>([]);
  readonly recoveredIds = signal<Set<string>>(new Set());
  readonly activeDraftId = signal<string | null>(null);
  readonly draftTitle = signal('整理需求清单');
  readonly draftCompleted = signal(false);
  readonly busy = signal(false);
  readonly notice = signal<Notice | null>(null);

  readonly activeDraftEntry = computed(() => {
    const activeId = this.activeDraftId();
    if (!activeId) return null;
    return this.workspaceEntries().find(entry => entry.id === activeId) ?? null;
  });

  readonly canCreateDraft = computed(() => this.draftTitle().trim().length > 0);

  constructor() {
    this.rxdb.workspace.changes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.refreshWorkspace(this.activeDraftId());
    });

    this.refreshWorkspace(null);
    void this.restoreWorkspaceEntries();
  }

  formatDateTime(value: Date | string | null | undefined): string {
    return formatDateTime(value, this.i18n?.locale() ?? 'zh-CN');
  }

  protected previousTodoPage() {
    this.requestedTodoPage.set(Math.max(0, this.todoPage() - 1));
  }

  protected nextTodoPage() {
    this.requestedTodoPage.set(Math.min(this.todoPageCount() - 1, this.todoPage() + 1));
  }

  protected alertClass(tone: NoticeTone) {
    switch (tone) {
      case 'success':
        return 'alert alert-success alert-soft';
      case 'warning':
        return 'alert alert-warning alert-soft';
      case 'error':
        return 'alert alert-error alert-soft';
      default:
        return 'alert alert-info alert-soft';
    }
  }

  protected titleOf(entry: WorkspaceCacheEntry): string {
    const title = entry.data['title'];
    return typeof title === 'string' && title.trim().length > 0 ?
        title
      : this.translate('page.workspace.untitled', 'Untitled Todo');
  }

  protected completedText(entry: WorkspaceCacheEntry): string {
    return entry.data['completed'] === true ?
        this.translate('page.workspace.statusCompleted', 'Completed')
      : this.translate('page.workspace.statusOpen', 'Open');
  }

  protected createdAtOf(entry: WorkspaceCacheEntry): Date | string | null {
    const createdAt = entry.data['createdAt'];
    return createdAt instanceof Date || typeof createdAt === 'string' ? createdAt : null;
  }

  protected async createDraft() {
    const title = this.draftTitle().trim();
    if (!title) return;

    this.busy.set(true);
    try {
      const todo = new Todo({
        title,
        completed: this.draftCompleted()
      });

      this.activeDraftId.set(todo.id);
      this.draftTitle.set('');
      this.draftCompleted.set(false);

      await this.syncWorkspace(todo.id);
      this.setNotice(
        this.translate('page.workspace.noticeCreated', `已创建未保存草稿：${todo.title}`, { title: todo.title }),
        'success'
      );
    } catch (error) {
      this.setNotice(
        this.getErrorMessage(error, this.translate('page.workspace.errorCreate', '创建草稿失败')),
        'error'
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected selectDraft(id: string) {
    this.activeDraftId.set(id);
  }

  protected async saveDraft(entry: WorkspaceCacheEntry) {
    const todo = this.resolveDraft(entry);
    if (!todo) {
      this.setNotice(this.translate('page.workspace.errorNoDraft', '未找到可恢复的 Todo 草稿'), 'error');
      return;
    }

    this.busy.set(true);
    try {
      await todo.save();
      await this.syncWorkspace(this.activeDraftId());
      this.setNotice(
        this.translate('page.workspace.noticeSaved', `已保存 Todo：${todo.title}`, { title: todo.title }),
        'success'
      );
    } catch (error) {
      this.setNotice(this.getErrorMessage(error, this.translate('page.workspace.errorSave', '保存草稿失败')), 'error');
    } finally {
      this.busy.set(false);
    }
  }

  protected async discardDraft(entry: WorkspaceCacheEntry) {
    this.busy.set(true);
    try {
      const discarded = this.rxdb.workspace.discard(entry.cacheId);
      await this.syncWorkspace(this.activeDraftId() === entry.id ? null : this.activeDraftId());
      this.setNotice(
        discarded ?
          this.translate('page.workspace.noticeDiscarded', `已丢弃草稿：${this.titleOf(entry)}`, {
            title: this.titleOf(entry)
          })
        : this.translate('page.workspace.errorMissingDraft', '草稿已经不存在'),
        discarded ? 'warning' : 'info'
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async clearSavedTodos() {
    if (this.savedTodoTotal() === 0) return;

    this.busy.set(true);
    try {
      await this.deleteAllTodos();
      this.requestedTodoPage.set(0);
      this.setNotice(this.translate('page.workspace.noticeCleared', '已清空 Todo 主表'), 'warning');
    } catch (error) {
      this.setNotice(
        this.getErrorMessage(error, this.translate('page.workspace.errorClear', '清空 Todo 主表失败')),
        'error'
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async resetDemo() {
    this.busy.set(true);
    try {
      for (const entry of this.readWorkspaceEntries()) {
        this.rxdb.workspace.discard(entry.cacheId);
      }
      await this.syncWorkspace(null);

      await this.deleteAllTodos();
      this.requestedTodoPage.set(0);

      this.setNotice(this.translate('page.workspace.noticeReset', '已重置 workspace 草稿和 Todo 主表'), 'warning');
      this.recoveredIds.set(new Set());
    } catch (error) {
      this.setNotice(
        this.getErrorMessage(error, this.translate('page.workspace.errorReset', '重置演示数据失败')),
        'error'
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected reloadPage() {
    window.location.reload();
  }

  protected refreshWorkspace(preferredId = this.activeDraftId()) {
    const entries = this.readWorkspaceEntries();
    this.workspaceEntries.set(entries);

    const nextId =
      preferredId && entries.some(entry => entry.id === preferredId) ? preferredId : (entries[0]?.id ?? null);
    this.activeDraftId.set(nextId);
  }

  private translate(key: string, fallback: string, params?: Record<string, unknown>): string {
    return (
      this.i18n?.t(key, params) ??
      fallback.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`))
    );
  }

  /**
   * 分批取、分批删。页面只订阅一页之后 `savedTodos()` 不再是全表，
   * 拿它去 `removeMany` 只会删掉当前这一页 —— 「清空」必须自己去翻整表。
   */
  private async deleteAllTodos() {
    let lastBatchHeadId: Todo['id'] | null = null;
    for (;;) {
      const batch = await firstValueFrom(
        Todo.find({ where: { combinator: 'and', rules: [] }, limit: TODO_DELETE_BATCH_SIZE })
      );
      if (batch.length === 0) return;
      // 游标没推进说明这一批根本没删掉，继续循环就是死循环，宁可把失败抛给调用方。
      if (batch[0].id === lastBatchHeadId) throw new Error('批量删除没有推进：仍有 Todo 未被删除');
      lastBatchHeadId = batch[0].id;
      await this.rxdb.entityManager.removeMany(batch);
    }
  }

  private async restoreWorkspaceEntries() {
    try {
      await this.rxdb.workspace.ready;
      const restoredEntries = this.readWorkspaceEntries();
      this.recoveredIds.set(new Set(restoredEntries.map(entry => entry.id)));
      this.refreshWorkspace(this.activeDraftId() ?? restoredEntries[0]?.id ?? null);
    } catch (error) {
      this.setNotice(
        this.getErrorMessage(error, this.translate('page.workspace.errorLoad', '读取 workspace 草稿失败')),
        'error'
      );
    }
  }

  private async syncWorkspace(preferredId = this.activeDraftId()) {
    await Promise.resolve();
    await this.rxdb.workspace.flush();
    this.refreshWorkspace(preferredId);
  }

  private readWorkspaceEntries(): WorkspaceCacheEntry[] {
    return this.rxdb.workspace
      .list()
      .filter(entry => entry.entity === 'Todo')
      .sort((left, right) => right.cacheId.localeCompare(left.cacheId));
  }

  private resolveDraft(entry: WorkspaceCacheEntry): Todo | null {
    return (
      this.rxdb.entityManager.getEntityRef(Todo, entry.id) ??
      this.rxdb.entityManager.createEntityRef(Todo, entry.data as Partial<Todo> & { id: string }, {
        local: false,
        remote: false,
        modified: true
      })
    );
  }

  private setNotice(text: string, tone: NoticeTone) {
    this.notice.set({ text, tone });
  }

  private getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? `${fallback}: ${error.message}` : fallback;
  }
}
