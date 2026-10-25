import type { ExpansionNode } from '@aiao/rxdb-plugin-bom';
import { buildPathTree } from './path-tree';

/** 以发生项完整路径区分的反查展示节点。 */
export interface WhereUsedTreeNode {
  key: string;
  node: ExpansionNode;
  children: WhereUsedTreeNode[];
}

/** 从被查子件向使用方生长，保留每个发生项路径及原有兄弟顺序。 */
export const buildWhereUsedTree = (nodes: readonly ExpansionNode[]): WhereUsedTreeNode[] => {
  const entries = nodes.map(node => {
    const key = JSON.stringify(node.path);
    if (node.path.length === 0) throw new Error('反查路径不能为空');
    if (node.depth !== node.path.length) throw new Error(`反查节点层级与路径长度不一致：${key}`);
    return { key, node, children: [] } as WhereUsedTreeNode;
  });
  return buildPathTree(
    entries,
    entry => (entry.node.path.length === 1 ? null : JSON.stringify(entry.node.path.slice(1))),
    '反查路径',
    '父路径'
  );
};
