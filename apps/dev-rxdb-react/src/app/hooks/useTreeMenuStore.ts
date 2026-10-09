import type { RxDB, RxDBEntityId } from '@aiao/rxdb';
import { SortableMenuSimple } from '@aiao/rxdb-test/entities';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { firstValueFrom } from 'rxjs';
import { promoteChildrenAndRemove } from '../utils/promote-children';
import { byParent, collectSubtreePostOrder } from '../utils/tree-scope';
import { MenuPathConflict, useMenuPathValidator } from './useMenuPathValidator';
import { useTreeWriteError } from './useTreeWriteError';

export interface TreeNode {
  menu: SortableMenuSimple;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
}

/** 有子节点的菜单 id 集合。 */
const collectParentIds = (menus: SortableMenuSimple[]): Set<string> =>
  new Set(menus.filter(menu => menus.some(child => child.parentId === menu.id)).map(menu => menu.id));

/** 库里某节点的直接子节点是否存在。删除对话框的取舍以库为准，不看页面已加载的节点。 */
const hasChildrenInDb = async (parentId: RxDBEntityId): Promise<boolean> => {
  const rows = await firstValueFrom(SortableMenuSimple.find({ where: byParent(parentId), limit: 1 }));
  return rows.length > 0;
};

/** 库里某节点的全部直接子节点（保持原有相对顺序）。 */
const fetchChildrenInDb = (parentId: RxDBEntityId): Promise<SortableMenuSimple[]> =>
  firstValueFrom(SortableMenuSimple.findAll({ where: byParent(parentId) }));

export function useTreeMenuStore(menus: SortableMenuSimple[], rxdb: RxDB) {
  // P1-2：**不能用 useState 初始化器展开父节点**。
  // 数据来自 `useFindAll` 的异步订阅，首渲染 `menus` 恒为 `[]`，初始化器算出来永远是空集，
  // 真正的数据到达时已经没有第二次机会 —— 整棵树默认全折叠，和"初始化时展开所有父节点"的注释相反。
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // 已自动展开过的 id。只展开"第一次见到"的父节点，用户随后折叠的不会被下一次数据更新顶回去。
  const autoExpandedIdsRef = useRef<Set<string>>(new Set());
  const { writeError, clearWriteError, runWrite } = useTreeWriteError();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [pathConflict, setPathConflict] = useState<MenuPathConflict | null>(null);
  const [menuToDelete, setMenuToDelete] = useState<SortableMenuSimple | null>(null);

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
    const childrenMap = new Map<string | null, SortableMenuSimple[]>();

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
      // 同组的顺序即查询顺序（引擎的手动顺序），不再另排
      const children = childrenMap.get(parentId) || [];

      children.forEach(menu => {
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

  // 新建返回是否已落库：路径冲突或写入失败时为 false，页面据此决定是否清空输入
  const addChild = useCallback(
    async (parentMenu: SortableMenuSimple, title: string): Promise<boolean> => {
      // 检查路径冲突
      const conflict = pathValidator.checkConflict(title, parentMenu.id, menus);
      if (conflict) {
        setPathConflict(conflict);
        return false;
      }

      // 只赋业务字段与 parentId：排序键由引擎在保存事务里追加到该父节点组的末尾
      const result = await runWrite('新建', () => new SortableMenuSimple({ title, parentId: parentMenu.id }).save());
      if (!result.ok) return false;
      setExpandedIds(prev => new Set(prev).add(parentMenu.id));
      setPathConflict(null);
      return true;
    },
    [menus, pathValidator, runWrite]
  );

  const addRoot = useCallback(
    async (title: string): Promise<boolean> => {
      // 检查路径冲突
      const conflict = pathValidator.checkConflict(title, null, menus);
      if (conflict) {
        setPathConflict(conflict);
        return false;
      }

      const result = await runWrite('新建', () => new SortableMenuSimple({ title, parentId: null }).save());
      if (result.ok) setPathConflict(null);
      return result.ok;
    },
    [menus, pathValidator, runWrite]
  );

  // REACT-FRESH-01：叶子删除原先是 `void menu.remove()` —— 既不等待也不处理 rejection。
  // 这里统一成 async，失败落进 `writeError`，由页面渲染；是否有子节点以库里的直接子节点为准。
  const deleteMenu = useCallback(
    async (menu: SortableMenuSimple): Promise<void> => {
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

    // 这两个 execute* 是直接挂在 onClick 上的 async 函数，rejection 无人接管：和叶子路径共用同一个错误出口。
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
    writeError,
    runWrite,
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
    clearWriteError
  };
}
