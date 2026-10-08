import { RxDB, type RxDBEntityId, UUID } from '@aiao/rxdb';
import { SortableMenuLarge } from '@aiao/rxdb-test/entities';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { firstValueFrom, type Observable } from 'rxjs';
import { generateBatchMenus } from '../utils/menu-utils';
import { promoteChildrenAndRemove } from '../utils/promote-children';
import { byParent, collectSubtreePostOrder } from '../utils/tree-scope';
import { useTreeWriteError } from './useTreeWriteError';

/** 批量删除的单批条数 —— 一次性把整表读进内存正是 P0-1 要消灭的东西。 */
const DELETE_BATCH_SIZE = 200;

export interface TreeMenuLazySource {
  findRoots: () => Observable<SortableMenuLarge[]>;
}

export const menuLargeTreeSource: TreeMenuLazySource = {
  findRoots: () =>
    SortableMenuLarge.findAll({
      where: byParent(null)
    })
};

/**
 * 取某个父节点下的直接子节点（查询不传 `orderBy`，引擎按手动顺序 `[parentId, sortOrder, id]` 返回）。
 *
 * 模块级导出而非挂在 store 返回值上：页面的重命名冲突检测与删除都按需调它，
 * 而 store 返回的是每次 render 都换新的对象字面量，经它取会把页面的 useCallback 链打脏（P2-7）。
 */
export const fetchMenuChildren = (parentId: RxDBEntityId | null): Promise<SortableMenuLarge[]> =>
  firstValueFrom(
    SortableMenuLarge.findAll({
      where: byParent(parentId)
    })
  );

export interface TreeMenuLazyNode {
  menu: SortableMenuLarge;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isLoading: boolean;
}

export function useTreeMenuLazyStore(rxdb: RxDB, source: TreeMenuLazySource) {
  const [nodesMap, setNodesMap] = useState<Map<string, SortableMenuLarge>>(new Map());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [rootIds, setRootIds] = useState<string[]>([]);
  const [childrenMap, setChildrenMap] = useState<Map<string, string[]>>(new Map()); // parentId -> childIds
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [menuToDelete, setMenuToDelete] = useState<SortableMenuLarge | null>(null);
  // 打开删除对话框时从库里读到的直接子节点数。折叠节点的子节点没加载，childrenMap 里没有它们。
  const [deleteChildrenCount, setDeleteChildrenCount] = useState(0);
  const { writeError, clearWriteError, runWrite } = useTreeWriteError();

  // 存储活跃的订阅，用于清理
  const subscriptionsRef = useRef<Map<string, { unsubscribe: () => void }>>(new Map());

  const subscribeToRoot = useCallback(() => {
    const rootQuery$ = source.findRoots();

    const subscription = rootQuery$.subscribe({
      next: (roots: SortableMenuLarge[]) => {
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

  /** 折叠：清理该节点及子孙的订阅与数据。 */
  const collapseNode = (id: string) => {
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
  };

  /** 展开：为该节点创建子节点的响应式订阅（库里已有的子节点按手动顺序全部载入，不传 orderBy）。 */
  const expandNode = (id: string) => {
    // 展开：创建订阅
    const newExpanded = new Set(expandedIds);
    newExpanded.add(id);
    setExpandedIds(newExpanded);

    // 开始加载
    setLoadingIds(prev => new Set(prev).add(id));

    // 创建响应式订阅
    const childQuery$ = SortableMenuLarge.findAll({
      where: {
        combinator: 'and',
        rules: [{ field: 'parentId', operator: '=', value: id as UUID }]
      }
    });

    const subscription = childQuery$.subscribe({
      next: (children: SortableMenuLarge[]) => {
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
  };

  const toggleExpand = async (id: string) => {
    const menu = nodesMap.get(id);
    if (!menu) return;

    // 检查是否有子节点
    const hasChildren = menu.hasChildren ?? false;
    if (!hasChildren) return;

    if (expandedIds.has(id)) collapseNode(id);
    else expandNode(id);
  };

  const startEdit = (id: string) => setEditingId(id);
  const cancelEdit = () => setEditingId(null);

  // 新建返回是否已落库：写入失败时为 false，页面据此决定是否清空输入
  const addRoot = async (title: string): Promise<boolean> => {
    // 只赋业务字段：排序键由引擎在保存事务里追加到根节点组的末尾
    const result = await runWrite('新建', async () => {
      const menu = new SortableMenuLarge({ title });
      await rxdb.entityManager.save(menu);

      // Update local state
      setNodesMap(prev => new Map(prev).set(menu.id, menu));
      setRootIds(prev => [...prev, menu.id]);
    });
    return result.ok;
  };

  const addChild = async (parent: SortableMenuLarge, title: string): Promise<boolean> => {
    const result = await runWrite('新建', async () => {
      const menu = new SortableMenuLarge({ title });
      menu.parentId = parent.id;
      await rxdb.entityManager.save(menu);

      setNodesMap(prev => new Map(prev).set(menu.id, menu));
      if (!expandedIds.has(parent.id)) {
        // 折叠（子节点未加载）的父节点：走展开订阅把库里的子节点连同新节点一起载入，
        // 而不是只往 childrenMap 里塞新节点——那样展开后只看得见这一个。
        expandNode(parent.id);
        return;
      }
      setChildrenMap(prev => {
        const next = new Map(prev);
        const current = next.get(parent.id) || [];
        next.set(parent.id, [...current, menu.id]);
        return next;
      });
    });
    return result.ok;
  };

  // REACT-FRESH-01：见 useTreeMenuStore 中的同名说明 —— 叶子路径不能 `void`，
  // 否则与相邻级联路径的 `await` 形成两套错误契约，删除失败对用户完全不可见。
  // 是否有子节点以库里的直接子节点为准：折叠节点的子节点没加载，页面里看不到它们。
  const deleteMenu = async (menu: SortableMenuLarge): Promise<void> => {
    await runWrite('删除', async () => {
      const children = await fetchMenuChildren(menu.id);
      if (children.length > 0) {
        // 有子节点，显示删除对话框
        setDeleteChildrenCount(children.length);
        setMenuToDelete(menu);
        return;
      }
      await menu.remove();
    });
  };

  const cancelDelete = () => {
    setMenuToDelete(null);
  };

  const executeCascadeDelete = async () => {
    const selected = menuToDelete;
    if (!selected) return;

    await runWrite('级联删除', async () => {
      // 只取这个节点的子树，不是整表 —— 级联删除本来就只关心它自己的子孙。
      // 不传 level 即不限深度，整棵子树一次取回
      const descendants = await firstValueFrom(SortableMenuLarge.findDescendants({ entityId: selected.id }));
      const menusToRemove = collectSubtreePostOrder(selected, [selected, ...descendants]);
      await rxdb.entityManager.removeMany(menusToRemove);
    });
    // 成败都关闭对话框：失败时页内提示不被模态框挡住（三端同一行为）
    setMenuToDelete(null);
  };

  const executePromoteChildrenDelete = async () => {
    const selected = menuToDelete;
    if (!selected) return;

    // 子节点取自库（折叠节点的子节点没加载），与被删节点同一事务提交
    await runWrite('删除并提升子节点', async () => {
      const children = await fetchMenuChildren(selected.id);
      await promoteChildrenAndRemove(rxdb, selected, children);
    });
    // 成败都关闭对话框：失败时页内提示不被模态框挡住（三端同一行为）
    setMenuToDelete(null);
  };

  const expandAll = () => {
    // 1. Unsubscribe everything
    subscriptionsRef.current.forEach(sub => sub.unsubscribe());
    subscriptionsRef.current.clear();

    // 2. Subscribe to ALL
    const allQuery$ = SortableMenuLarge.findAll({
      where: {
        combinator: 'and',
        rules: []
      }
    });

    const subscription = allQuery$.subscribe({
      next: (allMenus: SortableMenuLarge[]) => {
        const newNodesMap = new Map<string, SortableMenuLarge>();
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

  // 删除影响计算：直接子节点数取自库（打开对话框时读到），后代数取已加载部分与直接子节点数的较大者
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

    return {
      childrenCount: deleteChildrenCount,
      descendantsCount: Math.max(collectDescendants(menuToDelete.id), deleteChildrenCount)
    };
  }, [menuToDelete, childrenMap, deleteChildrenCount]);

  // 批量添加菜单：整批一次 `saveMany`，不读任何已有节点——排序键由引擎按父节点分组追加到各组末尾。
  const addManyMenus = async (count: number) => {
    const result = await runWrite('批量添加', () =>
      rxdb.entityManager.saveMany(generateBatchMenus(count, SortableMenuLarge))
    );
    if (!result.ok) return;

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
        SortableMenuLarge.find({ where: { combinator: 'and', rules: [] }, limit: DELETE_BATCH_SIZE })
      );
      if (batch.length === 0) return;
      if (batch[0].id === lastBatchHeadId) {
        throw new Error('批量删除没有推进：仍有菜单未被删除');
      }
      lastBatchHeadId = batch[0].id;
      await rxdb.entityManager.removeMany(batch);
    }
  };

  /**
   * 某个父节点下已整组加载的子节点 id（`null` 取根组），顺序即手动顺序，不分页、不受搜索影响。
   * 拖放的前后放置从这里换算邻居（`useDragDrop` 的 `getGroupIds`）；可见的目标其所在组必然已加载。
   */
  const getGroupIds = useCallback(
    (parentId: RxDBEntityId | null): readonly RxDBEntityId[] => {
      if (parentId === null) return rootIds;
      const childIds = childrenMap.get(parentId as string);
      if (!childIds) throw new Error(`父节点 ${String(parentId)} 的子节点尚未加载`);
      return childIds;
    },
    [rootIds, childrenMap]
  );

  /** 读取已加载的节点。页面拿父节点标题之类的用途，不该为此持有一份全表。 */
  const getNode = (id: string): SortableMenuLarge | undefined => nodesMap.get(id);

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
    getGroupIds,
    getNode,
    startEdit,
    cancelEdit,
    addRoot,
    addChild,
    deleteMenu,
    cancelDelete,
    writeError,
    clearWriteError,
    runWrite,
    executeCascadeDelete,
    executePromoteChildrenDelete,
    addManyMenus,
    deleteAllMenus
  };
}
