import { type RxDB, type RxDBEntityId, type UUID } from '@aiao/rxdb';
import { SortableMenuLarge } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { computed, ref, toRaw, type Ref } from 'vue';
import { generateBatchMenus } from '../utils/menu-utils';
import { promoteChildrenAndRemove } from '../utils/promote-children';
import { buildTreeMenuNodes, type TreeMenuNode } from '../utils/tree-menu';
import { useTreeWriteError } from './useTreeWriteError';

export type VirtualTreeNode = TreeMenuNode<SortableMenuLarge>;

/** 按父节点从库里取直接子节点（不看页面已加载的列表）。 */
const fetchChildren = (parentId: RxDBEntityId): Promise<SortableMenuLarge[]> =>
  firstValueFrom(
    SortableMenuLarge.findAll({
      where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: parentId as UUID }] }
    })
  );

export function useTreeMenuVirtualStore(menus: Ref<SortableMenuLarge[]>, rxdb: RxDB) {
  const expandedIds = ref<Set<RxDBEntityId>>(new Set());
  const editingId = ref<RxDBEntityId | null>(null);
  const selectedParentId = ref<RxDBEntityId | null>(null);
  const searchKeyword = ref('');
  const menuToDelete = ref<SortableMenuLarge | null>(null);
  const { writeError, clearWriteError, guardWrite } = useTreeWriteError();
  // 库里的直接子节点数：弹出删除对话框时按库取，不看页面已加载的列表
  const deleteChildrenCount = ref(0);

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

  // 不给 sortOrder：引擎把缺键的新节点追加到所属 parentId 组末尾
  // 新建返回是否已落库：写入失败时为 false，页面据此决定是否清空输入
  const addChild = async (parentMenu: SortableMenuLarge, title: string): Promise<boolean> => {
    const newMenu = new SortableMenuLarge({ title, parentId: parentMenu.id });
    const saved = await guardWrite('新建', () => newMenu.save());
    if (!saved) return false;

    const next = new Set(expandedIds.value);
    next.add(parentMenu.id);
    expandedIds.value = next;
    return true;
  };

  const addRoot = async (title: string): Promise<boolean> => {
    const newMenu = new SortableMenuLarge({ title, parentId: null });
    return guardWrite('新建', () => newMenu.save());
  };

  // 保存重命名；失败时回退到库里已提交的标题并给出页内提示
  const commitEdit = async (menu: SortableMenuLarge) => {
    const saved = await guardWrite('重命名', () => menu.save());
    if (!saved) menu.reset();
    cancelEdit();
  };

  // 批量添加：整批一次 saveMany，生成器不写 sortOrder
  const addManyMenus = (count: number) =>
    guardWrite('批量添加', () => rxdb.entityManager.saveMany(generateBatchMenus(count, SortableMenuLarge)));

  // 是否弹对话框以库里的直接子节点为准；叶子节点直接删除
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
    const target = menuToDelete.value;
    if (!target) return;

    // 级联删除：删除自己和所有后代
    const collectDescendants = (id: RxDBEntityId): RxDBEntityId[] => {
      const children = menus.value.filter(m => m.parentId === id);
      return children.flatMap(child => [child.id, ...collectDescendants(child.id)]);
    };

    const descendantIds = collectDescendants(target.id);
    const menusToRemove = menus.value.filter(m => m.id === target.id || descendantIds.includes(m.id));

    await guardWrite('级联删除', async () => {
      for (const menu of menusToRemove) {
        await menu.remove();
      }
    });
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

    const childrenCount = deleteChildrenCount.value;
    return {
      childrenCount,
      descendantsCount: Math.max(countDescendants(menuToDelete.value.id), childrenCount)
    };
  });

  const selectParent = (id: RxDBEntityId | null) => {
    selectedParentId.value = id;
  };

  const updateSearchKeyword = (value: string) => {
    searchKeyword.value = value;
  };

  // 删除所有菜单：页内错误提示，不留未处理拒绝
  const deleteAllMenus = () => guardWrite('删除全部', () => rxdb.entityManager.removeMany(menus.value));

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
    addManyMenus,
    commitEdit,
    writeError,
    clearWriteError,
    guardWrite,
    deleteMenu,
    deleteAllMenus,
    cancelDelete,
    executeCascadeDelete,
    executePromoteChildrenDelete,
    selectParent,
    setSelectedParentId: selectParent,
    setSearchKeyword: updateSearchKeyword
  };
}
