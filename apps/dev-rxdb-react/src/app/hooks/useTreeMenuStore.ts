import { MenuSimple } from '@aiao/rxdb-test/entities';
import { generateKeyBetween } from '@aiao/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getErrorMessage } from '../utils/error';
import { collectSubtreePostOrder } from '../utils/tree-scope';
import { MenuPathConflict, useMenuPathValidator } from './useMenuPathValidator';

export interface TreeNode {
  menu: MenuSimple;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
}

/** 有子节点的菜单 id 集合。 */
const collectParentIds = (menus: MenuSimple[]): Set<string> =>
  new Set(menus.filter(menu => menus.some(child => child.parentId === menu.id)).map(menu => menu.id));

export function useTreeMenuStore(menus: MenuSimple[]) {
  // P1-2：**不能用 useState 初始化器展开父节点**。
  // 数据来自 `useFindAll` 的异步订阅，首渲染 `menus` 恒为 `[]`，初始化器算出来永远是空集，
  // 真正的数据到达时已经没有第二次机会 —— 整棵树默认全折叠，和"初始化时展开所有父节点"的注释相反。
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // 已自动展开过的 id。只展开"第一次见到"的父节点，用户随后折叠的不会被下一次数据更新顶回去。
  const autoExpandedIdsRef = useRef<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [pathConflict, setPathConflict] = useState<MenuPathConflict | null>(null);
  const [menuToDelete, setMenuToDelete] = useState<MenuSimple | null>(null);

  const pathValidator = useMenuPathValidator();

  // P1-2：数据到达（或新增了父节点）时补齐展开状态。
  useEffect(() => {
    const freshParentIds = [...collectParentIds(menus)].filter(id => !autoExpandedIdsRef.current.has(id));
    if (freshParentIds.length === 0) return;
    freshParentIds.forEach(id => autoExpandedIdsRef.current.add(id));
    setExpandedIds(prev => new Set([...prev, ...freshParentIds]));
  }, [menus]);

  // 构建树节点列表
  const treeNodes = useMemo<TreeNode[]>(() => {
    const nodes: TreeNode[] = [];
    const childrenMap = new Map<string | null, MenuSimple[]>();

    // 构建 children 映射
    menus.forEach(menu => {
      const parentId = menu.parentId ?? null;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(menu);
    });

    // 递归构建节点
    const buildNodes = (parentId: string | null, level: number) => {
      const children = childrenMap.get(parentId) || [];
      const sorted = [...children].sort((a, b) => (a.sortOrder ?? '').localeCompare(b.sortOrder ?? ''));

      sorted.forEach(menu => {
        const hasChildren = childrenMap.has(menu.id) && childrenMap.get(menu.id)!.length > 0;
        const isExpanded = expandedIds.has(menu.id);

        // 搜索过滤
        if (searchKeyword) {
          const matchesSearch = menu.title.toLowerCase().includes(searchKeyword.toLowerCase());
          if (!matchesSearch) {
            // 检查是否有匹配的子节点
            const hasMatchingChildren = (id: string): boolean => {
              const kids = childrenMap.get(id) || [];
              return kids.some(
                kid => kid.title.toLowerCase().includes(searchKeyword.toLowerCase()) || hasMatchingChildren(kid.id)
              );
            };
            if (!hasMatchingChildren(menu.id)) {
              return;
            }
          }
        }

        nodes.push({
          menu,
          level,
          isExpanded,
          hasChildren
        });

        if (isExpanded) {
          buildNodes(menu.id, level + 1);
        }
      });
    };

    buildNodes(null, 0);
    return nodes;
  }, [menus, expandedIds, searchKeyword]);

  const toggleExpand = useCallback((menuId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(menuId)) {
        next.delete(menuId);
      } else {
        next.add(menuId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allParentIds = new Set(menus.filter(m => menus.some(child => child.parentId === m.id)).map(m => m.id));
    setExpandedIds(allParentIds);
  }, [menus]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const startEdit = useCallback((menuId: string) => {
    setEditingId(menuId);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const addChild = useCallback(
    async (parentMenu: MenuSimple, title: string) => {
      // 检查路径冲突
      const conflict = pathValidator.checkConflict(title, parentMenu.id, menus);
      if (conflict) {
        setPathConflict(conflict);
        return;
      }

      const siblings = menus.filter(m => m.parentId === parentMenu.id);
      siblings.sort((a, b) => {
        const orderA = a.sortOrder || '';
        const orderB = b.sortOrder || '';
        if (orderA < orderB) return -1;
        if (orderA > orderB) return 1;
        return 0;
      });
      const lastSibling = siblings[siblings.length - 1];
      const lastSortOrder = lastSibling ? lastSibling.sortOrder : null;
      const newSortOrder = generateKeyBetween(lastSortOrder, null);

      const newMenu = new MenuSimple({
        title,
        parentId: parentMenu.id,
        sortOrder: newSortOrder
      });

      await newMenu.save();
      setExpandedIds(prev => new Set(prev).add(parentMenu.id));
      setPathConflict(null);
    },
    [menus, pathValidator]
  );

  const addRoot = useCallback(
    async (title: string) => {
      // 检查路径冲突
      const conflict = pathValidator.checkConflict(title, null, menus);
      if (conflict) {
        setPathConflict(conflict);
        return;
      }

      const rootMenus = menus.filter(m => m.parentId === null);
      // Sort by sortOrder string to find the last one
      rootMenus.sort((a, b) => {
        const orderA = a.sortOrder || '';
        const orderB = b.sortOrder || '';
        if (orderA < orderB) return -1;
        if (orderA > orderB) return 1;
        return 0;
      });
      const lastMenu = rootMenus[rootMenus.length - 1];
      const lastSortOrder = lastMenu ? lastMenu.sortOrder : null;
      const newSortOrder = generateKeyBetween(lastSortOrder, null);

      const newMenu = new MenuSimple({
        title,
        parentId: null,
        sortOrder: newSortOrder
      });

      await newMenu.save();
      setPathConflict(null);
    },
    [menus, pathValidator]
  );

  // REACT-FRESH-01：叶子删除原先是 `void menu.remove()` —— 既不等待也不处理 rejection。
  // 删除失败时调用方（页面按钮）早已返回，用户看到行还在、没有任何提示，且产生未处理 rejection。
  // 而紧邻的级联删除路径是逐条 `await`：同一个"删除"动作有两套错误传播契约。
  // 这里统一成 async，错误落进 `deleteError`，由页面渲染。
  const deleteMenu = useCallback(
    async (menu: MenuSimple): Promise<void> => {
      const hasChildren = menus.some(m => m.parentId === menu.id);
      if (hasChildren) {
        // 有子节点，显示对话框
        setMenuToDelete(menu);
        return;
      }
      setDeleteError(null);
      try {
        await menu.remove();
      } catch (error: unknown) {
        setDeleteError(getErrorMessage(error, '删除菜单失败'));
      }
    },
    [menus]
  );

  const cancelDelete = useCallback(() => {
    setMenuToDelete(null);
  }, []);

  const executeCascadeDelete = useCallback(async () => {
    if (!menuToDelete) return;

    const menusToRemove = collectSubtreePostOrder(menuToDelete, menus);

    setDeleteError(null);
    try {
      for (const menu of menusToRemove) {
        await menu.remove();
      }
    } catch (error: unknown) {
      // 这两个 execute* 是直接挂在 onClick 上的 async 函数，rejection 无人接管。
      // 和叶子路径共用同一个错误出口。
      setDeleteError(getErrorMessage(error, '级联删除失败'));
      return;
    }

    setMenuToDelete(null);
  }, [menuToDelete, menus]);

  const executePromoteChildrenDelete = useCallback(async () => {
    if (!menuToDelete) return;

    // 删除父节点，子节点提升
    const children = menus.filter(m => m.parentId === menuToDelete.id);
    const newParentId = menuToDelete.parentId;

    setDeleteError(null);
    try {
      // 更新子节点的 parentId
      for (const child of children) {
        child.parentId = newParentId;
        await child.save();
      }

      // 删除当前节点
      await menuToDelete.remove();
    } catch (error: unknown) {
      setDeleteError(getErrorMessage(error, '删除菜单失败'));
      return;
    }

    setMenuToDelete(null);
  }, [menuToDelete, menus]);

  const clearDeleteError = useCallback(() => {
    setDeleteError(null);
  }, []);

  const clearPathConflict = useCallback(() => {
    setPathConflict(null);
  }, []);

  // 统计信息
  const expandedCount = expandedIds.size;
  const isAllExpanded = useMemo(() => {
    const allParentIds = menus.filter(m => menus.some(child => child.parentId === m.id)).map(m => m.id);
    return allParentIds.length > 0 && allParentIds.every(id => expandedIds.has(id));
  }, [menus, expandedIds]);

  // 删除影响计算
  const deleteImpact = useMemo(() => {
    if (!menuToDelete) return { childrenCount: 0, descendantsCount: 0 };

    const countDescendants = (id: string): number => {
      const children = menus.filter(m => m.parentId === id);
      return children.reduce((count, child) => count + 1 + countDescendants(child.id), 0);
    };

    const children = menus.filter(m => m.parentId === menuToDelete.id);
    return {
      childrenCount: children.length,
      descendantsCount: countDescendants(menuToDelete.id)
    };
  }, [menuToDelete, menus]);

  return {
    treeNodes,
    expandedIds,
    editingId,
    selectedParentId,
    searchKeyword,
    pathConflict,
    expandedCount,
    isAllExpanded,
    menuToDelete,
    deleteImpact,
    deleteError,
    setSearchKeyword,
    toggleExpand,
    expandAll,
    collapseAll,
    startEdit,
    cancelEdit,
    addChild,
    addRoot,
    deleteMenu,
    cancelDelete,
    executeCascadeDelete,
    executePromoteChildrenDelete,
    setSelectedParentId,
    clearPathConflict,
    clearDeleteError
  };
}
