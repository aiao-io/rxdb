import { RxDB } from '@aiao/rxdb';
import { InfiniteScrollingList, useAction, useCount } from '@aiao/rxdb-angular';
import { Todo, TodoStaticTypes } from '@aiao/rxdb-test/entities';
import { nextMacroTask } from '@aiao/utils';
import { CdkVirtualScrollableElement, ScrollingModule } from '@angular/cdk/scrolling';
import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
  ViewChild,
  WritableSignal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  LucideArrowDown as ArrowDown,
  LucideArrowUp as ArrowUp,
  LucideDynamicIcon,
  LucidePen as Pen,
  LucidePlus as Plus,
  LucideRedo2 as Redo2,
  LucideUndo2 as Undo2,
  LucideX as X
} from '@lucide/angular';
import { auditTime, filter, map } from 'rxjs';

@Component({
  selector: 'ao-todo-cursor-page',
  imports: [FormsModule, LucideDynamicIcon, ScrollingModule],
  templateUrl: './todo-cursor.page.html',
  styleUrls: ['./todo-cursor.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TodoCursorPage implements OnInit, AfterViewInit {
  #todo_state_map = new Map<Todo, WritableSignal<{ isEditing: boolean }>>();
  #destroyRef = inject(DestroyRef);
  #rxdb = inject(RxDB);

  readonly itemSize = 32;

  // 图标
  readonly Undo2 = Undo2;
  readonly Redo2 = Redo2;
  readonly Pen = Pen;
  readonly X = X;
  readonly Plus = Plus;
  readonly ArrowUp = ArrowUp;
  readonly ArrowDown = ArrowDown;

  readonly title = signal<string>('');
  readonly $current_tab = signal<string>('all');
  readonly $completed_sort = signal<'asc' | 'desc'>('asc');

  // 查询条件
  readonly $todo_find_by_cursor_options = computed<TodoStaticTypes['findByCursorOptions']>(() => {
    const current_tab = this.$current_tab();
    const options: TodoStaticTypes['findByCursorOptions'] = {
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

  // 查询条件
  readonly $todo_count_options = computed<TodoStaticTypes['countOptions']>(() => {
    const findByCursorOptions = this.$todo_find_by_cursor_options();
    const options: TodoStaticTypes['countOptions'] = {
      where: findByCursorOptions.where
    };
    return options;
  });

  readonly resource = new InfiniteScrollingList(this.#rxdb, Todo, this.$todo_find_by_cursor_options);

  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly add_1 = useAction<number>(options => this.add_many_todo(options));
  readonly add_2 = useAction<number>(options => this.add_many_todo(options));
  readonly add_3 = useAction<number>(options => this.add_many_todo(options));
  readonly add_4 = useAction<number>(options => this.add_many_todo(options));
  readonly add_5 = useAction<number>(options => this.add_many_todo(options));
  readonly $todo_count_left = useCount(Todo, this.$todo_count_options);

  @ViewChild(CdkVirtualScrollableElement) readonly viewport!: CdkVirtualScrollableElement;

  trackByFn = (index: number, todo: Todo) => todo.id + todo.updatedAt.getTime();

  ngOnInit() {
    if (!this.isBrowser) return;
  }

  ngAfterViewInit() {
    // 监听滚动事件
    this.viewport
      .elementScrolled()
      .pipe(
        auditTime(50),
        map(() => this.viewport.measureScrollOffset('bottom')),
        filter(offset => offset < 600),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe(() => {
        this.resource.loadMore();
      });
  }

  todo_edit(event: Event, liEle: HTMLDivElement, todo: Todo) {
    event.preventDefault();
    event.stopImmediatePropagation();
    this.get_todo_state_signal(todo).update(state => ({ ...state, isEditing: true }));
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
    stateSignal.update(state => ({ ...state, isEditing: false }));
    await todo.save();
    input.blur();
  }

  todo_cancel_edit(todo: Todo) {
    const state = this.get_todo_state_signal(todo);
    if (state().isEditing === false) return;
    state.update(state => ({ ...state, isEditing: false }));
    todo.reset();
  }

  get_todo_state_signal(todo: Todo) {
    if (this.#todo_state_map.has(todo) === false) this.#todo_state_map.set(todo, signal({ isEditing: false }));
    return this.#todo_state_map.get(todo)!;
  }

  async todo_remove(event: Event, todo: Todo) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await todo.remove();
  }

  toggle_complete_sort() {
    this.$completed_sort.update(sort => (sort === 'asc' ? 'desc' : 'asc'));
  }

  set_current_tab(tab: string) {
    this.$current_tab.set(tab);
  }

  async add_todo(event: Event) {
    event.preventDefault();
    const titleValue = this.title();
    if (titleValue) {
      const todo = new Todo({
        title: titleValue
      });
      await todo.save();
      this.title.set('');
      // 刷新列表以显示新添加的数据
      this.resource.refresh();
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
    const timestamp = Date.now();
    for (let i = 0; i < total; i++) {
      const todo = new Todo();
      todo.title = `test-${timestamp}-${i}`;
      todos.push(todo);
    }
    await this.#rxdb.entityManager.saveMany(todos);

    // 刷新列表以显示新添加的数据
    this.resource.refresh();
  }
}
