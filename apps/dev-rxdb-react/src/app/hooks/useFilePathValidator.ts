import { formatFileName } from '../pages/file-manager/utils/file-name';

export interface FilePathNode {
  id: string;
  name: string;
  extension?: string | null;
  parentId?: string | null;
  type: string;
}

/**
 * 路径冲突信息
 */
export interface PathConflict<T extends FilePathNode = FilePathNode> {
  /** 冲突的完整路径 */
  conflictPath: string;
  /** 冲突的现有节点 */
  conflictNode: T;
  /** 用户尝试的名称 */
  attemptedName: string;
}

/**
 * 文件路径验证 Hook
 * 负责检测路径冲突和构建完整路径
 */
export function createFilePathValidator<T extends FilePathNode = FilePathNode>() {
  /**
   * 检查路径冲突
   * @param name 文件/文件夹名称（不含扩展名）
   * @param extension 文件扩展名（含点，如 '.txt'），文件夹为 null
   * @param parentId 父节点 ID
   * @param allNodes 所有节点列表
   * @param currentNodeId 当前节点 ID（重命名时排除自己）
   * @returns 冲突信息，无冲突返回 null
   */
  const checkConflict = (
    name: string,
    extension: string | null,
    parentId: string | null,
    allNodes: T[],
    currentNodeId?: string
  ): PathConflict<T> | null => {
    const fullName = formatFileName(name, extension);

    // 找出同级节点（相同 parentId，排除自己）
    const siblings = allNodes.filter(node => node.parentId === parentId && node.id !== currentNodeId);

    // 检测冲突（case-insensitive）
    const conflict = siblings.find(sibling => {
      const siblingFullName = formatFileName(sibling.name, sibling.extension);
      return siblingFullName.toLowerCase() === fullName.toLowerCase();
    });

    if (conflict) {
      return {
        conflictPath: buildPath(conflict, allNodes),
        conflictNode: conflict,
        attemptedName: fullName
      };
    }

    return null;
  };

  /**
   * 构建节点的完整路径
   * @param node 目标节点
   * @param allNodes 所有节点列表
   * @returns 完整路径字符串（如 "/Documents/Projects/README.md"）
   */
  const buildPath = (node: T, allNodes: T[]): string => {
    const parts: string[] = [];
    let current: T | undefined = node;
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));

    // 从当前节点向上遍历到根节点；DB 存的 extension 不带前导点，所以这里手动加。
    while (current) {
      const nodeName = formatFileName(current.name, current.extension);
      parts.unshift(nodeName);

      current = current.parentId ? nodeMap.get(current.parentId) : undefined;
    }

    return '/' + parts.join('/');
  };

  return {
    checkConflict,
    buildPath
  };
}

export function useFilePathValidator<T extends FilePathNode = FilePathNode>() {
  return createFilePathValidator<T>();
}
