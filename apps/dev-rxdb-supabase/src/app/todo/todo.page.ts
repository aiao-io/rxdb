import { RxDB } from '@aiao/rxdb';
import { useAction, useFindAll } from '@aiao/rxdb-angular';
import { Todo, TodoStaticTypes } from '@aiao/rxdb-test/entities';
import { nextMacroTask } from '@aiao/utils';
import { ScrollDispatcher, ScrollingModule } from '@angular/cdk/scrolling';
import { isPlatformBrowser } from '@angular/common';
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
  LucideDynamicIcon,
  LucidePen as Pen,
  LucidePlus as Plus,
  LucideX as X
} from '@lucide/angular';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { historyActions } from '../history-actions';
import { registerPageWorkbench } from '../page-workbench';
import { RemoteSyncState } from '../remote-sync-state';
import { SyncCommands } from '../sync-commands';
import { Toasts } from '../toasts';
import { createTodoBatchTitles, persistCompleted, persistCompletedBatch } from '../todo-interactions';

/** 列表筛选：全部、进行中、已完成 */
type TodoTab = 'all' | 'active' | 'completed';

@Component({
  selector: 'app-todo-page',
  imports: [FormsModule, LucideDynamicIcon, ScrollingModule],
  templateUrl: './todo.page.html',
  styleUrls: ['./todo.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class TodoPage implements AfterViewInit {
  readonly #rxdb = inject(RxDB);
  readonly #scrollDispatcher = inject(ScrollDispatcher);
  readonly #destroyRef = inject(DestroyRef);
  readonly #toasts = inject(Toasts);
  readonly #editingTodoId = signal<Todo['id'] | null>(null);

  /** 远端是否真的连上：访客提示只在远端模式下给 */
  readonly remoteSync = inject(RemoteSyncState);
  /** 当前身份：Todo 走未分区的日志同步，只对登录身份开放（US-225），访客的 Todo 只存本地 */
  readonly session = inject(DemoSession);
  readonly itemSize = 48;

  // 图标
  readonly Pen = Pen;
  readonly X = X;
  readonly Plus = Plus;
  readonly ArrowUp = ArrowUp;
  readonly ArrowDown = ArrowDown;

  readonly tabs: readonly { key: TodoTab; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'active', label: '进行中' },
    { key: 'completed', label: '已完成' }
  ];
  /** 批量添加的档位 */
  readonly batchSizes = [1, 10, 100, 1000, 10000] as const;

  readonly title = signal<string>('');
  readonly $current_tab = signal<TodoTab>('all');
  readonly $completed_sort = signal<'asc' | 'desc'>('asc');
  readonly $show_sticky_header = signal(false);

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
  /** 批量添加：一批在写时其余档位都不可点，菜单按钮显示进度 */
  readonly add_many = useAction<number>(total => this.add_many_todo(total));

  fullHeaderRef = viewChild<ElementRef<HTMLElement>>('fullHeader');
  mainContainerRef = viewChild<ElementRef<HTMLElement>>('mainContainer');

  constructor() {
    // 撤销、重做与操作历史只作用于 Todo（无参 history() 是整库作用域，会撤到商品与订单）；推拉是整机的（epic-016）
    const history = this.#rxdb.versionManager.history(Todo);
    registerPageWorkbench({
      title: 'Todo',
      scopeLabel: '本页：Todo',
      ...historyActions(history, signal(null)),
      history,
      ...inject(SyncCommands).forPage()
    });
  }

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
    nextMacroTask(() => liEle.querySelector<HTMLInputElement>('input.todo-input')?.focus());
  }

  async todo_save(event: Event, input: HTMLInputElement, todo: Todo) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!this.is_todo_editing(todo)) return;
    try {
      await todo.save();
      this.#editingTodoId.set(null);
      input.blur();
    } catch (error) {
      this.#fail(`保存任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  todo_cancel_edit(todo: Todo) {
    if (!this.is_todo_editing(todo)) return;
    this.#editingTodoId.set(null);
    todo.reset();
  }

  is_todo_editing(todo: Todo): boolean {
    return this.#editingTodoId() === todo.id;
  }

  async todo_remove(event: Event, todo: Todo) {
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      await todo.remove();
      if (this.is_todo_editing(todo)) this.#editingTodoId.set(null);
    } catch (error) {
      todo.reset();
      this.#fail(`删除任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  async clear_completed() {
    const completedTodos = this.$completed_todos();
    try {
      await this.#rxdb.entityManager.removeMany(completedTodos);
    } catch (error) {
      completedTodos.forEach(todo => todo.reset());
      this.#fail(`清理已完成任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  async toggle_all() {
    const completed = !this.$is_all_completed();
    const todos = this.todo_resource.value().filter(todo => todo.completed !== completed);
    try {
      await persistCompletedBatch(todos, completed, entities => this.#rxdb.entityManager.saveMany(entities));
    } catch (error) {
      this.#fail(`批量更新任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  toggle_complete_sort() {
    this.$completed_sort.update(sort => (sort === 'asc' ? 'desc' : 'asc'));
  }

  set_current_tab(tab: TodoTab) {
    this.$current_tab.set(tab);
  }

  /** 焦点离开批量添加菜单（点了别处）就收起 */
  close_on_focus_out(event: FocusEvent, dropdown: HTMLDetailsElement) {
    if (dropdown.contains(event.relatedTarget as Node | null)) return;
    dropdown.removeAttribute('open');
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
  sticky_tab_click(tab: TodoTab) {
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
    try {
      await new Todo({ title: titleValue }).save();
      this.title.set('');
    } catch (error) {
      this.#fail(`新增任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  async toggle_todo_completed(event: Event, todo: Todo) {
    if (this.is_todo_editing(todo)) return;
    try {
      await persistCompleted(todo, (event.target as HTMLInputElement).checked);
    } catch (error) {
      this.#fail(`更新任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  async add_many_todo(total: number) {
    const titles = createTodoBatchTitles(total, crypto.randomUUID());
    const todos = titles.map(title => new Todo({ title }));
    try {
      await this.#rxdb.entityManager.saveMany(todos);
    } catch (error) {
      this.#fail(`批量新增任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }

  /** 写入失败弹一条错误消息，留到用户关掉 */
  #fail(message: string): void {
    this.#toasts.show({ kind: 'error', message });
  }
}
