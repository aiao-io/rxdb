export interface MenuPathNode {
  id: string;
  title: string;
  parentId?: string | null;
}

/**
 * 路径冲突信息
 */
export interface MenuPathConflict<T extends MenuPathNode = MenuPathNode> {
  /** 冲突的完整路径 */
  conflictPath: string;
  /** 冲突的现有节点 */
  conflictNode: T;
  /** 用户尝试的名称 */
  attemptedName: string;
}

/**
 * 菜单路径验证 Hook
 * 负责检测路径冲突和构建完整路径
 */
export function useMenuPathValidator<T extends MenuPathNode = MenuPathNode>() {
  /**
   * 构建节点的完整路径
   * @param node 目标节点
   * @param allNodes 所有节点列表
   * @returns 完整路径字符串（如 "/Settings/Account/Profile"）
   */
  const buildPath = (node: T, allNodes: T[]): string => {
    const parts: string[] = [];
    let current: T | undefined = node;
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));

    // 从当前节点向上遍历到根节点
    while (current) {
      parts.unshift(current.title);

      // 查找父节点
      current = current.parentId ? nodeMap.get(current.parentId) : undefined;
    }

    return '/' + parts.join('/');
  };

  /**
   * 检查路径冲突
   * @param name 菜单名称
   * @param parentId 父节点 ID
   * @param allNodes 所有节点列表
   * @param currentNodeId 当前节点 ID（重命名时排除自己）
   * @returns 冲突信息，无冲突返回 null
   */
  const checkConflict = (
    name: string,
    parentId: string | null,
    allNodes: T[],
    currentNodeId?: string
  ): MenuPathConflict<T> | null => {
    // 找出同级节点（相同 parentId，排除自己）
    const siblings = allNodes.filter(node => node.parentId === parentId && node.id !== currentNodeId);

    // 检测冲突（case-insensitive）
    const conflict = siblings.find(sibling => sibling.title.toLowerCase() === name.toLowerCase());

    if (conflict) {
      return {
        conflictPath: buildPath(conflict, allNodes),
        conflictNode: conflict,
        attemptedName: name
      };
    }

    return null;
  };

  return {
    checkConflict,
    buildPath
  };
}
