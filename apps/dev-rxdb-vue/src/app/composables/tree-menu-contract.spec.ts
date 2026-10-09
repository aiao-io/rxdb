import type { RxDB } from '@aiao/rxdb';
import { SortableMenuLarge, SortableMenuSimple } from '@aiao/rxdb-test/entities';
import { of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, ref } from 'vue';
import { buildTreeMenuNodes } from '../utils/tree-menu';
import { useDragDrop } from './useDragDrop';
import { useTreeMenuLazyStore } from './useTreeMenuLazyStore';
import { useTreeMenuStore } from './useTreeMenuStore';
import { useTreeMenuVirtualStore } from './useTreeMenuVirtualStore';

const queries = vi.hoisted(() => ({ findAll: vi.fn() }));

// 实体类的静态 findAll 由运行时注入，这里挂上替身以便断言默认数据源发出的查询
vi.mock('@aiao/rxdb-test/entities', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-test/entities')>();
  Object.assign(actual.SortableMenuLarge, { findAll: queries.findAll });
  return { ...actual };
});

const ROOT_ID = '00000000-0000-4000-8000-000000000001';
const NESTED_ID = '00000000-0000-4000-8000-000000000002';
const TARGET_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_ID = '00000000-0000-4000-8000-000000000004';

interface TestMenu {
  id: string;
  parentId: string | null;
  sortOrder: string;
  title: string;
}

const menus: TestMenu[] = [
  { id: ROOT_ID, parentId: null, sortOrder: 'a', title: 'Root' },
  { id: NESTED_ID, parentId: ROOT_ID, sortOrder: 'a', title: 'Nested' },
  { id: TARGET_ID, parentId: NESTED_ID, sortOrder: 'a', title: 'Target Menu' },
  { id: OTHER_ID, parentId: ROOT_ID, sortOrder: 'b', title: 'Other' }
];

const asMenuSimple = (menu: TestMenu): SortableMenuSimple => Object.assign({} as SortableMenuSimple, menu);
const asMenuLarge = (menu: TestMenu): SortableMenuLarge =>
  Object.assign({ hasChildren: false } as SortableMenuLarge, menu);

/** 在组件作用域里创建懒加载 store（onMounted 订阅根节点），返回 store 与卸载函数。 */
const mountLazyStore = (rxdb: RxDB, dataSource?: Parameters<typeof useTreeMenuLazyStore>[1]) => {
  const stores: Array<ReturnType<typeof useTreeMenuLazyStore>> = [];
  const app = createApp({
    setup() {
      stores.push(useTreeMenuLazyStore(rxdb, dataSource));
      return () => null;
    }
  });
  app.mount(document.createElement('div'));
  const store = stores.at(0);
  if (!store) throw new Error('lazy store creation failed');
  return { store, unmount: () => app.unmount() };
};

describe('tree menu contracts', () => {
  it('returns a match and every ancestor without unrelated branches', () => {
    const nodes = buildTreeMenuNodes(menus, new Set(), 'target');

    expect(nodes.map(node => node.menu.id)).toEqual([ROOT_ID, NESTED_ID, TARGET_ID]);
    expect(nodes.map(node => node.level)).toEqual([0, 1, 2]);
  });

  it('keeps simple and virtual stores on the same search contract', () => {
    const simple = useTreeMenuStore(ref(menus.map(asMenuSimple)), {} as RxDB);
    const virtual = useTreeMenuVirtualStore(ref(menus.map(asMenuLarge)), {} as RxDB);

    simple.setSearchKeyword('target');
    virtual.setSearchKeyword('target');

    expect(simple.treeNodes.value.map(node => node.menu.id)).toEqual([ROOT_ID, NESTED_ID, TARGET_ID]);
    expect(virtual.treeNodes.value.map(node => node.menu.id)).toEqual([ROOT_ID, NESTED_ID, TARGET_ID]);
  });

  it('searches the complete repository in the lazy store, including unloaded descendants', () => {
    const dataSource = {
      observeAllMenus: () => of(menus.map(asMenuLarge)),
      observeChildMenus: () => of([]),
      observeRootMenus: () => of([])
    };
    const { store, unmount } = mountLazyStore({} as RxDB, dataSource);

    store.setSearchKeyword('target');

    expect(store.treeNodes.value.map(node => node.menu.id)).toEqual([ROOT_ID, NESTED_ID, TARGET_ID]);
    unmount();
  });

  describe('懒加载 store：搜索出的未加载节点可拖放', () => {
    // 根组 P、X 已加载；P 从未展开，它的子节点 H（不匹配）与 Q（匹配）只出现在搜索全集里
    const P = asMenuLarge({ id: 'P', parentId: null, sortOrder: 'a0', title: '父节点' });
    const X = asMenuLarge({ id: 'X', parentId: null, sortOrder: 'a1', title: '命中 X' });
    const H = asMenuLarge({ id: 'H', parentId: 'P', sortOrder: 'a0', title: '隐藏兄弟' });
    const Q = asMenuLarge({ id: 'Q', parentId: 'P', sortOrder: 'a1', title: '命中 Q' });
    const ROW = { top: 0, height: 90 } as DOMRect;
    const BEFORE = 10;

    const mountSearching = () => {
      const dataSource = {
        observeAllMenus: () => of([P, X, H, Q]),
        observeChildMenus: () => of([]),
        observeRootMenus: () => of([P, X])
      };
      const mounted = mountLazyStore({} as RxDB, dataSource);
      const reorder = vi.fn(async () => undefined);
      const dragDrop = useDragDrop<SortableMenuLarge>(mounted.store.dragNodes, {
        repository: { reorder },
        guardWrite: mounted.store.guardWrite,
        groupIds: mounted.store.siblingIds
      });
      mounted.store.setSearchKeyword('命中');
      return { ...mounted, dragDrop, reorder };
    };

    it('拖到搜索出来的 Q 前面：组序列含未匹配的 H，悬停不抛错，放下交给引擎', async () => {
      const { store, dragDrop, reorder, unmount } = mountSearching();
      expect(store.treeNodes.value.map(node => node.menu.id)).toEqual(['P', 'Q', 'X']);
      expect(store.hasLoadedChildren('P')).toBe(false);

      dragDrop.onDragStart('X');
      expect(dragDrop.onDragOver(Q, BEFORE, ROW)).toEqual({ isValid: true, dropMode: 'before' });
      await dragDrop.onDrop(Q);

      expect(reorder).toHaveBeenCalledExactlyOnceWith('X', { prevId: 'H', nextId: 'Q' });
      expect(store.writeError.value).toBeNull();
      unmount();
    });

    it('从未加载的搜索结果 Q 发起拖动：源节点可解析', async () => {
      const { dragDrop, reorder, unmount } = mountSearching();

      dragDrop.onDragStart('Q');
      dragDrop.onDragOver(X, BEFORE, ROW);
      await dragDrop.onDrop(X);

      expect(reorder).toHaveBeenCalledExactlyOnceWith('Q', { prevId: 'P', nextId: 'X' });
      unmount();
    });

    it('清空搜索后回到已加载节点与已加载的组', () => {
      const { store, unmount } = mountSearching();
      expect(store.siblingIds('P')).toEqual(['H', 'Q']);

      store.setSearchKeyword('');

      expect(store.dragNodes.value.map(menu => menu.id)).toEqual(['P', 'X']);
      expect(store.siblingIds(null)).toEqual(['P', 'X']);
      expect(store.siblingIds('P')).toEqual([]);
      unmount();
    });
  });
});

describe('树菜单显示顺序 = 查询顺序', () => {
  beforeEach(() => {
    queries.findAll.mockReset();
  });

  it('建树顺序 = 查询顺序', () => {
    // 查询给出的组内顺序与 sortOrder 字典序相反：建树不得再按 sortOrder 重排
    const reversed: TestMenu[] = [
      { id: ROOT_ID, parentId: null, sortOrder: 'b', title: 'Root' },
      { id: OTHER_ID, parentId: ROOT_ID, sortOrder: 'b', title: 'Other' },
      { id: NESTED_ID, parentId: ROOT_ID, sortOrder: 'a', title: 'Nested' },
      { id: '00000000-0000-4000-8000-000000000005', parentId: null, sortOrder: 'a', title: 'Root 2' }
    ];

    const nodes = buildTreeMenuNodes(reversed, new Set([ROOT_ID]), '');

    expect(nodes.map(node => node.menu.title)).toEqual(['Root', 'Other', 'Nested', 'Root 2']);
  });

  it('建树顺序 = 查询顺序：懒加载 store 在根查询重新发射新顺序后跟着换位', () => {
    const roots$ = new Subject<SortableMenuLarge[]>();
    const dataSource = {
      observeAllMenus: () => of([]),
      observeChildMenus: () => of([]),
      observeRootMenus: () => roots$
    };
    const a = asMenuLarge({ id: ROOT_ID, parentId: null, sortOrder: 'a', title: 'A' });
    const b = asMenuLarge({ id: OTHER_ID, parentId: null, sortOrder: 'b', title: 'B' });
    const { store, unmount } = mountLazyStore({} as RxDB, dataSource);

    roots$.next([a, b]);
    expect(store.treeNodes.value.map(node => node.menu.title)).toEqual(['A', 'B']);

    // 拖放后根查询按新的手动顺序重新发射：A 的键没变也不影响，顺序以查询为准
    roots$.next([b, a]);
    expect(store.treeNodes.value.map(node => node.menu.title)).toEqual(['B', 'A']);
    expect(store.siblingIds(null)).toEqual([OTHER_ID, ROOT_ID]);
    unmount();
  });

  it('查询不传 orderBy', () => {
    const findAll = queries.findAll.mockReturnValue(of([]));
    const parent = Object.assign(asMenuLarge({ id: ROOT_ID, parentId: null, sortOrder: 'a', title: 'Root' }), {
      hasChildren: true
    });
    findAll.mockReturnValueOnce(of([parent]));

    const { store, unmount } = mountLazyStore({} as RxDB);
    store.toggleExpand(ROOT_ID);

    // 根查询 + 子节点查询
    expect(findAll).toHaveBeenCalledTimes(2);
    for (const [query] of findAll.mock.calls) {
      expect(query).not.toHaveProperty('orderBy');
    }
    unmount();
  });
});
