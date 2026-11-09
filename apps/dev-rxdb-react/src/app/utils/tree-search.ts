interface SearchNode {
  id: string;
  parentId?: string | null;
}

/** 搜索态的可见集与祖先路径。 */
export interface SearchPath {
  /** 命中节点及其全部祖先：搜索时只显示这些。 */
  visible: Set<string>;
  /** 命中节点的全部祖先：搜索时临时画成展开，不改用户的展开集合。 */
  ancestors: Set<string>;
}

/**
 * 按命中谓词算出搜索态的可见集与祖先路径（整棵树只算一次；父链成环时停下）。
 *
 * @remarks
 * 与 Angular 菜单树 `expandMatchedAncestors`、Vue `buildTreeMenuNodes` 同一口径：
 * 命中节点的祖先在搜索时打开，清空搜索后回到用户自己的折叠状态。
 */
export function collectSearchPath<T extends SearchNode>(nodes: readonly T[], isMatch: (node: T) => boolean): SearchPath {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const visible = new Set<string>();
  const ancestors = new Set<string>();
  for (const node of nodes) {
    if (!isMatch(node)) continue;
    visible.add(node.id);
    let parent = node.parentId ? byId.get(node.parentId) : undefined;
    while (parent && !ancestors.has(parent.id)) {
      ancestors.add(parent.id);
      visible.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
  }
  return { visible, ancestors };
}
