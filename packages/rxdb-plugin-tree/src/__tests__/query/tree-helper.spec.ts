import { UpdateDataCache, type RxDBEntityLocalUpdatedEventData } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { resolveAncestorForCount, TreeHelper } from '../../query/tree-helper.js';

class TreeNode {
  id?: string;
  parentId?: string | null;
}

type NodeDefinition = readonly [id: string, parentId: string | null];

interface HelperContext {
  helper: TreeHelper<typeof TreeNode>;
  oldResultMap: Map<string, TreeNode>;
  serializeCount: () => number;
}

const createNode = (id?: string, parentId: string | null = null): TreeNode => {
  const node = new TreeNode();
  if (id !== undefined) {
    node.id = id;
  }
  node.parentId = parentId;
  return node;
};

const createUpdate = (id: string, parentId: string | null): RxDBEntityLocalUpdatedEventData<typeof TreeNode> => ({
  type: 'UPDATE',
  namespace: 'public',
  entity: 'TreeNode',
  id,
  recordAt: new Date('2026-01-01T00:00:00.000Z'),
  patch: { id, parentId },
  inversePatch: {}
});

const createHelper = (updates: readonly NodeDefinition[] = [], oldNodes: readonly TreeNode[] = []): HelperContext => {
  let serialized = 0;
  const cache = new UpdateDataCache<typeof TreeNode>(
    updates.map(([id, parentId]) => createUpdate(id, parentId)),
    event => {
      serialized++;
      return createNode(event.id, event.patch.parentId ?? null);
    }
  );
  const oldResultMap = new Map<string, TreeNode>();
  for (const node of oldNodes) {
    if (node.id !== undefined) {
      oldResultMap.set(node.id, node);
    }
  }

  return {
    helper: new TreeHelper(cache, oldResultMap),
    oldResultMap,
    serializeCount: () => serialized
  };
};

/**
 * 「候选是否为目标的祖先」（count 口径）的等价写法：先收集整条祖先链，再用集合判定候选。
 *
 * 判定拆成「收集一次 + O(1) 查集合」两步后，同一批事件里的所有候选共用同一个集合；
 * 这个包装只是把两步重新合成一次调用，方便逐条断言单个候选的结果。
 */
const isAncestorForCount = (
  helper: TreeHelper<typeof TreeNode>,
  targetEntity: TreeNode,
  candidateEntity: TreeNode | null | undefined,
  maxLevel?: number
): boolean | undefined =>
  resolveAncestorForCount<typeof TreeNode>(helper.collectAncestorIdsForCount(targetEntity, maxLevel), candidateEntity);

const createChain = (length: number): NodeDefinition[] =>
  Array.from({ length }, (_, index): NodeDefinition => {
    const number = index + 1;
    const parentId = number === length ? null : `node-${number + 1}`;
    return [`node-${number}`, parentId];
  });

describe('TreeHelper', () => {
  describe('resolveParentEntity', () => {
    it('prefers the batch update over a stale old-result entry with the same id', () => {
      // `oldResultMap` 是本批事件**之前**的快照。父节点自己也在本批里改了 parentId 时，
      // 读旧快照会顺着过期的链路往上走，把已经移出子树的节点判成仍在子树内。
      const oldParent = createNode('parent', null);
      const { helper, oldResultMap, serializeCount } = createHelper([['parent', 'updated-root']], [oldParent]);

      const resolved = helper.resolveParentEntity('parent');

      expect(resolved).toMatchObject({ id: 'parent', parentId: 'updated-root' });
      expect(serializeCount()).toBe(1);
      // 反写回旧结果集，同批内的后续查询直接命中，不重复反序列化
      expect(oldResultMap.get('parent')).toBe(resolved);
      expect(helper.resolveParentEntity('parent')).toBe(resolved);
      expect(serializeCount()).toBe(1);
    });

    it('promotes a serialized update into the old result map and leaves misses uncached', () => {
      const { helper, oldResultMap, serializeCount } = createHelper([['parent', 'root']]);

      const first = helper.resolveParentEntity('parent');
      const second = helper.resolveParentEntity('parent');

      expect(first).toMatchObject({ id: 'parent', parentId: 'root' });
      expect(second).toBe(first);
      expect(oldResultMap.get('parent')).toBe(first);
      expect(serializeCount()).toBe(1);
      expect(helper.resolveParentEntity('missing')).toBeUndefined();
      expect(oldResultMap.has('missing')).toBe(false);
    });
  });

  describe('isEntityDescendant', () => {
    it('accepts null and undefined targets while calculating distance to the root', () => {
      const { helper } = createHelper([
        ['parent', 'root'],
        ['root', null]
      ]);
      const leaf = createNode('leaf', 'parent');
      const root = createNode('root', null);

      expect(helper.isEntityDescendant(leaf, null)).toEqual({ isDescendant: true, level: 2 });
      expect(helper.isEntityDescendant(leaf, undefined)).toEqual({ isDescendant: true, level: 2 });
      expect(helper.isEntityDescendant(root, null)).toEqual({ isDescendant: true, level: 0 });
    });

    it('counts the unresolved parent edge and then stops an all-tree traversal', () => {
      const { helper } = createHelper();

      expect(helper.isEntityDescendant(createNode('leaf', 'missing'), null)).toEqual({
        isDescendant: true,
        level: 1
      });
    });

    it('returns the real ancestor distance and rejects roots, self, and missing chains', () => {
      const { helper } = createHelper([
        ['parent', 'root'],
        ['root', null]
      ]);
      const leaf = createNode('leaf', 'parent');
      const root = createNode('root', null);
      const unresolved = createNode('unresolved', 'missing');

      expect(helper.isEntityDescendant(leaf, 'parent')).toEqual({ isDescendant: true, level: 1 });
      expect(helper.isEntityDescendant(leaf, 'root')).toEqual({ isDescendant: true, level: 2 });
      expect(helper.isEntityDescendant(root, 'root')).toEqual({ isDescendant: false, level: 0 });
      expect(helper.isEntityDescendant(leaf, 'leaf')).toEqual({ isDescendant: false, level: 0 });
      expect(helper.isEntityDescendant(unresolved, 'root')).toEqual({ isDescendant: false, level: 0 });
    });
  });

  describe('isEntityAncestor', () => {
    it('rejects a candidate without an id and an entity itself', () => {
      const { helper } = createHelper();
      const target = createNode('target', null);

      expect(helper.isEntityAncestor(target, createNode())).toBe(false);
      expect(helper.isEntityAncestor(target, target)).toBe(false);
    });

    it('finds a real ancestor and stops at a root or missing parent', () => {
      const { helper } = createHelper([
        ['parent', 'root'],
        ['root', null]
      ]);
      const leaf = createNode('leaf', 'parent');

      expect(helper.isEntityAncestor(leaf, createNode('root'))).toBe(true);
      expect(helper.isEntityAncestor(createNode('root', null), createNode('other'))).toBe(false);
      expect(helper.isEntityAncestor(createNode('leaf', 'missing'), createNode('root'))).toBe(false);
    });
  });

  describe('count variants', () => {
    it('handles null, undefined, and id-less inputs without guessing', () => {
      const { helper } = createHelper();
      const root = createNode('root', null);

      expect(helper.isEntityDescendantForCount(null, 'root')).toBeUndefined();
      expect(helper.isEntityDescendantForCount(undefined, 'root')).toBeUndefined();
      expect(helper.isEntityDescendantForCount(root, null)).toBe(true);
      expect(helper.isEntityDescendantForCount(root, undefined)).toBe(true);
      expect(isAncestorForCount(helper, root, null)).toBeUndefined();
      expect(isAncestorForCount(helper, root, undefined)).toBeUndefined();
      expect(isAncestorForCount(helper, root, createNode())).toBeUndefined();
    });

    it('reuses serialized update cache entries for determinate relationships', () => {
      const { helper, serializeCount } = createHelper([
        ['parent', 'root'],
        ['root', null]
      ]);
      const leaf = createNode('leaf', 'parent');

      expect(helper.isEntityDescendantForCount(leaf, 'root')).toBe(true);
      expect(helper.isEntityDescendantForCount(leaf, 'root')).toBe(true);
      expect(serializeCount()).toBe(1);

      // 祖先判定是「先收集整条链、再判候选」：收集会一路走到根，因此比「命中即停」
      // 多反序列化一个终点节点(root)。这一次开销在整批候选之间摊薄 ——
      const ancestors = helper.collectAncestorIdsForCount(leaf);
      expect(serializeCount()).toBe(2);
      // —— 之后每个候选都只查集合，不再回 cache。
      expect(resolveAncestorForCount<typeof TreeNode>(ancestors, createNode('root'))).toBe(true);
      expect(resolveAncestorForCount<typeof TreeNode>(ancestors, createNode('parent'))).toBe(true);
      expect(resolveAncestorForCount<typeof TreeNode>(ancestors, createNode('other'))).toBe(false);
      expect(serializeCount()).toBe(2);
    });

    it('returns false at roots and does not treat a root as its own relation', () => {
      const { helper } = createHelper();
      const root = createNode('root', null);

      expect(helper.isEntityDescendantForCount(root, 'other')).toBe(false);
      expect(helper.isEntityDescendantForCount(root, 'root')).toBe(false);
      expect(isAncestorForCount(helper, root, createNode('other'))).toBe(false);
      expect(isAncestorForCount(helper, root, root)).toBe(false);
    });

    it('returns undefined when an updated parent chain is incomplete', () => {
      const { helper } = createHelper();
      const leaf = createNode('leaf', 'missing');

      expect(helper.isEntityDescendantForCount(leaf, 'root')).toBeUndefined();
      expect(isAncestorForCount(helper, leaf, createNode('root'))).toBeUndefined();
    });
  });

  it('terminates every traversal when a parent cycle repeats', () => {
    const { helper } = createHelper([
      ['a', 'b'],
      ['b', 'a']
    ]);
    const leaf = createNode('leaf', 'a');
    const unreachable = createNode('unreachable');

    expect(helper.isEntityDescendant(leaf, null)).toEqual({ isDescendant: true, level: 2 });
    expect(helper.isEntityDescendant(leaf, 'unreachable')).toEqual({ isDescendant: false, level: 0 });
    expect(helper.isEntityAncestor(leaf, unreachable)).toBe(false);
    expect(helper.isEntityDescendantForCount(leaf, 'unreachable')).toBe(false);
    expect(isAncestorForCount(helper, leaf, unreachable)).toBe(false);
  });

  it('enforces the 100-edge limit only on the guarded traversal variants', () => {
    const { helper } = createHelper(createChain(101));
    const leaf = createNode('leaf', 'node-1');

    expect(helper.isEntityDescendant(leaf, 'node-101')).toEqual({ isDescendant: true, level: 101 });
    expect(helper.isEntityAncestor(leaf, createNode('node-100'))).toBe(true);
    expect(helper.isEntityAncestor(leaf, createNode('node-101'))).toBe(false);
    expect(helper.isEntityDescendantForCount(leaf, 'node-100')).toBe(true);
    expect(helper.isEntityDescendantForCount(leaf, 'node-101')).toBe(false);
    expect(isAncestorForCount(helper, leaf, createNode('node-100'))).toBe(true);
    expect(isAncestorForCount(helper, leaf, createNode('node-101'))).toBe(false);
  });
});
