import { getEntityStatus, reorderTargetForMove, RxDB } from '@aiao/rxdb';
// 本页的撤销/重做读 `rxdb.versionManager`，而历史子系统自 US-025 阶段 C 起住在这个插件里。
// 本模块**不**装插件 —— 它拿的是宿主注入的 `RxDB`，装插件是宿主 `setup_rxdb_*.ts` 的活；
// 这里只借 `declare module '@aiao/rxdb'` 的类型声明，`import type` 在 emit 时整句擦除。
import { useAction, useFindAll } from '@aiao/rxdb-angular';
import type {} from '@aiao/rxdb-plugin-history';
import { Task, TaskStaticTypes } from '@aiao/rxdb-test/entities';
import { FixedRowDrag, type FixedRowDragState, nextMacroTask } from '@aiao/utils';
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
  OnInit,
  PLATFORM_ID,
  signal,
  viewChild,
  WritableSignal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  LucideArrowDown as ArrowDown,
  LucideArrowUp as ArrowUp,
  LucideGripVertical as GripVertical,
  LucideHistory as History,
  LucideDynamicIcon,
  LucidePen as Pen,
  LucidePlus as Plus,
  LucideRedo2 as Redo2,
  LucideUndo2 as Undo2,
  LucideX as X
} from '@lucide/angular';
import { HistorySidebarComponent } from '@modules/angular';

/** 行高（px）：虚拟滚动的 itemSize 与拖拽落点换算共用 */
const ITEM_SIZE = 48;

@Component({
  selector: 'ao-todo-page',
  imports: [AsyncPipe, FormsModule, LucideDynamicIcon, ScrollingModule, HistorySidebarComponent],
  standalone: true,
  templateUrl: './todo.page.html',
  styleUrls: ['./todo.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TodoPage implements OnInit, AfterViewInit {
  #todo_state_map = new Map<Task, WritableSignal<{ isEditing: boolean }>>();
  #destroyRef = inject(DestroyRef);
  #rxdb = inject(RxDB);
  #scrollDispatcher = inject(ScrollDispatcher);
  #loading = false;
  #hasMore = true;
  readonly #drag = new FixedRowDrag({
    rowHeight: ITEM_SIZE,
    scrollElement: () => this.#required(this.mainContainerRef(), 'mainContainer'),
    listElement: () => this.#required(this.todoListRef(), 'todoList'),
    onChange: state => this.$drag.set(state),
    onDrop: (from, to) => void this.drop_todo(from, to)
  });

  readonly itemSize = ITEM_SIZE;
  readonly history = this.#rxdb.versionManager.history(Task);

  // 图标
  readonly Undo2 = Undo2;
  readonly Redo2 = Redo2;
  readonly Pen = Pen;
  readonly X = X;
  readonly Plus = Plus;
  readonly ArrowUp = ArrowUp;
  readonly ArrowDown = ArrowDown;
  readonly History = History;
  readonly GripVertical = GripVertical;

  readonly title = signal<string>('');
  readonly $current_tab = signal<string>('all');
  readonly $completed_sort = signal<'asc' | 'desc'>('asc');
  readonly $init_date = signal(new Date()).asReadonly();
  readonly $next_new_data = signal(new Date());
  readonly $show_history = signal(true);
  readonly $show_sticky_header = signal(false);
  /** 拖拽中的起点与落点；`null` 表示没在拖 */
  readonly $drag = signal<FixedRowDragState | null>(null);
  /** 一次重排正在落库；期间不允许开始新的拖拽 */
  readonly $reorder_pending = signal(false);
  /** 最近一次重排失败的原因；下一次重排开始时清掉 */
  readonly $reorder_error = signal<string | null>(null);

  // 查询条件
  readonly $todo_query_options = computed<TaskStaticTypes['findAllOptions']>(() => {
    const current_tab = this.$current_tab();
    const options: TaskStaticTypes['findAllOptions'] = {
      where: {
        combinator: 'and',
        rules: []
      },
      orderBy: [
        {
          field: 'completed',
          sort: this.$completed_sort()
        },
        // 组内手动顺序；id 只在 sortOrder 相同时定序，保证结果稳定
        {
          field: 'sortOrder',
          sort: 'asc'
        },
        {
          field: 'id',
          sort: 'asc'
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
  readonly todo_resource = useFindAll(Task, this.$todo_query_options);

  readonly $todo_count_left = computed(() => this.todo_resource.value().filter(d => d.completed === false).length);
  readonly $completed_todos = computed(() => this.todo_resource.value().filter(d => d.completed));
  readonly $is_all_completed = computed(() => this.todo_resource.value().every(d => d.completed));
  readonly $disabled_clear_completed_btn = computed(() => !this.$completed_todos().length);
  readonly $disabled_toggle_all_btn = computed(() => this.todo_resource.value().length === 0);
  /**
   * 是否允许拖拽排序。「全部」页混着两个分组且受排序方向影响，拖动语义不清，不提供手柄；
   * 加载中的列表下标与库里顺序可能对不上，待决重排期间再拖会基于过期邻居计算目标。
   */
  readonly $can_drag = computed(
    () =>
      this.$current_tab() !== 'all' &&
      !this.todo_resource.isLoading() &&
      !this.$reorder_pending() &&
      this.todo_resource.value().length >= 2
  );

  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly add_1 = useAction<number>(options => this.add_many_todo(options));
  readonly add_2 = useAction<number>(options => this.add_many_todo(options));
  readonly add_3 = useAction<number>(options => this.add_many_todo(options));
  readonly add_4 = useAction<number>(options => this.add_many_todo(options));
  readonly add_5 = useAction<number>(options => this.add_many_todo(options));

  fullHeaderRef = viewChild<ElementRef<HTMLElement>>('fullHeader');
  mainContainerRef = viewChild<ElementRef<HTMLElement>>('mainContainer');
  todoListRef = viewChild('todoList', { read: ElementRef<HTMLElement> });

  constructor() {
    this.#destroyRef.onDestroy(() => this.#drag.dispose());
  }

  trackByFn = (index: number, todo: Task) => getEntityStatus(todo).fingerprint;

  ngOnInit() {
    if (!this.isBrowser) return;
  }

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
      .subscribe(() => checkVisibility());

    checkVisibility();
  }

  /** 按下拖拽手柄：从第 `index` 行开始拖 */
  start_drag(event: PointerEvent, index: number) {
    if (!this.$can_drag()) return;
    this.#drag.start(event, index, this.todo_resource.value().length);
  }

  /** 把第 `from` 行放到第 `to` 行：换算成邻居目标后交给 `Repository.reorder()` */
  async drop_todo(from: number, to: number) {
    const ids = this.todo_resource.value().map(todo => todo.id);
    const target = reorderTargetForMove(ids, from, to);
    if (!target) return;
    this.$reorder_pending.set(true);
    this.$reorder_error.set(null);
    try {
      await this.#rxdb.entityManager.getRepository(Task).reorder(ids[from], target);
    } catch (error) {
      this.$reorder_error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.$reorder_pending.set(false);
    }
  }

  load_more() {
    if (this.#loading || !this.#hasMore) return;
    this.#loading = true;
  }

  todo_edit(event: Event, liEle: HTMLDivElement, todo: Task) {
    event.preventDefault();
    event.stopImmediatePropagation();
    this.get_todo_state_signal(todo).update(state => ({ ...state, isEditing: true }));
    nextMacroTask(() => {
      const input = liEle.querySelector<HTMLInputElement>('input.todo-input');
      input?.focus();
    });
  }

  async todo_save(event: Event, input: HTMLInputElement, todo: Task) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const stateSignal = this.get_todo_state_signal(todo);
    if (stateSignal().isEditing === false) return;
    await todo.save();
    stateSignal.update(state => ({ ...state, isEditing: false }));
    input.blur();
  }

  todo_cancel_edit(todo: Task) {
    const state = this.get_todo_state_signal(todo);
    if (state().isEditing === false) return;
    state.update(state => ({ ...state, isEditing: false }));
    todo.reset();
  }

  get_todo_state_signal(todo: Task) {
    if (this.#todo_state_map.has(todo) === false) this.#todo_state_map.set(todo, signal({ isEditing: false }));
    return this.#todo_state_map.get(todo)!;
  }

  async todo_remove(event: Event, todo: Task) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await todo.remove();
  }

  async clear_completed() {
    console.time('removeMany');
    const completed_todos = this.$completed_todos();
    await this.#rxdb.entityManager.removeMany(completed_todos);
    console.timeEnd('removeMany');
  }

  async toggle_all() {
    const all_completed = this.$is_all_completed();
    const toggle = !all_completed;
    const todos = this.todo_resource.value().filter(d => d.completed === all_completed);
    for (const todo of todos) {
      todo.completed = toggle;
    }
    console.time('saveMany');
    await this.#rxdb.entityManager.saveMany(todos);
    console.timeEnd('saveMany');
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

  sticky_tab_click(tab: string) {
    const mainContainer = this.mainContainerRef();
    if (!mainContainer) return;

    const element = mainContainer.nativeElement;

    // 监听滚动结束
    let scrollTimeout: number;
    const onScrollEnd = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(() => {
        // 滚动结束后切换 tab
        this.set_current_tab(tab);
        element.removeEventListener('scroll', onScrollEnd);
      }, 50);
    };

    element.addEventListener('scroll', onScrollEnd);
    element.scrollTo({ top: 0, behavior: 'smooth' });

    // 防止监听器泄漏：5秒后强制清理
    setTimeout(() => {
      element.removeEventListener('scroll', onScrollEnd);
      clearTimeout(scrollTimeout);
    }, 5000);
  }

  async add_todo(event: Event) {
    event.preventDefault();
    const titleValue = this.title();
    if (titleValue) {
      const todo = new Task({
        title: titleValue
      });
      await todo.save();
      this.title.set('');
    }
  }

  async toggle_todo_completed(event: Event, todo: Task) {
    const state = this.get_todo_state_signal(todo)();
    if (state.isEditing) return;
    event.preventDefault();
    todo.completed = (event.target as HTMLInputElement).checked;
    await todo.save();
  }

  async add_many_todo(total: number) {
    const todos: Task[] = [];
    for (let i = 0; i < total; i++) {
      const todo = new Task();
      todo.title = 'test' + '-' + i;
      todos.push(todo);
    }
    console.time('saveMany');
    await this.#rxdb.entityManager.saveMany(todos);
    console.timeEnd('saveMany');
  }

  undo() {
    void this.#rxdb.versionManager.history().undo();
  }

  redo() {
    void this.#rxdb.versionManager.history().redo();
  }

  #required(ref: ElementRef<HTMLElement> | undefined, name: string): HTMLElement {
    if (!ref) throw new Error(`拖拽需要的元素 #${name} 尚未渲染`);
    return ref.nativeElement;
  }
}
