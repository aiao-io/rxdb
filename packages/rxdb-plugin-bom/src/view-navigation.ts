import type { BomViewNode } from './view-types.js';

/** 执行三框架共用的树键盘语义，返回是否消费该按键。 */
export const handleBomTreeKey = (
  key: string,
  nodes: readonly BomViewNode[],
  index: number,
  actions: { focus(index: number): void; toggle(path: readonly string[]): void; edit(node: BomViewNode): void }
): boolean => {
  const node = nodes[index];
  if (node === undefined) return false;
  const focus = (target: number) => actions.focus(Math.max(0, Math.min(target, nodes.length - 1)));
  const move = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: nodes.length - 1 };
  if (key in move) {
    focus(move[key as keyof typeof move]);
    return true;
  }
  if (key === 'Enter') {
    actions.edit(node);
    return true;
  }
  if (key === ' ') {
    if (node.hasChildren) actions.toggle(node.path);
    return true;
  }
  if (key === 'ArrowRight') {
    if (node.hasChildren && !node.expanded) actions.toggle(node.path);
    else if (node.expanded && (nodes[index + 1]?.depth ?? 0) > node.depth) focus(index + 1);
    return true;
  }
  if (key !== 'ArrowLeft') return false;
  if (node.hasChildren && node.expanded) {
    actions.toggle(node.path);
    return true;
  }
  const parentKey = JSON.stringify(node.path.slice(0, -1));
  const parent = nodes.findIndex(candidate => candidate.depth === node.depth - 1 && candidate.key === parentKey);
  if (parent >= 0) focus(parent);
  return true;
};
