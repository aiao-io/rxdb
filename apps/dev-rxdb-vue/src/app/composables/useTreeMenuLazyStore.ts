import { getEntityMutations, RxDB, UUID, type RxDBEntityId } from '@aiao/rxdb';
import { SortableMenuLarge } from '@aiao/rxdb-test/entities';
import { firstValueFrom, type Observable, type Subscription } from 'rxjs';
import { computed, onMounted, onScopeDispose, ref, toRaw, watch } from 'vue';
import { generateBatchMenus } from '../utils/menu-utils';
import { buildTreeMenuNodes, type TreeMenuNode } from '../utils/tree-menu';
import { formatErrorMessage, useToast } from './useToast';
import { useTreeWriteError } from './useTreeWriteError';

export interface TreeMenuLazyDataSource {
  observeAllMenus(): Observable<SortableMenuLarge[]>;
  observeChildMenus(parentId: RxDBEntityId): Observable<SortableMenuLarge[]>;
  observeRootMenus(): Observable<SortableMenuLarge[]>;
}

const defaultDataSource: TreeMenuLazyDataSource = {
  observeAllMenus: () => SortableMenuLarge.findAll({ where: { combinator: 'and', rules: [] } }),
  observeChildMenus: parentId =>
    SortableMenuLarge.findAll({
      where: {
        combinator: 'and',
        rules: [{ field: 'parentId', operator: '=', value: parentId as UUID }]
      }
    }),
  observeRootMenus: () =>
    SortableMenuLarge.findAll({
      where: {
        combinator: 'and',
        rules: [{ field: 'parentId', operator: '=', value: null }]
      }
    })
};

export interface TreeMenuLazyNode extends TreeMenuNode<SortableMenuLarge> {
  isLoading: boolean;
}

export function useTreeMenuLazyStore(rxdb: RxDB, dataSource: TreeMenuLazyDataSource = defaultDataSource) {
  const nodesMap = ref<Map<RxDBEntityId, SortableMenuLarge>>(new Map());
  const expandedIds = ref<Set<RxDBEntityId>>(new Set());
  const loadingIds = ref<Set<RxDBEntityId>>(new Set());
  const rootIds = ref<RxDBEntityId[]>([]);
  const childrenMap = ref<Map<RxDBEntityId, RxDBEntityId[]>>(new Map()); // parentId -> childIds
  const editingId = ref<RxDBEntityId | null>(null);
  const selectedParentId = ref<RxDBEntityId | null>(null);
  const searchKeyword = ref('');
  const searchMenus = ref<SortableMenuLarge[]>([]);
  const menuToDelete = ref<SortableMenuLarge | null>(null);
  // 库里的直接子节点数：弹出删除对话框时按库取，折叠节点（子节点未加载）也算
  const deleteChildrenCount = ref(0);
  const { writeError, clearWriteError, guardWrite } = useTreeWriteError();
  const fetchAllMenus = (): Promise<SortableMenuLarge[]> => firstValueFrom(dataSource.observeAllMenus());
  const fetchChildren = (parentId: RxDBEntityId): Promise<SortableMenuLarge[]> =>
    firstValueFrom(dataSource.observeChildMenus(parentId));

  // 存储活跃的订阅，用于清理
  const subscriptions = new Map<RxDBEntityId | string, { unsubscribe: () => void }>();
  let searchSubscription: Subscription | null = null;

  const subscribeToRoot = () => {
    const rootQuery$ = dataSource.observeRootMenus();

    const subscription = rootQuery$.subscribe({
      next: (roots: SortableMenuLarge[]) => {
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

  // 已加载节点按查询顺序排列：先根组，再各已展开节点的子组。
  // 不能直接取 nodesMap 的插入顺序——拖放后查询重新发射新顺序，Map 里已有的键不会换位。
  const loadedMenusInQueryOrder = computed<SortableMenuLarge[]>(() => {
    const ordered: SortableMenuLarge[] = [];
    const seen = new Set<RxDBEntityId>();
    const collect = (ids: readonly RxDBEntityId[]) => {
      for (const id of ids) {
        const menu = nodesMap.value.get(id);
        if (!menu || seen.has(id)) continue;
        seen.add(id);
        ordered.push(menu);
      }
    };
    collect(rootIds.value);
    childrenMap.value.forEach(collect);
    return ordered;
  });

  const treeNodes = computed<TreeMenuLazyNode[]>(() => {
    const menus = searchKeyword.value ? searchMenus.value : loadedMenusInQueryOrder.value;
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
        next: (children: SortableMenuLarge[]) => {
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

  // 不给 sortOrder：引擎把缺键的新节点追加到所属 parentId 组末尾
  const addRoot = async (title: string) => {
    const menu = new SortableMenuLarge({ title, parentId: null });
    const saved = await guardWrite('新建', () => menu.save());
    if (!saved) return;

    // Update local state
    const newNodesMap = new Map(nodesMap.value);
    newNodesMap.set(menu.id, menu);
    nodesMap.value = newNodesMap;

    rootIds.value = [...rootIds.value, menu.id];
  };

  const addChild = async (parent: SortableMenuLarge, title: string) => {
    const menu = new SortableMenuLarge({ title });
    menu.parentId = parent.id;
    const saved = await guardWrite('新建', () => menu.save());
    if (!saved) return;

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

  // 保存重命名；失败时回退到库里已提交的标题并给出页内提示
  const commitEdit = async (menu: SortableMenuLarge) => {
    const saved = await guardWrite('重命名', () => menu.save());
    if (!saved) menu.reset();
    cancelEdit();
  };

  // 是否弹对话框以库里的直接子节点为准（折叠、子节点未加载的节点也有子节点）；叶子节点直接删除
  const deleteMenu = async (menu: SortableMenuLarge): Promise<void> => {
    await guardWrite('删除', async () => {
      const children = await fetchChildren(menu.id);
      if (children.length > 0) {
        deleteChildrenCount.value = children.length;
        menuToDelete.value = menu;
        return;
      }
      await menu.remove();
    });
  };

  const cancelDelete = () => {
    menuToDelete.value = null;
  };

  const executeCascadeDelete = async () => {
    const selected = menuToDelete.value;
    if (!selected) return;

    await guardWrite('级联删除', async () => {
      const allMenus = await fetchAllMenus();
      const childrenByParent = new Map<RxDBEntityId, SortableMenuLarge[]>();
      for (const menu of allMenus) {
        if (!menu.parentId) continue;
        const children = childrenByParent.get(menu.parentId) ?? [];
        children.push(menu);
        childrenByParent.set(menu.parentId, children);
      }

      const menusToRemove: SortableMenuLarge[] = [];
      const collect = (menu: SortableMenuLarge): void => {
        for (const child of childrenByParent.get(menu.id) ?? []) collect(child);
        menusToRemove.push(menu);
      };
      collect(selected);
      await rxdb.entityManager.removeMany(menusToRemove);
    });
    menuToDelete.value = null;
  };

  // 删除并提升子节点：子节点按 parentId 取自库，只改 parentId，与删除同一次 mutations 提交
  const executePromoteChildrenDelete = async () => {
    const selected = menuToDelete.value;
    if (!selected) return;

    await guardWrite('删除并提升子节点', async () => {
      const children = await fetchChildren(selected.id);
      for (const child of children) {
        child.parentId = selected.parentId as UUID | null;
      }
      await rxdb.entityManager.mutations(
        getEntityMutations({ needSaveEntities: children, needRemoveEntities: [toRaw(selected)] })
      );
    });
    menuToDelete.value = null;
  };

  const expandAll = () => {
    // 1. Unsubscribe everything
    subscriptions.forEach(sub => sub.unsubscribe());
    subscriptions.clear();

    // 2. Subscribe to ALL
    const allQuery$ = dataSource.observeAllMenus();

    const subscription = allQuery$.subscribe({
      next: (allMenus: SortableMenuLarge[]) => {
        const newNodesMap = new Map<RxDBEntityId, SortableMenuLarge>();
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

    const childrenCount = deleteChildrenCount.value;
    const descendantsCount = Math.max(collectDescendants(menuToDelete.value.id), childrenCount);

    return { childrenCount, descendantsCount };
  });

  // 批量添加菜单：整批一次 saveMany，生成器不写 sortOrder，也不读全表取根
  const addManyMenus = (count: number) =>
    guardWrite('批量添加', async () => {
      await rxdb.entityManager.saveMany(generateBatchMenus(count, SortableMenuLarge));

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
    });

  // 删除所有菜单 - 内部一次性 fetch 全表后批量删除
  const deleteAllMenus = async () => {
    const allMenus = await fetchAllMenus();
    await rxdb.entityManager.removeMany(allMenus);
  };

  /**
   * 已加载到 store 内的节点快照。供拖放校验、循环嵌套检测使用，避免 page 端再开一份全表订阅。
   */
  const loadedNodes = computed<SortableMenuLarge[]>(() => Array.from(nodesMap.value.values()));

  /**
   * 某个父节点下已加载的完整子节点 id 序列（`null` 为根组），按手动顺序；
   * 拖放换算前后放置的邻居用它，不用页面可见行，也不用搜索过滤后的结果。
   */
  const siblingIds = (parentId: RxDBEntityId | null): readonly RxDBEntityId[] =>
    parentId === null ? rootIds.value : (childrenMap.value.get(parentId) ?? []);

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
    commitEdit,
    writeError,
    clearWriteError,
    guardWrite,
    deleteMenu,
    cancelDelete,
    executeCascadeDelete,
    executePromoteChildrenDelete,
    addManyMenus,
    deleteAllMenus,
    loadedNodes,
    siblingIds
  };
}
