import { RxDB, UUID, type RxDBEntityId } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { generateKeyBetween } from '@aiao/utils';
import { firstValueFrom, type Observable, type Subscription } from 'rxjs';
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue';
import { generateBatchMenus } from '../utils/menu-utils';
import { buildTreeMenuNodes, type TreeMenuNode } from '../utils/tree-menu';
import { formatErrorMessage, useToast } from './useToast';

export interface TreeMenuLazyDataSource {
  observeAllMenus(): Observable<MenuLarge[]>;
  observeChildMenus(parentId: RxDBEntityId): Observable<MenuLarge[]>;
  observeRootMenus(): Observable<MenuLarge[]>;
}

const defaultDataSource: TreeMenuLazyDataSource = {
  observeAllMenus: () => MenuLarge.findAll({ where: { combinator: 'and', rules: [] } }),
  observeChildMenus: parentId =>
    MenuLarge.findAll({
      where: {
        combinator: 'and',
        rules: [{ field: 'parentId', operator: '=', value: parentId as UUID }]
      },
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    }),
  observeRootMenus: () =>
    MenuLarge.findAll({
      where: {
        combinator: 'and',
        rules: [{ field: 'parentId', operator: '=', value: null }]
      },
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    })
};

export interface TreeMenuLazyNode extends TreeMenuNode<MenuLarge> {
  isLoading: boolean;
}

export function useTreeMenuLazyStore(rxdb: RxDB, dataSource: TreeMenuLazyDataSource = defaultDataSource) {
  const nodesMap = ref<Map<RxDBEntityId, MenuLarge>>(new Map());
  const expandedIds = ref<Set<RxDBEntityId>>(new Set());
  const loadingIds = ref<Set<RxDBEntityId>>(new Set());
  const rootIds = ref<RxDBEntityId[]>([]);
  const childrenMap = ref<Map<RxDBEntityId, RxDBEntityId[]>>(new Map()); // parentId -> childIds
  const editingId = ref<RxDBEntityId | null>(null);
  const selectedParentId = ref<RxDBEntityId | null>(null);
  const searchKeyword = ref('');
  const searchMenus = ref<MenuLarge[]>([]);
  const menuToDelete = ref<MenuLarge | null>(null);
  const fetchAllMenus = (): Promise<MenuLarge[]> => firstValueFrom(dataSource.observeAllMenus());

  // 存储活跃的订阅，用于清理
  const subscriptions = new Map<RxDBEntityId | string, { unsubscribe: () => void }>();
  let searchSubscription: Subscription | null = null;

  const subscribeToRoot = () => {
    const rootQuery$ = dataSource.observeRootMenus();

    const subscription = rootQuery$.subscribe({
      next: (roots: MenuLarge[]) => {
        const newMap = new Map(nodesMap.value);
        // 更新或添加根节点
        roots.forEach(root => {
          newMap.set(root.id, root);
        });
        // 删除不再是根节点的节点（可能被移动了）
        Array.from(nodesMap.value.keys()).forEach(id => {
          const node = nodesMap.value.get(id);
          if (node?.parentId === null && !roots.find(r => r.id === id)) {
            newMap.delete(id);
          }
        });
        nodesMap.value = newMap;

        rootIds.value = roots.map(r => r.id);
      },
      error: (error: unknown) => {
        useToast().error(formatErrorMessage('菜单根目录加载失败', error));
      }
    });

    if (subscriptions.has('ROOT')) {
      subscriptions.get('ROOT')?.unsubscribe();
    }
    subscriptions.set('ROOT', subscription);
    return subscription;
  };

  onMounted(() => {
    subscribeToRoot();
  });

  watch(
    searchKeyword,
    keyword => {
      searchSubscription?.unsubscribe();
      searchSubscription = null;
      searchMenus.value = [];
      if (!keyword) return;

      searchSubscription = dataSource.observeAllMenus().subscribe({
        next: menus => (searchMenus.value = menus),
        error: (error: unknown) => useToast().error(formatErrorMessage('搜索菜单失败', error))
      });
    },
    { flush: 'sync' }
  );

  const treeNodes = computed<TreeMenuLazyNode[]>(() => {
    const menus = searchKeyword.value ? searchMenus.value : Array.from(nodesMap.value.values());
    return buildTreeMenuNodes(
      menus,
      expandedIds.value,
      searchKeyword.value,
      (menu, children) => menu.hasChildren ?? children.length > 0
    ).map(node => ({ ...node, isLoading: loadingIds.value.has(node.menu.id) }));
  });

  const toggleExpand = async (id: RxDBEntityId) => {
    const menu = nodesMap.value.get(id);
    if (!menu) return;

    // 检查是否有子节点
    const hasChildren = menu.hasChildren ?? false;
    if (!hasChildren) return;

    if (expandedIds.value.has(id)) {
      // 折叠：清理订阅和数据
      const subscription = subscriptions.get(id);
      if (subscription) {
        subscription.unsubscribe();
        subscriptions.delete(id);
      }

      const newExpanded = new Set(expandedIds.value);
      newExpanded.delete(id);
      expandedIds.value = newExpanded;

      const descendantIds: RxDBEntityId[] = [];
      const collectDescendants = (parentId: RxDBEntityId): void => {
        for (const childId of childrenMap.value.get(parentId) ?? []) {
          descendantIds.push(childId);
          collectDescendants(childId);
        }
      };
      collectDescendants(id);

      for (const descendantId of descendantIds) {
        subscriptions.get(descendantId)?.unsubscribe();
        subscriptions.delete(descendantId);
      }

      const newChildrenMap = new Map(childrenMap.value);
      newChildrenMap.delete(id);
      descendantIds.forEach(descendantId => newChildrenMap.delete(descendantId));
      childrenMap.value = newChildrenMap;

      const newNodesMap = new Map(nodesMap.value);
      descendantIds.forEach(descendantId => newNodesMap.delete(descendantId));
      nodesMap.value = newNodesMap;
    } else {
      // 展开：创建订阅
      const newExpanded = new Set(expandedIds.value);
      newExpanded.add(id);
      expandedIds.value = newExpanded;

      // 开始加载
      loadingIds.value.add(id);

      // 创建响应式订阅
      const childQuery$ = dataSource.observeChildMenus(id);

      const subscription = childQuery$.subscribe({
        next: (children: MenuLarge[]) => {
          const newNodesMap = new Map(nodesMap.value);
          children.forEach(child => {
            newNodesMap.set(child.id, child);
          });
          nodesMap.value = newNodesMap;

          const childIds = children.map(c => c.id);
          const newChildrenMap = new Map(childrenMap.value);
          newChildrenMap.set(id, childIds);
          childrenMap.value = newChildrenMap;

          // 停止加载状态
          loadingIds.value.delete(id);
        },
        error: (error: unknown) => {
          useToast().error(formatErrorMessage(`加载子菜单失败 (${id})`, error));
          loadingIds.value.delete(id);
        }
      });

      subscriptions.set(id, subscription);
    }
  };

  const startEdit = (id: RxDBEntityId) => (editingId.value = id);
  const cancelEdit = () => (editingId.value = null);

  const addRoot = async (title: string) => {
    const lastRootId = rootIds.value[rootIds.value.length - 1];
    const lastRoot = lastRootId ? nodesMap.value.get(lastRootId) : null;
    const sortOrder = generateKeyBetween(lastRoot?.sortOrder || null, null);

    const menu = new MenuLarge({ title, sortOrder, parentId: null });
    await menu.save();

    // Update local state
    const newNodesMap = new Map(nodesMap.value);
    newNodesMap.set(menu.id, menu);
    nodesMap.value = newNodesMap;

    rootIds.value = [...rootIds.value, menu.id];
  };

  const addChild = async (parent: MenuLarge, title: string) => {
    const siblings = await firstValueFrom(dataSource.observeChildMenus(parent.id));
    const sortOrder = generateKeyBetween(siblings.at(-1)?.sortOrder ?? null, null);

    const menu = new MenuLarge({ title, sortOrder });
    menu.parentId = parent.id;
    await menu.save();

    // Update local state
    const newNodesMap = new Map(nodesMap.value);
    newNodesMap.set(menu.id, menu);
    nodesMap.value = newNodesMap;

    const newChildrenMap = new Map(childrenMap.value);
    const current = newChildrenMap.get(parent.id) || [];
    newChildrenMap.set(parent.id, [...current, menu.id]);
    childrenMap.value = newChildrenMap;

    // Ensure expanded
    if (!expandedIds.value.has(parent.id)) {
      const newExpanded = new Set(expandedIds.value);
      newExpanded.add(parent.id);
      expandedIds.value = newExpanded;
    }
  };

  const deleteMenu = async (menu: MenuLarge): Promise<void> => {
    // 检查是否有子节点（使用 hasChildren 属性）
    const hasChildren = menu.hasChildren ?? false;

    if (!hasChildren) {
      // 没有子节点，直接删除。
      //
      // VUE-FRESH-01：早先是 `void menu.remove()` —— 既不 await 也不 catch，
      // 删除失败会成为未处理 rejection，调用方既看不到错误、也无法判断删除是否完成。
      // 同文件里其它删除路径（批量删除子树）本来就是 `await menu.remove()`，
      // 只有叶子这一条分叉了。失败统一走页面既有的 toast 通道。
      try {
        await menu.remove();
      } catch (error: unknown) {
        useToast().error(formatErrorMessage('删除菜单失败', error));
      }
    } else {
      // 有子节点，显示删除对话框
      menuToDelete.value = menu;
    }
  };

  const cancelDelete = () => {
    menuToDelete.value = null;
  };

  const executeCascadeDelete = async () => {
    const selected = menuToDelete.value;
    if (!selected) return;

    const allMenus = await fetchAllMenus();
    const childrenByParent = new Map<RxDBEntityId, MenuLarge[]>();
    for (const menu of allMenus) {
      if (!menu.parentId) continue;
      const children = childrenByParent.get(menu.parentId) ?? [];
      children.push(menu);
      childrenByParent.set(menu.parentId, children);
    }

    const menusToRemove: MenuLarge[] = [];
    const collect = (menu: MenuLarge): void => {
      for (const child of childrenByParent.get(menu.id) ?? []) collect(child);
      menusToRemove.push(menu);
    };
    collect(selected);
    await rxdb.entityManager.removeMany(menusToRemove);
    menuToDelete.value = null;
  };

  const executePromoteChildrenDelete = async () => {
    const selected = menuToDelete.value;
    if (!selected) return;

    const allMenus = await fetchAllMenus();
    const children = allMenus.filter(menu => menu.parentId === selected.id);
    for (const child of children) {
      child.parentId = selected.parentId as UUID | null;
      await child.save();
    }
    await selected.remove();
    menuToDelete.value = null;
  };

  const expandAll = () => {
    // 1. Unsubscribe everything
    subscriptions.forEach(sub => sub.unsubscribe());
    subscriptions.clear();

    // 2. Subscribe to ALL
    const allQuery$ = dataSource.observeAllMenus();

    const subscription = allQuery$.subscribe({
      next: (allMenus: MenuLarge[]) => {
        const newNodesMap = new Map<RxDBEntityId, MenuLarge>();
        const newChildrenMap = new Map<RxDBEntityId, RxDBEntityId[]>();
        const newRootIds: RxDBEntityId[] = [];
        const newExpandedIds = new Set<RxDBEntityId>();

        allMenus.forEach(menu => {
          newNodesMap.set(menu.id, menu);
          if (menu.parentId) {
            if (!newChildrenMap.has(menu.parentId)) {
              newChildrenMap.set(menu.parentId, []);
            }
            newChildrenMap.get(menu.parentId)!.push(menu.id);
          } else {
            newRootIds.push(menu.id);
          }
        });

        // Expand all nodes that have children
        for (const parentId of newChildrenMap.keys()) {
          newExpandedIds.add(parentId);
        }

        nodesMap.value = newNodesMap;
        childrenMap.value = newChildrenMap;
        rootIds.value = newRootIds;
        expandedIds.value = newExpandedIds;
        loadingIds.value = new Set();
      },
      error: (err: unknown) => useToast().error(formatErrorMessage('展开全部菜单失败', err))
    });

    subscriptions.set('ALL', subscription);
  };

  const collapseAll = () => {
    // 1. Unsubscribe everything
    subscriptions.forEach(sub => sub.unsubscribe());
    subscriptions.clear();

    // 2. Reset State
    expandedIds.value = new Set();
    childrenMap.value = new Map();
    loadingIds.value = new Set();
    nodesMap.value = new Map(); // Clear all nodes to avoid stale data
    rootIds.value = [];

    // 3. Subscribe to ROOT
    subscribeToRoot();
  };

  // 检查节点是否已加载子节点
  const hasLoadedChildren = (menuId: RxDBEntityId): boolean => {
    return childrenMap.value.has(menuId);
  };

  // 组件卸载时清理所有订阅
  onScopeDispose(() => {
    searchSubscription?.unsubscribe();
    subscriptions.forEach(subscription => {
      subscription.unsubscribe();
    });
    subscriptions.clear();
  });

  // 统计信息
  const expandedCount = computed(() => expandedIds.value.size);
  const isAllExpanded = computed(() => {
    const allParentIds = Array.from(childrenMap.value.keys());
    return allParentIds.length > 0 && allParentIds.every(id => expandedIds.value.has(id));
  });

  // 删除影响计算
  const deleteImpact = computed(() => {
    if (!menuToDelete.value) return null;

    const collectDescendants = (id: RxDBEntityId): number => {
      const childIds = childrenMap.value.get(id) || [];
      let count = childIds.length;
      childIds.forEach(childId => {
        count += collectDescendants(childId);
      });
      return count;
    };

    const childrenCount = (childrenMap.value.get(menuToDelete.value.id) || []).length;
    const descendantsCount = collectDescendants(menuToDelete.value.id);

    return { childrenCount, descendantsCount };
  });

  // 批量添加菜单 - 内部 fetch 现有根节点，page 无需传入全表
  const addManyMenus = async (count: number) => {
    const allMenus = await fetchAllMenus();
    const existingRoots = allMenus
      .filter(m => !m.parentId)
      .sort((a, b) => (a.sortOrder || '').localeCompare(b.sortOrder || ''));

    const newMenus = generateBatchMenus(count, MenuLarge, existingRoots);
    await rxdb.entityManager.saveMany(newMenus);

    // 保存后清理展开节点的订阅和缓存，避免新旧数据混淆；保留 ROOT 订阅。
    subscriptions.forEach((sub, key) => {
      if (key !== 'ROOT') {
        sub.unsubscribe();
        subscriptions.delete(key);
      }
    });
    expandedIds.value = new Set();
    childrenMap.value = new Map();
    loadingIds.value = new Set();
  };

  // 删除所有菜单 - 内部一次性 fetch 全表后批量删除
  const deleteAllMenus = async () => {
    const allMenus = await fetchAllMenus();
    await rxdb.entityManager.removeMany(allMenus);
  };

  /**
   * 已加载到 store 内的节点快照。供拖放校验、循环嵌套检测使用，避免 page 端再开一份全表订阅。
   */
  const loadedNodes = computed<MenuLarge[]>(() => Array.from(nodesMap.value.values()));

  return {
    treeNodes,
    expandedIds,
    loadingIds,
    editingId,
    selectedParentId,
    searchKeyword,
    menuToDelete,
    deleteImpact,
    expandedCount,
    isAllExpanded,
    setSearchKeyword: (val: string) => (searchKeyword.value = val),
    setSelectedParentId: (val: RxDBEntityId | null) => (selectedParentId.value = val),
    toggleExpand,
    expandAll,
    collapseAll,
    hasLoadedChildren,
    startEdit,
    cancelEdit,
    addRoot,
    addChild,
    deleteMenu,
    cancelDelete,
    executeCascadeDelete,
    executePromoteChildrenDelete,
    addManyMenus,
    deleteAllMenus,
    loadedNodes
  };
}
