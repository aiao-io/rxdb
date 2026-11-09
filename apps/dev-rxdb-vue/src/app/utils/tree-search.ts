import type { RxDBEntityId } from '@aiao/rxdb';

interface SearchNode {
  id: RxDBEntityId;
  parentId?: RxDBEntityId | null;
}

/** 搜索态的可见集与祖先路径。 */
export interface SearchPath {
  /** 命中节点及其全部祖先：搜索时只显示这些。 */
  visible: Set<RxDBEntityId>;
  /** 命中节点的全部祖先：搜索时临时画成展开，不改用户的展开集合。 */
  ancestors: Set<RxDBEntityId>;
}

/**
 * 按命中谓词算出搜索态的可见集与祖先路径（整棵树只算一次；父链成环时停下）。
 *
 * @remarks
 * 与 Angular 菜单树 `expandMatchedAncestors`、React `collectSearchPath` 同一口径：
 * 命中节点的祖先在搜索时打开，清空搜索后回到用户自己的折叠状态。
 */
export function collectSearchPath<T extends SearchNode>(nodes: readonly T[], isMatch: (node: T) => boolean): SearchPath {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const visible = new Set<RxDBEntityId>();
  const ancestors = new Set<RxDBEntityId>();
  for (const node of nodes) {
    if (!isMatch(node)) continue;
    visible.add(node.id);
    let parent = node.parentId == null ? undefined : byId.get(node.parentId);
    while (parent && !ancestors.has(parent.id)) {
      ancestors.add(parent.id);
      visible.add(parent.id);
      parent = parent.parentId == null ? undefined : byId.get(parent.parentId);
    }
  }
  return { visible, ancestors };
}
