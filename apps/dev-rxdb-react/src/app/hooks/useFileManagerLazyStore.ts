import { RxDB, type RxDBEntityId, UUID } from '@aiao/rxdb';
import { FileLarge } from '@aiao/rxdb-test/entities';
import { generateKeyBetween } from '@aiao/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { firstValueFrom } from 'rxjs';
import { formatFileName, normalizeFileExtension } from '../pages/file-manager/utils/file-name';
import { getSortComparator, loadStoredSortMode, persistSortMode, SortMode } from '../utils/file-sorters';
import { generateBatchFiles } from '../utils/file-utils';
import { collectSubtreePostOrder } from '../utils/tree-scope';

/** 子孙查询的层级上限，与 `FindTreeOptions.level` 的上限一致。 */
const MAX_TREE_LEVEL = 100;

/** 批量删除的单批条数 —— 一次性把整表读进内存正是 P0-1 要消灭的东西。 */
const DELETE_BATCH_SIZE = 200;

const byParent = (parentId: RxDBEntityId | null) => ({
  combinator: 'and' as const,
  rules: [{ field: 'parentId' as const, operator: '=' as const, value: parentId as UUID | null }]
});

/**
 * 取某个父节点下的直接子节点（按 sortOrder 升序）。
 *
 * 模块级导出而非挂在 store 返回值上：页面要把它当 `useDragDrop` 的 `resolveSiblings`，
 * 而 store 返回的是每次 render 都换新的对象字面量，经它取会把整条 useCallback 链打脏（P2-7）。
 */
export const fetchFileChildren = (parentId: RxDBEntityId | null): Promise<FileLarge[]> =>
  firstValueFrom(
    FileLarge.findAll({
      where: byParent(parentId),
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    })
  );

/** 取某个父节点下 sortOrder 最大的那一个 —— 新增节点只需要它，不需要整个同级列表。 */
const fetchLastSibling = async (parentId: RxDBEntityId | null): Promise<FileLarge | null> => {
  const rows = await firstValueFrom(
    FileLarge.find({
      where: byParent(parentId),
      orderBy: [{ field: 'sortOrder', sort: 'desc' }],
      limit: 1
    })
  );
  return rows[0] ?? null;
};

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
  const [nodesMap, setNodesMap] = useState<Map<string, FileLarge>>(new Map());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [rootIds, setRootIds] = useState<string[]>([]);
  const [childrenMap, setChildrenMap] = useState<Map<string, string[]>>(new Map()); // parentId -> childIds
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<FileLarge | null>(null);
  const [isAddingFile, setIsAddingFile] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>(() =>
    loadStoredSortMode(Object.values(SortMode) as readonly SortMode[], SortMode.Manual)
  );
  const [isFullMode, setIsFullMode] = useState(false);

  // 存储活跃的订阅，用于清理
  const subscriptionsRef = useRef<Map<string, { unsubscribe: () => void }>>(new Map());

  const subscribeToRoot = () => {
    // 2. Subscribe to ROOT
    const rootQuery$ = FileLarge.findAll({
      where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: null }] },
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    });
    const subscription = rootQuery$.subscribe({
      next: (roots: FileLarge[]) => {
        setNodesMap(prev => {
          const newMap = new Map(prev);
          // 更新或添加根节点（过滤空名称）
          roots.forEach(root => {
            if (root.name && root.name.trim()) {
              newMap.set(root.id, root);
            }
          });
          // 删除不再是根节点的节点
          Array.from(prev.keys()).forEach(id => {
            const node = prev.get(id);
            if (node?.parentId === null && !roots.find(r => r.id === id)) {
              newMap.delete(id);
            }
          });
          return newMap;
        });

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
        setRootIds(newRootIds);
      },
      error: (error: unknown) => {
        console.error('[useFileManagerLazyStore] Root subscription error:', error);
      }
    });

    const currentSubscriptions = subscriptionsRef.current;
    if (currentSubscriptions.has('ROOT')) {
      currentSubscriptions.get('ROOT')?.unsubscribe();
    }
    currentSubscriptions.set('ROOT', subscription);
    return subscription;
  };

  // 订阅根节点（响应式更新）
  useEffect(() => {
    const subscription = subscribeToRoot();
    const subscriptions = subscriptionsRef.current;
    return () => {
      subscription.unsubscribe();
      subscriptions.delete('ROOT');
    };
  }, [rxdb]);

  // 搜索匹配的文件 IDs
  const matchedFileIds = useMemo(() => {
    const matched = new Set<string>();
    if (!searchKeyword) return matched;

    const keyword = searchKeyword.toLowerCase();
    nodesMap.forEach(file => {
      const fullName = formatFileName(file.name, file.extension);
      if (fullName.toLowerCase().includes(keyword)) {
        matched.add(file.id);
      }
    });
    return matched;
  }, [nodesMap, searchKeyword]);

  // 已展开数量和是否全部展开
  const expandedCount = useMemo(() => expandedIds.size, [expandedIds]);
  const isAllExpanded = useMemo(() => {
    if (!isFullMode) return false;
    const folderCount = Array.from(nodesMap.values()).filter(f => f.type === 'folder').length;
    return folderCount > 0 && expandedIds.size === folderCount;
  }, [nodesMap, expandedIds, isFullMode]);

  // 删除影响分析
  const deleteImpact = useMemo<DeleteImpact>(() => {
    if (!fileToDelete) return { childrenCount: 0, descendantsCount: 0 };

    const countDescendants = (parentId: string): number => {
      const childIds = childrenMap.get(parentId) || [];
      let count = childIds.length;
      childIds.forEach(childId => {
        count += countDescendants(childId);
      });
      return count;
    };

    const childrenCount = (childrenMap.get(fileToDelete.id) || []).length;
    const descendantsCount = countDescendants(fileToDelete.id);

    return { childrenCount, descendantsCount };
  }, [fileToDelete, childrenMap]);

  // Flatten visible nodes
  const treeNodes = useMemo(() => {
    const result: FileLazyNode[] = [];
    const comparator = getSortComparator(sortMode);

    const traverse = (id: string, level: number) => {
      const file = nodesMap.get(id);
      if (!file) return;

      const isExpanded = expandedIds.has(id);
      const isLoading = loadingIds.has(id);
      const isMatched = matchedFileIds.has(id);

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
        const childIds = childrenMap.get(id) || [];
        const sortedChildIds = [...childIds].sort((a, b) => {
          const nodeA = nodesMap.get(a);
          const nodeB = nodesMap.get(b);
          if (!nodeA || !nodeB) return 0;
          return comparator(nodeA, nodeB);
        });
        sortedChildIds.forEach(childId => traverse(childId, level + 1));
      }
    };

    const sortedRootIds = [...rootIds].sort((a, b) => {
      const nodeA = nodesMap.get(a);
      const nodeB = nodesMap.get(b);
      if (!nodeA || !nodeB) return 0;
      return comparator(nodeA, nodeB);
    });

    sortedRootIds.forEach(id => traverse(id, 0));
    return result;
  }, [nodesMap, expandedIds, loadingIds, rootIds, childrenMap, matchedFileIds, sortMode]);

  const toggleExpand = async (id: string) => {
    const file = nodesMap.get(id);
    if (!file || file.type !== 'folder') return;

    if (expandedIds.has(id)) {
      // 折叠：清理订阅和数据
      const currentSubscriptions = subscriptionsRef.current;
      const subscription = currentSubscriptions.get(id);
      if (subscription) {
        subscription.unsubscribe();
        currentSubscriptions.delete(id);
      }

      const newExpanded = new Set(expandedIds);
      newExpanded.delete(id);
      setExpandedIds(newExpanded);

      // 递归清理所有子孙节点的数据
      const cleanupDescendants = (parentId: string) => {
        const childIds = childrenMap.get(parentId) || [];
        childIds.forEach(childId => {
          // 递归清理孙节点
          cleanupDescendants(childId);
          // 清理该子节点的订阅
          const childSub = currentSubscriptions.get(childId);
          if (childSub) {
            childSub.unsubscribe();
            currentSubscriptions.delete(childId);
          }
        });
      };

      cleanupDescendants(id);

      // 清理 childrenMap 数据
      setChildrenMap(prev => {
        const newMap = new Map(prev);
        const removeChildren = (parentId: string) => {
          const childIds = newMap.get(parentId) || [];
          childIds.forEach(childId => {
            removeChildren(childId);
          });
          newMap.delete(parentId);
        };
        removeChildren(id);
        return newMap;
      });

      // 清理 nodesMap 中的子节点数据
      setNodesMap(prev => {
        const newMap = new Map(prev);
        const removeNodes = (parentId: string) => {
          const childIds = childrenMap.get(parentId) || [];
          childIds.forEach(childId => {
            removeNodes(childId);
            newMap.delete(childId);
          });
        };
        removeNodes(id);
        return newMap;
      });
    } else {
      // 展开：创建订阅
      const newExpanded = new Set(expandedIds);
      newExpanded.add(id);
      setExpandedIds(newExpanded);

      // 开始加载
      setLoadingIds(prev => new Set(prev).add(id));

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

          setNodesMap(prev => {
            const newMap = new Map(prev);
            validChildren.forEach(child => {
              newMap.set(child.id, child);
            });
            return newMap;
          });

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

          setChildrenMap(prev => new Map(prev).set(id, childIds));

          // 停止加载状态
          setLoadingIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
        error: (error: unknown) => {
          console.error(`[useFileManagerLazyStore] Failed to load children for ${id}:`, error);
          setLoadingIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      });

      const currentSubscriptions = subscriptionsRef.current;
      currentSubscriptions.set(id, subscription);
    }
  };

  const startEdit = (id: string) => setEditingId(id);
  const cancelEdit = () => setEditingId(null);

  const addManyFiles = async (count: number) => {
    // 1. Unsubscribe everything
    subscriptionsRef.current.forEach(sub => sub.unsubscribe());
    subscriptionsRef.current.clear();

    // 2. Generate and save files
    const existingRoots = rootIds.map(id => nodesMap.get(id)).filter(Boolean) as FileLarge[];
    const newFiles = generateBatchFiles(count, FileLarge, existingRoots);
    await rxdb.entityManager.saveMany(newFiles);

    // 3. Reset state and resubscribe
    setExpandedIds(new Set());
    setChildrenMap(new Map());
    setLoadingIds(new Set());
    setNodesMap(new Map());
    setRootIds([]);

    if (isFullMode) {
      expandAll();
    } else {
      subscribeToRoot();
    }
  };

  const expandAll = () => {
    setIsFullMode(true);

    // 1. Unsubscribe everything
    subscriptionsRef.current.forEach(sub => sub.unsubscribe());
    subscriptionsRef.current.clear();

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
        const newNodesMap = new Map<string, FileLarge>();
        const newChildrenMap = new Map<string, string[]>();
        const newRootIds: string[] = [];
        const newExpandedIds = new Set<string>();

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
        newChildrenMap.forEach((childIds, parentId) => {
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

        setNodesMap(newNodesMap);
        setChildrenMap(newChildrenMap);
        setRootIds(newRootIds);
        setExpandedIds(newExpandedIds);
        setLoadingIds(new Set());
      },
      error: (error: unknown) => console.error('[useFileManagerLazyStore] ExpandAll error:', error)
    });

    subscriptionsRef.current.set('ALL', subscription);
  };

  const collapseAll = () => {
    setIsFullMode(false);

    // 1. Unsubscribe everything
    subscriptionsRef.current.forEach(sub => sub.unsubscribe());
    subscriptionsRef.current.clear();

    // 2. Reset State
    setExpandedIds(new Set());
    setChildrenMap(new Map());
    setLoadingIds(new Set());
    setNodesMap(new Map());
    setRootIds([]);

    // 3. Subscribe to ROOT
    subscribeToRoot();
  };

  const selectFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
  };

  const cancelSelectFolder = () => {
    setSelectedFolderId(null);
  };

  const getSelectedFolderName = () => {
    if (!selectedFolderId) return '';
    const folder = nodesMap.get(selectedFolderId);
    return folder?.name || '';
  };

  const toggleAddingMode = () => {
    setIsAddingFile(prev => !prev);
  };

  const changeSortMode = (mode: SortMode) => {
    setSortMode(mode);
    persistSortMode(mode);
  };

  const showDeleteDialog = (file: FileLarge) => {
    setFileToDelete(file);
  };

  const cancelDelete = () => {
    setFileToDelete(null);
  };

  const executeCascadeDelete = async () => {
    const selected = fileToDelete;
    if (!selected) return;

    // 只取这个节点的子树，不是整表 —— 级联删除本来就只关心它自己的子孙。
    const descendants = await firstValueFrom(
      FileLarge.findDescendants({ entityId: selected.id, level: MAX_TREE_LEVEL })
    );
    const filesToRemove = collectSubtreePostOrder(selected, [selected, ...descendants]);
    await rxdb.entityManager.removeMany(filesToRemove);
    setFileToDelete(null);
  };

  const clearSearch = () => {
    setSearchKeyword('');
  };

  const addRoot = async (name: string, type: 'file' | 'folder', extension?: string | null) => {
    const lastRootId = rootIds[rootIds.length - 1];
    const lastRoot = lastRootId ? nodesMap.get(lastRootId) : null;
    const sortOrder = generateKeyBetween(lastRoot?.sortOrder || null, null);

    const file = new FileLarge({
      name,
      type,
      sortOrder,
      extension:
        type === 'file' ?
          normalizeFileExtension(extension ?? (name.includes('.') ? name.split('.').pop() : null))
        : undefined,
      size: type === 'file' ? Math.floor(Math.random() * 10000) : undefined
    });
    await rxdb.entityManager.save(file);

    // Update local state
    setNodesMap(prev => new Map(prev).set(file.id, file));
    setRootIds(prev => [...prev, file.id]);
  };

  const addChild = async (parent: FileLarge, name: string, type: 'file' | 'folder', extension?: string | null) => {
    const lastSibling = await fetchLastSibling(parent.id);
    const sortOrder = generateKeyBetween(lastSibling?.sortOrder ?? null, null);

    const file = new FileLarge({
      name,
      type,
      sortOrder,
      extension:
        type === 'file' ?
          normalizeFileExtension(extension ?? (name.includes('.') ? name.split('.').pop() : null))
        : undefined,
      size: type === 'file' ? Math.floor(Math.random() * 10000) : undefined
    });
    file.parentId = parent.id;
    await rxdb.entityManager.save(file);

    // Update local state
    setNodesMap(prev => new Map(prev).set(file.id, file));
    setChildrenMap(prev => {
      const next = new Map(prev);
      const current = next.get(parent.id) || [];
      next.set(parent.id, [...current, file.id]);
      return next;
    });

    // Ensure expanded
    if (!expandedIds.has(parent.id)) {
      setExpandedIds(prev => new Set(prev).add(parent.id));
    }
  };

  const deleteFile = async (file: FileLarge) => {
    await file.remove();

    // Update local state
    setNodesMap(prev => {
      const next = new Map(prev);
      next.delete(file.id);
      return next;
    });

    if (file.parentId) {
      setChildrenMap(prev => {
        const next = new Map(prev);
        const siblings = next.get(file.parentId!) || [];
        next.set(
          file.parentId!,
          siblings.filter(id => id !== file.id)
        );
        return next;
      });
    } else {
      setRootIds(prev => prev.filter(id => id !== file.id));
    }
  };

  // 组件卸载时清理所有订阅
  useEffect(() => {
    const currentSubscriptions = subscriptionsRef.current;
    return () => {
      currentSubscriptions.forEach(subscription => {
        subscription.unsubscribe();
      });
      currentSubscriptions.clear();
    };
  }, []);

  /**
   * 清空整表。分批取、分批删 —— 内存里同时只有一批，
   * 而不是像此前那样先让页面订阅出一份完整数组再整个丢进 `removeMany`。
   *
   * 每批都断言游标真的推进了：删不动却继续循环会变成死循环，宁可把失败抛给调用方。
   */
  const deleteAllFiles = async () => {
    let lastBatchHeadId: string | null = null;
    for (;;) {
      const batch = await firstValueFrom(
        FileLarge.find({ where: { combinator: 'and', rules: [] }, limit: DELETE_BATCH_SIZE })
      );
      if (batch.length === 0) return;
      if (batch[0].id === lastBatchHeadId) {
        throw new Error('批量删除没有推进：仍有文件未被删除');
      }
      lastBatchHeadId = batch[0].id;
      await rxdb.entityManager.removeMany(batch);
    }
  };

  /** 读取已加载的节点。页面拿所在文件夹名之类的用途，不该为此持有一份全表。 */
  const getNode = (id: string): FileLarge | undefined => nodesMap.get(id);

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
    setSearchKeyword,
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
    getNode
  };
}
