import type { RxDBEntityId, UUID } from '@aiao/rxdb';
import type { ITreeEntity } from '@aiao/rxdb-plugin-tree';

interface TreeScopeNode {
  id: RxDBEntityId;
  parentId?: RxDBEntityId | null;
}

/**
 * 按父节点取直接子节点的查询条件，`null` 取根节点。
 *
 * 懒加载 store 的子节点订阅、删除前判断「库里有没有子节点」、删除并提升时读子节点都用它，
 * 三处必须同一口径。
 */
export const byParent = (parentId: RxDBEntityId | null) => ({
  combinator: 'and' as const,
  rules: [{ field: 'parentId' as const, operator: '=' as const, value: parentId as UUID | null }]
});

/**
 * 以 id 去重合并两份节点列表，**前者优先**。
 *
 * 懒加载页面里"手上有的节点"天然分成两份：屏幕上可见的那批（已订阅的实例），
 * 和为某次操作按需查回来的那批（重命名冲突检测要的同级列表等）。二者会重叠，
 * 重叠部分保留可见的那个实例，免得同一节点在合并结果里出现两份。
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
