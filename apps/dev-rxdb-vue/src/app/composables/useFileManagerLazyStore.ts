import { RxDB, UUID, type RxDBEntityId } from '@aiao/rxdb';
import { SortableFileLarge } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getSortComparator, loadStoredSortMode, persistSortMode, SortMode } from '../utils/file-sorters';
import { generateBatchFiles } from '../utils/file-utils';
import { formatErrorMessage, useToast } from './useToast';
import { useTreeWriteError } from './useTreeWriteError';

const fetchAllFiles = (): Promise<SortableFileLarge[]> =>
  firstValueFrom(SortableFileLarge.findAll({ where: { combinator: 'and', rules: [] } }));

/** 库里某节点的直接子节点（不传 orderBy：沿用引擎默认的手动顺序）。 */
const fetchChildren = (parentId: RxDBEntityId): Promise<SortableFileLarge[]> =>
  firstValueFrom(
    SortableFileLarge.findAll({
      where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: parentId as UUID }] }
    })
  );

/** 库里某节点的子树：节点自身加全部后代。 */
const fetchSubtree = (entityId: RxDBEntityId): Promise<SortableFileLarge[]> =>
  firstValueFrom(SortableFileLarge.findDescendants({ entityId: entityId as UUID }));

/**
 * 名称非空白的行才展示。
 *
 * 只用在渲染层：空白名称的行仍是库里同组的成员，`rootIds` / `childrenMap` 保留它们，
 * 否则拖放换算出的邻居之间夹着它，引擎会以 `staleTarget` 拒绝。
 */
const hasVisibleName = (file: SortableFileLarge): boolean => file.name.trim() !== '';

export interface FileLazyNode {
  file: SortableFileLarge;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isLoading: boolean;
  isMatched?: boolean;
}

export interface DeleteImpact {
  childrenCount: number;
  descendantsCount: number;
}

export function useFileManagerLazyStore(rxdb: RxDB) {
  const nodesMap = ref<Map<RxDBEntityId, SortableFileLarge>>(new Map());
  const expandedIds = ref<Set<RxDBEntityId>>(new Set());
  const loadingIds = ref<Set<RxDBEntityId>>(new Set());
  const rootIds = ref<RxDBEntityId[]>([]);
  const childrenMap = ref<Map<RxDBEntityId, RxDBEntityId[]>>(new Map()); // parentId -> childIds
  const editingId = ref<RxDBEntityId | null>(null);
  const searchKeyword = ref('');
  const selectedFolderId = ref<RxDBEntityId | null>(null);
  const fileToDelete = ref<SortableFileLarge | null>(null);
  const isAddingFile = ref(false);
  const sortMode = ref<SortMode>(loadStoredSortMode(Object.values(SortMode) as readonly SortMode[], SortMode.Manual));
  const isFullMode = ref(false);
  const { writeError, clearWriteError, guardWrite } = useTreeWriteError();

  // 存储活跃的订阅，用于清理
  const subscriptions = new Map<RxDBEntityId | string, { unsubscribe: () => void }>();

  const subscribeToRoot = () => {
    // 2. Subscribe to ROOT
    const rootQuery$ = SortableFileLarge.findAll({
      where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: null }] }
    });
    const subscription = rootQuery$.subscribe({
      next: (roots: SortableFileLarge[]) => {
        const newMap = new Map(nodesMap.value);
        // 更新或添加根节点：空白名称的行也保留，展示时才过滤
        roots.forEach(root => newMap.set(root.id, root));
        // 删除不再是根节点的节点
        Array.from(nodesMap.value.keys()).forEach(id => {
          const node = nodesMap.value.get(id);
          if (node?.parentId === null && !roots.find(r => r.id === id)) {
            newMap.delete(id);
          }
        });
        nodesMap.value = newMap;

        // 保持查询顺序（手动顺序），不再文件夹优先预排序；是完整组，拖放换算邻居要用
        rootIds.value = roots.map(root => root.id);
      },
      error: (error: unknown) => {
        useToast().error(formatErrorMessage('文件根目录加载失败', error));
      }
    });

    if (subscriptions.has('ROOT')) {
      subscriptions.get('ROOT')?.unsubscribe();
    }
    subscriptions.set('ROOT', subscription);
    return subscription;
  };

  onMounted(() => {
    subscribeToRoot();
  });

  onUnmounted(() => {
    subscriptions.forEach(sub => sub.unsubscribe());
    subscriptions.clear();
  });

  // 搜索匹配的文件 IDs
  const matchedFileIds = computed(() => {
    const matched = new Set<RxDBEntityId>();
    if (!searchKeyword.value) return matched;

    const keyword = searchKeyword.value.toLowerCase();
    nodesMap.value.forEach(file => {
      const fullName = file.extension ? `${file.name}${file.extension}` : file.name;
      if (fullName.toLowerCase().includes(keyword)) {
        matched.add(file.id);
      }
    });
    return matched;
  });

  // 已展开数量和是否全部展开
  const expandedCount = computed(() => expandedIds.value.size);
  const isAllExpanded = computed(() => {
    if (!isFullMode.value) return false;
    const folderCount = Array.from(nodesMap.value.values()).filter(f => f.type === 'folder').length;
    return folderCount > 0 && expandedIds.value.size === folderCount;
  });

  // 删除影响分析：弹出对话框时按库取，折叠文件夹（子节点未加载）也算
  const deleteImpact = ref<DeleteImpact>({ childrenCount: 0, descendantsCount: 0 });

  // Flatten visible nodes
  const treeNodes = computed(() => {
    const result: FileLazyNode[] = [];
    const comparator = getSortComparator(sortMode.value);
    // 手动模式 comparator 为 null：沿用查询顺序，不排序
    const sortIds = (ids: readonly RxDBEntityId[]): readonly RxDBEntityId[] => {
      if (!comparator) return ids;
      return [...ids].sort((a, b) => {
        const nodeA = nodesMap.value.get(a);
        const nodeB = nodesMap.value.get(b);
        if (!nodeA || !nodeB) return 0;
        return comparator(nodeA, nodeB);
      });
    };

    const traverse = (id: RxDBEntityId, level: number) => {
      const file = nodesMap.value.get(id);
      // 空白名称的行留在组里参与拖放换算，只是不展示
      if (!file || !hasVisibleName(file)) return;

      const isExpanded = expandedIds.value.has(id);
      const isLoading = loadingIds.value.has(id);
      const isMatched = matchedFileIds.value.has(id);

      // 使用数据库的 hasChildren 属性（由树特性自动计算）
      const hasChildren = file.hasChildren ?? false;

      result.push({
        file,
        level,
        isExpanded,
        hasChildren,
        isLoading,
        isMatched
      });

      if (isExpanded && file.type === 'folder') {
        sortIds(childrenMap.value.get(id) || []).forEach(childId => traverse(childId, level + 1));
      }
    };

    sortIds(rootIds.value).forEach(id => traverse(id, 0));
    return result;
  });

  const toggleExpand = async (id: RxDBEntityId) => {
    const file = nodesMap.value.get(id);
    if (!file || file.type !== 'folder') return;

    if (expandedIds.value.has(id)) {
      // 折叠：清理订阅和数据
      const subscription = subscriptions.get(id);
      if (subscription) {
        subscription.unsubscribe();
        subscriptions.delete(id);
      }

      expandedIds.value.delete(id);
      // Trigger reactivity
      expandedIds.value = new Set(expandedIds.value);

      // 加载中折叠：订阅已退订，不会再收到 next，这里清掉 loading 状态
      loadingIds.value.delete(id);
      loadingIds.value = new Set(loadingIds.value);

      const descendantIds: RxDBEntityId[] = [];
      const collectDescendants = (parentId: RxDBEntityId): void => {
        for (const childId of childrenMap.value.get(parentId) ?? []) {
          descendantIds.push(childId);
          collectDescendants(childId);
        }
      };
      collectDescendants(id);

      for (const descendantId of descendantIds) {
        subscriptions.get(descendantId)?.unsubscribe();
        subscriptions.delete(descendantId);
      }

      const newChildrenMap = new Map(childrenMap.value);
      newChildrenMap.delete(id);
      descendantIds.forEach(descendantId => newChildrenMap.delete(descendantId));
      childrenMap.value = newChildrenMap;

      const newNodesMap = new Map(nodesMap.value);
      descendantIds.forEach(descendantId => newNodesMap.delete(descendantId));
      nodesMap.value = newNodesMap;
    } else {
      // 展开：创建订阅
      expandedIds.value.add(id);
      // Trigger reactivity
      expandedIds.value = new Set(expandedIds.value);

      // 开始加载
      loadingIds.value.add(id);
      loadingIds.value = new Set(loadingIds.value);

      // 创建响应式订阅
      const childQuery$ = SortableFileLarge.findAll({
        where: {
          combinator: 'and',
          rules: [{ field: 'parentId', operator: '=', value: id as UUID }]
        }
      });

      const subscription = childQuery$.subscribe({
        next: (children: SortableFileLarge[]) => {
          const newNodesMap = new Map(nodesMap.value);
          children.forEach(child => {
            newNodesMap.set(child.id, child);
          });
          nodesMap.value = newNodesMap;

          // 完整组（含空白名称的行），展示时才过滤
          const childIds = children.map(c => c.id);

          const newChildrenMap = new Map(childrenMap.value);
          newChildrenMap.set(id, childIds);
          childrenMap.value = newChildrenMap;

          // 停止加载状态
          loadingIds.value.delete(id);
          loadingIds.value = new Set(loadingIds.value);
        },
        error: (error: unknown) => {
          useToast().error(formatErrorMessage(`加载子节点失败 (${id})`, error));
          loadingIds.value.delete(id);
          loadingIds.value = new Set(loadingIds.value);
        }
      });

      subscriptions.set(id, subscription);
    }
  };

  const startEdit = (id: RxDBEntityId) => {
    editingId.value = id;
  };
  const cancelEdit = () => {
    editingId.value = null;
  };

  // 批量添加：整批一次 saveMany，生成器不写 sortOrder，也不取根节点作锚点
  const addManyFiles = async (count: number) => {
    // 1. Unsubscribe everything
    subscriptions.forEach(sub => sub.unsubscribe());
    subscriptions.clear();

    // 2. Generate and save files
    const saved = await guardWrite('批量添加', () =>
      rxdb.entityManager.saveMany(generateBatchFiles(count, SortableFileLarge))
    );

    // 3. Reset state and resubscribe（失败时也重订阅，页面回到库里已提交的状态）
    expandedIds.value = new Set();
    childrenMap.value = new Map();
    loadingIds.value = new Set();
    nodesMap.value = new Map();
    rootIds.value = [];

    if (isFullMode.value) {
      expandAll();
    } else {
      subscribeToRoot();
    }
    return saved;
  };

  const expandAll = () => {
    isFullMode.value = true;

    // 1. Unsubscribe everything
    subscriptions.forEach(sub => sub.unsubscribe());
    subscriptions.clear();

    // 2. Subscribe to ALL
    const allQuery$ = SortableFileLarge.findAll({
      where: {
        combinator: 'and',
        rules: []
      }
    });

    const subscription = allQuery$.subscribe({
      next: (allFiles: SortableFileLarge[]) => {
        const newNodesMap = new Map<RxDBEntityId, SortableFileLarge>();
        const newChildrenMap = new Map<RxDBEntityId, RxDBEntityId[]>();
        const newRootIds: RxDBEntityId[] = [];
        const newExpandedIds = new Set<RxDBEntityId>();

        // 各组保留完整成员（含空白名称的行），展示时才过滤
        allFiles.forEach(file => {
          newNodesMap.set(file.id, file);
          if (file.parentId) {
            if (!newChildrenMap.has(file.parentId)) {
              newChildrenMap.set(file.parentId, []);
            }
            newChildrenMap.get(file.parentId)!.push(file.id);
          } else {
            newRootIds.push(file.id);
          }

          // Expand if it is a folder
          if (file.type === 'folder') {
            newExpandedIds.add(file.id);
          }
        });

        nodesMap.value = newNodesMap;
        childrenMap.value = newChildrenMap;
        rootIds.value = newRootIds;
        expandedIds.value = newExpandedIds;
        loadingIds.value = new Set();
      },
      error: (err: unknown) => useToast().error(formatErrorMessage('展开全部失败', err))
    });

    subscriptions.set('ALL', subscription);
  };

  const collapseAll = () => {
    isFullMode.value = false;

    // 1. Unsubscribe everything
    subscriptions.forEach(sub => sub.unsubscribe());
    subscriptions.clear();

    // 2. Reset State
    expandedIds.value = new Set();
    childrenMap.value = new Map();
    loadingIds.value = new Set();
    nodesMap.value = new Map();
    rootIds.value = [];

    // 3. Subscribe to ROOT
    subscribeToRoot();
  };

  const selectFolder = (folderId: RxDBEntityId) => {
    selectedFolderId.value = folderId;
  };

  const cancelSelectFolder = () => {
    selectedFolderId.value = null;
  };

  const getSelectedFolderName = () => {
    if (!selectedFolderId.value) return '';
    const folder = nodesMap.value.get(selectedFolderId.value);
    return folder?.name || '';
  };

  const toggleAddingMode = () => {
    isAddingFile.value = !isAddingFile.value;
  };

  const changeSortMode = (mode: SortMode) => {
    sortMode.value = mode;
    persistSortMode(mode);
  };

  // 先按库取直接子节点与子树，再打开对话框：折叠文件夹的后代不在 store 里，不能按已加载节点计数
  const showDeleteDialog = async (file: SortableFileLarge) => {
    await guardWrite('删除', async () => {
      const [children, subtree] = await Promise.all([fetchChildren(file.id), fetchSubtree(file.id)]);
      // findDescendants 含节点自身
      deleteImpact.value = { childrenCount: children.length, descendantsCount: subtree.length - 1 };
      fileToDelete.value = file;
    });
  };

  const closeDeleteDialog = () => {
    fileToDelete.value = null;
    deleteImpact.value = { childrenCount: 0, descendantsCount: 0 };
  };

  const cancelDelete = () => {
    closeDeleteDialog();
  };

  const executeCascadeDelete = async () => {
    const selected = fileToDelete.value;
    if (!selected) return;

    // 文件夹的后代可能还没加载，按类型而不是已加载子节点数判断
    const operation = selected.type === 'folder' ? '级联删除' : '删除';
    await guardWrite(operation, async () => {
      // 子树取自库（含自身），一次 removeMany 提交
      await rxdb.entityManager.removeMany(await fetchSubtree(selected.id));
    });
    closeDeleteDialog();
  };

  const clearSearch = () => {
    searchKeyword.value = '';
  };

  // 不给 sortOrder：引擎把缺键的新节点追加到所属 parentId 组末尾（文件与文件夹同属一组）
  // 新建返回是否已落库：写入失败时为 false，页面据此决定是否清空输入
  const addRoot = async (name: string, type: 'file' | 'folder', extension?: string): Promise<boolean> => {
    const file = new SortableFileLarge({
      name,
      type,
      extension: type === 'file' ? extension?.replace(/^\./, '') || name.split('.').pop() : undefined,
      size: type === 'file' ? Math.floor(Math.random() * 10000) : undefined
    });
    const saved = await guardWrite('新建', () => rxdb.entityManager.save(file));
    if (!saved) return false;

    // Update local state
    const newNodesMap = new Map(nodesMap.value);
    newNodesMap.set(file.id, file);
    nodesMap.value = newNodesMap;
    rootIds.value = [...rootIds.value, file.id];
    return true;
  };

  const addChild = async (
    parent: SortableFileLarge,
    name: string,
    type: 'file' | 'folder',
    extension?: string
  ): Promise<boolean> => {
    const file = new SortableFileLarge({
      name,
      type,
      extension: type === 'file' ? extension?.replace(/^\./, '') || name.split('.').pop() : undefined,
      size: type === 'file' ? Math.floor(Math.random() * 10000) : undefined
    });
    file.parentId = parent.id;
    const saved = await guardWrite('新建', () => rxdb.entityManager.save(file));
    if (!saved) return false;

    // Update local state
    const newNodesMap = new Map(nodesMap.value);
    newNodesMap.set(file.id, file);
    nodesMap.value = newNodesMap;

    const newChildrenMap = new Map(childrenMap.value);
    const current = newChildrenMap.get(parent.id) || [];
    newChildrenMap.set(parent.id, [...current, file.id]);
    childrenMap.value = newChildrenMap;

    // Ensure expanded
    if (!expandedIds.value.has(parent.id)) {
      expandedIds.value.add(parent.id);
      expandedIds.value = new Set(expandedIds.value);
    }
    return true;
  };

  // 保存重命名；失败时回退到库里已提交的名称并给出页内提示
  const commitEdit = async (file: SortableFileLarge) => {
    const saved = await guardWrite('重命名', () => file.save());
    if (!saved) file.reset();
    cancelEdit();
  };

  // 删除所有文件 - 内部一次性 fetch 全表后批量删除
  const deleteAllFiles = () =>
    guardWrite('删除全部', async () => {
      const allFiles = await fetchAllFiles();
      await rxdb.entityManager.removeMany(allFiles);
    });

  /**
   * 已加载到 store 内的节点快照。供拖放校验、循环嵌套检测使用，避免 page 端再开一份全表订阅。
   */
  const loadedNodes = computed<SortableFileLarge[]>(() => Array.from(nodesMap.value.values()));

  /**
   * 某个父节点下已加载的完整子节点 id 序列（`null` 为根组），按手动顺序；
   * 拖放换算前后放置的邻居用它，不用页面可见行，也不用 `loadedNodes`。
   */
  const siblingIds = (parentId: RxDBEntityId | null): readonly RxDBEntityId[] =>
    parentId === null ? rootIds.value : (childrenMap.value.get(parentId) ?? []);

  return {
    treeNodes,
    expandedIds,
    loadingIds,
    editingId,
    searchKeyword,
    selectedFolderId,
    fileToDelete,
    deleteImpact,
    isAddingFile,
    sortMode,
    matchedFileIds,
    expandedCount,
    isAllExpanded,
    addManyFiles,
    toggleExpand,
    expandAll,
    collapseAll,
    startEdit,
    cancelEdit,
    addRoot,
    addChild,
    commitEdit,
    writeError,
    clearWriteError,
    guardWrite,
    selectFolder,
    cancelSelectFolder,
    getSelectedFolderName,
    toggleAddingMode,
    changeSortMode,
    showDeleteDialog,
    cancelDelete,
    executeCascadeDelete,
    clearSearch,
    deleteAllFiles,
    loadedNodes,
    siblingIds
  };
}
