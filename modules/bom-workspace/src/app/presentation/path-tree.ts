interface PathNode<T> {
  key: string;
  children: T[];
}

export const buildPathTree = <T extends PathNode<T>>(
  nodes: readonly T[],
  parentKeyOf: (node: T) => string | null,
  label: string,
  parentLabel: string
): T[] => {
  const indexed = new Map<string, T>();
  for (const node of nodes) {
    if (indexed.has(node.key)) throw new Error(`${label}重复：${node.key}`);
    indexed.set(node.key, node);
  }
  const roots: T[] = [];
  for (const node of nodes) {
    const parentKey = parentKeyOf(node);
    if (parentKey === null) {
      roots.push(node);
      continue;
    }
    const parent = indexed.get(parentKey);
    if (parent === undefined) throw new Error(`${label}缺少${parentLabel}：${parentKey}`);
    parent.children.push(node);
  }
  return roots;
};
