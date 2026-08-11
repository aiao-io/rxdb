import { RxDB } from '@aiao/rxdb';
import { FileNode, MenuLarge, MenuSimple } from '@aiao/rxdb-test/entities';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const angularMocks = vi.hoisted(() => ({
  useFindAll: vi.fn(() => ({ value: () => [] })),
  useAction: vi.fn((action: (...args: never[]) => unknown) => action)
}));

vi.mock('@aiao/rxdb-angular', () => angularMocks);

import FileManagerSimplePage from './file-manager/file-manager-simple/file-manager-simple.page';
import FileManagerVirtualPage from './file-manager/file-manager-virtual/file-manager-virtual.page';
import { FileDragDropService } from './file-manager/services/file-drag-drop.service';
import { FilePathValidatorService } from './file-manager/services/file-path-validator.service';
import { MenuDragDropService } from './menu/services/menu-drag-drop.service';
import { MenuSearchService } from './menu/services/menu-search.service';
import MenuTreeLazyPage from './menu/tree-menu-lazy/tree-menu-lazy.page';
import { HISTORY, TreeMenuLazyStore } from './menu/tree-menu-lazy/tree-menu-lazy.store';
import MenuTreeSimplePage from './menu/tree-menu-simple/tree-menu-simple.page';
import MenuTreeVirtualPage from './menu/tree-menu-virtual/tree-menu-virtual.page';

const makeRxdb = () => ({
  versionManager: { history: vi.fn(() => ({ undo: vi.fn(), redo: vi.fn() })) },
  entityManager: { saveMany: vi.fn(), removeMany: vi.fn() }
});

const configure = (rxdb: ReturnType<typeof makeRxdb>) => {
  TestBed.configureTestingModule({
    providers: [
      { provide: RxDB, useValue: rxdb },
      { provide: PLATFORM_ID, useValue: 'browser' },
      MenuSearchService,
      MenuDragDropService,
      FileDragDropService,
      FilePathValidatorService
    ]
  });
};

describe('tree demo page construction contracts', () => {
  beforeEach(() => {
    angularMocks.useFindAll.mockClear();
    angularMocks.useAction.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('simple/virtual 菜单页都复用统一的 store 基类契约', () => {
    const rxdb = makeRxdb();
    configure(rxdb);

    const simple = TestBed.runInInjectionContext(() => new MenuTreeSimplePage());
    const virtual = TestBed.runInInjectionContext(() => new MenuTreeVirtualPage());
    const menu = { id: 'menu-1', parentId: null, title: '菜单', sortOrder: 'a0' } as unknown as MenuSimple;

    simple.toggleExpand(menu);
    simple.selectParent(menu.id);
    simple.cancelSelectParent();
    simple.clearSearch();
    virtual.onDragEnd();
    virtual.onDragOver({ preventDefault: vi.fn() } as unknown as DragEvent, menu as unknown as MenuLarge);

    expect(simple.trackByMenuId(0, { menu, level: 0, isExpanded: false, hasChildren: false })).toBe(menu.id);
    expect(virtual.itemSize).toBe(44);
    expect(rxdb.versionManager.history).toHaveBeenCalledWith(MenuSimple);
    expect(rxdb.versionManager.history).toHaveBeenCalledWith(MenuLarge);
  });

  it('懒加载菜单页只通过懒 store 控制展开、错误与销毁', () => {
    const rxdb = makeRxdb();
    const history = { undo: vi.fn(), redo: vi.fn() };
    const historyFactory = vi.fn(() => history);
    const expandedMenuIds = signal(new Set<string>());
    const loadingNodes = signal(new Set<string>());
    const nodeErrors = signal(new Map<string, Error>());
    const lazyStore = {
      visibleNodes: signal<MenuLarge[]>([]),
      expandedMenuIds,
      editingMenuId: signal<string | null>(null),
      selectedParentId: signal<string | null>(null),
      menuToDelete: signal<MenuLarge | null>(null),
      pathConflictWarning: signal(null),
      searchKeyword: signal(''),
      matchedMenuIds: signal(new Set<string>()),
      deleteImpact: signal({ childrenCount: 0, descendantsCount: 0 }),
      expandedCount: signal(0),
      isAllExpanded: signal(false),
      treeNodes: signal([]),
      dragDropState: signal({
        draggedItemId: null,
        targetItemId: null,
        dropMode: null,
        isValidTarget: false
      }),
      highlightedMenuIds: signal(new Set<string>()),
      loadingNodes,
      nodeErrors,
      isExpanded: vi.fn((id: string) => expandedMenuIds().has(id)),
      expandNode: vi.fn((id: string) => expandedMenuIds.set(new Set([id]))),
      collapseNode: vi.fn((id: string) =>
        expandedMenuIds.update(set => {
          const next = new Set(set);
          next.delete(id);
          return next;
        })
      ),
      expandAll: vi.fn(),
      collapseAll: vi.fn(),
      retryLoadChildren: vi.fn(),
      ngOnDestroy: vi.fn()
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: RxDB, useValue: rxdb },
        { provide: PLATFORM_ID, useValue: 'browser' },
        MenuSearchService,
        MenuDragDropService,
        { provide: TreeMenuLazyStore, useValue: lazyStore },
        { provide: HISTORY, useFactory: historyFactory }
      ]
    });

    const page = TestBed.runInInjectionContext(() => new MenuTreeLazyPage());
    const menu = { id: 'menu-1', parentId: null, title: '菜单', sortOrder: 'a0' } as unknown as MenuLarge;
    const error = new Error('加载失败');
    loadingNodes.set(new Set([menu.id]));
    nodeErrors.set(new Map([[menu.id, error]]));

    expect(page.store).toBe(lazyStore);
    expect(page.history).toBe(history);
    expect(historyFactory).toHaveBeenCalledOnce();
    expect(rxdb.versionManager.history).not.toHaveBeenCalled();
    page.toggleExpand(menu);
    expect(lazyStore.expandNode).toHaveBeenCalledWith(menu.id);
    expect(page.isNodeLoading(menu.id)).toBe(true);
    expect(page.getNodeError(menu.id)).toBe(error);
    page.retryLoadChildren(menu.id);
    page.toggleExpandAll();
    page.ngOnDestroy();

    expect(lazyStore.retryLoadChildren).toHaveBeenCalledWith(menu.id);
    expect(lazyStore.expandAll).toHaveBeenCalledOnce();
    expect(lazyStore.ngOnDestroy).toHaveBeenCalledOnce();
  });

  it('simple/virtual 文件页覆盖显示名、模式切换和虚拟滚动初始化', () => {
    vi.useFakeTimers();
    const rxdb = makeRxdb();
    configure(rxdb);

    const simple = TestBed.runInInjectionContext(() => new FileManagerSimplePage());
    const virtual = TestBed.runInInjectionContext(() => new FileManagerVirtualPage());
    const folder = { id: 'folder', type: 'folder', name: '文档', extension: null } as unknown as FileNode;
    const plain = { id: 'plain', type: 'file', name: 'README', extension: null } as unknown as FileNode;
    const complete = { id: 'complete', type: 'file', name: 'README.txt', extension: 'txt' } as unknown as FileNode;
    const missing = { id: 'missing', type: 'file', name: 'README', extension: 'txt' } as unknown as FileNode;
    const iconFile = { id: 'icon', type: 'file', name: 'README', extension: '.txt' } as unknown as FileNode;

    expect(simple.getDisplayName(folder)).toBe('文档');
    expect(simple.getDisplayName(plain)).toBe('README');
    expect(simple.getDisplayName(complete)).toBe('README.txt');
    expect(simple.getDisplayName(missing)).toBe('README.txt');
    expect(simple.getFileIconName(iconFile)).toBe('file-text');

    simple.toggleAddingMode();
    expect(simple.$is_adding_file()).toBe(true);
    expect(simple.$new_file_extension()).toBe('.txt');
    expect(simple.isSubmitDisabled()).toBe(true);

    const viewport = {
      scrollTo: vi.fn(),
      getBoundingClientRect: () => ({ top: 0, bottom: 100 }),
      scrollTop: 0,
      scrollHeight: 500,
      clientHeight: 100
    };
    const header = { offsetHeight: 20 };
    Object.defineProperty(virtual, 'scrollViewport', { value: () => ({ nativeElement: viewport }) });
    Object.defineProperty(virtual, 'fullHeader', { value: () => ({ nativeElement: header }) });
    virtual.onScroll({ target: { scrollTop: 30 } } as unknown as Event);
    virtual.scroll_to_top();
    vi.runAllTimers();

    expect(virtual.$show_sticky_header()).toBe(true);
    expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(virtual.$virtual_scroll_ready()).toBe(true);
  });
});
