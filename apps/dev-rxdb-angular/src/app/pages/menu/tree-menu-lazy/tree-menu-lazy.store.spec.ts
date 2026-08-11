import type { HistoryScopeAPI } from '@aiao/rxdb';
import { RxDB } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuDragDropService } from '../services/menu-drag-drop.service';
import { MenuSearchService } from '../services/menu-search.service';
import { PathValidatorService } from '../utils/path-validator';
import { ENTITY_CLASS, HISTORY, TreeMenuLazyStore } from './tree-menu-lazy.store';

interface MenuQueryOptions {
  where?: {
    rules?: Array<{ field: string; value: unknown }>;
  };
}

const roots$ = new BehaviorSubject<MenuLarge[]>([]);
const allMenus$ = new BehaviorSubject<MenuLarge[]>([]);
const childQueries = new Map<string, BehaviorSubject<MenuLarge[]>>();
let failingNodeId: string | null = null;

class TestMenuEntityClass {
  static readonly findAll = vi.fn((options: object): Observable<MenuLarge[]> => {
    const rules = (options as MenuQueryOptions).where?.rules ?? [];
    if (rules.length === 0) return allMenus$;

    const parentId = rules.find(rule => rule.field === 'parentId')?.value;
    if (parentId === null) return roots$;
    if (parentId === failingNodeId) return throwError(() => new Error(`load ${String(parentId)} failed`));

    const key = String(parentId);
    let query = childQueries.get(key);
    if (!query) {
      query = new BehaviorSubject<MenuLarge[]>([]);
      childQueries.set(key, query);
    }
    return query;
  });
}

const makeMenu = (id: string, parentId: string | null, title: string, hasChildren = false, sortOrder = id): MenuLarge =>
  ({
    id,
    parentId,
    title,
    hasChildren,
    sortOrder,
    save: vi.fn(async function (this: MenuLarge) {
      return this;
    }),
    remove: vi.fn(async function (this: MenuLarge) {
      return this;
    })
  }) as unknown as MenuLarge;

const makeStore = () => TestBed.inject(TreeMenuLazyStore<typeof MenuLarge>);

describe('TreeMenuLazyStore', () => {
  beforeEach(() => {
    roots$.next([]);
    allMenus$.next([]);
    childQueries.clear();
    failingNodeId = null;
    TestMenuEntityClass.findAll.mockClear();

    TestBed.configureTestingModule({
      providers: [
        TreeMenuLazyStore,
        MenuSearchService,
        MenuDragDropService,
        PathValidatorService,
        { provide: RxDB, useValue: { entityManager: { saveMany: vi.fn() } } },
        { provide: ENTITY_CLASS, useValue: TestMenuEntityClass },
        { provide: HISTORY, useValue: { undo: vi.fn(), redo: vi.fn() } satisfies Partial<HistoryScopeAPI> }
      ]
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('只订阅根节点，并按 sortOrder 构建初始树', () => {
    const rootB = makeMenu('root-b', null, 'B', false, 'b');
    const rootA = makeMenu('root-a', null, 'A', true, 'a');
    roots$.next([rootB, rootA]);

    const store = makeStore();

    expect(TestMenuEntityClass.findAll).toHaveBeenCalledWith({
      where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: null }] },
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    });
    expect(store.visibleNodes()).toEqual([rootB, rootA]);
    expect(store.treeNodes().map(node => node.menu.id)).toEqual(['root-a', 'root-b']);

    store.setSearchKeyword('不存在');
    expect(store.treeNodes()).toEqual([]);
    expect(store.searchWarning()).toEqual({
      message: '搜索仅限于已加载的节点。展开更多节点以搜索其子节点。',
      loadedCount: 2,
      expandedCount: 0,
      rootCount: 2
    });
  });

  it('展开时订阅子节点，折叠时递归清理数据与订阅', async () => {
    const root = makeMenu('root', null, '根', true);
    const child = makeMenu('child', 'root', '子', true);
    const grandchild = makeMenu('grandchild', 'child', '孙');
    roots$.next([root]);
    childQueries.set('root', new BehaviorSubject([child]));
    childQueries.set('child', new BehaviorSubject([grandchild]));
    const store = makeStore();

    store.expandNode(root.id);
    store.expandNode(child.id);

    expect(store.expandedMenuIds()).toEqual(new Set(['root', 'child']));
    expect(store.treeNodes().map(node => node.menu.id)).toEqual(['root', 'child', 'grandchild']);
    expect(store.loadingNodes()).toEqual(new Set());
    await vi.waitFor(() => expect(root.save).toHaveBeenCalledOnce());

    store.collapseNode(root.id);
    childQueries.get('root')?.next([makeMenu('late', 'root', '迟到')]);

    expect(store.expandedMenuIds()).toEqual(new Set());
    expect(store.visibleNodes()).toEqual([root]);
    expect(store.treeNodes().map(node => node.menu.id)).toEqual(['root']);
  });

  it('选择父节点时建立子节点订阅', () => {
    const root = makeMenu('root', null, '根', true);
    const child = makeMenu('child', root.id, '子');
    roots$.next([root]);
    childQueries.set(root.id, new BehaviorSubject([child]));
    const store = makeStore();

    store.selectParent(root.id);

    expect(store.selectedParentId()).toBe(root.id);
    expect(store.isExpanded(root.id)).toBe(true);
    expect(store.treeNodes().map(node => node.menu.id)).toEqual(['root', 'child']);
  });

  it('记录加载错误，并允许清错后重新订阅', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = makeMenu('root', null, '根', true);
    roots$.next([root]);
    failingNodeId = root.id;
    const store = makeStore();

    store.expandNode(root.id);
    expect(store.loadingNodes()).not.toContain(root.id);
    expect(store.nodeErrors().get(root.id)?.message).toBe('load root failed');

    failingNodeId = null;
    childQueries.set(root.id, new BehaviorSubject([makeMenu('child', root.id, '子')]));
    store.retryLoadChildren(root.id);

    expect(store.nodeErrors().has(root.id)).toBe(false);
    expect(store.treeNodes().map(node => node.menu.id)).toEqual(['root', 'child']);
    consoleError.mockRestore();
  });

  it('全量模式一次构建层级，折叠后恢复根查询', () => {
    const root = makeMenu('root', null, '根', true);
    const child = makeMenu('child', root.id, '子', true);
    const grandchild = makeMenu('grandchild', child.id, '孙');
    roots$.next([root]);
    allMenus$.next([root, child, grandchild]);
    const store = makeStore();

    store.expandAll();

    expect(store.expandedMenuIds()).toEqual(new Set(['root', 'child']));
    expect(store.treeNodes().map(node => node.menu.id)).toEqual(['root', 'child', 'grandchild']);

    store.collapseAll();
    expect(store.expandedMenuIds()).toEqual(new Set());
    expect(store.visibleNodes()).toEqual([root]);
  });

  it('销毁后不再接收根与子节点更新', () => {
    const root = makeMenu('root', null, '根', true);
    roots$.next([root]);
    childQueries.set(root.id, new BehaviorSubject([makeMenu('child', root.id, '子')]));
    const store = makeStore();
    store.expandNode(root.id);

    store.ngOnDestroy();
    roots$.next([makeMenu('new-root', null, '新根')]);
    childQueries.get(root.id)?.next([]);

    expect(store.visibleNodes().map(node => node.id)).toEqual(['root', 'child']);
  });
});
