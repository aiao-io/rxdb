import { Injectable } from '@angular/core';

export interface FilePathNode {
  id: string;
  name: string;
  extension?: string | null;
  parentId?: string | null;
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
 * 文件路径验证服务
 * 负责检测路径冲突和构建完整路径
 */
@Injectable({
  providedIn: 'root'
})
export class FilePathValidatorService {
  /**
   * 检查路径冲突
   * @param name 文件/文件夹名称（不含扩展名）
   * @param extension 文件扩展名（含点，如 '.txt'），文件夹为 null
   * @param parentId 父节点 ID
   * @param allNodes 所有节点列表
   * @param currentNodeId 当前节点 ID（重命名时排除自己）
   * @returns 冲突信息，无冲突返回 null
   */
  checkConflict<T extends FilePathNode>(
    name: string,
    extension: string | null,
    parentId: string | null,
    allNodes: T[],
    currentNodeId?: string
  ): PathConflict<T> | null {
    // 统一扩展名格式（确保带点）
    const formatExt = (ext: string | null | undefined) =>
      ext ?
        ext.startsWith('.') ?
          ext
        : '.' + ext
      : '';

    // 构建完整名称
    const fullName = `${name}${formatExt(extension)}`;

    // 找出同级节点（相同 parentId，排除自己）
    const normalizedParentId = parentId ?? null;
    const siblings = allNodes.filter(
      node => (node.parentId ?? null) === normalizedParentId && node.id !== currentNodeId
    );

    // 检测冲突（case-insensitive）
    const conflict = siblings.find(sibling => {
      const siblingFullName = `${sibling.name}${formatExt(sibling.extension)}`;
      return siblingFullName.toLowerCase() === fullName.toLowerCase();
    });

    if (conflict) {
      return {
        conflictPath: this.buildPath(conflict, allNodes),
        conflictNode: conflict,
        attemptedName: fullName
      };
    }

    return null;
  }

  /**
   * 构建节点的完整路径
   * @param node 目标节点
   * @param allNodes 所有节点列表
   * @returns 完整路径字符串（如 "/Documents/Projects/README.md"）
   */
  buildPath<T extends FilePathNode>(node: T, allNodes: T[]): string {
    const parts: string[] = [];
    let current: T | undefined = node;

    // 从当前节点向上遍历到根节点
    while (current) {
      const nodeName = current.extension ? `${current.name}${current.extension}` : current.name;
      parts.unshift(nodeName);

      // 查找父节点
      current = allNodes.find(n => n.id === current?.parentId);
    }

    return '/' + parts.join('/');
  }
}
