import type { HistoryScopeAPI } from '@aiao/rxdb';
import { RxDB } from '@aiao/rxdb';
import { SortableMenuLarge } from '@aiao/rxdb-test/entities';
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

const roots$ = new BehaviorSubject<SortableMenuLarge[]>([]);
const allMenus$ = new BehaviorSubject<SortableMenuLarge[]>([]);
const childQueries = new Map<string, BehaviorSubject<SortableMenuLarge[]>>();
const subtrees = new Map<string, SortableMenuLarge[]>();
let failingNodeId: string | null = null;
/** 引擎重排的替身：记录入参，并记下调用瞬间各懒加载查询已被调用的次数 */
const reorder = vi.fn(async (id: string, target: object) => {
  void id;
  void target;
});

class TestMenuEntityClass {
  static readonly findDescendants = vi.fn(
    (options: { entityId: string }): Observable<SortableMenuLarge[]> =>
      new BehaviorSubject(subtrees.get(options.entityId) ?? [])
  );

  static readonly findAll = vi.fn((options: object): Observable<SortableMenuLarge[]> => {
    const rules = (options as MenuQueryOptions).where?.rules ?? [];
    if (rules.length === 0) return allMenus$;

    const parentId = rules.find(rule => rule.field === 'parentId')?.value;
    if (parentId === null) return roots$;
    if (parentId === failingNodeId) return throwError(() => new Error(`load ${String(parentId)} failed`));

    const key = String(parentId);
    let query = childQueries.get(key);
    if (!query) {
      query = new BehaviorSubject<SortableMenuLarge[]>([]);
      childQueries.set(key, query);
    }
    return query;
  });
}

const makeMenu = (
  id: string,
  parentId: string | null,
  title: string,
  hasChildren = false,
  sortOrder = id
): SortableMenuLarge =>
  ({
    id,
    parentId,
    title,
    hasChildren,
    sortOrder,
    save: vi.fn(async function (this: SortableMenuLarge) {
      return this;
    }),
    remove: vi.fn(async function (this: SortableMenuLarge) {
      return this;
    })
  }) as unknown as SortableMenuLarge;

const makeStore = () => TestBed.inject(TreeMenuLazyStore<typeof SortableMenuLarge>);

describe('TreeMenuLazyStore', () => {
  beforeEach(() => {
    roots$.next([]);
    allMenus$.next([]);
    childQueries.clear();
    subtrees.clear();
    failingNodeId = null;
    TestMenuEntityClass.findAll.mockClear();
    TestMenuEntityClass.findDescendants.mockClear();
    reorder.mockReset();

    TestBed.configureTestingModule({
      providers: [
        TreeMenuLazyStore,
        MenuSearchService,
        MenuDragDropService,
        PathValidatorService,
        {
          provide: RxDB,
          useValue: { entityManager: { saveMany: vi.fn(), getRepository: vi.fn(() => ({ reorder })) } }
        },
        { provide: ENTITY_CLASS, useValue: TestMenuEntityClass },
        { provide: HISTORY, useValue: { undo: vi.fn(), redo: vi.fn() } satisfies Partial<HistoryScopeAPI> }
      ]
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('只订阅根节点，并按查询顺序构建初始树', () => {
    // 键的字典序（a < b）与查询给出的顺序相反：页面不得再按 sortOrder 排序
    const rootB = makeMenu('root-b', null, 'B', false, 'b');
    const rootA = makeMenu('root-a', null, 'A', true, 'a');
    roots$.next([rootB, rootA]);

    const store = makeStore();

    expect(TestMenuEntityClass.findAll).toHaveBeenCalledWith({
      where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: null }] }
    });
    expect(store.visibleNodes()).toEqual([rootB, rootA]);
    expect(store.treeNodes().map(node => node.menu.id)).toEqual(['root-b', 'root-a']);

    store.setSearchKeyword('不存在');
    expect(store.treeNodes()).toEqual([]);
    expect(store.searchWarning()).toEqual({
      message: '搜索仅限于已加载的节点。展开更多节点以搜索其子节点。',
      loadedCount: 2,
      expandedCount: 0,
      rootCount: 2
    });
  });

  it('查询不传 orderBy', () => {
    const root = makeMenu('root', null, '根', true);
    roots$.next([root]);
    const store = makeStore();

    store.expandNode(root.id);
    store.expandAll();

    // 根查询、子节点查询、展开全部三处
    expect(TestMenuEntityClass.findAll).toHaveBeenCalledTimes(3);
    for (const [options] of TestMenuEntityClass.findAll.mock.calls) {
      expect(options).not.toHaveProperty('orderBy');
    }
  });

  it('子节点建树顺序 = 查询顺序', () => {
    const root = makeMenu('root', null, '根', true);
    roots$.next([root]);
    childQueries.set(
      'root',
      new BehaviorSubject([makeMenu('z', 'root', 'Z', false, 'z'), makeMenu('a', 'root', 'A', false, 'a')])
    );
    const store = makeStore();

    store.expandNode(root.id);

    expect(store.treeNodes().map(node => node.menu.id)).toEqual(['root', 'z', 'a']);
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

  it('节点折叠、子节点未加载时 deleteMenu 打开删除对话框，而不是直接 remove()', async () => {
    const root = makeMenu('root', null, '根', true);
    const child = makeMenu('child', 'root', '子');
    roots$.next([root]);
    // 库里有子节点，但节点没展开，子查询没订阅，visibleNodes 里只有根
    childQueries.set('root', new BehaviorSubject([child]));
    subtrees.set('root', [root, child]);
    const store = makeStore();
    expect(store.visibleNodes()).toEqual([root]);

    await store.deleteMenu(root);

    expect(root.remove).not.toHaveBeenCalled();
    expect(store.menuToDelete()).toBe(root);
    expect(store.deleteImpact()).toEqual({ childrenCount: 1, descendantsCount: 1 });
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

  describe('拖放交给引擎', () => {
    const ROW = { top: 0, height: 90 } as DOMRect;
    const INTO = 45;
    const AFTER = 85;

    it('拖进折叠且子节点未加载的节点：目标为 { group }，不读子节点', async () => {
      const parent = makeMenu('P', null, 'P', true);
      const dragged = makeMenu('X', null, 'X');
      roots$.next([parent, dragged]);
      const store = makeStore();
      // 拖放前只有根查询；P 折叠，没有订阅它的子节点
      const callsBeforeReorder: number[] = [];
      reorder.mockImplementation(async () => {
        callsBeforeReorder.push(TestMenuEntityClass.findAll.mock.calls.length);
      });

      store.onDragStart(dragged.id);
      store.onDragOver(parent, INTO, ROW);
      await store.onDrop(parent);

      expect(reorder).toHaveBeenCalledExactlyOnceWith('X', { group: { parentId: 'P' } });
      expect(callsBeforeReorder).toEqual([1]);
      expect(store.dragDropState()).toEqual({
        draggedItemId: null,
        targetItemId: null,
        dropMode: null,
        isValidTarget: false
      });
    });

    it('拖进后展开目标并订阅其子节点，新节点随订阅回流', async () => {
      const parent = makeMenu('P', null, 'P', true);
      const dragged = makeMenu('X', null, 'X');
      roots$.next([parent, dragged]);
      const store = makeStore();

      store.onDragStart(dragged.id);
      store.onDragOver(parent, INTO, ROW);
      await store.onDrop(parent);

      expect(store.isExpanded('P')).toBe(true);
      expect(TestMenuEntityClass.findAll).toHaveBeenCalledTimes(2);
    });

    it('前后放置的邻居取自该组已加载的完整序列', async () => {
      const root = makeMenu('R', null, 'R', true);
      const c1 = makeMenu('c1', 'R', 'c1');
      const c2 = makeMenu('c2', 'R', 'c2');
      const x = makeMenu('X', null, 'X');
      roots$.next([root, x]);
      childQueries.set('R', new BehaviorSubject([c1, c2]));
      const store = makeStore();
      store.expandNode(root.id);

      store.onDragStart(x.id);
      store.onDragOver(c1, AFTER, ROW);
      await store.onDrop(c1);

      expect(reorder).toHaveBeenCalledExactlyOnceWith('X', { prevId: 'c1', nextId: 'c2' });
    });

    it('拖放被拒时不调用 reorder，也不展开目标', async () => {
      const parent = makeMenu('P', null, 'P', true);
      roots$.next([parent]);
      const store = makeStore();

      store.onDragStart(parent.id);
      store.onDragOver(parent, INTO, ROW);
      await store.onDrop(parent);

      expect(reorder).not.toHaveBeenCalled();
      expect(store.isExpanded('P')).toBe(false);
    });
  });
});
