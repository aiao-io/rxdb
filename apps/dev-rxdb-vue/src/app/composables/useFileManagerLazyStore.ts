import { RxDB, UUID, type RxDBEntityId } from '@aiao/rxdb';
import { FileLarge } from '@aiao/rxdb-test/entities';
import { generateKeyBetween } from '@aiao/utils';
import { firstValueFrom } from 'rxjs';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getSortComparator, loadStoredSortMode, persistSortMode, SortMode } from '../utils/file-sorters';
import { generateBatchFiles } from '../utils/file-utils';
import { formatErrorMessage, useToast } from './useToast';

const fetchAllFiles = (): Promise<FileLarge[]> =>
  firstValueFrom(FileLarge.findAll({ where: { combinator: 'and', rules: [] } }));

export interface FileLazyNode {
  file: FileLarge;
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
  const nodesMap = ref<Map<RxDBEntityId, FileLarge>>(new Map());
  const expandedIds = ref<Set<RxDBEntityId>>(new Set());
  const loadingIds = ref<Set<RxDBEntityId>>(new Set());
  const rootIds = ref<RxDBEntityId[]>([]);
  const childrenMap = ref<Map<RxDBEntityId, RxDBEntityId[]>>(new Map()); // parentId -> childIds
  const editingId = ref<RxDBEntityId | null>(null);
  const searchKeyword = ref('');
  const selectedFolderId = ref<RxDBEntityId | null>(null);
  const fileToDelete = ref<FileLarge | null>(null);
  const isAddingFile = ref(false);
  const sortMode = ref<SortMode>(loadStoredSortMode(Object.values(SortMode) as readonly SortMode[], SortMode.Manual));
  const isFullMode = ref(false);

  // 存储活跃的订阅，用于清理
  const subscriptions = new Map<RxDBEntityId | string, { unsubscribe: () => void }>();

  const subscribeToRoot = () => {
    // 2. Subscribe to ROOT
    const rootQuery$ = FileLarge.findAll({
      where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: null }] },
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    });
    const subscription = rootQuery$.subscribe({
      next: (roots: FileLarge[]) => {
        const newMap = new Map(nodesMap.value);
        // 更新或添加根节点（过滤空名称）
        roots.forEach(root => {
          if (root.name && root.name.trim()) {
            newMap.set(root.id, root);
          }
        });
        // 删除不再是根节点的节点
        Array.from(nodesMap.value.keys()).forEach(id => {
          const node = nodesMap.value.get(id);
          if (node?.parentId === null && !roots.find(r => r.id === id)) {
            newMap.delete(id);
          }
        });
        nodesMap.value = newMap;

        const newRootIds = roots
          .filter(r => r.name && r.name.trim())
          .map(r => r.id)
          .sort((a, b) => {
            const nodeA = roots.find(r => r.id === a);
            const nodeB = roots.find(r => r.id === b);
            if (!nodeA || !nodeB) return 0;
            if (nodeA.type !== nodeB.type) {
              return nodeA.type === 'folder' ? -1 : 1;
            }
            return (nodeA.sortOrder || '').localeCompare(nodeB.sortOrder || '');
          });
        rootIds.value = newRootIds;
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

  // 删除影响分析
  const deleteImpact = computed<DeleteImpact>(() => {
    if (!fileToDelete.value) return { childrenCount: 0, descendantsCount: 0 };

    const countDescendants = (parentId: RxDBEntityId): number => {
      const childIds = childrenMap.value.get(parentId) || [];
      let count = childIds.length;
      childIds.forEach(childId => {
        count += countDescendants(childId);
      });
      return count;
    };

    const childrenCount = (childrenMap.value.get(fileToDelete.value.id) || []).length;
    const descendantsCount = countDescendants(fileToDelete.value.id);

    return { childrenCount, descendantsCount };
  });

  // Flatten visible nodes
  const treeNodes = computed(() => {
    const result: FileLazyNode[] = [];
    const comparator = getSortComparator(sortMode.value);

    const traverse = (id: RxDBEntityId, level: number) => {
      const file = nodesMap.value.get(id);
      if (!file) return;

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
        const childIds = childrenMap.value.get(id) || [];
        const sortedChildIds = [...childIds].sort((a, b) => {
          const nodeA = nodesMap.value.get(a);
          const nodeB = nodesMap.value.get(b);
          if (!nodeA || !nodeB) return 0;
          return comparator(nodeA, nodeB);
        });
        sortedChildIds.forEach(childId => traverse(childId, level + 1));
      }
    };

    const sortedRootIds = [...rootIds.value].sort((a, b) => {
      const nodeA = nodesMap.value.get(a);
      const nodeB = nodesMap.value.get(b);
      if (!nodeA || !nodeB) return 0;
      return comparator(nodeA, nodeB);
    });

    sortedRootIds.forEach(id => traverse(id, 0));
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
      const childQuery$ = FileLarge.findAll({
        where: {
          combinator: 'and',
          rules: [{ field: 'parentId', operator: '=', value: id as UUID }]
        },
        orderBy: [{ field: 'sortOrder', sort: 'asc' }]
      });

      const subscription = childQuery$.subscribe({
        next: (children: FileLarge[]) => {
          // 过滤掉无效的空名称记录
          const validChildren = children.filter(child => child.name && child.name.trim());

          const newNodesMap = new Map(nodesMap.value);
          validChildren.forEach(child => {
            newNodesMap.set(child.id, child);
          });
          nodesMap.value = newNodesMap;

          const childIds = validChildren
            .map(c => c.id)
            .sort((a, b) => {
              const nodeA = validChildren.find(c => c.id === a);
              const nodeB = validChildren.find(c => c.id === b);
              if (!nodeA || !nodeB) return 0;
              if (nodeA.type !== nodeB.type) {
                return nodeA.type === 'folder' ? -1 : 1;
              }
              return (nodeA.sortOrder || '').localeCompare(nodeB.sortOrder || '');
            });

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

  const addManyFiles = async (count: number) => {
    // 1. Unsubscribe everything
    subscriptions.forEach(sub => sub.unsubscribe());
    subscriptions.clear();

    // 2. Generate and save files
    const existingRoots = rootIds.value
      .map(id => nodesMap.value.get(id))
      .filter((file): file is FileLarge => file !== undefined);
    const newFiles = generateBatchFiles(count, FileLarge, existingRoots);
    await rxdb.entityManager.saveMany(newFiles);

    // 3. Reset state and resubscribe
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
  };

  const expandAll = () => {
    isFullMode.value = true;

    // 1. Unsubscribe everything
    subscriptions.forEach(sub => sub.unsubscribe());
    subscriptions.clear();

    // 2. Subscribe to ALL
    const allQuery$ = FileLarge.findAll({
      where: {
        combinator: 'and',
        rules: []
      },
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    });

    const subscription = allQuery$.subscribe({
      next: (allFiles: FileLarge[]) => {
        const newNodesMap = new Map<RxDBEntityId, FileLarge>();
        const newChildrenMap = new Map<RxDBEntityId, RxDBEntityId[]>();
        const newRootIds: RxDBEntityId[] = [];
        const newExpandedIds = new Set<RxDBEntityId>();

        // Filter valid files
        const validFiles = allFiles.filter(f => f.name && f.name.trim());

        validFiles.forEach(file => {
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

        // Sort root IDs
        newRootIds.sort((a, b) => {
          const nodeA = newNodesMap.get(a);
          const nodeB = newNodesMap.get(b);
          if (!nodeA || !nodeB) return 0;
          if (nodeA.type !== nodeB.type) {
            return nodeA.type === 'folder' ? -1 : 1;
          }
          return (nodeA.sortOrder || '').localeCompare(nodeB.sortOrder || '');
        });

        // Sort children IDs
        newChildrenMap.forEach(childIds => {
          childIds.sort((a, b) => {
            const nodeA = newNodesMap.get(a);
            const nodeB = newNodesMap.get(b);
            if (!nodeA || !nodeB) return 0;
            if (nodeA.type !== nodeB.type) {
              return nodeA.type === 'folder' ? -1 : 1;
            }
            return (nodeA.sortOrder || '').localeCompare(nodeB.sortOrder || '');
          });
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

  const showDeleteDialog = (file: FileLarge) => {
    fileToDelete.value = file;
  };

  const cancelDelete = () => {
    fileToDelete.value = null;
  };

  const executeCascadeDelete = async () => {
    const selected = fileToDelete.value;
    if (!selected) return;

    const allFiles = await fetchAllFiles();
    const childrenByParent = new Map<RxDBEntityId, FileLarge[]>();
    for (const file of allFiles) {
      if (!file.parentId) continue;
      const children = childrenByParent.get(file.parentId) ?? [];
      children.push(file);
      childrenByParent.set(file.parentId, children);
    }

    const filesToRemove: FileLarge[] = [];
    const collect = (file: FileLarge): void => {
      for (const child of childrenByParent.get(file.id) ?? []) collect(child);
      filesToRemove.push(file);
    };
    collect(selected);
    await rxdb.entityManager.removeMany(filesToRemove);
    fileToDelete.value = null;
  };

  const clearSearch = () => {
    searchKeyword.value = '';
  };

  const addRoot = async (name: string, type: 'file' | 'folder', extension?: string) => {
    const lastRootId = rootIds.value[rootIds.value.length - 1];
    const lastRoot = lastRootId ? nodesMap.value.get(lastRootId) : null;
    const sortOrder = generateKeyBetween(lastRoot?.sortOrder || null, null);

    const file = new FileLarge({
      name,
      type,
      sortOrder,
      extension: type === 'file' ? extension?.replace(/^\./, '') || name.split('.').pop() : undefined,
      size: type === 'file' ? Math.floor(Math.random() * 10000) : undefined
    });
    await rxdb.entityManager.save(file);

    // Update local state
    const newNodesMap = new Map(nodesMap.value);
    newNodesMap.set(file.id, file);
    nodesMap.value = newNodesMap;
    rootIds.value = [...rootIds.value, file.id];
  };

  const addChild = async (parent: FileLarge, name: string, type: 'file' | 'folder', extension?: string) => {
    const siblings = await firstValueFrom(
      FileLarge.findAll({
        where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: parent.id as UUID }] },
        orderBy: [{ field: 'sortOrder', sort: 'asc' }]
      })
    );
    const sortOrder = generateKeyBetween(siblings.at(-1)?.sortOrder ?? null, null);

    const file = new FileLarge({
      name,
      type,
      sortOrder,
      extension: type === 'file' ? extension?.replace(/^\./, '') || name.split('.').pop() : undefined,
      size: type === 'file' ? Math.floor(Math.random() * 10000) : undefined
    });
    file.parentId = parent.id;
    await rxdb.entityManager.save(file);

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
  };

  const deleteFile = async (file: FileLarge) => {
    await file.remove();

    // Update local state
    const newNodesMap = new Map(nodesMap.value);
    newNodesMap.delete(file.id);
    nodesMap.value = newNodesMap;

    if (file.parentId) {
      const newChildrenMap = new Map(childrenMap.value);
      const siblings = newChildrenMap.get(file.parentId!) || [];
      newChildrenMap.set(
        file.parentId!,
        siblings.filter(id => id !== file.id)
      );
      childrenMap.value = newChildrenMap;
    } else {
      rootIds.value = rootIds.value.filter(id => id !== file.id);
    }
  };

  // 删除所有文件 - 内部一次性 fetch 全表后批量删除
  const deleteAllFiles = async () => {
    const allFiles = await fetchAllFiles();
    await rxdb.entityManager.removeMany(allFiles);
  };

  /**
   * 已加载到 store 内的节点快照。供拖放校验、循环嵌套检测使用，避免 page 端再开一份全表订阅。
   */
  const loadedNodes = computed<FileLarge[]>(() => Array.from(nodesMap.value.values()));

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
    deleteFile,
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
    loadedNodes
  };
}
