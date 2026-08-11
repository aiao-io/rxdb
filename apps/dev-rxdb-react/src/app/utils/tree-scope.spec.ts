import { describe, expect, it } from 'vitest';
import { collectSubtreePostOrder } from './tree-scope';

interface TestNode {
  id: string;
  parentId: string | null;
}

describe('collectSubtreePostOrder', () => {
  it('只收集目标子树，并保证子节点先于父节点', () => {
    const nodes: TestNode[] = [
      { id: 'root', parentId: null },
      { id: 'child', parentId: 'root' },
      { id: 'grandchild', parentId: 'child' },
      { id: 'other', parentId: null }
    ];

    expect(collectSubtreePostOrder(nodes[0], nodes).map(node => node.id)).toEqual(['grandchild', 'child', 'root']);
  });
});
