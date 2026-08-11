import { FileNode } from '@aiao/rxdb-test/entities';
import { generateKeyBetween } from '@aiao/utils';
import { useCallback, useMemo, useState } from 'react';
import { formatFileName, normalizeFileExtension } from '../pages/file-manager/utils/file-name';
import { getSortComparator, loadStoredSortMode, persistSortMode, SortMode } from '../utils/file-sorters';
import { collectSubtreePostOrder } from '../utils/tree-scope';
import { PathConflict, useFilePathValidator } from './useFilePathValidator';

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

export function useFileManagerStore(files: FileNode[]) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [pathConflict, setPathConflict] = useState<PathConflict | null>(null);
  const [fileToDelete, setFileToDelete] = useState<FileNode | null>(null);
  const [isAddingFile, setIsAddingFile] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>(() =>
    loadStoredSortMode(Object.values(SortMode) as readonly SortMode[], SortMode.Manual)
  );

  const pathValidator = useFilePathValidator();

  // 搜索匹配的文件 IDs
  const matchedFileIds = useMemo(() => {
    const matched = new Set<string>();
    if (!searchKeyword) return matched;

    const keyword = searchKeyword.toLowerCase();
    files.forEach(file => {
      const fullName = formatFileName(file.name, file.extension);
      if (fullName.toLowerCase().includes(keyword)) {
        matched.add(file.id);
      }
    });
    return matched;
  }, [files, searchKeyword]);

  // 已展开数量和是否全部展开
  const expandedCount = useMemo(() => expandedIds.size, [expandedIds]);
  const isAllExpanded = useMemo(() => {
    const folderCount = files.filter(f => f.type === 'folder').length;
    return folderCount > 0 && expandedIds.size === folderCount;
  }, [files, expandedIds]);

  // 删除影响分析
  const deleteImpact = useMemo<DeleteImpact>(() => {
    if (!fileToDelete) return { childrenCount: 0, descendantsCount: 0 };

    const countDescendants = (parentId: string): number => {
      const children = files.filter(f => f.parentId === parentId);
      let count = children.length;
      children.forEach(child => {
        count += countDescendants(child.id);
      });
      return count;
    };

    const childrenCount = files.filter(f => f.parentId === fileToDelete.id).length;
    const descendantsCount = countDescendants(fileToDelete.id);

    return { childrenCount, descendantsCount };
  }, [fileToDelete, files]);

  // 构建树节点列表
  const treeNodes = useMemo<FileTreeNode[]>(() => {
    const nodes: FileTreeNode[] = [];
    const childrenMap = new Map<string | null, FileNode[]>();

    // 构建 children 映射
    files.forEach(file => {
      const parentId = file.parentId ?? null;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(file);
    });

    // 应用排序
    const sortFiles = (fileList: FileNode[]): FileNode[] => [...fileList].sort(getSortComparator(sortMode));

    // 递归构建节点
    const buildNodes = (parentId: string | null, level: number) => {
      const children = childrenMap.get(parentId) || [];
      const sorted = sortFiles(children);

      sorted.forEach(file => {
        const hasChildren = childrenMap.has(file.id) && childrenMap.get(file.id)!.length > 0;
        const isExpanded = expandedIds.has(file.id);
        const isMatched = matchedFileIds.has(file.id); // 搜索过滤
        if (searchKeyword) {
          const keyword = searchKeyword.toLowerCase();
          const fileFullName = formatFileName(file.name, file.extension);
          const matchesSearch = fileFullName.toLowerCase().includes(keyword);
          if (!matchesSearch) {
            // 检查是否有匹配的子节点
            const hasMatchingChildren = (id: string): boolean => {
              const kids = childrenMap.get(id) || [];
              return kids.some(kid => {
                const kidFullName = formatFileName(kid.name, kid.extension);
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

        if (isExpanded && file.type === 'folder') {
          buildNodes(file.id, level + 1);
        }
      });
    };

    buildNodes(null, 0);
    return nodes;
  }, [files, expandedIds, searchKeyword, matchedFileIds, sortMode]);

  const toggleExpand = useCallback((fileId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allFolderIds = new Set(files.filter(f => f.type === 'folder').map(f => f.id));
    setExpandedIds(allFolderIds);
  }, [files]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const startEdit = useCallback((fileId: string) => {
    setEditingId(fileId);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const addChild = useCallback(
    async (parentFile: FileNode, name: string, type: 'file' | 'folder', extension?: string) => {
      const ext = type === 'file' && extension ? extension : null;
      const conflict = pathValidator.checkConflict(name, ext, parentFile.id, files);
      if (conflict) {
        setPathConflict(conflict);
        return;
      }

      const siblings = files.filter(f => f.parentId === parentFile.id);
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
          type === 'file' ?
            normalizeFileExtension(extension ?? (name.includes('.') ? name.split('.').pop() : null))
          : undefined,
        size: type === 'file' ? Math.floor(Math.random() * 10000) : undefined
      });
      newFile.parentId = parentFile.id;

      await newFile.save();
      setExpandedIds(prev => new Set(prev).add(parentFile.id));
      setPathConflict(null);
    },
    [files, pathValidator]
  );

  const addRoot = useCallback(
    async (name: string, type: 'file' | 'folder', extension?: string) => {
      const ext = type === 'file' && extension ? extension : null;
      const conflict = pathValidator.checkConflict(name, ext, null, files);
      if (conflict) {
        setPathConflict(conflict);
        return;
      }

      const rootFiles = files.filter(f => f.parentId === null);
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
          type === 'file' ?
            normalizeFileExtension(extension ?? (name.includes('.') ? name.split('.').pop() : null))
          : undefined,
        size: type === 'file' ? Math.floor(Math.random() * 10000) : undefined
      });
      newFile.parentId = null;

      await newFile.save();
      setPathConflict(null);
    },
    [files, pathValidator]
  );

  const deleteFile = useCallback(
    async (file: FileNode) => {
      for (const item of collectSubtreePostOrder(file, files)) await item.remove();
    },
    [files]
  );

  const clearPathConflict = useCallback(() => {
    setPathConflict(null);
  }, []);

  // 父文件夹选择
  const selectFolder = useCallback((folderId: string) => {
    setSelectedFolderId(folderId);
  }, []);

  const cancelSelectFolder = useCallback(() => {
    setSelectedFolderId(null);
  }, []);

  const getSelectedFolderName = useCallback(() => {
    if (!selectedFolderId) return '';
    const folder = files.find(f => f.id === selectedFolderId);
    return folder?.name || '';
  }, [selectedFolderId, files]);

  // 添加模式切换
  const toggleAddingMode = useCallback(() => {
    setIsAddingFile(prev => !prev);
  }, []);

  // 排序模式
  const changeSortMode = useCallback((mode: SortMode) => {
    setSortMode(mode);
    persistSortMode(mode);
  }, []);

  // 删除确认对话框
  const showDeleteDialog = useCallback((file: FileNode) => {
    setFileToDelete(file);
  }, []);

  const cancelDelete = useCallback(() => {
    setFileToDelete(null);
  }, []);

  const executeCascadeDelete = useCallback(async () => {
    if (!fileToDelete) return;

    for (const file of collectSubtreePostOrder(fileToDelete, files)) await file.remove();
    setFileToDelete(null);
  }, [fileToDelete, files]);

  // 清除搜索
  const clearSearch = useCallback(() => {
    setSearchKeyword('');
  }, []);

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
    setSelectedId,
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
