import type { RxDB, RxDBEntityId } from '@aiao/rxdb';
import { SortableFileNode } from '@aiao/rxdb-test/entities';
import { computed, ref, type Ref } from 'vue';
import { getSortComparator, loadStoredSortMode, persistSortMode, SortMode } from '../utils/file-sorters';
import { generateBatchFiles } from '../utils/file-utils';
import { type PathConflict, useFilePathValidator } from './useFilePathValidator';
import { useTreeWriteError } from './useTreeWriteError';

export { SortMode } from '../utils/file-sorters';

export interface FileTreeNode {
  file: SortableFileNode;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isMatched?: boolean;
}

export interface DeleteImpact {
  childrenCount: number;
  descendantsCount: number;
}

export function useFileManagerStore(files: Ref<SortableFileNode[]>, rxdb: RxDB) {
  const expandedIds = ref<Set<RxDBEntityId>>(new Set());
  const editingId = ref<RxDBEntityId | null>(null);
  const selectedId = ref<RxDBEntityId | null>(null);
  const selectedFolderId = ref<RxDBEntityId | null>(null);
  const searchKeyword = ref('');
  const pathConflict = ref<PathConflict | null>(null);
  const fileToDelete = ref<SortableFileNode | null>(null);
  const isAddingFile = ref(false);
  const sortMode = ref<SortMode>(loadStoredSortMode(Object.values(SortMode), SortMode.Manual));

  const pathValidator = useFilePathValidator();
  const { writeError, clearWriteError, guardWrite } = useTreeWriteError();

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
    const childrenMap = new Map<RxDBEntityId | null, SortableFileNode[]>();

    // 构建 children 映射
    files.value.forEach(file => {
      const parentId = file.parentId ?? null;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(file);
    });

    // 应用排序；手动模式不排序，沿用查询顺序
    const comparator = getSortComparator(sortMode.value);
    const sortFiles = (fileList: SortableFileNode[]): SortableFileNode[] =>
      comparator ? [...fileList].sort(comparator) : fileList;

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

  // 不给 sortOrder：引擎把缺键的新节点追加到所属 parentId 组末尾（文件与文件夹同属一组）
  // 新建返回是否已落库：路径冲突或写入失败时为 false，页面据此决定是否清空输入
  const addChild = async (
    parentFile: SortableFileNode,
    name: string,
    type: 'file' | 'folder',
    extension?: string
  ): Promise<boolean> => {
    const ext = type === 'file' && extension ? extension : null;
    const conflict = pathValidator.checkConflict(name, ext, parentFile.id, files.value);
    if (conflict) {
      pathConflict.value = conflict;
      return false;
    }

    const newFile = new SortableFileNode({
      name,
      type,
      extension:
        extension ? extension.replace(/^\./, '')
        : type === 'file' && name.includes('.') ? name.split('.').pop()
        : undefined,
      size: type === 'file' ? Math.floor(Math.random() * 10000) : undefined
    });
    newFile.parentId = parentFile.id;

    const saved = await guardWrite('新建', () => newFile.save());
    if (!saved) return false;

    const next = new Set(expandedIds.value);
    next.add(parentFile.id);
    expandedIds.value = next;
    pathConflict.value = null;
    return true;
  };

  const addRoot = async (name: string, type: 'file' | 'folder', extension?: string): Promise<boolean> => {
    const ext = type === 'file' && extension ? extension : null;
    const conflict = pathValidator.checkConflict(name, ext, null, files.value);
    if (conflict) {
      pathConflict.value = conflict;
      return false;
    }

    const newFile = new SortableFileNode({
      name,
      type,
      extension:
        extension ? extension.replace(/^\./, '')
        : type === 'file' && name.includes('.') ? name.split('.').pop()
        : undefined,
      size: type === 'file' ? Math.floor(Math.random() * 10000) : undefined
    });
    newFile.parentId = null;

    const saved = await guardWrite('新建', () => newFile.save());
    if (saved) pathConflict.value = null;
    return saved;
  };

  // 保存重命名；失败时回退到库里已提交的名称并给出页内提示
  const commitEdit = async (file: SortableFileNode) => {
    const saved = await guardWrite('重命名', () => file.save());
    if (!saved) file.reset();
    cancelEdit();
  };

  // 批量添加：整批一次 saveMany，生成器不写 sortOrder
  const addManyFiles = (count: number) =>
    guardWrite('批量添加', () => rxdb.entityManager.saveMany(generateBatchFiles(count, SortableFileNode)));

  // 递归删除节点及其全部后代
  const removeWithDescendants = async (id: RxDBEntityId) => {
    const children = files.value.filter(f => f.parentId === id);
    for (const child of children) {
      await removeWithDescendants(child.id);
    }
    const file = files.value.find(f => f.id === id);
    if (file) {
      await file.remove();
    }
  };

  const deleteFile = (file: SortableFileNode) => guardWrite('删除', () => removeWithDescendants(file.id));

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
  const showDeleteDialog = (file: SortableFileNode) => {
    fileToDelete.value = file;
  };

  const cancelDelete = () => {
    fileToDelete.value = null;
  };

  const executeCascadeDelete = async () => {
    const target = fileToDelete.value;
    if (!target) return;

    // 文件夹会连带删除后代，按级联删除上报；普通文件就是单个删除
    const operation = target.type === 'folder' ? '级联删除' : '删除';
    await guardWrite(operation, () => removeWithDescendants(target.id));
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
    addManyFiles,
    commitEdit,
    writeError,
    clearWriteError,
    guardWrite,
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
