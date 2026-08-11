import type { HistoryScopeAPI, RxDB } from '@aiao/rxdb';
import { MenuSimple } from '@aiao/rxdb-test/entities';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuSearchService } from '../services/menu-search.service';
import type { PathValidatorService } from './path-validator';
import { TreeMenuStore } from './tree-menu.store';

/** `treeNodes` 只读 menuResource / expandedMenuIds / searchKeyword，其余构造参数用不到。 */
const makeStore = (menus: MenuSimple[], searchService: MenuSearchService) =>
  new TreeMenuStore<typeof MenuSimple>(
    {} as RxDB,
    {} as PathValidatorService,
    searchService,
    { value: signal(menus) },
    MenuSimple,
    {} as HistoryScopeAPI
  );

let seq = 0;
const makeMenu = (id: string, parentId: string | null, title: string): MenuSimple =>
  ({ id, parentId, title, sortOrder: `a${String(seq++).padStart(3, '0')}` }) as unknown as MenuSimple;

/** 根 + n 个子节点，标题一律不含 "zzz"。 */
const makeTree = (childCount: number): MenuSimple[] => {
  seq = 0;
  const root = makeMenu('root', null, '根节点');
  const children = Array.from({ length: childCount }, (_, i) =>
    makeMenu(`c${String(i)}`, 'root', `子节点 ${String(i)}`)
  );
  return [root, ...children];
};

describe('TreeMenuStore.treeNodes', () => {
  let searchService: MenuSearchService;

  beforeEach(() => {
    searchService = new MenuSearchService();
  });

  describe('搜索无结果（P1-1）', () => {
    it('关键字无匹配时必须显示空树，而不是回退成全量', () => {
      const store = makeStore(makeTree(3), searchService);
      store.expandedMenuIds.set(new Set(['root']));

      store.setSearchKeyword('zzz-绝不匹配');

      expect(store.treeNodes()).toEqual([]);
    });

    it('关键字有匹配时只显示匹配项及其祖先', () => {
      const store = makeStore(makeTree(3), searchService);

      store.setSearchKeyword('子节点 1');

      expect(store.treeNodes().map(node => node.menu.id)).toEqual(['root', 'c1']);
    });

    it('关键字为空时显示全量（展开的部分）', () => {
      const store = makeStore(makeTree(3), searchService);
      store.expandedMenuIds.set(new Set(['root']));

      store.setSearchKeyword('');

      expect(store.treeNodes()).toHaveLength(4);
    });
  });

  describe('搜索态的索引重建（P0-3）', () => {
    /**
     * `shouldShowMenu` 每次调用都会重建整张 `childrenByParentId`，
     * `expandMatchedAncestors` 每次调用都会重建整张 `menuById`。
     * 放在逐节点循环里 → O(n²)。这里断言它们**与节点数无关**。
     */
    it('两个全量索引方法的调用次数不得随节点数增长', () => {
      const shouldShow = vi.spyOn(searchService, 'shouldShowMenu');
      const expandAncestors = vi.spyOn(searchService, 'expandMatchedAncestors');

      const small = makeStore(makeTree(5), searchService);
      small.setSearchKeyword('子节点');
      small.treeNodes();
      const smallCalls = shouldShow.mock.calls.length + expandAncestors.mock.calls.length;

      shouldShow.mockClear();
      expandAncestors.mockClear();

      const large = makeStore(makeTree(50), searchService);
      large.setSearchKeyword('子节点');
      large.treeNodes();
      const largeCalls = shouldShow.mock.calls.length + expandAncestors.mock.calls.length;

      expect(largeCalls).toBe(smallCalls);
    });
  });
});

class TestMenuEntity {
  static instances: TestMenuEntity[] = [];
  static nextId = 0;

  id = `new-menu-${String(++TestMenuEntity.nextId)}`;
  parentId: string | null = null;
  title = '';
  sortOrder: string | null = null;
  hasChildren = false;
  readonly save = vi.fn(async () => this);
  readonly remove = vi.fn(async () => this);

  constructor() {
    TestMenuEntity.instances.push(this);
  }

  static reset(): void {
    TestMenuEntity.instances = [];
    TestMenuEntity.nextId = 0;
  }
}

const makeActionMenu = (id: string, parentId: string | null, title: string, sortOrder = 'a0'): MenuSimple =>
  ({
    id,
    parentId,
    title,
    sortOrder,
    save: vi.fn(async function (this: MenuSimple) {
      return this;
    }),
    remove: vi.fn(async function (this: MenuSimple) {
      return this;
    })
  }) as unknown as MenuSimple;

const makeActionStore = (
  menus: MenuSimple[],
  conflict: { hasConflict: boolean; conflictPath?: string } = { hasConflict: false }
) => {
  const removeMany = vi.fn(async (menus: MenuSimple[]) => {
    void menus;
  });
  const saveMany = vi.fn(async (menus: MenuSimple[]) => {
    void menus;
  });
  const entityManager = {
    removeMany,
    saveMany
  };
  const pathValidator = {
    checkPathConflict: vi.fn(() => conflict)
  };
  const history = {
    undo: vi.fn(async () => undefined),
    redo: vi.fn(async () => undefined)
  };
  const store = new TreeMenuStore<typeof MenuSimple>(
    { entityManager } as unknown as RxDB,
    pathValidator as unknown as PathValidatorService,
    new MenuSearchService(),
    { value: signal(menus) },
    TestMenuEntity as unknown as typeof MenuSimple,
    history as unknown as HistoryScopeAPI
  );

  return { entityManager, history, pathValidator, store };
};

describe('TreeMenuStore actions', () => {
  beforeEach(() => TestMenuEntity.reset());

  it('根菜单冲突时不写入，成功时保存并展开新节点', async () => {
    const conflict = { hasConflict: true, conflictPath: '/已存在' };
    const { pathValidator, store } = makeActionStore([], conflict);

    await store.addRootMenu('已存在');

    expect(store.pathConflictWarning()).toBe(conflict);
    expect(TestMenuEntity.instances).toHaveLength(0);

    conflict.hasConflict = false;
    await store.addRootMenu('新根节点');

    const [created] = TestMenuEntity.instances;
    expect(pathValidator.checkPathConflict).toHaveBeenLastCalledWith('新根节点', null, []);
    expect(created.title).toBe('新根节点');
    expect(created.save).toHaveBeenCalledOnce();
    expect(store.expandedMenuIds()).toContain(created.id);
  });

  it('子菜单沿选中父节点保存，并在成功后退出选择态', async () => {
    const root = makeActionMenu('root', null, '根');
    const { store } = makeActionStore([root]);

    store.selectParent(root.id);
    await store.addChildMenu('子节点');

    const [created] = TestMenuEntity.instances;
    expect(created.parentId).toBe(root.id);
    expect(created.title).toBe('子节点');
    expect(created.save).toHaveBeenCalledOnce();
    expect(store.selectedParentId()).toBeNull();
  });

  it('编辑、叶子删除、级联删除和批量删除都委托给正确的持久化边界', async () => {
    const root = makeActionMenu('root', null, '根');
    const child = makeActionMenu('child', 'root', '子');
    const leaf = makeActionMenu('leaf', null, '叶');
    const { entityManager, store } = makeActionStore([root, child, leaf]);

    store.startEdit(leaf.id);
    await store.saveEdit('已编辑');
    expect(leaf.title).toBe('已编辑');
    expect(leaf.save).toHaveBeenCalledOnce();
    expect(store.editingMenuId()).toBeNull();

    await store.deleteMenu(leaf);
    expect(leaf.remove).toHaveBeenCalledOnce();

    await store.deleteMenu(root);
    expect(store.menuToDelete()).toBe(root);
    expect(store.deleteImpact()).toEqual({ childrenCount: 1, descendantsCount: 1 });

    await store.executeCascadeDelete();
    expect(entityManager.removeMany).toHaveBeenCalledWith([root, child]);
    expect(store.menuToDelete()).toBeNull();

    await store.add_many_menu(3);
    expect(entityManager.saveMany).toHaveBeenCalledWith(expect.any(Array));
    expect(entityManager.saveMany.mock.calls[0]?.[0]).toHaveLength(3);

    await store.deleteAllMenus();
    expect(entityManager.removeMany).toHaveBeenLastCalledWith([root, child, leaf]);
  });

  it('展开、选择、警告和历史操作保持独立状态', () => {
    const root = makeActionMenu('root', null, '根');
    const child = makeActionMenu('child', 'root', '子');
    const { history, store } = makeActionStore([root, child]);

    expect(store.isAllExpanded()).toBe(false);
    store.toggleExpandAll();
    expect(store.expandedMenuIds()).toEqual(new Set(['root']));
    expect(store.isAllExpanded()).toBe(true);
    store.toggleExpandAll();
    expect(store.expandedMenuIds()).toEqual(new Set());

    store.toggleExpand(root);
    store.selectParent(root.id);
    store.cancelSelectParent();
    store.pathConflictWarning.set({ hasConflict: true });
    store.clearPathWarning();
    store.undo();
    store.redo();

    expect(store.expandedMenuIds()).toEqual(new Set(['root']));
    expect(store.selectedParentId()).toBeNull();
    expect(store.pathConflictWarning()).toBeNull();
    expect(history.undo).toHaveBeenCalledOnce();
    expect(history.redo).toHaveBeenCalledOnce();
  });
});
