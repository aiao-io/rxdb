import { RxDB, type RxDBEntityId, UUID } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { generateKeyBetween } from '@aiao/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { firstValueFrom, type Observable } from 'rxjs';
import { getErrorMessage } from '../utils/error';
import { generateBatchMenus } from '../utils/menu-utils';
import { collectSubtreePostOrder } from '../utils/tree-scope';

/** 子孙查询的层级上限，与 `FindTreeOptions.level` 的上限一致。 */
const MAX_TREE_LEVEL = 100;

/** 批量删除的单批条数 —— 一次性把整表读进内存正是 P0-1 要消灭的东西。 */
const DELETE_BATCH_SIZE = 200;

const byParent = (parentId: RxDBEntityId | null) => ({
  combinator: 'and' as const,
  rules: [{ field: 'parentId' as const, operator: '=' as const, value: parentId as UUID | null }]
});

export interface TreeMenuLazySource {
  findRoots: () => Observable<MenuLarge[]>;
}

export const menuLargeTreeSource: TreeMenuLazySource = {
  findRoots: () =>
    MenuLarge.findAll({
      where: byParent(null),
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    })
};

/**
 * 取某个父节点下的直接子节点（按 sortOrder 升序）。
 *
 * 模块级导出而非挂在 store 返回值上：页面要把它当 `useDragDrop` 的 `resolveSiblings`，
 * 而 store 返回的是每次 render 都换新的对象字面量，经它取会把整条 useCallback 链打脏（P2-7）。
 */
export const fetchMenuChildren = (parentId: RxDBEntityId | null): Promise<MenuLarge[]> =>
  firstValueFrom(
    MenuLarge.findAll({
      where: byParent(parentId),
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    })
  );

/** 取某个父节点下 sortOrder 最大的那一个 —— 新增节点只需要它，不需要整个同级列表。 */
const fetchLastSibling = async (parentId: RxDBEntityId | null): Promise<MenuLarge | null> => {
  const rows = await firstValueFrom(
    MenuLarge.find({
      where: byParent(parentId),
      orderBy: [{ field: 'sortOrder', sort: 'desc' }],
      limit: 1
    })
  );
  return rows[0] ?? null;
};

export interface TreeMenuLazyNode {
  menu: MenuLarge;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isLoading: boolean;
}

export function useTreeMenuLazyStore(rxdb: RxDB, source: TreeMenuLazySource) {
  const [nodesMap, setNodesMap] = useState<Map<string, MenuLarge>>(new Map());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [rootIds, setRootIds] = useState<string[]>([]);
  const [childrenMap, setChildrenMap] = useState<Map<string, string[]>>(new Map()); // parentId -> childIds
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [menuToDelete, setMenuToDelete] = useState<MenuLarge | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 存储活跃的订阅，用于清理
  const subscriptionsRef = useRef<Map<string, { unsubscribe: () => void }>>(new Map());

  const subscribeToRoot = useCallback(() => {
    const rootQuery$ = source.findRoots();

    const subscription = rootQuery$.subscribe({
      next: (roots: MenuLarge[]) => {
        setNodesMap(prev => {
          const newMap = new Map(prev);
          // 更新或添加根节点
          roots.forEach(root => {
            newMap.set(root.id, root);
          });
          // 删除不再是根节点的节点（可能被移动了）
          Array.from(prev.keys()).forEach(id => {
            const node = prev.get(id);
            if (node?.parentId === null && !roots.find(r => r.id === id)) {
              newMap.delete(id);
            }
          });
          return newMap;
        });

        const newRootIds = roots.map(r => r.id);
        setRootIds(newRootIds);
      },
      error: (error: unknown) => {
        console.error('[useTreeMenuLazyStore] Root subscription error:', error);
      }
    });

    const currentSubscriptions = subscriptionsRef.current;
    if (currentSubscriptions.has('ROOT')) {
      currentSubscriptions.get('ROOT')?.unsubscribe();
    }
    currentSubscriptions.set('ROOT', subscription);
    return subscription;
  }, [source]);

  // 订阅根节点（响应式更新）
  useEffect(() => {
    const subscription = subscribeToRoot();
    const subscriptions = subscriptionsRef.current;
    return () => {
      subscription.unsubscribe();
      subscriptions.delete('ROOT');
    };
  }, [subscribeToRoot]);

  // Flatten visible nodes
  const treeNodes = useMemo(() => {
    const result: TreeMenuLazyNode[] = [];

    const traverse = (id: string, level: number) => {
      const menu = nodesMap.get(id);
      if (!menu) return;

      const isExpanded = expandedIds.has(id);
      const isLoading = loadingIds.has(id);

      // 使用数据库中的 hasChildren 属性（由树特性自动计算）
      const hasChildren = menu.hasChildren ?? false;

      result.push({
        menu,
        level,
        isExpanded,
        hasChildren,
        isLoading
      });

      if (isExpanded) {
        const childIds = childrenMap.get(id) || [];
        childIds.forEach(childId => traverse(childId, level + 1));
      }
    };

    rootIds.forEach(id => traverse(id, 0));
    return result;
  }, [nodesMap, expandedIds, loadingIds, rootIds, childrenMap]);

  const toggleExpand = async (id: string) => {
    const menu = nodesMap.get(id);
    if (!menu) return;

    // 检查是否有子节点
    const hasChildren = menu.hasChildren ?? false;
    if (!hasChildren) return;

    if (expandedIds.has(id)) {
      // 折叠：清理订阅和数据
      const currentSubscriptions = subscriptionsRef.current;
      const subscription = currentSubscriptions.get(id);
      if (subscription) {
        subscription.unsubscribe();
        currentSubscriptions.delete(id);
      }

      const newExpanded = new Set(expandedIds);
      newExpanded.delete(id);
      setExpandedIds(newExpanded);

      // 递归清理所有子孙节点的数据
      const cleanupDescendants = (parentId: string) => {
        const childIds = childrenMap.get(parentId) || [];
        childIds.forEach(childId => {
          // 递归清理孙节点
          cleanupDescendants(childId);
          // 清理该子节点的订阅
          const childSub = currentSubscriptions.get(childId);
          if (childSub) {
            childSub.unsubscribe();
            currentSubscriptions.delete(childId);
          }
        });
      };

      cleanupDescendants(id);

      // 清理 childrenMap 数据
      setChildrenMap(prev => {
        const newMap = new Map(prev);
        const removeChildren = (parentId: string) => {
          const childIds = newMap.get(parentId) || [];
          childIds.forEach(childId => {
            removeChildren(childId);
          });
          newMap.delete(parentId);
        };
        removeChildren(id);
        return newMap;
      });

      // 清理 nodesMap 中的子节点数据
      setNodesMap(prev => {
        const newMap = new Map(prev);
        const removeNodes = (parentId: string) => {
          const childIds = childrenMap.get(parentId) || [];
          childIds.forEach(childId => {
            removeNodes(childId);
            newMap.delete(childId);
          });
        };
        removeNodes(id);
        return newMap;
      });
    } else {
      // 展开：创建订阅
      const newExpanded = new Set(expandedIds);
      newExpanded.add(id);
      setExpandedIds(newExpanded);

      // 开始加载
      setLoadingIds(prev => new Set(prev).add(id));

      // 创建响应式订阅
      const childQuery$ = MenuLarge.findAll({
        where: {
          combinator: 'and',
          rules: [{ field: 'parentId', operator: '=', value: id as UUID }]
        },
        orderBy: [{ field: 'sortOrder', sort: 'asc' }]
      });

      const subscription = childQuery$.subscribe({
        next: (children: MenuLarge[]) => {
          setNodesMap(prev => {
            const newMap = new Map(prev);
            children.forEach(child => {
              newMap.set(child.id, child);
            });
            return newMap;
          });

          const childIds = children.map(c => c.id);
          setChildrenMap(prev => new Map(prev).set(id, childIds));

          // 停止加载状态
          setLoadingIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
        error: (error: unknown) => {
          console.error(`[useTreeMenuLazyStore] Failed to load children for ${id}:`, error);
          setLoadingIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      });

      const currentSubscriptions = subscriptionsRef.current;
      currentSubscriptions.set(id, subscription);
    }
  };

  const startEdit = (id: string) => setEditingId(id);
  const cancelEdit = () => setEditingId(null);

  const addRoot = async (title: string) => {
    const lastRootId = rootIds[rootIds.length - 1];
    const lastRoot = lastRootId ? nodesMap.get(lastRootId) : null;
    const sortOrder = generateKeyBetween(lastRoot?.sortOrder || null, null);

    const menu = new MenuLarge({ title, sortOrder });
    await rxdb.entityManager.save(menu);

    // Update local state
    setNodesMap(prev => new Map(prev).set(menu.id, menu));
    setRootIds(prev => [...prev, menu.id]);
  };

  const addChild = async (parent: MenuLarge, title: string) => {
    const lastSibling = await fetchLastSibling(parent.id);
    const sortOrder = generateKeyBetween(lastSibling?.sortOrder ?? null, null);

    const menu = new MenuLarge({ title, sortOrder });
    menu.parentId = parent.id;
    await rxdb.entityManager.save(menu);

    // Update local state
    setNodesMap(prev => new Map(prev).set(menu.id, menu));
    setChildrenMap(prev => {
      const next = new Map(prev);
      const current = next.get(parent.id) || [];
      next.set(parent.id, [...current, menu.id]);
      return next;
    });

    // Ensure expanded
    if (!expandedIds.has(parent.id)) {
      setExpandedIds(prev => new Set(prev).add(parent.id));
    }
  };

  // REACT-FRESH-01：见 useTreeMenuStore 中的同名说明 —— 叶子路径不能 `void`，
  // 否则与相邻级联路径的 `await` 形成两套错误契约，删除失败对用户完全不可见。
  const deleteMenu = async (menu: MenuLarge): Promise<void> => {
    // 检查是否有子节点（使用 hasChildren 属性）
    const hasChildren = menu.hasChildren ?? false;

    if (hasChildren) {
      // 有子节点，显示删除对话框
      setMenuToDelete(menu);
      return;
    }
    setDeleteError(null);
    try {
      await menu.remove();
    } catch (error: unknown) {
      setDeleteError(getErrorMessage(error, '删除菜单失败'));
    }
  };

  const cancelDelete = () => {
    setMenuToDelete(null);
  };

  const clearDeleteError = () => {
    setDeleteError(null);
  };

  const executeCascadeDelete = async () => {
    const selected = menuToDelete;
    if (!selected) return;

    // 只取这个节点的子树，不是整表 —— 级联删除本来就只关心它自己的子孙。
    const descendants = await firstValueFrom(
      MenuLarge.findDescendants({ entityId: selected.id, level: MAX_TREE_LEVEL })
    );
    const menusToRemove = collectSubtreePostOrder(selected, [selected, ...descendants]);
    setDeleteError(null);
    try {
      await rxdb.entityManager.removeMany(menusToRemove);
    } catch (error: unknown) {
      setDeleteError(getErrorMessage(error, '级联删除失败'));
      return;
    }
    setMenuToDelete(null);
  };

  const executePromoteChildrenDelete = async () => {
    const selected = menuToDelete;
    if (!selected) return;

    const children = await fetchMenuChildren(selected.id);
    setDeleteError(null);
    try {
      for (const child of children) {
        child.parentId = selected.parentId as UUID | null;
        await child.save();
      }
      await selected.remove();
    } catch (error: unknown) {
      setDeleteError(getErrorMessage(error, '删除菜单失败'));
      return;
    }
    setMenuToDelete(null);
  };

  const expandAll = () => {
    // 1. Unsubscribe everything
    subscriptionsRef.current.forEach(sub => sub.unsubscribe());
    subscriptionsRef.current.clear();

    // 2. Subscribe to ALL
    const allQuery$ = MenuLarge.findAll({
      where: {
        combinator: 'and',
        rules: []
      },
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    });

    const subscription = allQuery$.subscribe({
      next: (allMenus: MenuLarge[]) => {
        const newNodesMap = new Map<string, MenuLarge>();
        const newChildrenMap = new Map<string, string[]>();
        const newRootIds: string[] = [];
        const newExpandedIds = new Set<string>();

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

        setNodesMap(newNodesMap);
        setChildrenMap(newChildrenMap);
        setRootIds(newRootIds);
        setExpandedIds(newExpandedIds);
        setLoadingIds(new Set());
      },
      error: (error: unknown) => console.error('[useTreeMenuLazyStore] ExpandAll error:', error)
    });

    subscriptionsRef.current.set('ALL', subscription);
  };

  const collapseAll = () => {
    // 1. Unsubscribe everything
    subscriptionsRef.current.forEach(sub => sub.unsubscribe());
    subscriptionsRef.current.clear();

    // 2. Reset State
    setExpandedIds(new Set());
    setChildrenMap(new Map());
    setLoadingIds(new Set());
    setNodesMap(new Map()); // Clear all nodes to avoid stale data
    setRootIds([]);

    // 3. Subscribe to ROOT
    subscribeToRoot();
  };

  // 检查节点是否已加载子节点（对应 Angular 的 childSubscriptions.has 检查）
  const hasLoadedChildren = (menuId: string): boolean => {
    return childrenMap.has(menuId);
  };

  // 组件卸载时清理所有订阅
  useEffect(() => {
    const currentSubscriptions = subscriptionsRef.current;
    return () => {
      currentSubscriptions.forEach(subscription => {
        subscription.unsubscribe();
      });
      currentSubscriptions.clear();
    };
  }, []);

  // 统计信息
  const expandedCount = expandedIds.size;
  const isAllExpanded = useMemo(() => {
    const allParentIds = Array.from(childrenMap.keys());
    return allParentIds.length > 0 && allParentIds.every(id => expandedIds.has(id));
  }, [expandedIds, childrenMap]);

  // 删除影响计算
  const deleteImpact = useMemo(() => {
    if (!menuToDelete) return null;

    const collectDescendants = (id: string): number => {
      const childIds = childrenMap.get(id) || [];
      let count = childIds.length;
      childIds.forEach(childId => {
        count += collectDescendants(childId);
      });
      return count;
    };

    const childrenCount = (childrenMap.get(menuToDelete.id) || []).length;
    const descendantsCount = collectDescendants(menuToDelete.id);

    return { childrenCount, descendantsCount };
  }, [menuToDelete, childrenMap]);

  // 批量添加菜单。`generateBatchMenus` 只用 existingRoots 的**最后一个**来续排序键，
  // 因此这里查最大 sortOrder 的那一个就够，不必让调用方持有整表。
  const addManyMenus = async (count: number) => {
    const lastRoot = await fetchLastSibling(null);
    const existingRoots = lastRoot ? [lastRoot] : [];

    const newMenus = generateBatchMenus(count, MenuLarge, existingRoots);
    // await rxdb.entityManager.saveMany(newMenus);
    for (const menu of newMenus) {
      await rxdb.entityManager.save(menu);
    }

    // 保存后清理展开节点的订阅和缓存，避免新旧数据混淆
    // 只清理子节点订阅，保留 ROOT 订阅（会自动更新根节点）
    const currentSubscriptions = subscriptionsRef.current;
    currentSubscriptions.forEach((sub, key) => {
      if (key !== 'ROOT') {
        sub.unsubscribe();
        currentSubscriptions.delete(key);
      }
    });
    setExpandedIds(new Set());
    setChildrenMap(new Map());
    setLoadingIds(new Set());
  };

  /**
   * 清空整表。分批取、分批删 —— 内存里同时只有一批，
   * 而不是像此前那样先让页面订阅出一份完整数组再整个丢进 `removeMany`。
   *
   * 每批都断言游标真的推进了：删不动却继续循环会变成死循环，宁可把失败抛给调用方。
   */
  const deleteAllMenus = async () => {
    let lastBatchHeadId: string | null = null;
    for (;;) {
      const batch = await firstValueFrom(
        MenuLarge.find({ where: { combinator: 'and', rules: [] }, limit: DELETE_BATCH_SIZE })
      );
      if (batch.length === 0) return;
      if (batch[0].id === lastBatchHeadId) {
        throw new Error('批量删除没有推进：仍有菜单未被删除');
      }
      lastBatchHeadId = batch[0].id;
      await rxdb.entityManager.removeMany(batch);
    }
  };

  /** 读取已加载的节点。页面拿父节点标题之类的用途，不该为此持有一份全表。 */
  const getNode = (id: string): MenuLarge | undefined => nodesMap.get(id);

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
    setSearchKeyword,
    setSelectedParentId,
    toggleExpand,
    expandAll,
    collapseAll,
    hasLoadedChildren,
    getNode,
    startEdit,
    cancelEdit,
    addRoot,
    addChild,
    deleteMenu,
    cancelDelete,
    deleteError,
    clearDeleteError,
    executeCascadeDelete,
    executePromoteChildrenDelete,
    addManyMenus,
    deleteAllMenus
  };
}
