import { RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import { PageWorkbench } from '../page-workbench';
import { RemoteSyncState } from '../remote-sync-state';
import TodoPage from './todo.page';
import todoPageTemplate from './todo.page.html?raw';

const angularMocks = vi.hoisted(() => ({ useFindAll: vi.fn() }));

vi.mock('@aiao/rxdb-angular', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-angular')>();
  return { ...actual, useFindAll: angularMocks.useFindAll };
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

function renderTodoPage(
  options: {
    connected?: boolean;
    /** 当前身份能不能同步 Todo：访客不能（日志同步只对登录身份开放） */
    canSyncTodo?: boolean;
    pull?: () => Promise<unknown>;
    push?: () => Promise<unknown>;
  } = {}
) {
  const history = {
    histories$: of([]),
    redo: vi.fn(() => Promise.resolve()),
    redoCount$: of(0),
    type: 'repository' as const,
    undo: vi.fn(() => Promise.resolve()),
    undoCount$: of(1),
    undoBarrier$: of(null)
  };
  const pull = vi.fn(options.pull ?? (() => Promise.resolve()));
  const push = vi.fn(options.push ?? (() => Promise.resolve()));
  const rxdb = {
    entityManager: {
      removeMany: vi.fn(() => Promise.resolve()),
      saveMany: vi.fn(() => Promise.resolve())
    },
    // 自 US-025 阶段 D 起推拉入口归 `@aiao/rxdb-plugin-sync`（`rxdb.syncManager`），
    // 而撤销重做与两个待推/待拉计数仍是历史插件的（`rxdb.versionManager`）。
    // 替身照着这条边界分成两半，页面读错哪一边都会当场红。
    syncManager: {
      pull,
      push
    },
    versionManager: {
      history: vi.fn(() => history),
      pullableCount$: of(1),
      pushableCount$: of(1)
    }
  };
  const remoteSync = new RemoteSyncState();
  remoteSync.markConnected(options.connected ?? false);
  angularMocks.useFindAll.mockReturnValue(createResource([]));
  TestBed.overrideComponent(TodoPage, {
    set: {
      imports: [FormsModule, LucideDynamicIcon, ScrollingModule],
      schemas: [NO_ERRORS_SCHEMA],
      styleUrls: [],
      styles: [],
      template: todoPageTemplate
    }
  });
  const session = { canSyncTodo: options.canSyncTodo ?? true, $switching: signal(false), switchTo: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: RxDB, useValue: rxdb },
      { provide: RemoteSyncState, useValue: remoteSync },
      { provide: DemoSession, useValue: session }
    ]
  });
  const fixture = TestBed.createComponent(TodoPage);
  fixture.detectChanges();
  return { fixture, history, pull, push, rxdb, session };
}

describe('TodoPage：顶栏登记（epic-016）', () => {
  beforeEach(() => angularMocks.useFindAll.mockReset());

  // 无参 history() 是整库作用域：撤销会撤到页面外的实体（商品、订单）
  it('登记标题与 Todo 作用域；撤销、重做走 history(Todo)', async () => {
    const { history, rxdb } = renderTodoPage();
    const page = TestBed.inject(PageWorkbench).current();

    expect(page).toMatchObject({ title: 'Todo', scopeLabel: '本页：Todo' });
    expect(rxdb.versionManager.history.mock.calls).toEqual([[Todo]]);
    expect(page?.history).toBe(history);
    await page?.undo?.run();
    await page?.redo?.run();
    expect(history.undo).toHaveBeenCalledOnce();
    expect(history.redo).toHaveBeenCalledOnce();
  });

  it('本地模式不登记推拉；连着远端时登记整机的推拉', async () => {
    const local = renderTodoPage();
    expect(TestBed.inject(PageWorkbench).current()).toMatchObject({ push: null, pull: null });
    local.fixture.destroy();
    TestBed.resetTestingModule();

    const { pull } = renderTodoPage({ connected: true });
    await TestBed.inject(PageWorkbench).current()?.pull?.run();
    expect(pull).toHaveBeenCalledWith({ fetchAll: true });
  });

  it('离开页面时注销', () => {
    const { fixture } = renderTodoPage();

    fixture.destroy();

    expect(TestBed.inject(PageWorkbench).current()).toBeNull();
  });

  it('页面里不再有自己的推拉、撤销按钮、历史侧栏与被拒清单：它们都在顶栏和右侧面板', () => {
    const { fixture } = renderTodoPage({ connected: true });
    const element = fixture.nativeElement as HTMLElement;

    for (const label of ['Pull', 'Push', 'Undo', 'Redo', '历史记录']) {
      expect(element.querySelector(`button[aria-label="${label}"]`)).toBeNull();
    }
    expect(element.querySelector('ao-history-sidebar')).toBeNull();
    expect(element.querySelector('app-sync-rejections-panel')).toBeNull();
  });

  it('访客：远端连着时提示 Todo 只存本机，可以一键匿名登录', () => {
    const { fixture, session } = renderTodoPage({ connected: true, canSyncTodo: false });

    const notice = fixture.nativeElement.querySelector('[data-testid="todo-visitor-notice"]') as HTMLElement | null;
    expect(notice?.textContent).toContain('只存在本机');
    (notice?.querySelector('button') as HTMLButtonElement).click();
    expect(session.switchTo).toHaveBeenCalledWith('anonymous');
  });
});

describe('TodoPage 交互', () => {
  beforeEach(() => angularMocks.useFindAll.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('批量添加：点选一项之后收起菜单，避免停在打开状态挡住列表', () => {
    const { fixture } = renderTodoPage();
    const addMany = vi
      .spyOn(fixture.componentInstance, 'add_many_todo')
      .mockReturnValue(new Promise<void>(() => undefined));
    const dropdown = fixture.nativeElement.querySelector('[data-testid="todo-batch-dropdown"]') as HTMLDetailsElement;
    dropdown.open = true;

    (fixture.nativeElement.querySelector('[data-testid="todo-batch-option-10"]') as HTMLButtonElement).click();

    expect(dropdown.open).toBe(false);
    expect(addMany).toHaveBeenCalledWith(10);
    expect(fixture.componentInstance.add_many.isPending()).toBe(true);
  });

  it('标签页标出当前选中的那个（aria-selected）', () => {
    const { fixture } = renderTodoPage();

    fixture.componentInstance.set_current_tab('active');
    fixture.detectChanges();

    const selected = fixture.nativeElement.querySelectorAll('[role="tab"][aria-selected="true"]');
    expect(Array.from(selected, (tab: Element) => tab.textContent?.trim())).toEqual(['进行中']);
  });
});
