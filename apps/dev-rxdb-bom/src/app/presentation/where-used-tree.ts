import type { ExpansionNode } from '@aiao/rxdb-plugin-bom';

/** 以发生项完整路径区分的反查展示节点。 */
export interface WhereUsedTreeNode {
  key: string;
  node: ExpansionNode;
  children: WhereUsedTreeNode[];
}

/** 从被查子件向使用方生长，保留每个发生项路径及原有兄弟顺序。 */
export const buildWhereUsedTree = (nodes: readonly ExpansionNode[]): WhereUsedTreeNode[] => {
  const indexed = new Map<string, WhereUsedTreeNode>();
  for (const node of nodes) {
    const key = JSON.stringify(node.path);
    if (node.path.length === 0) throw new Error('反查路径不能为空');
    if (node.depth !== node.path.length) throw new Error(`反查节点层级与路径长度不一致：${key}`);
    if (indexed.has(key)) throw new Error(`反查路径重复：${key}`);
    indexed.set(key, { key, node, children: [] });
  }

  const roots: WhereUsedTreeNode[] = [];
  for (const entry of indexed.values()) {
    if (entry.node.path.length === 1) {
      roots.push(entry);
      continue;
    }
    const parentKey = JSON.stringify(entry.node.path.slice(1));
    const parent = indexed.get(parentKey);
    if (!parent) throw new Error(`反查路径缺少父路径：${parentKey}`);
    parent.children.push(entry);
  }
  return roots;
};
