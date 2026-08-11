import type { ITreeEntity, RxDBEntityId } from '@aiao/rxdb';

interface TreeScopeNode {
  id: RxDBEntityId;
  parentId?: RxDBEntityId | null;
}

/**
 * 以 id 去重合并两份节点列表，**前者优先**。
 *
 * 懒加载页面里"手上有的节点"天然分成两份：屏幕上可见的那批（已订阅、正在被改写的
 * 就是这些实例），和为某次操作按需查回来的那批（同级列表等）。二者会重叠，
 * 而重叠部分必须保留可见的那个实例 —— 拖放会改写它的 `sortOrder`/`parentId` 再 `save()`，
 * 换成查询回来的另一个实例，改动就落在了一个没人渲染的对象上。
 *
 * @param primary - 优先保留的列表（通常是可见节点）
 * @param extra - 补充列表（通常是按需查回来的同级）
 * @returns 去重后的合并结果
 */
export const mergeById = <T extends ITreeEntity>(primary: T[], extra: T[]): T[] => {
  const seen = new Set<RxDBEntityId>(primary.map(item => item.id));
  return [...primary, ...extra.filter(item => !seen.has(item.id))];
};

/** 返回目标节点及其子树的后序列表，保证删除时子节点先于父节点。 */
export const collectSubtreePostOrder = <T extends TreeScopeNode>(root: T, nodes: readonly T[]): T[] => {
  const childrenByParent = new Map<RxDBEntityId | null, T[]>();
  for (const node of nodes) {
    const parentId = node.parentId ?? null;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(node);
    childrenByParent.set(parentId, children);
  }

  const result: T[] = [];
  const visited = new Set<RxDBEntityId>();
  const visit = (node: T): void => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    for (const child of childrenByParent.get(node.id) ?? []) visit(child);
    result.push(node);
  };

  visit(root);
  return result;
};
