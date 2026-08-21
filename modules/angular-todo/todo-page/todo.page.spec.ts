import { getEntityStatus, RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { ScrollDispatcher } from '@angular/cdk/scrolling';
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TodoPage } from './todo.page';

const angularMocks = vi.hoisted(() => ({ useFindAll: vi.fn() }));
const entityMocks = vi.hoisted(() => {
  const save = vi.fn().mockResolvedValue(undefined);
  class MockTodo {
    completed = false;
    save = save;
    title = '';
    constructor(data: { title?: string } = {}) {
      this.title = data.title ?? '';
    }
  }
  return { MockTodo, save };
});

vi.mock('@aiao/rxdb-angular', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-angular')>();
  return { ...actual, useFindAll: angularMocks.useFindAll };
});

vi.mock('@aiao/rxdb-test/entities', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-test/entities')>();
  return { ...actual, Todo: entityMocks.MockTodo };
});

vi.mock('@aiao/rxdb', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb')>();
  return {
    ...actual,
    getEntityStatus: vi.fn(() => ({ fingerprint: 'todo-fp' }))
  };
});

function createResource<T>(value: T) {
  return {
    error: signal<Error | undefined>(undefined),
    hasValue: signal(true),
    isEmpty: signal(Array.isArray(value) ? value.length === 0 : value == null),
    isLoading: signal(false),
    value: signal(value)
  };
}

function stubTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    title: 'buy milk',
    completed: false,
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
    ...overrides
  } as unknown as Todo;
}

function renderTodoPage(todos: Todo[] = []) {
  const scrolled$ = new Subject<void>();
  const history = {
    histories$: of([]),
    redo: vi.fn(),
    redoCount$: of(0),
    type: 'entity' as const,
    undo: vi.fn(),
    undoCount$: of(0)
  };
  const rxdb = {
    entityManager: {
      // 签名挂在泛型上而不是形参上：`toHaveBeenCalledWith` / `mock.calls[0]?.[0]` 的断言要它，形参名不要
      removeMany: vi.fn<(entities: Todo[]) => Promise<void>>(() => Promise.resolve()),
      saveMany: vi.fn<(entities: Todo[]) => Promise<void>>(() => Promise.resolve())
    },
    versionManager: {
      history: vi.fn(() => history)
    }
  };
  angularMocks.useFindAll.mockReturnValue(createResource(todos));
  TestBed.overrideComponent(TodoPage, {
    set: {
      imports: [],
      schemas: [NO_ERRORS_SCHEMA],
      styleUrls: [],
      styles: [],
      template: `<main #mainContainer><div #fullHeader>header</div></main>`
    }
  });
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: RxDB, useValue: rxdb },
      { provide: ScrollDispatcher, useValue: { scrolled: () => scrolled$ } }
    ]
  });
  const fixture = TestBed.createComponent(TodoPage);
  fixture.detectChanges();
  return { fixture, history, page: fixture.componentInstance, rxdb, scrolled$ };
}

describe('TodoPage', () => {
  beforeEach(() => {
    angularMocks.useFindAll.mockReset();
    entityMocks.save.mockClear();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('stops updating the sticky header after destroy', () => {
    const { fixture, page, scrolled$ } = renderTodoPage();
    const header = page.fullHeaderRef()?.nativeElement;
    const main = page.mainContainerRef()?.nativeElement;
    if (!header || !main) throw new Error('sticky header refs missing');

    Object.defineProperty(header, 'offsetTop', { configurable: true, value: 0 });
    Object.defineProperty(header, 'offsetHeight', { configurable: true, value: 40 });
    Object.defineProperty(main, 'scrollTop', { configurable: true, value: 0, writable: true });

    scrolled$.next();
    expect(page.$show_sticky_header()).toBe(false);

    main.scrollTop = 80;
    scrolled$.next();
    expect(page.$show_sticky_header()).toBe(true);

    fixture.destroy();
    main.scrollTop = 0;
    scrolled$.next();
    expect(page.$show_sticky_header()).toBe(true);
  });

  it('reuses the same edit-state signal per todo', () => {
    const { page } = renderTodoPage();
    const todo = stubTodo();

    const first = page.get_todo_state_signal(todo);
    const second = page.get_todo_state_signal(todo);

    expect(first).toBe(second);
    expect(first().isEditing).toBe(false);
  });

  it('enters and cancels edit without saving', () => {
    const { page } = renderTodoPage();
    const todo = stubTodo();
    const host = document.createElement('div');

    page.todo_edit(new Event('dblclick'), host, todo);
    expect(page.get_todo_state_signal(todo)().isEditing).toBe(true);

    page.todo_cancel_edit(todo);
    expect(page.get_todo_state_signal(todo)().isEditing).toBe(false);
    expect(todo.reset).toHaveBeenCalledOnce();
    expect(todo.save).not.toHaveBeenCalled();
  });

  it('saves an editing todo and ignores a second save', async () => {
    const { page } = renderTodoPage();
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

  it('removes a todo and skips toggle while editing', async () => {
    const { page } = renderTodoPage();
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

  it('clears completed todos and toggles remaining ones', async () => {
    const active = stubTodo({ title: 'active' });
    const done = stubTodo({ title: 'done', completed: true });
    const { page, rxdb } = renderTodoPage([active, done]);

    await page.clear_completed();
    expect(rxdb.entityManager.removeMany).toHaveBeenCalledWith([done]);

    await page.toggle_all();
    expect(active.completed).toBe(true);
    expect(rxdb.entityManager.saveMany).toHaveBeenCalledWith([active]);
  });

  it('creates a single todo and a batch through entityManager', async () => {
    const { page, rxdb } = renderTodoPage();

    page.title.set('new task');
    await page.add_todo(new Event('submit'));
    expect(entityMocks.save).toHaveBeenCalledOnce();
    expect(page.title()).toBe('');

    await page.add_todo(new Event('submit'));
    expect(entityMocks.save).toHaveBeenCalledOnce();

    await page.add_many_todo(3);
    expect(rxdb.entityManager.saveMany).toHaveBeenCalledOnce();
    expect(rxdb.entityManager.saveMany.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it('switches tabs, sort, history and undo/redo', () => {
    const { page, history } = renderTodoPage();

    page.set_current_tab('active');
    expect(page.$todo_query_options().where.rules).toEqual([{ field: 'completed', operator: '=', value: false }]);

    page.set_current_tab('completed');
    expect(page.$todo_query_options().where.rules).toEqual([{ field: 'completed', operator: '=', value: true }]);

    page.toggle_complete_sort();
    expect(page.$completed_sort()).toBe('desc');
    page.toggle_complete_sort();
    expect(page.$completed_sort()).toBe('asc');

    page.toggle_history();
    expect(page.$show_history()).toBe(false);

    page.undo();
    page.redo();
    expect(history.undo).toHaveBeenCalledOnce();
    expect(history.redo).toHaveBeenCalledOnce();
    expect(page.trackByFn(0, stubTodo())).toBe(getEntityStatus(stubTodo()).fingerprint);
  });

  it('scrolls to top before switching a sticky tab and load_more is a no-op stub', () => {
    const { page } = renderTodoPage();
    const main = page.mainContainerRef()?.nativeElement;
    if (!main) throw new Error('main container missing');
    const scrollTo = vi.fn();
    Object.defineProperty(main, 'scrollTo', { configurable: true, value: scrollTo });

    page.sticky_tab_click('completed');
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 0 });
    expect(page.$current_tab()).toBe('all');

    page.load_more();
    page.load_more();
    expect(page.$current_tab()).toBe('all');
  });
});
