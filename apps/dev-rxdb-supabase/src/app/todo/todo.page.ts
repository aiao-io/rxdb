import { RxDB } from '@aiao/rxdb';
import { useAction, useFindAll } from '@aiao/rxdb-angular';
import { Todo, TodoStaticTypes } from '@aiao/rxdb-test/entities';
import { nextMacroTask } from '@aiao/utils';
import { ScrollDispatcher, ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  LucideArrowDown as ArrowDown,
  LucideArrowUp as ArrowUp,
  LucideHistory as History,
  LucideDynamicIcon,
  LucidePen as Pen,
  LucidePlus as Plus,
  LucideRedo2 as Redo2,
  LucideUndo2 as Undo2,
  LucideX as X
} from '@lucide/angular';
import { HistorySidebarComponent } from '@modules/angular';
import { getErrorMessage } from '../error-message';
import { RemoteSyncState } from '../remote-sync-state';
import { createTodoBatchTitles, persistCompleted, persistCompletedBatch } from '../todo-interactions';

@Component({
  selector: 'app-todo-page',
  imports: [AsyncPipe, FormsModule, LucideDynamicIcon, ScrollingModule, HistorySidebarComponent],
  templateUrl: './todo.page.html',
  styleUrls: ['./todo.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class TodoPage implements AfterViewInit {
  readonly #rxdb = inject(RxDB);
  readonly #scrollDispatcher = inject(ScrollDispatcher);
  readonly #destroyRef = inject(DestroyRef);
  readonly #editingTodoId = signal<Todo['id'] | null>(null);

  /** P1-2：远端是否真的连上；纯本地模式下 pull / push 必须不可点。 */
  readonly remoteSync = inject(RemoteSyncState);
  readonly itemSize = 48;
  readonly history = this.#rxdb.versionManager.history(Todo);
  readonly pushableCount$ = this.#rxdb.versionManager.pushableCount$;
  readonly pullableCount$ = this.#rxdb.versionManager.pullableCount$;

  // 图标
  readonly Undo2 = Undo2;
  readonly Redo2 = Redo2;
  readonly Pen = Pen;
  readonly X = X;
  readonly Plus = Plus;
  readonly ArrowUp = ArrowUp;
  readonly ArrowDown = ArrowDown;
  readonly History = History;

  readonly title = signal<string>('');
  readonly $current_tab = signal<string>('all');
  readonly $completed_sort = signal<'asc' | 'desc'>('asc');
  readonly $show_history = signal(true);
  readonly $show_sticky_header = signal(false);
  readonly $syncError = signal<string | null>(null);
  readonly $syncPending = signal(false);
  readonly $crudError = signal<string | null>(null);

  // 查询条件
  readonly $todo_query_options = computed<TodoStaticTypes['findAllOptions']>(() => {
    const current_tab = this.$current_tab();
    const options: TodoStaticTypes['findAllOptions'] = {
      where: {
        combinator: 'and',
        rules: []
      },
      orderBy: [
        {
          field: 'completed',
          sort: this.$completed_sort()
        },
        {
          field: 'id',
          sort: 'desc'
        }
      ]
    };
    if (current_tab === 'active') {
      options.where.rules.push({
        field: 'completed',
        operator: '=',
        value: false
      });
    } else if (current_tab === 'completed') {
      options.where.rules.push({
        field: 'completed',
        operator: '=',
        value: true
      });
    }
    return options;
  });

  // Resource
  readonly todo_resource = useFindAll(Todo, this.$todo_query_options);

  readonly $todo_count_left = computed(() => this.todo_resource.value().filter(d => d.completed === false).length);
  readonly $completed_todos = computed(() => this.todo_resource.value().filter(d => d.completed));
  readonly $is_all_completed = computed(() => this.todo_resource.value().every(d => d.completed));
  readonly $disabled_clear_completed_btn = computed(() => !this.$completed_todos().length);
  readonly $disabled_toggle_all_btn = computed(() => this.todo_resource.value().length === 0);

  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly add_1 = useAction<number>(options => this.add_many_todo(options));
  readonly add_2 = useAction<number>(options => this.add_many_todo(options));
  readonly add_3 = useAction<number>(options => this.add_many_todo(options));
  readonly add_4 = useAction<number>(options => this.add_many_todo(options));
  readonly add_5 = useAction<number>(options => this.add_many_todo(options));

  fullHeaderRef = viewChild<ElementRef<HTMLElement>>('fullHeader');
  mainContainerRef = viewChild<ElementRef<HTMLElement>>('mainContainer');

  trackByFn = (_index: number, todo: Todo) => todo.id;

  ngAfterViewInit() {
    const fullHeader = this.fullHeaderRef();
    const mainContainer = this.mainContainerRef();

    if (!this.isBrowser || !fullHeader || !mainContainer) return;

    const checkVisibility = () => {
      const headerElement = fullHeader.nativeElement;
      const mainElement = mainContainer.nativeElement;

      const scrollTop = mainElement.scrollTop;
      const headerOffsetTop = headerElement.offsetTop;
      const headerHeight = headerElement.offsetHeight;

      const shouldShow = scrollTop > headerOffsetTop + headerHeight;
      this.$show_sticky_header.set(shouldShow);
    };

    this.#scrollDispatcher
      .scrolled()
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe(() => {
        checkVisibility();
      });

    checkVisibility();
  }

  todo_edit(event: Event, liEle: HTMLDivElement, todo: Todo) {
    event.preventDefault();
    event.stopImmediatePropagation();
    this.#editingTodoId.set(todo.id);
    this.$crudError.set(null);
    nextMacroTask(() => liEle.querySelector<HTMLInputElement>('input.todo-input')?.focus());
  }

  async todo_save(event: Event, input: HTMLInputElement, todo: Todo) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!this.is_todo_editing(todo)) return;
    this.$crudError.set(null);
    try {
      await todo.save();
      this.#editingTodoId.set(null);
      input.blur();
    } catch (error) {
      this.$crudError.set(`保存任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  todo_cancel_edit(todo: Todo) {
    if (!this.is_todo_editing(todo)) return;
    this.#editingTodoId.set(null);
    this.$crudError.set(null);
    todo.reset();
  }

  is_todo_editing(todo: Todo): boolean {
    return this.#editingTodoId() === todo.id;
  }

  async todo_remove(event: Event, todo: Todo) {
    event.preventDefault();
    event.stopImmediatePropagation();
    this.$crudError.set(null);
    try {
      await todo.remove();
      if (this.is_todo_editing(todo)) this.#editingTodoId.set(null);
    } catch (error) {
      todo.reset();
      this.$crudError.set(`删除任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  async clear_completed() {
    const completedTodos = this.$completed_todos();
    this.$crudError.set(null);
    try {
      await this.#rxdb.entityManager.removeMany(completedTodos);
    } catch (error) {
      completedTodos.forEach(todo => todo.reset());
      this.$crudError.set(`清理已完成任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  async toggle_all() {
    const completed = !this.$is_all_completed();
    const todos = this.todo_resource.value().filter(todo => todo.completed !== completed);
    this.$crudError.set(null);
    try {
      await persistCompletedBatch(todos, completed, entities => this.#rxdb.entityManager.saveMany(entities));
    } catch (error) {
      this.$crudError.set(`批量更新任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  toggle_complete_sort() {
    this.$completed_sort.update(sort => (sort === 'asc' ? 'desc' : 'asc'));
  }

  toggle_history() {
    this.$show_history.update(show => !show);
  }

  set_current_tab(tab: string) {
    this.$current_tab.set(tab);
  }

  /**
   * 滚回顶部，滚动停下后再切 tab。
   *
   * @remarks
   * P2-3：这里原先有三个都不受组件生命周期管理的东西 —— `scroll` 监听、50ms 的
   * `scrollTimeout`、5s 的兜底 `setTimeout`。组件销毁后 50ms 的回调照样触发
   * `this.set_current_tab(tab)`（对已销毁组件写 signal），5s 的兜底也照样排着。
   * 对照本类 `:45` 已注入的 `#destroyRef` 与 `:146` 正确使用的 `takeUntilDestroyed`：
   * 手段就在手边，只是这段没用。
   *
   * `scrollTimeout` 原先声明为 `let scrollTimeout: number;` 且首次就 `clearTimeout(undefined)` ——
   * 无害但说明这段没人验证过。
   */
  sticky_tab_click(tab: string) {
    const mainContainer = this.mainContainerRef();
    if (!mainContainer) return;

    const element = mainContainer.nativeElement;

    let scrollTimeout: number | undefined;
    const cleanup = () => {
      element.removeEventListener('scroll', onScrollEnd);
      if (scrollTimeout !== undefined) clearTimeout(scrollTimeout);
      clearTimeout(fallbackTimeout);
    };

    const onScrollEnd = () => {
      if (scrollTimeout !== undefined) clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(() => {
        // 滚动结束后切换 tab
        this.set_current_tab(tab);
        cleanup();
      }, 50);
    };

    element.addEventListener('scroll', onScrollEnd);
    element.scrollTo({ top: 0, behavior: 'smooth' });

    // 兜底：滚动事件始终不来（比如内容不足以滚动）时，5 秒后收摊
    const fallbackTimeout = window.setTimeout(cleanup, 5000);

    // 组件销毁时无条件收摊 —— 这是原实现完全缺失的一环
    this.#destroyRef.onDestroy(cleanup);
  }

  async add_todo(event: Event) {
    event.preventDefault();
    const titleValue = this.title();
    if (!titleValue) return;
    this.$crudError.set(null);
    try {
      await new Todo({ title: titleValue }).save();
      this.title.set('');
    } catch (error) {
      this.$crudError.set(`新增任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  async toggle_todo_completed(event: Event, todo: Todo) {
    if (this.is_todo_editing(todo)) return;
    this.$crudError.set(null);
    try {
      await persistCompleted(todo, (event.target as HTMLInputElement).checked);
    } catch (error) {
      this.$crudError.set(`更新任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  async add_many_todo(total: number) {
    const titles = createTodoBatchTitles(total, crypto.randomUUID());
    const todos = titles.map(title => new Todo({ title }));
    this.$crudError.set(null);
    try {
      await this.#rxdb.entityManager.saveMany(todos);
    } catch (error) {
      this.$crudError.set(`批量新增任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  undo() {
    void this.#rxdb.versionManager.history().undo();
  }

  redo() {
    void this.#rxdb.versionManager.history().redo();
  }

  async pull(): Promise<void> {
    await this.#sync(() => this.#rxdb.versionManager.pull());
  }

  async push(): Promise<void> {
    await this.#sync(() => this.#rxdb.versionManager.push());
  }

  async #sync(operation: () => Promise<unknown>): Promise<void> {
    this.$syncPending.set(true);
    this.$syncError.set(null);
    try {
      await operation();
    } catch (error) {
      this.$syncError.set(`同步失败：${getErrorMessage(error, '未知错误')}`);
    } finally {
      this.$syncPending.set(false);
    }
  }
}
