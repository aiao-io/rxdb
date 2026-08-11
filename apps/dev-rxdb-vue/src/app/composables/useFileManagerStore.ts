import type { RxDBEntityId } from '@aiao/rxdb';
import { FileNode } from '@aiao/rxdb-test/entities';
import { generateKeyBetween } from '@aiao/utils';
import { computed, ref, type Ref } from 'vue';
import { getSortComparator, loadStoredSortMode, persistSortMode, SortMode } from '../utils/file-sorters';
import { type PathConflict, useFilePathValidator } from './useFilePathValidator';

export { SortMode } from '../utils/file-sorters';

export interface FileTreeNode {
  file: FileNode;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isMatched?: boolean;
}

export interface DeleteImpact {
  childrenCount: number;
  descendantsCount: number;
}

export function useFileManagerStore(files: Ref<FileNode[]>) {
  const expandedIds = ref<Set<RxDBEntityId>>(new Set());
  const editingId = ref<RxDBEntityId | null>(null);
  const selectedId = ref<RxDBEntityId | null>(null);
  const selectedFolderId = ref<RxDBEntityId | null>(null);
  const searchKeyword = ref('');
  const pathConflict = ref<PathConflict | null>(null);
  const fileToDelete = ref<FileNode | null>(null);
  const isAddingFile = ref(false);
  const sortMode = ref<SortMode>(loadStoredSortMode(Object.values(SortMode), SortMode.Manual));

  const pathValidator = useFilePathValidator();

  // 搜索匹配的文件 IDs
  const matchedFileIds = computed(() => {
    const matched = new Set<string>();
    if (!searchKeyword.value) return matched;

    const keyword = searchKeyword.value.toLowerCase();
    files.value.forEach(file => {
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
    const folderCount = files.value.filter(f => f.type === 'folder').length;
    return folderCount > 0 && expandedIds.value.size === folderCount;
  });

  // 删除影响分析
  const deleteImpact = computed<DeleteImpact>(() => {
    if (!fileToDelete.value) return { childrenCount: 0, descendantsCount: 0 };

    const countDescendants = (parentId: RxDBEntityId): number => {
      const children = files.value.filter(f => f.parentId === parentId);
      let count = children.length;
      children.forEach(child => {
        count += countDescendants(child.id);
      });
      return count;
    };

    const childrenCount = files.value.filter(f => f.parentId === fileToDelete.value!.id).length;
    const descendantsCount = countDescendants(fileToDelete.value!.id);

    return { childrenCount, descendantsCount };
  });

  // 构建树节点列表
  const treeNodes = computed<FileTreeNode[]>(() => {
    const nodes: FileTreeNode[] = [];
    const childrenMap = new Map<RxDBEntityId | null, FileNode[]>();

    // 构建 children 映射
    files.value.forEach(file => {
      const parentId = file.parentId ?? null;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(file);
    });

    // 应用排序
    const sortFiles = (fileList: FileNode[]): FileNode[] => [...fileList].sort(getSortComparator(sortMode.value));

    // 递归构建节点
    const buildNodes = (parentId: RxDBEntityId | null, level: number) => {
      const children = childrenMap.get(parentId) || [];
      const sorted = sortFiles(children);

      sorted.forEach(file => {
        const hasChildren = childrenMap.has(file.id) && childrenMap.get(file.id)!.length > 0;
        const isExpanded = expandedIds.value.has(file.id);
        const isMatched = matchedFileIds.value.has(file.id); // 搜索过滤
        if (searchKeyword.value) {
          const keyword = searchKeyword.value.toLowerCase();
          const fileFullName = file.extension ? `${file.name}${file.extension}` : file.name;
          const matchesSearch = fileFullName.toLowerCase().includes(keyword);
          if (!matchesSearch) {
            // 检查是否有匹配的子节点
            const hasMatchingChildren = (id: RxDBEntityId): boolean => {
              const kids = childrenMap.get(id) || [];
              return kids.some(kid => {
                const kidFullName = kid.extension ? `${kid.name}${kid.extension}` : kid.name;
                return kidFullName.toLowerCase().includes(keyword) || hasMatchingChildren(kid.id);
              });
            };
            if (!hasMatchingChildren(file.id)) {
              return;
            }
          }
        }

        nodes.push({
          file,
          level,
          isExpanded,
          hasChildren,
          isMatched
        });

        if ((isExpanded || searchKeyword.value) && file.type === 'folder') {
          buildNodes(file.id, level + 1);
        }
      });
    };

    buildNodes(null, 0);
    return nodes;
  });

  const toggleExpand = (fileId: RxDBEntityId) => {
    const next = new Set(expandedIds.value);
    if (next.has(fileId)) {
      next.delete(fileId);
    } else {
      next.add(fileId);
    }
    expandedIds.value = next;
  };

  const expandAll = () => {
    const allFolderIds = new Set(files.value.filter(f => f.type === 'folder').map(f => f.id));
    expandedIds.value = allFolderIds;
  };

  const collapseAll = () => {
    expandedIds.value = new Set();
  };

  const startEdit = (fileId: RxDBEntityId) => {
    editingId.value = fileId;
  };

  const cancelEdit = () => {
    editingId.value = null;
  };

  const addChild = async (parentFile: FileNode, name: string, type: 'file' | 'folder', extension?: string) => {
    const ext = type === 'file' && extension ? extension : null;
    const conflict = pathValidator.checkConflict(name, ext, parentFile.id, files.value);
    if (conflict) {
      pathConflict.value = conflict;
      return;
    }

    const siblings = files.value.filter(f => f.parentId === parentFile.id);
    siblings.sort((a, b) => {
      const orderA = a.sortOrder || '';
      const orderB = b.sortOrder || '';
      return orderA.localeCompare(orderB);
    });
    const lastSibling = siblings[siblings.length - 1];
    const lastSortOrder = lastSibling ? lastSibling.sortOrder : null;
    const newSortOrder = generateKeyBetween(lastSortOrder, null);

    const newFile = new FileNode({
      name,
      type,
      sortOrder: newSortOrder,
      extension:
        extension ? extension.replace(/^\./, '')
        : type === 'file' && name.includes('.') ? name.split('.').pop()
        : undefined,
      size: type === 'file' ? Math.floor(Math.random() * 10000) : undefined
    });
    newFile.parentId = parentFile.id;

    await newFile.save();
    const next = new Set(expandedIds.value);
    next.add(parentFile.id);
    expandedIds.value = next;
    pathConflict.value = null;
  };

  const addRoot = async (name: string, type: 'file' | 'folder', extension?: string) => {
    const ext = type === 'file' && extension ? extension : null;
    const conflict = pathValidator.checkConflict(name, ext, null, files.value);
    if (conflict) {
      pathConflict.value = conflict;
      return;
    }

    const rootFiles = files.value.filter(f => f.parentId === null);
    rootFiles.sort((a, b) => {
      const orderA = a.sortOrder || '';
      const orderB = b.sortOrder || '';
      return orderA.localeCompare(orderB);
    });
    const lastFile = rootFiles[rootFiles.length - 1];
    const lastSortOrder = lastFile ? lastFile.sortOrder : null;
    const newSortOrder = generateKeyBetween(lastSortOrder, null);

    const newFile = new FileNode({
      name,
      type,
      sortOrder: newSortOrder,
      extension:
        extension ? extension.replace(/^\./, '')
        : type === 'file' && name.includes('.') ? name.split('.').pop()
        : undefined,
      size: type === 'file' ? Math.floor(Math.random() * 10000) : undefined
    });
    newFile.parentId = null;

    await newFile.save();
    pathConflict.value = null;
  };

  const deleteFile = async (file: FileNode) => {
    // 递归删除所有子节点
    const deleteWithChildren = async (id: RxDBEntityId) => {
      const children = files.value.filter(f => f.parentId === id);
      for (const child of children) {
        await deleteWithChildren(child.id);
      }
      const fileToDelete = files.value.find(f => f.id === id);
      if (fileToDelete) {
        await fileToDelete.remove();
      }
    };

    await deleteWithChildren(file.id);
  };

  const clearPathConflict = () => {
    pathConflict.value = null;
  };

  // 父文件夹选择
  const selectFolder = (folderId: RxDBEntityId) => {
    selectedFolderId.value = folderId;
  };

  const cancelSelectFolder = () => {
    selectedFolderId.value = null;
  };

  const getSelectedFolderName = () => {
    if (!selectedFolderId.value) return '';
    const folder = files.value.find(f => f.id === selectedFolderId.value);
    return folder?.name || '';
  };

  // 添加模式切换
  const toggleAddingMode = () => {
    isAddingFile.value = !isAddingFile.value;
  };

  // 排序模式
  const changeSortMode = (mode: SortMode) => {
    sortMode.value = mode;
    persistSortMode(mode);
  };

  // 删除确认对话框
  const showDeleteDialog = (file: FileNode) => {
    fileToDelete.value = file;
  };

  const cancelDelete = () => {
    fileToDelete.value = null;
  };

  const executeCascadeDelete = async () => {
    if (!fileToDelete.value) return;

    const deleteWithChildren = async (id: RxDBEntityId) => {
      const children = files.value.filter(f => f.parentId === id);
      for (const child of children) {
        await deleteWithChildren(child.id);
      }
      const file = files.value.find(f => f.id === id);
      if (file) {
        await file.remove();
      }
    };

    await deleteWithChildren(fileToDelete.value.id);
    fileToDelete.value = null;
  };

  // 清除搜索
  const clearSearch = () => {
    searchKeyword.value = '';
  };

  const setSearchKeyword = (keyword: string) => {
    searchKeyword.value = keyword;
  };

  return {
    treeNodes,
    expandedIds,
    editingId,
    selectedId,
    selectedFolderId,
    searchKeyword,
    pathConflict,
    fileToDelete,
    deleteImpact,
    isAddingFile,
    sortMode,
    matchedFileIds,
    expandedCount,
    isAllExpanded,
    setSearchKeyword,
    toggleExpand,
    expandAll,
    collapseAll,
    startEdit,
    cancelEdit,
    addChild,
    addRoot,
    deleteFile,
    clearPathConflict,
    selectFolder,
    cancelSelectFolder,
    getSelectedFolderName,
    toggleAddingMode,
    changeSortMode,
    showDeleteDialog,
    cancelDelete,
    executeCascadeDelete,
    clearSearch
  };
}
