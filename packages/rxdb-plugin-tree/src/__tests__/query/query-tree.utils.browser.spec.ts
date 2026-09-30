import { describe, expect, it } from 'vitest';
import {
  buildEntityMap,
  get_tree_parent_id,
  isAncestorOf,
  isDescendantOf,
  traverseAncestors
} from '../../query/query-tree.utils.js';

interface TreeNode {
  id: string;
  parentId: string | null;
  name: string;
}

describe('query-tree.utils', () => {
  describe('get_tree_parent_id', () => {
    it('should return parentId when it exists', () => {
      const entity = { id: '1', parentId: 'parent-1', name: 'Node' };
      expect(get_tree_parent_id(entity)).toBe('parent-1');
    });

    it('should return null when parentId is null', () => {
      const entity = { id: '1', parentId: null, name: 'Root' };
      expect(get_tree_parent_id(entity)).toBeNull();
    });

    it('should return null when entity is null', () => {
      expect(get_tree_parent_id(null)).toBeNull();
    });

    it('should return 0 when parentId is numeric zero, not treat it as null', () => {
      const entity = { id: 1, parentId: 0, name: 'Child of root-zero' };
      expect(get_tree_parent_id(entity)).toBe(0);
    });
  });

  describe('buildEntityMap', () => {
    it('should build map from entities', () => {
      const entities: TreeNode[] = [
        { id: '1', parentId: null, name: 'Root' },
        { id: '2', parentId: '1', name: 'Child1' },
        { id: '3', parentId: '1', name: 'Child2' }
      ];

      const map = buildEntityMap(entities, e => e.id);

      expect(map.size).toBe(3);
      expect(map.get('1')?.name).toBe('Root');
      expect(map.get('2')?.name).toBe('Child1');
      expect(map.get('3')?.name).toBe('Child2');
    });

    it('should skip entities with null id', () => {
      const entities = [
        { id: '1', parentId: null, name: 'Root' },
        { id: null, parentId: '1', name: 'Invalid' }
      ];

      const map = buildEntityMap(entities, e => e.id);

      expect(map.size).toBe(1);
      expect(map.get('1')).toBeDefined();
    });

    it('should handle empty array', () => {
      const entities: TreeNode[] = [];
      const map = buildEntityMap(entities, e => e.id);

      expect(map.size).toBe(0);
    });

    it('should include entities with numeric id 0, not treat it as absent', () => {
      const entities = [
        { id: 0, parentId: null, name: 'Root-zero' },
        { id: 1, parentId: 0, name: 'Child' }
      ];

      const map = buildEntityMap(entities, e => e.id);

      expect(map.size).toBe(2);
      expect(map.get(0)?.name).toBe('Root-zero');
    });
  });

  describe('traverseAncestors', () => {
    it('should traverse up the parent chain', () => {
      const entities: TreeNode[] = [
        { id: 'root', parentId: null, name: 'Root' },
        { id: 'level1', parentId: 'root', name: 'Level1' },
        { id: 'level2', parentId: 'level1', name: 'Level2' },
        { id: 'level3', parentId: 'level2', name: 'Level3' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const leaf = entities[3];

      const ancestors = Array.from(traverseAncestors(leaf, map));

      expect(ancestors).toHaveLength(3);
      expect(ancestors[0].entity.id).toBe('level2');
      expect(ancestors[0].level).toBe(1);
      expect(ancestors[1].entity.id).toBe('level1');
      expect(ancestors[1].level).toBe(2);
      expect(ancestors[2].entity.id).toBe('root');
      expect(ancestors[2].level).toBe(3);
    });

    it('should respect maxLevel option', () => {
      const entities: TreeNode[] = [
        { id: 'root', parentId: null, name: 'Root' },
        { id: 'level1', parentId: 'root', name: 'Level1' },
        { id: 'level2', parentId: 'level1', name: 'Level2' },
        { id: 'level3', parentId: 'level2', name: 'Level3' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const leaf = entities[3];

      const ancestors = Array.from(traverseAncestors(leaf, map, { maxLevel: 2 }));

      expect(ancestors).toHaveLength(2);
      expect(ancestors[0].entity.id).toBe('level2');
      expect(ancestors[1].entity.id).toBe('level1');
    });

    it('should return no ancestors when maxLevel is zero', () => {
      const entities: TreeNode[] = [
        { id: 'root', parentId: null, name: 'Root' },
        { id: 'child', parentId: 'root', name: 'Child' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const ancestors = Array.from(traverseAncestors(entities[1], map, { maxLevel: 0 }));

      expect(ancestors).toHaveLength(0);
    });

    it('should stop when parent not found in map', () => {
      const entities: TreeNode[] = [
        { id: 'level2', parentId: 'level1', name: 'Level2' },
        { id: 'level3', parentId: 'level2', name: 'Level3' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const leaf = entities[1];

      const ancestors = Array.from(traverseAncestors(leaf, map));

      expect(ancestors).toHaveLength(1);
      expect(ancestors[0].entity.id).toBe('level2');
    });

    it('should detect circular references', () => {
      const entities: TreeNode[] = [
        { id: 'node1', parentId: 'node2', name: 'Node1' },
        { id: 'node2', parentId: 'node1', name: 'Node2' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const start = entities[0];

      const ancestors = Array.from(traverseAncestors(start, map));

      // 应该在检测到循环后停止
      expect(ancestors.length).toBeLessThan(1000);
    });

    it('should respect maxDepth to prevent infinite loops', () => {
      const entities: TreeNode[] = [
        { id: 'node1', parentId: 'node2', name: 'Node1' },
        { id: 'node2', parentId: 'node1', name: 'Node2' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const start = entities[0];

      const ancestors = Array.from(traverseAncestors(start, map, { maxDepth: 5 }));

      expect(ancestors.length).toBeLessThanOrEqual(5);
    });

    it('should return empty for root node', () => {
      const entities: TreeNode[] = [{ id: 'root', parentId: null, name: 'Root' }];

      const map = buildEntityMap(entities, e => e.id);
      const root = entities[0];

      const ancestors = Array.from(traverseAncestors(root, map));

      expect(ancestors).toHaveLength(0);
    });

    it('should traverse through an intermediate parent with numeric id 0', () => {
      const entities = [
        { id: 0, parentId: null, name: 'Root-zero' },
        { id: 1, parentId: 0, name: 'Child' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const child = entities[1];

      const ancestors = Array.from(traverseAncestors(child, map));

      expect(ancestors).toHaveLength(1);
      expect(ancestors[0].entity.id).toBe(0);
    });
  });

  describe('isDescendantOf', () => {
    it('should return true for direct child', () => {
      const entities: TreeNode[] = [
        { id: 'parent', parentId: null, name: 'Parent' },
        { id: 'child', parentId: 'parent', name: 'Child' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const child = entities[1];

      expect(isDescendantOf(child, 'parent', map)).toBe(true);
    });

    it('should return true for deep descendant', () => {
      const entities: TreeNode[] = [
        { id: 'root', parentId: null, name: 'Root' },
        { id: 'level1', parentId: 'root', name: 'Level1' },
        { id: 'level2', parentId: 'level1', name: 'Level2' },
        { id: 'level3', parentId: 'level2', name: 'Level3' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const leaf = entities[3];

      expect(isDescendantOf(leaf, 'root', map)).toBe(true);
      expect(isDescendantOf(leaf, 'level1', map)).toBe(true);
      expect(isDescendantOf(leaf, 'level2', map)).toBe(true);
    });

    it('should return false for non-descendant', () => {
      const entities: TreeNode[] = [
        { id: 'root', parentId: null, name: 'Root' },
        { id: 'branch1', parentId: 'root', name: 'Branch1' },
        { id: 'branch2', parentId: 'root', name: 'Branch2' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const branch1 = entities[1];

      expect(isDescendantOf(branch1, 'branch2', map)).toBe(false);
    });

    it('should return true for root node when targetId is null', () => {
      const entities: TreeNode[] = [
        { id: 'root', parentId: null, name: 'Root' },
        { id: 'child', parentId: 'root', name: 'Child' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const root = entities[0];

      expect(isDescendantOf(root, null, map)).toBe(true);
    });

    it('should return true for a rooted descendant when maxLevel is omitted', () => {
      const entities: TreeNode[] = [
        { id: 'root', parentId: null, name: 'Root' },
        { id: 'child', parentId: 'root', name: 'Child' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const child = entities[1];

      expect(isDescendantOf(child, null, map)).toBe(true);
    });

    it('should respect maxLevel option', () => {
      const entities: TreeNode[] = [
        { id: 'root', parentId: null, name: 'Root' },
        { id: 'level1', parentId: 'root', name: 'Level1' },
        { id: 'level2', parentId: 'level1', name: 'Level2' },
        { id: 'level3', parentId: 'level2', name: 'Level3' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const leaf = entities[3];

      expect(isDescendantOf(leaf, 'level2', map, 1)).toBe(true);
      expect(isDescendantOf(leaf, 'level1', map, 1)).toBe(false);
      expect(isDescendantOf(leaf, 'root', map, 2)).toBe(false);
      expect(isDescendantOf(entities[1], 'root', map, 0)).toBe(false);
    });

    it('should apply maxLevel from every root when targetId is null', () => {
      const entities: TreeNode[] = [
        { id: 'root', parentId: null, name: 'Root' },
        { id: 'child', parentId: 'root', name: 'Child' },
        { id: 'grandchild', parentId: 'child', name: 'Grandchild' }
      ];

      const map = buildEntityMap(entities, e => e.id);

      expect(isDescendantOf(entities[0], null, map, 0)).toBe(true);
      expect(isDescendantOf(entities[1], null, map, 0)).toBe(false);
      expect(isDescendantOf(entities[1], null, map, 1)).toBe(true);
      expect(isDescendantOf(entities[2], null, map, 1)).toBe(false);
      expect(isDescendantOf(entities[2], null, map, 2)).toBe(true);
    });

    it('should reject unresolved and cyclic root chains', () => {
      const unresolved: TreeNode = { id: 'child', parentId: 'missing', name: 'Child' };
      const cyclic: TreeNode[] = [
        { id: 'first', parentId: 'second', name: 'First' },
        { id: 'second', parentId: 'first', name: 'Second' }
      ];

      expect(
        isDescendantOf(
          unresolved,
          null,
          buildEntityMap([unresolved], e => e.id)
        )
      ).toBe(false);
      expect(
        isDescendantOf(
          cyclic[0],
          null,
          buildEntityMap(cyclic, e => e.id)
        )
      ).toBe(false);
    });

    it('should return true when an intermediate parent has numeric id 0', () => {
      const entities = [
        { id: 0, parentId: null, name: 'Root-zero' },
        { id: 1, parentId: 0, name: 'Child' },
        { id: 2, parentId: 1, name: 'Grandchild' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const grandchild = entities[2];

      expect(isDescendantOf(grandchild, 0, map)).toBe(true);
      expect(isDescendantOf(entities[1], 0, map)).toBe(true);
    });
  });

  describe('isAncestorOf', () => {
    it('should return true for direct parent', () => {
      const entities: TreeNode[] = [
        { id: 'parent', parentId: null, name: 'Parent' },
        { id: 'child', parentId: 'parent', name: 'Child' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const parent = entities[0];

      expect(isAncestorOf(parent, 'child', map)).toBe(true);
    });

    it('should return true for deep ancestor', () => {
      const entities: TreeNode[] = [
        { id: 'root', parentId: null, name: 'Root' },
        { id: 'level1', parentId: 'root', name: 'Level1' },
        { id: 'level2', parentId: 'level1', name: 'Level2' },
        { id: 'level3', parentId: 'level2', name: 'Level3' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const root = entities[0];
      const level1 = entities[1];

      expect(isAncestorOf(root, 'level3', map)).toBe(true);
      expect(isAncestorOf(level1, 'level3', map)).toBe(true);
    });

    it('should respect maxLevel option', () => {
      const entities: TreeNode[] = [
        { id: 'root', parentId: null, name: 'Root' },
        { id: 'level1', parentId: 'root', name: 'Level1' },
        { id: 'level2', parentId: 'level1', name: 'Level2' },
        { id: 'target', parentId: 'level2', name: 'Target' }
      ];

      const map = buildEntityMap(entities, e => e.id);

      expect(isAncestorOf(entities[2], 'target', map, 1)).toBe(true);
      expect(isAncestorOf(entities[1], 'target', map, 1)).toBe(false);
      expect(isAncestorOf(entities[1], 'target', map, 2)).toBe(true);
      expect(isAncestorOf(entities[2], 'target', map, 0)).toBe(false);
    });

    it('should return false for non-ancestor', () => {
      const entities: TreeNode[] = [
        { id: 'root', parentId: null, name: 'Root' },
        { id: 'branch1', parentId: 'root', name: 'Branch1' },
        { id: 'branch2', parentId: 'root', name: 'Branch2' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const branch1 = entities[1];

      expect(isAncestorOf(branch1, 'branch2', map)).toBe(false);
    });

    it('should return false when target not found', () => {
      const entities: TreeNode[] = [{ id: 'root', parentId: null, name: 'Root' }];

      const map = buildEntityMap(entities, e => e.id);
      const root = entities[0];

      expect(isAncestorOf(root, 'non-existent', map)).toBe(false);
    });

    it('should return false for self', () => {
      const entities: TreeNode[] = [{ id: 'node', parentId: null, name: 'Node' }];

      const map = buildEntityMap(entities, e => e.id);
      const node = entities[0];

      expect(isAncestorOf(node, 'node', map)).toBe(false);
    });

    it('should return true when targetId is numeric 0', () => {
      const entities = [
        { id: 1, parentId: null, name: 'Root' },
        { id: 0, parentId: 1, name: 'Target-zero' }
      ];

      const map = buildEntityMap(entities, e => e.id);
      const root = entities[0];

      expect(isAncestorOf(root, 0, map)).toBe(true);
    });
  });
});
