import { describe, expect, it } from 'vitest';
import { byParent, collectSubtreePostOrder } from './tree-scope';

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

describe('byParent', () => {
  it('生成按 parentId 精确匹配的查询条件，根节点用 null', () => {
    expect(byParent('p1' as never)).toEqual({
      combinator: 'and',
      rules: [{ field: 'parentId', operator: '=', value: 'p1' }]
    });
    expect(byParent(null).rules[0].value).toBeNull();
  });
});
