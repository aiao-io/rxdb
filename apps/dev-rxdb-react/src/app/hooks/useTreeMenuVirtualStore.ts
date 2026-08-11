import { MenuLarge } from '@aiao/rxdb-test/entities';
import { generateKeyBetween } from '@aiao/utils';
import { useCallback, useMemo, useState } from 'react';
import { getErrorMessage } from '../utils/error';
import { collectSubtreePostOrder } from '../utils/tree-scope';

export interface VirtualTreeNode {
  menu: MenuLarge;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
}

export function useTreeMenuVirtualStore(menus: MenuLarge[]) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [menuToDelete, setMenuToDelete] = useState<MenuLarge | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 构建树节点列表
  const treeNodes = useMemo<VirtualTreeNode[]>(() => {
    const nodes: VirtualTreeNode[] = [];
    const childrenMap = new Map<string | null, MenuLarge[]>();

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
      const sorted = [...children].sort((a, b) => {
        const orderA = a.sortOrder || '';
        const orderB = b.sortOrder || '';
        if (orderA < orderB) return -1;
        if (orderA > orderB) return 1;
        return 0;
      });

      sorted.forEach(menu => {
        // 使用实体上的 hasChildren 属性，或者回退到内存计算
        const hasChildren = menu.hasChildren ?? (childrenMap.has(menu.id) && childrenMap.get(menu.id)!.length > 0);
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
    async (parentMenu: MenuLarge, title: string) => {
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

      const newMenu = new MenuLarge({
        title,
        parentId: parentMenu.id,
        sortOrder: newSortOrder
      });

      await newMenu.save();
      setExpandedIds(prev => new Set(prev).add(parentMenu.id));
    },
    [menus]
  );

  const addRoot = useCallback(
    async (title: string) => {
      const rootMenus = menus.filter(m => m.parentId === null);
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

      const newMenu = new MenuLarge({
        title,
        parentId: null,
        sortOrder: newSortOrder
      });

      await newMenu.save();
    },
    [menus]
  );

  // REACT-FRESH-01：见 useTreeMenuStore 中的同名说明 —— 叶子路径不能 `void`，
  // 否则与相邻级联路径的 `await` 形成两套错误契约，删除失败对用户完全不可见。
  const deleteMenu = useCallback(
    async (menu: MenuLarge): Promise<void> => {
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
    expandedCount,
    isAllExpanded,
    menuToDelete,
    deleteImpact,
    deleteError,
    setSearchKeyword,
    setSelectedParentId,
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
    clearDeleteError
  };
}
