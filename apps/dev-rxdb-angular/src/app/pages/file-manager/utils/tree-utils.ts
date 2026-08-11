import type { FileTreeEntity } from '../models/file-node.interface';
import { TreeNode } from '../models/file-node.interface';
import type { DropMode } from '../services/file-drag-drop.service';
import { getSortComparator, SortMode } from './file-sorters';

export interface FileNodeData {
  id: string;
  parentId?: string | null;
  sortOrder?: string | null;
  type?: string; // Allow any string to match FileNode's type inference
}

export interface FileEntity extends FileNodeData {
  name: string;
  type: 'file' | 'folder';
  extension?: string | null;
}

/**
 * 构建树节点列表（扁平化结构，用于虚拟滚动）
 */
export function buildTreeNodes<T extends FileTreeEntity>(
  allFiles: T[],
  expandedIds: Set<string>,
  matchedIds: Set<string> | null = null,
  draggingNodeId: string | null = null,
  hoverTargetId: string | null = null,
  dropMode: DropMode | null = null,
  invalidTargets: Set<string> | null = null,
  sortMode: SortMode = SortMode.Manual
): TreeNode<T>[] {
  const result: TreeNode<T>[] = [];
  const childrenMap = new Map<string | null, T[]>();

  // 1. 构建 childrenMap
  allFiles.forEach(file => {
    const pid = file.parentId || null;
    if (!childrenMap.has(pid)) {
      childrenMap.set(pid, []);
    }
    childrenMap.get(pid)!.push(file);
  });

  // 2. 排序
  const comparator = getSortComparator(sortMode);
  childrenMap.forEach(children => {
    children.sort(comparator);
  });

  // 3. 递归构建
  function traverse(parentId: string | null, level: number) {
    const children = childrenMap.get(parentId);
    if (!children) return;

    for (const node of children) {
      // 如果有搜索关键词，且节点不匹配也不在匹配路径上，则跳过
      // (这里简化处理，假设 matchedIds 包含了所有需要显示的节点 ID)
      if (matchedIds && !matchedIds.has(node.id)) {
        continue;
      }

      const hasChildren = childrenMap.has(node.id) && childrenMap.get(node.id)!.length > 0;
      const isExpanded = expandedIds.has(node.id);

      // 计算拖拽状态
      let dragState: TreeNode<T>['dragState'] = null;
      if (draggingNodeId && node.id === hoverTargetId) {
        if (dropMode === 'before') dragState = 'drag-over-before';
        else if (dropMode === 'after') dragState = 'drag-over-after';
        else if (dropMode === 'into') dragState = 'drag-over-inside';
      }
      if (invalidTargets?.has(node.id)) {
        dragState = 'invalid-target';
      }

      result.push({
        node,
        level,
        isExpanded,
        hasChildren,
        isMatched: matchedIds ? matchedIds.has(node.id) : false,
        dragState
      });

      if (isExpanded) {
        traverse(node.id, level + 1);
      }
    }
  }

  traverse(null, 0);
  return result;
}

/**
 * 计算所有后代节点数量（迭代实现避免栈溢出）
 */
export function countDescendants<T extends FileNodeData>(fileId: string, allFiles: T[]): number {
  const childrenMap = new Map<string | null, T[]>();
  allFiles.forEach(file => {
    const pid = file.parentId || null;
    if (!childrenMap.has(pid)) {
      childrenMap.set(pid, []);
    }
    childrenMap.get(pid)!.push(file);
  });

  let count = 0;
  const queue: string[] = [fileId];
  let head = 0;

  while (head < queue.length) {
    const currentId = queue[head++];
    const children = childrenMap.get(currentId) || [];
    for (const child of children) {
      count++;
      queue.push(child.id);
    }
  }
  return count;
}

/**
 * 收集所有后代节点ID（迭代实现避免栈溢出）
 */
export function collectDescendants<T extends FileNodeData>(fileId: string, allFiles: T[]): Set<string> {
  const childrenMap = new Map<string | null, T[]>();
  allFiles.forEach(file => {
    const pid = file.parentId || null;
    if (!childrenMap.has(pid)) {
      childrenMap.set(pid, []);
    }
    childrenMap.get(pid)!.push(file);
  });

  const descendantIds = new Set<string>();
  const queue: string[] = [fileId];
  let head = 0;

  while (head < queue.length) {
    const currentId = queue[head++];
    const children = childrenMap.get(currentId) || [];
    for (const child of children) {
      if (!descendantIds.has(child.id)) {
        descendantIds.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return descendantIds;
}

/**
 * 比较排序顺序
 */
export function compareSortOrder(a: { sortOrder?: string | null }, b: { sortOrder?: string | null }): number {
  const aSortOrder = a.sortOrder ?? '';
  const bSortOrder = b.sortOrder ?? '';
  return (
    aSortOrder < bSortOrder ? -1
    : aSortOrder > bSortOrder ? 1
    : 0
  );
}
