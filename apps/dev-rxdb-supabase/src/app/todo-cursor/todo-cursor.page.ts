import { RxDB } from '@aiao/rxdb';
import { InfiniteScrollingList, useAction, useCount } from '@aiao/rxdb-angular';
import { Todo, TodoStaticTypes } from '@aiao/rxdb-test/entities';
import { nextMacroTask } from '@aiao/utils';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  PLATFORM_ID,
  signal,
  ViewChild
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
import { getErrorMessage } from '../error-message';
import { createTodoBatchTitles, persistCompleted } from '../todo-interactions';

@Component({
  selector: 'app-todo-cursor-page',
  imports: [FormsModule, LucideDynamicIcon, ScrollingModule],
  templateUrl: './todo-cursor.page.html',
  styleUrls: ['./todo-cursor.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class TodoCursorPage implements AfterViewInit {
  readonly #rxdb = inject(RxDB);
  readonly #destroyRef = inject(DestroyRef);
  readonly #editingTodoId = signal<Todo['id'] | null>(null);

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
  readonly $crudError = signal<string | null>(null);

  /**
   * 每页条数。
   *
   * @remarks
   * P2-2：原先不传 `limit`，实际生效的是 `InfiniteScrollingList` 内部的
   * `inputOptions.limit ?? 100`。于是 e2e 里断言的 `data-loaded-count === '100'`
   * 断的是**库的默认值**——库哪天把默认改成 50，这个 demo 的测试就会因为一件
   * 与它自己无关的事变红。页大小是本页面的行为，应该由本页面声明。
   */
  static readonly PAGE_SIZE = 100;

  // 查询条件
  readonly $todo_find_by_cursor_options = computed<TodoStaticTypes['findByCursorOptions']>(() => {
    const current_tab = this.$current_tab();
    const options: TodoStaticTypes['findByCursorOptions'] = {
      limit: TodoCursorPage.PAGE_SIZE,
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

  /** 模板/E2E 读取用：把页大小暴露成 `data-page-size`，测试不必再抄一个魔数。 */
  readonly pageSize = TodoCursorPage.PAGE_SIZE;

  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly add_1 = useAction<number>(options => this.add_many_todo(options));
  readonly add_2 = useAction<number>(options => this.add_many_todo(options));
  readonly add_3 = useAction<number>(options => this.add_many_todo(options));
  readonly add_4 = useAction<number>(options => this.add_many_todo(options));
  readonly add_5 = useAction<number>(options => this.add_many_todo(options));
  readonly $todo_count_left = useCount(Todo, this.$todo_count_options);

  @ViewChild(CdkVirtualScrollViewport) viewport?: CdkVirtualScrollViewport;

  trackByFn = (_index: number, todo: Todo) => todo.id;

  ngAfterViewInit() {
    const viewport = this.viewport;
    if (!this.isBrowser || !viewport) return;
    viewport
      .elementScrolled()
      .pipe(
        auditTime(50),
        map(() => viewport.measureScrollOffset('bottom')),
        filter(offset => offset < 600),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe(() => this.resource.loadMore());
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
      this.resource.refresh();
    } catch (error) {
      todo.reset();
      this.$crudError.set(`删除任务失败：${getErrorMessage(error, '未知错误')}`);
    }
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
    if (!titleValue) return;
    this.$crudError.set(null);
    try {
      await new Todo({ title: titleValue }).save();
      this.title.set('');
      this.resource.refresh();
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
      this.resource.refresh();
    } catch (error) {
      this.$crudError.set(`批量新增任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  }
}
