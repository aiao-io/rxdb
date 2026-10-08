import type { RxDB, RxDBEntityId } from '@aiao/rxdb';
import { SortableMenuLarge } from '@aiao/rxdb-test/entities';
import { useCallback, useMemo, useState } from 'react';
import { firstValueFrom } from 'rxjs';
import { promoteChildrenAndRemove } from '../utils/promote-children';
import { byParent, collectSubtreePostOrder } from '../utils/tree-scope';
import { useTreeWriteError } from './useTreeWriteError';

export interface VirtualTreeNode {
  menu: SortableMenuLarge;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
}

/** 库里某节点的直接子节点是否存在。删除对话框的取舍以库为准，不看页面已加载的节点。 */
const hasChildrenInDb = async (parentId: RxDBEntityId): Promise<boolean> => {
  const rows = await firstValueFrom(SortableMenuLarge.find({ where: byParent(parentId), limit: 1 }));
  return rows.length > 0;
};

/** 库里某节点的全部直接子节点（保持原有相对顺序）。 */
const fetchChildrenInDb = (parentId: RxDBEntityId): Promise<SortableMenuLarge[]> =>
  firstValueFrom(
    SortableMenuLarge.findAll({ where: byParent(parentId), orderBy: [{ field: 'sortOrder', sort: 'asc' }] })
  );

export function useTreeMenuVirtualStore(menus: SortableMenuLarge[], rxdb: RxDB) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [menuToDelete, setMenuToDelete] = useState<SortableMenuLarge | null>(null);
  const { writeError, clearWriteError, runWrite } = useTreeWriteError();

  // 构建树节点列表
  const treeNodes = useMemo<VirtualTreeNode[]>(() => {
    const nodes: VirtualTreeNode[] = [];
    const childrenMap = new Map<string | null, SortableMenuLarge[]>();

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
    async (parentMenu: SortableMenuLarge, title: string) => {
      // 只赋业务字段与 parentId：排序键由引擎在保存事务里追加到该父节点组的末尾
      const result = await runWrite('新建', () => new SortableMenuLarge({ title, parentId: parentMenu.id }).save());
      if (result.ok) setExpandedIds(prev => new Set(prev).add(parentMenu.id));
    },
    [runWrite]
  );

  const addRoot = useCallback(
    async (title: string) => {
      await runWrite('新建', () => new SortableMenuLarge({ title, parentId: null }).save());
    },
    [runWrite]
  );

  // REACT-FRESH-01：见 useTreeMenuStore 中的同名说明 —— 叶子路径不能 `void`，
  // 否则与相邻级联路径的 `await` 形成两套错误契约，删除失败对用户完全不可见。
  const deleteMenu = useCallback(
    async (menu: SortableMenuLarge): Promise<void> => {
      await runWrite('删除', async () => {
        if (await hasChildrenInDb(menu.id)) {
          // 有子节点，显示对话框
          setMenuToDelete(menu);
          return;
        }
        await menu.remove();
      });
    },
    [runWrite]
  );

  const cancelDelete = useCallback(() => {
    setMenuToDelete(null);
  }, []);

  const executeCascadeDelete = useCallback(async () => {
    if (!menuToDelete) return;

    const menusToRemove = collectSubtreePostOrder(menuToDelete, menus);

    await runWrite('级联删除', async () => {
      for (const menu of menusToRemove) {
        await menu.remove();
      }
    });
    // 成败都关闭对话框：失败时页内提示不被模态框挡住（三端同一行为）
    setMenuToDelete(null);
  }, [menuToDelete, menus, runWrite]);

  const executePromoteChildrenDelete = useCallback(async () => {
    const selected = menuToDelete;
    if (!selected) return;

    // 子节点取自库（页面可能没加载全），与被删节点同一事务提交
    await runWrite('删除并提升子节点', async () => {
      const children = await fetchChildrenInDb(selected.id);
      await promoteChildrenAndRemove(rxdb, selected, children);
    });
    // 成败都关闭对话框：失败时页内提示不被模态框挡住（三端同一行为）
    setMenuToDelete(null);
  }, [menuToDelete, rxdb, runWrite]);

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
    writeError,
    runWrite,
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
    clearWriteError
  };
}
