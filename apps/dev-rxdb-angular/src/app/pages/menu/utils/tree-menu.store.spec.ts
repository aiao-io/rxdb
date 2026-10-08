import { getEntityMutations, SortOrderError, type HistoryScopeAPI, type RxDB } from '@aiao/rxdb';
import { SortableMenuSimple } from '@aiao/rxdb-test/entities';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuDragDropService } from '../services/menu-drag-drop.service';
import { MenuSearchService } from '../services/menu-search.service';
import type { PathValidatorService } from './path-validator';
import { TreeMenuDragDropBase } from './tree-menu.drag-drop';
import { TreeMenuDragDropStore, TreeMenuStore } from './tree-menu.store';

// 假实体没有 EntityStatus，真 getEntityMutations 会读不到；这里让它原样回传入参，断言 `mutations` 收到的分组。
// 失败时退回 parentId 后按剩余差异重算 modified，状态同理给一份空差异
vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  getEntityMutations: vi.fn((options: unknown) => options),
  getEntityStatus: () => ({ patch: {}, modified: false })
}));

/** `treeNodes` 只读 menuResource / expandedMenuIds / searchKeyword，其余构造参数用不到。 */
const makeStore = (menus: SortableMenuSimple[], searchService: MenuSearchService) =>
  new TreeMenuStore<typeof SortableMenuSimple>(
    {} as RxDB,
    {} as PathValidatorService,
    searchService,
    { value: signal(menus) },
    SortableMenuSimple,
    {} as HistoryScopeAPI
  );

let seq = 0;
const makeMenu = (id: string, parentId: string | null, title: string): SortableMenuSimple =>
  ({ id, parentId, title, sortOrder: `a${String(seq++).padStart(3, '0')}` }) as unknown as SortableMenuSimple;

/** 根 + n 个子节点，标题一律不含 "zzz"。 */
const makeTree = (childCount: number): SortableMenuSimple[] => {
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

  it('建树顺序 = 查询顺序', () => {
    // 键的字典序（a < b < z）与查询给出的顺序相反：页面不得再按 sortOrder 排序
    const rootB = { id: 'rb', parentId: null, title: 'B', sortOrder: 'b' } as unknown as SortableMenuSimple;
    const rootA = { id: 'ra', parentId: null, title: 'A', sortOrder: 'a' } as unknown as SortableMenuSimple;
    const childZ = { id: 'cz', parentId: 'rb', title: 'Z', sortOrder: 'z' } as unknown as SortableMenuSimple;
    const childA = { id: 'ca', parentId: 'rb', title: 'a', sortOrder: 'a' } as unknown as SortableMenuSimple;
    const store = makeStore([rootB, rootA, childZ, childA], searchService);
    store.expandedMenuIds.set(new Set(['rb']));

    expect(store.treeNodes().map(node => node.menu.id)).toEqual(['rb', 'cz', 'ca', 'ra']);
  });
});

interface FindAllOptions {
  where?: { rules?: Array<{ field: string; value: unknown }> };
}

class TestMenuEntity {
  static instances: TestMenuEntity[] = [];
  static nextId = 0;
  /** 模拟库里的数据：被删节点 id -> 它的直接子节点 */
  static dbChildren = new Map<string, SortableMenuSimple[]>();
  /** 模拟库里的数据：被删节点 id -> 节点自身 + 全部后代（`findDescendants` 的语义） */
  static dbSubtree = new Map<string, SortableMenuSimple[]>();
  static readonly findAll = vi.fn((options: object) => {
    const parentId = (options as FindAllOptions).where?.rules?.find(rule => rule.field === 'parentId')?.value;
    return of(TestMenuEntity.dbChildren.get(String(parentId)) ?? []);
  });
  static readonly findDescendants = vi.fn((options: { entityId: string }) =>
    of(TestMenuEntity.dbSubtree.get(options.entityId) ?? [])
  );

  id = `new-menu-${String(++TestMenuEntity.nextId)}`;
  parentId: string | null = null;
  title = '';
  /** 页面代码对 `sortOrder` 的每一次赋值都会记在这里（新建不得赋值） */
  sortOrderWrites: unknown[] = [];
  hasChildren = false;
  readonly save = vi.fn(async () => this);
  readonly remove = vi.fn(async () => this);

  set sortOrder(value: unknown) {
    this.sortOrderWrites.push(value);
  }

  constructor() {
    TestMenuEntity.instances.push(this);
  }

  static reset(): void {
    TestMenuEntity.instances = [];
    TestMenuEntity.nextId = 0;
    TestMenuEntity.dbChildren.clear();
    TestMenuEntity.dbSubtree.clear();
    TestMenuEntity.findAll.mockClear();
    TestMenuEntity.findDescendants.mockClear();
  }
}

const makeActionMenu = (id: string, parentId: string | null, title: string, sortOrder = 'a0'): SortableMenuSimple =>
  ({
    id,
    parentId,
    title,
    sortOrder,
    save: vi.fn(async function (this: SortableMenuSimple) {
      return this;
    }),
    remove: vi.fn(async function (this: SortableMenuSimple) {
      return this;
    })
  }) as unknown as SortableMenuSimple;

const makeActionStore = (
  menus: SortableMenuSimple[],
  conflict: { hasConflict: boolean; conflictPath?: string } = { hasConflict: false }
) => {
  const removeMany = vi.fn(async (menus: SortableMenuSimple[]) => {
    void menus;
  });
  const saveMany = vi.fn(async (menus: SortableMenuSimple[]) => {
    void menus;
  });
  const mutations = vi.fn(async (options: unknown) => {
    void options;
  });
  const entityManager = {
    mutations,
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
  const store = new TreeMenuStore<typeof SortableMenuSimple>(
    { entityManager } as unknown as RxDB,
    pathValidator as unknown as PathValidatorService,
    new MenuSearchService(),
    { value: signal(menus) },
    TestMenuEntity as unknown as typeof SortableMenuSimple,
    history as unknown as HistoryScopeAPI
  );

  return { entityManager, history, pathValidator, store };
};

describe('TreeMenuStore actions', () => {
  beforeEach(() => TestMenuEntity.reset());

  it('根菜单冲突时不写入，成功时保存并展开新节点', async () => {
    const conflict = { hasConflict: true, conflictPath: '/已存在' };
    const { pathValidator, store } = makeActionStore([], conflict);

    expect(await store.addRootMenu('已存在')).toBe(false);

    expect(store.pathConflictWarning()).toBe(conflict);
    expect(TestMenuEntity.instances).toHaveLength(0);

    conflict.hasConflict = false;
    expect(await store.addRootMenu('新根节点')).toBe(true);

    const [created] = TestMenuEntity.instances;
    expect(pathValidator.checkPathConflict).toHaveBeenLastCalledWith('新根节点', null, []);
    expect(created.title).toBe('新根节点');
    expect(created.save).toHaveBeenCalledOnce();
    expect(store.expandedMenuIds()).toContain(created.id);
  });

  it('新建根 / 子菜单不读兄弟、不赋 sortOrder，由引擎追加到所属组末尾', async () => {
    const root = makeActionMenu('root', null, '根', 'a0');
    const sibling = makeActionMenu('sibling', 'root', '兄弟', 'a1');
    const { store } = makeActionStore([root, sibling]);

    await store.addRootMenu('新根');
    store.selectParent(root.id);
    await store.addChildMenu('新子');

    const [newRoot, newChild] = TestMenuEntity.instances;
    expect(newRoot.sortOrderWrites).toEqual([]);
    expect(newChild.sortOrderWrites).toEqual([]);
    expect(newChild.parentId).toBe(root.id);
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
    TestMenuEntity.dbChildren.set('root', [child]);
    TestMenuEntity.dbSubtree.set('root', [root, child]);
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

  describe('删除读库里的子节点，不看页面已加载的节点', () => {
    it('页面没加载子节点（懒加载折叠）时，库里有子节点也要弹对话框而不是直接 remove()', async () => {
      const folded = makeActionMenu('folded', null, '折叠的节点');
      const unloadedA = makeActionMenu('a', 'folded', 'A');
      const unloadedB = makeActionMenu('b', 'folded', 'B');
      TestMenuEntity.dbChildren.set('folded', [unloadedA, unloadedB]);
      TestMenuEntity.dbSubtree.set('folded', [folded, unloadedA, unloadedB]);
      const { store } = makeActionStore([folded]);

      await store.deleteMenu(folded);

      expect(folded.remove).not.toHaveBeenCalled();
      expect(store.menuToDelete()).toBe(folded);
      expect(store.deleteImpact()).toEqual({ childrenCount: 2, descendantsCount: 2 });
      expect(TestMenuEntity.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: 'folded' }] }
        })
      );
    });

    it('查询不传 orderBy', async () => {
      const folded = makeActionMenu('folded', null, '折叠的节点');
      TestMenuEntity.dbChildren.set('folded', [makeActionMenu('a', 'folded', 'A')]);
      TestMenuEntity.dbSubtree.set('folded', [folded]);
      const { store } = makeActionStore([folded]);

      await store.deleteMenu(folded);

      expect(TestMenuEntity.findAll).toHaveBeenCalledOnce();
      expect(TestMenuEntity.findAll.mock.calls[0]?.[0]).not.toHaveProperty('orderBy');
    });

    it('库里没有子节点（页面却有过期的子节点）时直接 remove()', async () => {
      const leaf = makeActionMenu('leaf', null, '叶');
      const stale = makeActionMenu('stale', 'leaf', '过期');
      const { store } = makeActionStore([leaf, stale]);

      await store.deleteMenu(leaf);

      expect(leaf.remove).toHaveBeenCalledOnce();
      expect(store.menuToDelete()).toBeNull();
    });

    it('级联删除的子孙集合取自库的 findDescendants，而不是页面已加载的节点', async () => {
      const folded = makeActionMenu('folded', null, '折叠的节点');
      const child = makeActionMenu('child', 'folded', '子');
      const grandchild = makeActionMenu('grandchild', 'child', '孙');
      TestMenuEntity.dbChildren.set('folded', [child]);
      TestMenuEntity.dbSubtree.set('folded', [folded, child, grandchild]);
      const { entityManager, store } = makeActionStore([folded]);

      await store.deleteMenu(folded);
      await store.executeCascadeDelete();

      expect(TestMenuEntity.findDescendants).toHaveBeenCalledWith({ entityId: 'folded' });
      expect(entityManager.removeMany).toHaveBeenCalledWith([folded, child, grandchild]);
      expect(store.menuToDelete()).toBeNull();
    });

    it('关闭对话框后影响统计清零', async () => {
      const folded = makeActionMenu('folded', null, '折叠的节点');
      const child = makeActionMenu('child', 'folded', '子');
      TestMenuEntity.dbChildren.set('folded', [child]);
      TestMenuEntity.dbSubtree.set('folded', [folded, child]);
      const { store } = makeActionStore([folded]);

      await store.deleteMenu(folded);
      store.cancelDelete();

      expect(store.menuToDelete()).toBeNull();
      expect(store.deleteImpact()).toEqual({ childrenCount: 0, descendantsCount: 0 });
    });
  });

  describe('删除并提升子节点（缺陷二）', () => {
    it('子节点取自库，只改 parentId，一次 mutations 同时保存子节点并删除被删节点', async () => {
      const grandparent = makeActionMenu('g', null, '祖父');
      const parent = makeActionMenu('p', 'g', '父');
      // 页面只加载了祖父与父：子节点在折叠的分支里，menuResource 里没有
      const c1 = makeActionMenu('c1', 'p', 'c1', 'k1');
      const c2 = makeActionMenu('c2', 'p', 'c2', 'k2');
      TestMenuEntity.dbChildren.set('p', [c1, c2]);
      TestMenuEntity.dbSubtree.set('p', [parent, c1, c2]);
      const { entityManager, store } = makeActionStore([grandparent, parent]);
      const sortOrderWrites: string[] = [];
      for (const child of [c1, c2]) {
        let key = child.sortOrder;
        Object.defineProperty(child, 'sortOrder', {
          get: () => key,
          set: (value: string) => {
            sortOrderWrites.push(value);
            key = value;
          }
        });
      }

      await store.deleteMenu(parent);
      await store.executePromoteChildrenDelete();

      expect(entityManager.mutations).toHaveBeenCalledOnce();
      expect(getEntityMutations).toHaveBeenCalledWith({ needSaveEntities: [c1, c2], needRemoveEntities: [parent] });
      expect(c1.parentId).toBe('g');
      expect(c2.parentId).toBe('g');
      expect(sortOrderWrites).toEqual([]);
      expect(c1.save).not.toHaveBeenCalled();
      expect(store.menuToDelete()).toBeNull();
    });

    it('被删节点是根节点时，子节点提升为根（parentId 置 null）', async () => {
      const root = makeActionMenu('root', null, '根');
      const child = makeActionMenu('child', 'root', '子');
      TestMenuEntity.dbChildren.set('root', [child]);
      TestMenuEntity.dbSubtree.set('root', [root, child]);
      const { entityManager, store } = makeActionStore([root]);

      await store.deleteMenu(root);
      await store.executePromoteChildrenDelete();

      expect(child.parentId).toBeNull();
      expect(entityManager.mutations).toHaveBeenCalledOnce();
    });

    it('提交失败时错误原样抛给页面，共享实例上的 parentId 退回原值', async () => {
      const root = makeActionMenu('root', null, '根');
      const child = makeActionMenu('child', 'root', '子');
      TestMenuEntity.dbChildren.set('root', [child]);
      TestMenuEntity.dbSubtree.set('root', [root, child]);
      const { entityManager, store } = makeActionStore([root]);
      entityManager.mutations.mockRejectedValueOnce(new Error('唯一约束'));

      await store.deleteMenu(root);
      await expect(store.executePromoteChildrenDelete()).rejects.toThrow('唯一约束');

      expect(child.parentId).toBe('root');
    });
  });

  it('批量添加：一次 saveMany，节点不带 sortOrder，也不读页面已加载的根节点', async () => {
    const root = makeActionMenu('root', null, '已有根', 'a0');
    const { entityManager, store } = makeActionStore([root]);

    await store.add_many_menu(25);

    expect(entityManager.saveMany).toHaveBeenCalledOnce();
    const saved = entityManager.saveMany.mock.calls[0]?.[0] as unknown as TestMenuEntity[];
    expect(saved).toHaveLength(25);
    expect(saved.every(menu => menu.sortOrderWrites.length === 0)).toBe(true);
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

/** 拖放用例的行：只有 id / parentId / title，顺序即查询顺序。 */
const dragMenu = (id: string, parentId: string | null, title = id): SortableMenuSimple =>
  ({ id, parentId, title, sortOrder: id }) as unknown as SortableMenuSimple;

/** 目标行的矩形：高 90，上三分之一 [0,30)、中间 [30,60]、下三分之一 (60,90]。 */
const ROW = { top: 0, height: 90 } as DOMRect;
const BEFORE = 5;
const INTO = 45;
const AFTER = 85;

const makeDragStore = (menus: SortableMenuSimple[]) => {
  const reorder = vi.fn(async (id: string, target: object) => {
    void id;
    void target;
  });
  const getRepository = vi.fn(() => ({ reorder }));
  const history = { undo: vi.fn(), redo: vi.fn() } as unknown as HistoryScopeAPI;
  const store = new TreeMenuDragDropStore<typeof SortableMenuSimple>(
    { entityManager: { getRepository } } as unknown as RxDB,
    {} as PathValidatorService,
    new MenuSearchService(),
    new MenuDragDropService(),
    { value: signal(menus) },
    SortableMenuSimple,
    history
  );
  return { store, reorder, getRepository, history };
};

/** 拖动 `draggedId`，在 `target` 行的 `clientY` 处放下。 */
const dragAndDrop = async (
  store: TreeMenuDragDropStore<typeof SortableMenuSimple>,
  menus: SortableMenuSimple[],
  draggedId: string,
  targetId: string,
  clientY: number
) => {
  const target = menus.find(menu => menu.id === targetId)!;
  store.onDragStart(draggedId);
  store.onDragOver(target, clientY, ROW);
  await store.onDrop(target);
};

describe('TreeMenuDragDropStore 拖放交给引擎', () => {
  const idleState = { draggedItemId: null, targetItemId: null, dropMode: null, isValidTarget: false };

  it('前后放置的邻居取自组的完整序列，不取搜索过滤后的可见行', async () => {
    const menus = [dragMenu('A', null, 'alpha'), dragMenu('B', null, 'beta'), dragMenu('X', null, 'xalpha')];
    const { store, reorder } = makeDragStore(menus);
    // 搜索 "alpha" 隐藏 B：可见行只有 A、X
    store.setSearchKeyword('alpha');
    expect(store.treeNodes().map(node => node.menu.id)).toEqual(['A', 'X']);

    await dragAndDrop(store, menus, 'X', 'A', AFTER);

    expect(reorder).toHaveBeenCalledExactlyOnceWith('X', { prevId: 'A', nextId: 'B' });
  });

  it('跨父前后放置：邻居取自目标所在组', async () => {
    const menus = [
      dragMenu('P', null),
      dragMenu('p1', 'P'),
      dragMenu('Q', null),
      dragMenu('q1', 'Q'),
      dragMenu('q2', 'Q')
    ];
    const { store, reorder } = makeDragStore(menus);

    await dragAndDrop(store, menus, 'p1', 'q1', AFTER);

    expect(reorder).toHaveBeenCalledExactlyOnceWith('p1', { prevId: 'q1', nextId: 'q2' });
  });

  it('拖进节点：目标为 { group: { parentId } }，成功后展开目标', async () => {
    const menus = [dragMenu('P', null), dragMenu('c1', 'P'), dragMenu('X', null)];
    const { store, reorder } = makeDragStore(menus);

    await dragAndDrop(store, menus, 'X', 'P', INTO);

    expect(reorder).toHaveBeenCalledExactlyOnceWith('X', { group: { parentId: 'P' } });
    expect(store.expandedMenuIds().has('P')).toBe(true);
    expect(store.dragDropState()).toEqual(idleState);
  });

  describe('reject / noop 不调用 reorder', () => {
    it('拖到自己或后代上（前、后、内部）被拒', async () => {
      const menus = [dragMenu('P', null), dragMenu('c', 'P'), dragMenu('g', 'c')];
      const { store, reorder } = makeDragStore(menus);

      for (const targetId of ['P', 'c', 'g']) {
        for (const clientY of [BEFORE, INTO, AFTER]) {
          store.onDragStart('P');
          const result = store.onDragOver(
            menus.find(menu => menu.id === targetId)!,
            clientY,
            ROW
          );
          expect(result.isValid).toBe(false);
          await store.onDrop(menus.find(menu => menu.id === targetId)!);
        }
      }

      expect(reorder).not.toHaveBeenCalled();
      expect(store.dragDropState()).toEqual(idleState);
    });

    it('原位放下与拖进已是末尾的当前父节点都零写入', async () => {
      const menus = [dragMenu('A', null), dragMenu('B', null), dragMenu('C', null), dragMenu('c1', 'C')];
      const { store, reorder } = makeDragStore(menus);

      // C 本来就在 B 之后、也在根组末尾
      await dragAndDrop(store, menus, 'C', 'B', AFTER);
      await dragAndDrop(store, menus, 'A', 'B', BEFORE);

      expect(reorder).not.toHaveBeenCalled();
      expect(store.dragDropState()).toEqual(idleState);
    });
  });

  describe('拖放失败进页内提示', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      TestBed.resetTestingModule();
    });

    const makeHost = (menus: SortableMenuSimple[]) => {
      TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'browser' }] });
      const parts = makeDragStore(menus);
      class Host extends TreeMenuDragDropBase<typeof SortableMenuSimple> {
        constructor() {
          super({ value: signal(menus) }, SortableMenuSimple, parts.history, parts.store);
        }
      }
      const host = TestBed.runInInjectionContext(() => new Host());
      return { host, ...parts };
    };

    const dropEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as DragEvent;

    it('reorder 抛 SortOrderError 时页内提示「拖放失败：…」、拖拽状态复位、不弹窗', async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal('alert', alertSpy);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const menus = [dragMenu('A', null), dragMenu('B', null), dragMenu('X', null)];
      const { host, store, reorder } = makeHost(menus);
      const error = new SortOrderError('SortableMenuSimple', 'staleTarget', '邻居已不相邻');
      reorder.mockRejectedValueOnce(error);

      store.onDragStart('X');
      store.onDragOver(menus[0], AFTER, ROW);
      await host.onDrop(dropEvent, menus[0]);

      expect(host.writeError()).toBe(`拖放失败：${error.message}`);
      expect(host.writeError()).toContain('邻居已不相邻');
      expect(store.dragDropState()).toEqual(idleState);
      expect(alertSpy).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('下一次拖放清空错误', async () => {
      const menus = [dragMenu('A', null), dragMenu('B', null), dragMenu('X', null)];
      const { host, store, reorder } = makeHost(menus);
      reorder.mockRejectedValueOnce(new SortOrderError('SortableMenuSimple', 'staleTarget', '邻居已不相邻'));

      store.onDragStart('X');
      store.onDragOver(menus[0], AFTER, ROW);
      await host.onDrop(dropEvent, menus[0]);
      expect(host.writeError()).not.toBeNull();

      store.onDragStart('X');
      store.onDragOver(menus[0], AFTER, ROW);
      await host.onDrop(dropEvent, menus[0]);

      expect(host.writeError()).toBeNull();
      expect(reorder).toHaveBeenCalledTimes(2);
    });
  });
});
