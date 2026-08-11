import type { RxDBEntityId } from '@aiao/rxdb';
import { MenuSimple } from '@aiao/rxdb-test/entities';
import { generateKeyBetween } from '@aiao/utils';
import { computed, ref, unref, type MaybeRef } from 'vue';
import { buildTreeMenuNodes, type TreeMenuNode } from '../utils/tree-menu';
import { MenuPathConflict, useMenuPathValidator } from './useMenuPathValidator';

export type TreeNode = TreeMenuNode<MenuSimple>;

export function useTreeMenuStore(menus: MaybeRef<MenuSimple[]>) {
  const expandedIds = ref<Set<RxDBEntityId>>(new Set());
  const editingId = ref<RxDBEntityId | null>(null);
  const selectedParentId = ref<RxDBEntityId | null>(null);
  const searchKeyword = ref('');
  const pathConflict = ref<MenuPathConflict | null>(null);
  const menuToDelete = ref<MenuSimple | null>(null);

  const pathValidator = useMenuPathValidator();

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

    const rootMenus = unref(menus).filter(m => m.parentId === null);
    rootMenus.sort((a, b) => {
      const orderA = a.sortOrder || '';
      const orderB = b.sortOrder || '';
      return orderA.localeCompare(orderB);
    });
    const lastMenu = rootMenus[rootMenus.length - 1];
    const lastSortOrder = lastMenu ? lastMenu.sortOrder : null;
    const newSortOrder = generateKeyBetween(lastSortOrder, null);

    const newMenu = new MenuSimple({
      title,
      sortOrder: newSortOrder,
      parentId: null
    });
    await newMenu.save();
    return true;
  };

  const addChild = async (parent: MenuSimple, title: string) => {
    const parentId = parent.id;
    const conflict = pathValidator.checkConflict(title, parentId, unref(menus));
    if (conflict) {
      pathConflict.value = conflict;
      return false;
    }

    const siblings = unref(menus).filter(m => m.parentId === parentId);
    siblings.sort((a, b) => {
      const orderA = a.sortOrder || '';
      const orderB = b.sortOrder || '';
      return orderA.localeCompare(orderB);
    });
    const lastMenu = siblings[siblings.length - 1];
    const lastSortOrder = lastMenu ? lastMenu.sortOrder : null;
    const newSortOrder = generateKeyBetween(lastSortOrder, null);

    const newMenu = new MenuSimple({
      title,
      sortOrder: newSortOrder,
      parentId
    });
    await newMenu.save();

    if (!expandedIds.value.has(parentId)) {
      toggleExpand(parentId);
    }
    return true;
  };

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

    const childrenCount = unref(menus).filter(m => m.parentId === menuToDelete.value!.id).length;
    const descendantsCount = countDescendants(menuToDelete.value!.id);

    return { childrenCount, descendantsCount };
  });

  const deleteMenu = (menu: MenuSimple) => {
    menuToDelete.value = menu;
  };

  const showDeleteDialog = (menu: MenuSimple) => {
    menuToDelete.value = menu;
  };

  const cancelDelete = () => {
    menuToDelete.value = null;
  };

  const executeCascadeDelete = async () => {
    if (!menuToDelete.value) return;

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

    await deleteWithChildren(menuToDelete.value.id);
    menuToDelete.value = null;
  };

  const executePromoteChildrenDelete = async () => {
    if (!menuToDelete.value) return;

    const parentId = menuToDelete.value.parentId;
    const children = unref(menus).filter(m => m.parentId === menuToDelete.value!.id);

    await Promise.all(
      children.map(child => {
        child.parentId = parentId;
        return child.save();
      })
    );

    await menuToDelete.value.remove();
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
