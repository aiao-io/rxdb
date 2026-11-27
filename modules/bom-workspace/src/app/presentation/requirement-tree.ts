import type { ExplosionResult, OutputLine, PenetrationRecord, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { buildPathTree } from './path-tree';

/** 以完整发生项路径区分的展示节点，虚拟件与产出不伪装成投入需求。 */
export interface RequirementTreeNode {
  key: string;
  path: readonly string[];
  depth: number;
  itemId: string;
  kind: 'root' | 'requirement' | 'phantom' | 'output';
  line: RequirementLine | null;
  penetration: PenetrationRecord | null;
  output: OutputLine | null;
  children: RequirementTreeNode[];
}

/** 按本次发生项遍历顺序挂接完整路径，不按物料编号归并。 */
export const buildRequirementTree = (result: ExplosionResult): RequirementTreeNode => {
  const root: RequirementTreeNode = {
    key: '[]',
    path: [],
    depth: 0,
    itemId: result.manifest.parentItemId,
    kind: 'root',
    line: null,
    penetration: null,
    output: null,
    children: []
  };
  const nodes: RequirementTreeNode[] = [
    ...result.requirementLines.map(line => ({
      path: line.path,
      itemId: line.itemId,
      kind: 'requirement' as const,
      line,
      penetration: null,
      output: null
    })),
    ...result.penetrations.map(penetration => ({
      path: penetration.path,
      itemId: penetration.childItemId,
      kind: 'phantom' as const,
      line: null,
      penetration,
      output: null
    })),
    ...result.outputs.map(output => ({
      path: output.path,
      itemId: output.itemId,
      kind: 'output' as const,
      line: null,
      penetration: null,
      output
    }))
  ].map(node => ({ ...node, key: JSON.stringify(node.path), depth: node.path.length, children: [] }));
  for (const node of nodes) {
    if (node.path.length === 0) throw new Error('需求发生项路径不能为空');
  }
  buildPathTree(
    [root, ...nodes],
    node => (node.depth === 0 ? null : JSON.stringify(node.path.slice(0, -1))),
    '需求路径',
    '父节点'
  );
  const order = new Map(result.manifest.occurrenceIds.map((id, index) => [id, index]));
  for (const parent of [root, ...nodes]) {
    parent.children.sort(
      (first, second) =>
        (order.get(first.path[first.path.length - 1]) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(second.path[second.path.length - 1]) ?? Number.MAX_SAFE_INTEGER)
    );
  }
  return root;
};

/** 迭代展开可见分支，避免深树递归与已收起后代的 DOM。 */
export const flattenRequirementTree = (
  root: RequirementTreeNode,
  expanded: ReadonlySet<string>
): RequirementTreeNode[] => {
  const visible: RequirementTreeNode[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop()!;
    visible.push(node);
    if (expanded.has(node.key)) pending.push(...node.children.toReversed());
  }
  return visible;
};
