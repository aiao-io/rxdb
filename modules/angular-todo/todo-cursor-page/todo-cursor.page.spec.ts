import { RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { CdkVirtualScrollableElement } from '@angular/cdk/scrolling';
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TodoCursorPage } from './todo-cursor.page';

const angularMocks = vi.hoisted(() => {
  class MockInfiniteScrollingList {
    loadMore = vi.fn();
    refresh = vi.fn();
    value = () => [] as Todo[];
    isEmpty = () => true;
    isLoading = () => false;
    hasValue = () => false;
    error = () => undefined;
    hasMore = () => true;
  }

  return {
    MockInfiniteScrollingList,
    useCount: vi.fn(() => ({
      error: () => undefined,
      hasValue: () => true,
      isEmpty: () => false,
      isLoading: () => false,
      value: () => 0
    }))
  };
});
const entityMocks = vi.hoisted(() => {
  const save = vi.fn().mockResolvedValue(undefined);
  class MockTodo {
    completed = false;
    id = 'todo-new';
    save = save;
    title = '';
    updatedAt = new Date(0);
    constructor(data: { title?: string } = {}) {
      this.title = data.title ?? '';
    }
  }
  return { MockTodo, save };
});

vi.mock('@aiao/rxdb-angular', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-angular')>();
  return {
    ...actual,
    InfiniteScrollingList: angularMocks.MockInfiniteScrollingList,
    useCount: angularMocks.useCount
  };
});

vi.mock('@aiao/rxdb-test/entities', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-test/entities')>();
  return { ...actual, Todo: entityMocks.MockTodo };
});

function stubTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    title: 'cursor todo',
    completed: false,
    id: 'todo-1',
    updatedAt: new Date(0),
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
    ...overrides
  } as unknown as Todo;
}

function createViewport(offset = 100) {
  const elementScrolled$ = new Subject<Event>();
  const measureScrollOffset = vi.fn(() => offset);
  const viewport = {
    elementScrolled: () => elementScrolled$,
    measureScrollOffset
  } as unknown as CdkVirtualScrollableElement;
  return { elementScrolled$, measureScrollOffset, viewport };
}

const originalAfterViewInit = TodoCursorPage.prototype.ngAfterViewInit;

function renderCursorPage() {
  const rxdb = {
    entityManager: {
      saveMany: vi.fn<(entities: Todo[]) => Promise<void>>(() => Promise.resolve())
    }
  };
  vi.spyOn(TodoCursorPage.prototype, 'ngAfterViewInit').mockImplementation(() => undefined);
  TestBed.overrideComponent(TodoCursorPage, {
    set: {
      imports: [],
      schemas: [NO_ERRORS_SCHEMA],
      styleUrls: [],
      styles: [],
      template: `<div></div>`
    }
  });
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: RxDB, useValue: rxdb }]
  });
  const fixture = TestBed.createComponent(TodoCursorPage);
  return { fixture, page: fixture.componentInstance, rxdb };
}

describe('TodoCursorPage', () => {
  beforeEach(() => {
    angularMocks.useCount.mockClear();
    entityMocks.save.mockClear();
  });

  afterEach(() => {
    vi.mocked(TodoCursorPage.prototype.ngAfterViewInit).mockRestore();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('loads more near the bottom and stops after destroy', async () => {
    vi.useFakeTimers();
    const { fixture, page } = renderCursorPage();
    const { elementScrolled$, measureScrollOffset, viewport } = createViewport(100);
    Object.defineProperty(page, 'viewport', {
      configurable: true,
      get: () => viewport,
      set: () => undefined
    });
    originalAfterViewInit.call(page);

    elementScrolled$.next(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(50);
    expect(page.resource.loadMore).toHaveBeenCalledOnce();

    measureScrollOffset.mockReturnValue(800);
    elementScrolled$.next(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(50);
    expect(page.resource.loadMore).toHaveBeenCalledOnce();

    fixture.destroy();
    measureScrollOffset.mockReturnValue(50);
    elementScrolled$.next(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(50);
    expect(page.resource.loadMore).toHaveBeenCalledOnce();
  });

  it('reuses edit state and cancels without saving', () => {
    const { page } = renderCursorPage();
    const todo = stubTodo();
    const host = document.createElement('div');

    expect(page.get_todo_state_signal(todo)).toBe(page.get_todo_state_signal(todo));
    page.todo_edit(new Event('dblclick'), host, todo);
    expect(page.get_todo_state_signal(todo)().isEditing).toBe(true);

    page.todo_cancel_edit(todo);
    expect(page.get_todo_state_signal(todo)().isEditing).toBe(false);
    expect(todo.reset).toHaveBeenCalledOnce();
    expect(todo.save).not.toHaveBeenCalled();
  });

  it('saves an editing todo then ignores a second save', async () => {
    const { page } = renderCursorPage();
    const todo = stubTodo();
    const input = document.createElement('input');
    const blur = vi.spyOn(input, 'blur');

    page.get_todo_state_signal(todo).set({ isEditing: true });
    await page.todo_save(new Event('submit'), input, todo);
    expect(todo.save).toHaveBeenCalledOnce();
    expect(page.get_todo_state_signal(todo)().isEditing).toBe(false);
    expect(blur).toHaveBeenCalledOnce();

    await page.todo_save(new Event('submit'), input, todo);
    expect(todo.save).toHaveBeenCalledOnce();
  });

  it('removes a todo and skips completed toggle while editing', async () => {
    const { page } = renderCursorPage();
    const todo = stubTodo();
    const event = { preventDefault: vi.fn(), target: { checked: true } } as unknown as Event;

    await page.todo_remove(new Event('click'), todo);
    expect(todo.remove).toHaveBeenCalledOnce();

    page.get_todo_state_signal(todo).set({ isEditing: true });
    await page.toggle_todo_completed(event, todo);
    expect(todo.save).not.toHaveBeenCalled();

    page.get_todo_state_signal(todo).set({ isEditing: false });
    await page.toggle_todo_completed(event, todo);
    expect(todo.completed).toBe(true);
    expect(todo.save).toHaveBeenCalledOnce();
  });

  it('refreshes the cursor list after add and batch add', async () => {
    const { page, rxdb } = renderCursorPage();

    page.title.set('cursor task');
    await page.add_todo(new Event('submit'));
    expect(entityMocks.save).toHaveBeenCalledOnce();
    expect(page.title()).toBe('');
    expect(page.resource.refresh).toHaveBeenCalledOnce();

    await page.add_todo(new Event('submit'));
    expect(entityMocks.save).toHaveBeenCalledOnce();

    await page.add_many_todo(2);
    expect(rxdb.entityManager.saveMany).toHaveBeenCalledOnce();
    expect(page.resource.refresh).toHaveBeenCalledTimes(2);
    const [batch] = rxdb.entityManager.saveMany.mock.calls[0];
    expect(batch).toHaveLength(2);
  });

  it('updates cursor query options from tab and sort', () => {
    const { page } = renderCursorPage();
    const todo = stubTodo({ id: 'id-2-0-0-0', updatedAt: new Date(10) });

    page.set_current_tab('active');
    expect(page.$todo_find_by_cursor_options().where.rules).toEqual([
      { field: 'completed', operator: '=', value: false }
    ]);
    expect(page.$todo_count_options().where).toBe(page.$todo_find_by_cursor_options().where);

    page.set_current_tab('completed');
    expect(page.$todo_find_by_cursor_options().where.rules).toEqual([
      { field: 'completed', operator: '=', value: true }
    ]);

    page.toggle_complete_sort();
    expect(page.$completed_sort()).toBe('desc');
    expect(page.trackByFn(0, todo)).toBe(`${todo.id}${todo.updatedAt.getTime()}`);
  });
});
