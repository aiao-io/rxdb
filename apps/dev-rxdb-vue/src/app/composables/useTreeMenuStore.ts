import { type RxDB, type RxDBEntityId, type UUID } from '@aiao/rxdb';
import { SortableMenuSimple } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { computed, ref, toRaw, unref, type MaybeRef } from 'vue';
import { generateBatchMenus } from '../utils/menu-utils';
import { promoteChildrenAndRemove } from '../utils/promote-children';
import { buildTreeMenuNodes, type TreeMenuNode } from '../utils/tree-menu';
import { MenuPathConflict, useMenuPathValidator } from './useMenuPathValidator';
import { useTreeWriteError } from './useTreeWriteError';

export type TreeNode = TreeMenuNode<SortableMenuSimple>;

/** 按父节点从库里取直接子节点（不看页面已加载的列表）。 */
const fetchChildren = (parentId: RxDBEntityId): Promise<SortableMenuSimple[]> =>
  firstValueFrom(
    SortableMenuSimple.findAll({
      where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: parentId as UUID }] }
    })
  );

export function useTreeMenuStore(menus: MaybeRef<SortableMenuSimple[]>, rxdb: RxDB) {
  const expandedIds = ref<Set<RxDBEntityId>>(new Set());
  const editingId = ref<RxDBEntityId | null>(null);
  const selectedParentId = ref<RxDBEntityId | null>(null);
  const searchKeyword = ref('');
  const pathConflict = ref<MenuPathConflict | null>(null);
  const menuToDelete = ref<SortableMenuSimple | null>(null);

  const pathValidator = useMenuPathValidator();
  const { writeError, clearWriteError, guardWrite } = useTreeWriteError();

  const expandedCount = computed(() => expandedIds.value.size);

  const isAllExpanded = computed(() => {
    const items = unref(menus);
    const allParentIds = new Set(items.filter(m => items.some(child => child.parentId === m.id)).map(m => m.id));
    return allParentIds.size > 0 && expandedIds.value.size >= allParentIds.size;
  });

  const treeNodes = computed<TreeNode[]>(() =>
    buildTreeMenuNodes(unref(menus), expandedIds.value, searchKeyword.value)
  );

  const toggleExpand = (menuId: RxDBEntityId) => {
    const next = new Set(expandedIds.value);
    if (next.has(menuId)) {
      next.delete(menuId);
    } else {
      next.add(menuId);
    }
    expandedIds.value = next;
  };

  const expandAll = () => {
    const items = unref(menus);
    const allParentIds = new Set(items.filter(m => items.some(child => child.parentId === m.id)).map(m => m.id));
    expandedIds.value = allParentIds;
  };

  const collapseAll = () => {
    expandedIds.value = new Set();
  };

  const startEdit = (menuId: RxDBEntityId) => {
    editingId.value = menuId;
    pathConflict.value = null;
  };

  const cancelEdit = () => {
    editingId.value = null;
    pathConflict.value = null;
  };

  const validateName = (name: string, parentId: string | null, currentNodeId?: string) => {
    const conflict = pathValidator.checkConflict(name, parentId, unref(menus), currentNodeId);
    pathConflict.value = conflict;
    return !conflict;
  };

  const addRoot = async (title: string) => {
    const conflict = pathValidator.checkConflict(title, null, unref(menus));
    if (conflict) {
      pathConflict.value = conflict;
      return false;
    }

    // 不给 sortOrder：引擎把缺键的新节点追加到所属 parentId 组末尾
    const newMenu = new SortableMenuSimple({ title, parentId: null });
    return guardWrite('新建', () => newMenu.save());
  };

  const addChild = async (parent: SortableMenuSimple, title: string) => {
    const parentId = parent.id;
    const conflict = pathValidator.checkConflict(title, parentId, unref(menus));
    if (conflict) {
      pathConflict.value = conflict;
      return false;
    }

    const newMenu = new SortableMenuSimple({ title, parentId });
    const saved = await guardWrite('新建', () => newMenu.save());
    if (saved && !expandedIds.value.has(parentId)) {
      toggleExpand(parentId);
    }
    return saved;
  };

  // 保存重命名；失败时回退到库里已提交的标题并给出页内提示
  const commitEdit = async (menu: SortableMenuSimple) => {
    const saved = await guardWrite('重命名', () => menu.save());
    if (!saved) menu.reset();
    cancelEdit();
  };

  // 批量添加：整批一次 saveMany，生成器不写 sortOrder
  const addManyMenus = (count: number) =>
    guardWrite('批量添加', () => rxdb.entityManager.saveMany(generateBatchMenus(count, SortableMenuSimple)));

  // 库里的直接子节点数：弹出删除对话框时按库取，不看页面已加载的列表
  const deleteChildrenCount = ref(0);

  const deleteImpact = computed(() => {
    if (!menuToDelete.value) return { childrenCount: 0, descendantsCount: 0 };

    const countDescendants = (parentId: RxDBEntityId): number => {
      const children = unref(menus).filter(m => m.parentId === parentId);
      let count = children.length;
      children.forEach(child => {
        count += countDescendants(child.id);
      });
      return count;
    };

    const childrenCount = deleteChildrenCount.value;
    const descendantsCount = Math.max(countDescendants(menuToDelete.value.id), childrenCount);

    return { childrenCount, descendantsCount };
  });

  const showDeleteDialog = async (menu: SortableMenuSimple) => {
    const opened = await guardWrite('删除', async () => {
      deleteChildrenCount.value = (await fetchChildren(menu.id)).length;
    });
    if (opened) menuToDelete.value = menu;
  };

  const deleteMenu = showDeleteDialog;

  const cancelDelete = () => {
    menuToDelete.value = null;
  };

  const executeCascadeDelete = async () => {
    const target = menuToDelete.value;
    if (!target) return;

    const deleteWithChildren = async (id: RxDBEntityId) => {
      const children = unref(menus).filter(m => m.parentId === id);
      for (const child of children) {
        await deleteWithChildren(child.id);
      }
      const menu = unref(menus).find(m => m.id === id);
      if (menu) {
        await menu.remove();
      }
    };

    const operation = deleteImpact.value.childrenCount > 0 ? '级联删除' : '删除';
    await guardWrite(operation, () => deleteWithChildren(target.id));
    menuToDelete.value = null;
  };

  // 删除并提升子节点：子节点取自库，只改 parentId，与删除同一次 mutations 提交
  const executePromoteChildrenDelete = async () => {
    const target = menuToDelete.value;
    if (!target) return;

    await guardWrite('删除并提升子节点', async () => {
      const children = await fetchChildren(target.id);
      await promoteChildrenAndRemove(rxdb, toRaw(target), children);
    });
    menuToDelete.value = null;
  };

  const selectParent = (id: RxDBEntityId | null) => {
    selectedParentId.value = id;
  };

  const updateSearchKeyword = (value: string) => {
    searchKeyword.value = value;
  };

  const clearPathConflict = () => {
    pathConflict.value = null;
  };

  return {
    expandedIds,
    editingId,
    selectedParentId,
    searchKeyword,
    pathConflict,
    menuToDelete,
    treeNodes,
    expandedCount,
    isAllExpanded,
    toggleExpand,
    expandAll,
    collapseAll,
    startEdit,
    cancelEdit,
    validateName,
    addRoot,
    addChild,
    addManyMenus,
    commitEdit,
    writeError,
    clearWriteError,
    guardWrite,
    deleteMenu,
    showDeleteDialog,
    cancelDelete,
    executeCascadeDelete,
    executePromoteChildrenDelete,
    deleteImpact,
    selectParent,
    setSelectedParentId: selectParent,
    setSearchKeyword: updateSearchKeyword,
    clearPathConflict
  };
}
