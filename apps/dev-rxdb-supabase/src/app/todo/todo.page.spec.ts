import { RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe } from '@angular/common';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
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

function createDeferred() {
  let resolvePromise: (() => void) | undefined;
  let rejectPromise: ((reason: unknown) => void) | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    reject: (reason: unknown) => rejectPromise!(reason),
    resolve: () => resolvePromise!()
  };
}

function getButton(fixture: ComponentFixture<TodoPage>, label: string): HTMLButtonElement {
  const button = fixture.nativeElement.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
  if (!button) throw new Error(`Missing ${label} button`);
  return button;
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
    redo: vi.fn(),
    redoCount$: of(0),
    type: 'entity' as const,
    undo: vi.fn(),
    undoCount$: of(0)
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
      imports: [AsyncPipe, FormsModule, LucideDynamicIcon, ScrollingModule],
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

/** 视口宽度断点的替身：`matches` 为真表示 ≥ 768px */
function stubViewport(wide: boolean) {
  const mediaQuery = {
    matches: wide,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  } as unknown as MediaQueryList;
  vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery);
}

describe('TodoPage remote sync controls', () => {
  beforeEach(() => angularMocks.useFindAll.mockReset());

  it('keeps Pull and Push disabled in the zero-config local demo', () => {
    const { fixture, pull, push } = renderTodoPage();

    const pullButton = getButton(fixture, 'Pull');
    const pushButton = getButton(fixture, 'Push');

    expect(pullButton.disabled).toBe(true);
    expect(pushButton.disabled).toBe(true);
    expect(pullButton.title).toContain('纯本地模式');
    pullButton.click();
    pushButton.click();
    expect(pull).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('访客：远端连着，但 Todo 的日志同步只对登录身份开放，Pull 与 Push 不可用，提示匿名登录', () => {
    const { fixture, pull, session } = renderTodoPage({ connected: true, canSyncTodo: false });

    const pullButton = getButton(fixture, 'Pull');
    expect(pullButton.disabled).toBe(true);
    expect(getButton(fixture, 'Push').disabled).toBe(true);
    expect(pullButton.title).toContain('登录');
    pullButton.click();
    expect(pull).not.toHaveBeenCalled();

    const notice = fixture.nativeElement.querySelector('[data-testid="todo-visitor-notice"]') as HTMLElement | null;
    expect(notice?.textContent).toContain('只存在本机');
    (notice?.querySelector('button') as HTMLButtonElement).click();
    expect(session.switchTo).toHaveBeenCalledWith('anonymous');
  });

  it('disables both sync controls until a successful Push settles', async () => {
    const operation = createDeferred();
    const { fixture, push } = renderTodoPage({ connected: true, push: () => operation.promise });

    const pending = fixture.componentInstance.push();
    fixture.detectChanges();

    expect(push).toHaveBeenCalledOnce();
    expect(getButton(fixture, 'Pull').disabled).toBe(true);
    expect(getButton(fixture, 'Push').disabled).toBe(true);

    operation.resolve();
    await pending;
    fixture.detectChanges();

    expect(getButton(fixture, 'Pull').disabled).toBe(false);
    expect(getButton(fixture, 'Push').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('renders a rejected Pull and restores the controls', async () => {
    const { fixture, pull } = renderTodoPage({
      connected: true,
      pull: () => Promise.reject(new Error('remote unavailable'))
    });

    await fixture.componentInstance.pull();
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;
    expect(pull).toHaveBeenCalledOnce();
    expect(alert?.textContent).toContain('同步失败：remote unavailable');
    expect(getButton(fixture, 'Pull').disabled).toBe(false);
    expect(getButton(fixture, 'Push').disabled).toBe(false);
  });
});

describe('TodoPage 交互', () => {
  beforeEach(() => angularMocks.useFindAll.mockReset());
  afterEach(() => vi.restoreAllMocks());

  // 无参 history() 是整库作用域：撤销会撤到页面外的实体（比如商品目录），与侧栏、计数对不上
  it('撤销 / 重做走 Todo 作用域的历史，与计数、侧栏同一份', () => {
    const { fixture, history, rxdb } = renderTodoPage();

    fixture.componentInstance.undo();
    fixture.componentInstance.redo();

    expect(history.undo).toHaveBeenCalledOnce();
    expect(history.redo).toHaveBeenCalledOnce();
    expect(rxdb.versionManager.history.mock.calls).toEqual([[Todo]]);
  });

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

  it('Todo 同步不可用时（本地模式、访客）不显示被拒推送面板', () => {
    const { fixture } = renderTodoPage({ connected: true, canSyncTodo: false });

    expect(fixture.nativeElement.querySelector('app-sync-rejections-panel')).toBeNull();
  });

  it('登录身份连着远端时显示被拒推送面板', () => {
    const { fixture } = renderTodoPage({ connected: true });

    expect(fixture.nativeElement.querySelector('app-sync-rejections-panel')).not.toBeNull();
  });

  it('窄屏默认收起操作历史侧栏：它是浮层，打开就挡住列表', () => {
    stubViewport(false);

    const { fixture } = renderTodoPage();

    expect(fixture.componentInstance.$show_history()).toBe(false);
  });

  it('宽屏默认展开操作历史侧栏', () => {
    stubViewport(true);

    const { fixture } = renderTodoPage();

    expect(fixture.componentInstance.$show_history()).toBe(true);
  });

  it('推送进行中只在 Push 上显示加载指示，结束后收起', async () => {
    const operation = createDeferred();
    const { fixture } = renderTodoPage({ connected: true, push: () => operation.promise });

    const pending = fixture.componentInstance.push();
    fixture.detectChanges();

    expect(getButton(fixture, 'Push').querySelector('.loading')).not.toBeNull();
    expect(getButton(fixture, 'Pull').querySelector('.loading')).toBeNull();

    operation.resolve();
    await pending;
    fixture.detectChanges();

    expect(getButton(fixture, 'Push').querySelector('.loading')).toBeNull();
  });

  it('标签页标出当前选中的那个（aria-selected）', () => {
    const { fixture } = renderTodoPage();

    fixture.componentInstance.set_current_tab('active');
    fixture.detectChanges();

    const selected = fixture.nativeElement.querySelectorAll('[role="tab"][aria-selected="true"]');
    expect(Array.from(selected, (tab: Element) => tab.textContent?.trim())).toEqual(['进行中']);
  });
});
