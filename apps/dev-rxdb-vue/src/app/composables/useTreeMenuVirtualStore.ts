import type { RxDBEntityId } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { generateKeyBetween } from '@aiao/utils';
import { computed, ref, type Ref } from 'vue';
import { buildTreeMenuNodes, type TreeMenuNode } from '../utils/tree-menu';
import { formatErrorMessage, useToast } from './useToast';

export type VirtualTreeNode = TreeMenuNode<MenuLarge>;

export function useTreeMenuVirtualStore(menus: Ref<MenuLarge[]>) {
  const expandedIds = ref<Set<RxDBEntityId>>(new Set());
  const editingId = ref<RxDBEntityId | null>(null);
  const selectedParentId = ref<RxDBEntityId | null>(null);
  const searchKeyword = ref('');
  const menuToDelete = ref<MenuLarge | null>(null);

  const treeNodes = computed<VirtualTreeNode[]>(() =>
    buildTreeMenuNodes(
      menus.value,
      expandedIds.value,
      searchKeyword.value,
      (menu, children) => menu.hasChildren ?? children.length > 0
    )
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
    const allParentIds = new Set(
      menus.value.filter(m => menus.value.some(child => child.parentId === m.id)).map(m => m.id)
    );
    expandedIds.value = allParentIds;
  };

  const collapseAll = () => {
    expandedIds.value = new Set();
  };

  const startEdit = (menuId: RxDBEntityId) => {
    editingId.value = menuId;
  };

  const cancelEdit = () => {
    editingId.value = null;
  };

  const addChild = async (parentMenu: MenuLarge, title: string) => {
    const siblings = menus.value.filter(m => m.parentId === parentMenu.id);
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
    const next = new Set(expandedIds.value);
    next.add(parentMenu.id);
    expandedIds.value = next;
  };

  const addRoot = async (title: string) => {
    const rootMenus = menus.value.filter(m => m.parentId === null);
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
  };

  const deleteMenu = async (menu: MenuLarge): Promise<void> => {
    const hasChildren = menus.value.some(m => m.parentId === menu.id);
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
      // 有子节点，显示对话框
      menuToDelete.value = menu;
    }
  };

  const cancelDelete = () => {
    menuToDelete.value = null;
  };

  const executeCascadeDelete = async () => {
    if (!menuToDelete.value) return;

    // 级联删除：删除自己和所有后代
    const collectDescendants = (id: RxDBEntityId): RxDBEntityId[] => {
      const children = menus.value.filter(m => m.parentId === id);
      return children.flatMap(child => [child.id, ...collectDescendants(child.id)]);
    };

    const descendantIds = collectDescendants(menuToDelete.value.id);
    const menusToRemove = menus.value.filter(m => m.id === menuToDelete.value!.id || descendantIds.includes(m.id));

    for (const menu of menusToRemove) {
      await menu.remove();
    }

    menuToDelete.value = null;
  };

  const executePromoteChildrenDelete = async () => {
    if (!menuToDelete.value) return;

    // 删除父节点，子节点提升
    const children = menus.value.filter(m => m.parentId === menuToDelete.value!.id);
    const newParentId = menuToDelete.value.parentId;

    // 更新子节点的 parentId
    for (const child of children) {
      child.parentId = newParentId;
      await child.save();
    }

    // 删除当前节点
    await menuToDelete.value.remove();
    menuToDelete.value = null;
  };

  // 统计信息
  const expandedCount = computed(() => expandedIds.value.size);
  const isAllExpanded = computed(() => {
    const allParentIds = menus.value.filter(m => menus.value.some(child => child.parentId === m.id)).map(m => m.id);
    return allParentIds.length > 0 && allParentIds.every(id => expandedIds.value.has(id));
  });

  // 删除影响计算
  const deleteImpact = computed(() => {
    if (!menuToDelete.value) return { childrenCount: 0, descendantsCount: 0 };

    const countDescendants = (id: RxDBEntityId): number => {
      const children = menus.value.filter(m => m.parentId === id);
      return children.reduce((count, child) => count + 1 + countDescendants(child.id), 0);
    };

    const target = menuToDelete.value;
    const children = menus.value.filter(m => m.parentId === target.id);
    return {
      childrenCount: children.length,
      descendantsCount: countDescendants(target.id)
    };
  });

  const selectParent = (id: RxDBEntityId | null) => {
    selectedParentId.value = id;
  };

  const updateSearchKeyword = (value: string) => {
    searchKeyword.value = value;
  };

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
    selectParent,
    setSelectedParentId: selectParent,
    setSearchKeyword: updateSearchKeyword
  };
}
