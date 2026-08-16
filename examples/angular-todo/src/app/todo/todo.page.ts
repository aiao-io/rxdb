import { getEntityStatus, RxDB } from '@aiao/rxdb';
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
  OnInit,
  PLATFORM_ID,
  signal,
  viewChild,
  WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideDynamicIcon,
  LucideHistory,
  LucidePen,
  LucidePlus,
  LucideRedo2,
  LucideUndo2,
  LucideX,
} from '@lucide/angular';
import { HistorySidebarComponent } from '../history-sidebar/history-sidebar.component';

@Component({
  selector: 'ao-todo-page',
  imports: [AsyncPipe, FormsModule, LucideDynamicIcon, ScrollingModule, HistorySidebarComponent],
  standalone: true,
  templateUrl: './todo.page.html',
  styleUrls: ['./todo.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class TodoPage implements OnInit, AfterViewInit {
  #todo_state_map = new Map<Todo, WritableSignal<{ isEditing: boolean }>>();
  #destroyRef = inject(DestroyRef);
  #rxdb = inject(RxDB);
  #scrollDispatcher = inject(ScrollDispatcher);
  #loading = false;
  #hasMore = true;

  readonly itemSize = 48;
  readonly history = this.#rxdb.versionManager.history(Todo);

  readonly undoIcon = LucideUndo2;
  readonly redoIcon = LucideRedo2;
  readonly editIcon = LucidePen;
  readonly deleteIcon = LucideX;
  readonly plusIcon = LucidePlus;
  readonly arrowUpIcon = LucideArrowUp;
  readonly arrowDownIcon = LucideArrowDown;
  readonly historyIcon = LucideHistory;

  readonly title = signal<string>('');
  readonly $current_tab = signal<string>('all');
  readonly $completed_sort = signal<'asc' | 'desc'>('asc');
  readonly $init_date = signal(new Date()).asReadonly();
  readonly $next_new_data = signal(new Date());
  readonly $show_history = signal(true);
  readonly $show_sticky_header = signal(false);

  // 查询条件
  readonly $todo_query_options = computed<TodoStaticTypes['findAllOptions']>(() => {
    const current_tab = this.$current_tab();
    const options: TodoStaticTypes['findAllOptions'] = {
      where: {
        combinator: 'and',
        rules: [],
      },
      orderBy: [
        {
          field: 'completed',
          sort: this.$completed_sort(),
        },
        {
          field: 'id',
          sort: 'desc',
        },
      ],
    };
    if (current_tab === 'active') {
      options.where.rules.push({
        field: 'completed',
        operator: '=',
        value: false,
      });
    } else if (current_tab === 'completed') {
      options.where.rules.push({
        field: 'completed',
        operator: '=',
        value: true,
      });
    }
    return options;
  });

  // Resource
  readonly todo_resource = useFindAll(Todo, this.$todo_query_options);

  readonly $todo_count_left = computed(
    () => this.todo_resource.value().filter((d) => d.completed === false).length,
  );
  readonly $completed_todos = computed(() => this.todo_resource.value().filter((d) => d.completed));
  readonly $is_all_completed = computed(() => this.todo_resource.value().every((d) => d.completed));
  readonly $disabled_clear_completed_btn = computed(() => !this.$completed_todos().length);
  readonly $disabled_toggle_all_btn = computed(() => this.todo_resource.value().length === 0);

  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly add_1 = useAction<number>((options) => this.add_many_todo(options));
  readonly add_2 = useAction<number>((options) => this.add_many_todo(options));
  readonly add_3 = useAction<number>((options) => this.add_many_todo(options));
  readonly add_4 = useAction<number>((options) => this.add_many_todo(options));
  readonly add_5 = useAction<number>((options) => this.add_many_todo(options));

  fullHeaderRef = viewChild<ElementRef<HTMLElement>>('fullHeader');
  mainContainerRef = viewChild<ElementRef<HTMLElement>>('mainContainer');

  trackByFn = (index: number, todo: Todo) => getEntityStatus(todo).fingerprint;

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

  load_more() {
    if (this.#loading || !this.#hasMore) return;
    this.#loading = true;
  }

  todo_edit(event: Event, liEle: HTMLDivElement, todo: Todo) {
    event.preventDefault();
    event.stopImmediatePropagation();
    this.get_todo_state_signal(todo).update((state) => ({ ...state, isEditing: true }));
    nextMacroTask(() => {
      const input = liEle.querySelector<HTMLInputElement>('input.todo-input');
      input?.focus();
    });
  }

  async todo_save(event: Event, input: HTMLInputElement, todo: Todo) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const stateSignal = this.get_todo_state_signal(todo);
    if (stateSignal().isEditing === false) return;
    stateSignal.update((state) => ({ ...state, isEditing: false }));
    await todo.save();
    input.blur();
  }

  todo_cancel_edit(todo: Todo) {
    const state = this.get_todo_state_signal(todo);
    if (state().isEditing === false) return;
    state.update((state) => ({ ...state, isEditing: false }));
    todo.reset();
  }

  get_todo_state_signal(todo: Todo) {
    if (this.#todo_state_map.has(todo) === false)
      this.#todo_state_map.set(todo, signal({ isEditing: false }));
    return this.#todo_state_map.get(todo)!;
  }

  async todo_remove(event: Event, todo: Todo) {
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
    const todos = this.todo_resource.value().filter((d) => d.completed === all_completed);
    for (const todo of todos) {
      todo.completed = toggle;
    }
    console.time('saveMany');
    await this.#rxdb.entityManager.saveMany(todos);
    console.timeEnd('saveMany');
  }

  toggle_complete_sort() {
    this.$completed_sort.update((sort) => (sort === 'asc' ? 'desc' : 'asc'));
  }

  toggle_history() {
    this.$show_history.update((show) => !show);
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
      const todo = new Todo({
        title: titleValue,
      });
      await todo.save();
      this.title.set('');
    }
  }

  async toggle_todo_completed(event: Event, todo: Todo) {
    const state = this.get_todo_state_signal(todo)();
    if (state.isEditing) return;
    event.preventDefault();
    todo.completed = (event.target as HTMLInputElement).checked;
    await todo.save();
  }

  async add_many_todo(total: number) {
    const todos: Todo[] = [];
    for (let i = 0; i < total; i++) {
      const todo = new Todo();
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
}
