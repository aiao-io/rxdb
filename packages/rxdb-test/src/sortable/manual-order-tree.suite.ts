/**
 * @fileoverview 按自引用外键分组的手动排序契约用例（US-031 阶段 A）。
 *
 * @remarks
 * 三端 demo 的可排序树实体按 `parentId` 分组：同一父节点下的子节点是一条序列，根节点自成一组。
 * 这里用不依赖树插件的 {@link SortableNode} 覆盖 demo 的三种写法——缺键新建、批量添加（父节点与子节点同批新建）、
 * 删除并提升子节点（一次 `mutations` 里子节点改挂、父节点删除），断言库里的真实键。
 *
 * 「本批新建父行的组不读尾键」这条追加优化以外键约束为前提：库里不可能有行指向尚不存在的父行。
 * 第一条用例在两个后端上把这个前提钉住。
 */
import { getEntityMutations, type RuleGroup } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { SortableNode } from './fixtures.js';
import type { ManualOrderSuiteDatabase } from './types.js';

/** 一行的落库形态：标题、父节点标题（根为 null）、排序键 */
type StoredNode = readonly [title: string, parent: string | null, sortOrder: string];

const ALL = { combinator: 'and', rules: [] } as RuleGroup;
const NODE_ORDER_BY = [
  { field: 'parentId', sort: 'asc' },
  { field: 'sortOrder', sort: 'asc' },
  { field: 'id', sort: 'asc' }
] as const;

/**
 * 在外层 describe 里登记树形分组用例。
 *
 * @param database - 外层 `beforeEach` 建好的当前用例数据库
 */
export function describeManualOrderTree(database: () => ManualOrderSuiteDatabase): void {
  const rxdb = () => database().rxdb;
  const localAdapter = () => firstValueFrom(rxdb().localAdapter$);
  const nodes = () => rxdb().entityManager.getRepository(SortableNode);

  describe('树形分组：自引用外键 parentId（US-031）', () => {
    const node = (title: string, parent: SortableNode | null, sortOrder?: string): SortableNode => {
      const row = new SortableNode();
      row.title = title;
      row.parentId = parent?.id ?? null;
      if (sortOrder !== undefined) row.sortOrder = sortOrder;
      return row;
    };

    /** 绕开门面直接落库 */
    const seedRaw = async (rows: readonly SortableNode[]): Promise<void> => {
      const adapter = await localAdapter();
      await adapter.mutations({
        create: new Map([[SortableNode, new Set(rows)]]),
        update: new Map(),
        remove: new Map()
      });
    };

    /** 库里的真实键，按默认排序：清掉实体缓存后从适配器直接读 */
    const readStored = async (): Promise<StoredNode[]> => {
      rxdb().entityManager.cleanAllCache();
      const adapter = await localAdapter();
      const rows = await adapter.getRepository(SortableNode).find({ where: ALL, orderBy: [...NODE_ORDER_BY] });
      const titleOf = new Map<string, string>(rows.map(row => [row.id, row.title]));
      return rows.map(row => [
        row.title,
        row.parentId === null ? null : (titleOf.get(row.parentId) ?? '?'),
        row.sortOrder
      ]);
    };

    /** 某个父节点（根为 null）下的子节点，按库里顺序 */
    const childrenOf = (stored: readonly StoredNode[], parent: string | null): [string, string][] =>
      stored.filter(([, owner]) => owner === parent).map(([title, , sortOrder]) => [title, sortOrder]);

    const expectStrictlyIncreasing = (group: readonly [string, string][]): void => {
      for (let index = 1; index < group.length; index++) {
        expect(group[index - 1][1] < group[index][1], `${group[index - 1][0]} < ${group[index][0]}`).toBe(true);
      }
    };

    let roots: Record<'R0' | 'R1', SortableNode>;

    beforeEach(async () => {
      roots = { R0: node('R0', null, 'a0'), R1: node('R1', null, 'a1') };
      await seedRaw([roots.R0, roots.R1, node('c0', roots.R0, 'a0'), node('c1', roots.R0, 'a1')]);
    });

    it('外键约束拒绝指向不存在父行的子行（同批新建父行不读尾键的前提）', async () => {
      const orphan = node('orphan', null, 'a0');
      orphan.parentId = new SortableNode().id;
      await expect(seedRaw([orphan])).rejects.toBeDefined();
      expect(childrenOf(await readStored(), null).map(([title]) => title)).toEqual(['R0', 'R1']);
    });

    it('缺键新建：根组、已有子节点的组、空组各自追加到组尾', async () => {
      await nodes().create(node('r2', null));
      await nodes().create(node('c2', roots.R0));
      await nodes().create(node('d0', roots.R1));
      const stored = await readStored();
      expect(childrenOf(stored, null).map(([title]) => title)).toEqual(['R0', 'R1', 'r2']);
      expect(childrenOf(stored, 'R0').map(([title]) => title)).toEqual(['c0', 'c1', 'c2']);
      expect(childrenOf(stored, 'R1')).toEqual([['d0', 'a0']]);
      expectStrictlyIncreasing(childrenOf(stored, null));
      expectStrictlyIncreasing(childrenOf(stored, 'R0'));
    });

    it('批量添加：同批新建的父节点下从首键起，既有组从库里尾键之后，组内按批内顺序', async () => {
      const n1 = node('n1', null);
      const n4 = node('n4', null);
      const batch = [
        n1,
        node('n2', n1),
        node('x', roots.R0),
        node('n3', n1),
        node('y', null),
        n4,
        node('n5', n4),
        node('z', roots.R1)
      ];
      await rxdb().entityManager.saveMany(batch);
      const stored = await readStored();
      expect(childrenOf(stored, null).map(([title]) => title)).toEqual(['R0', 'R1', 'n1', 'y', 'n4']);
      expect(childrenOf(stored, 'n1').map(([title]) => title)).toEqual(['n2', 'n3']);
      expect(childrenOf(stored, 'n4')).toEqual([['n5', 'a0']]);
      expect(childrenOf(stored, 'n1')[0][1]).toBe('a0');
      expect(childrenOf(stored, 'R0').map(([title]) => title)).toEqual(['c0', 'c1', 'x']);
      expect(childrenOf(stored, 'R1')).toEqual([['z', 'a0']]);
      for (const parent of [null, 'n1', 'R0']) expectStrictlyIncreasing(childrenOf(stored, parent));
    });

    /** 删除 `target` 并把它的直接子节点提升到它的父节点下，一次 `mutations`（三端 demo 的写法） */
    const promoteChildrenAndDelete = async (target: SortableNode): Promise<void> => {
      const promoted = await firstValueFrom(
        nodes().find({ where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: target.id }] } })
      );
      const removed = await firstValueFrom(nodes().get(target.id));
      for (const child of promoted) child.parentId = target.parentId;
      await rxdb().entityManager.mutations(
        getEntityMutations({ needSaveEntities: promoted, needRemoveEntities: [removed] })
      );
    };

    it('删除并提升子节点（被删节点是根）：子节点先改挂、父节点后删除，按原顺序追加到根组末尾', async () => {
      await promoteChildrenAndDelete(roots.R0);
      const stored = await readStored();
      expect(childrenOf(stored, null).map(([title]) => title)).toEqual(['R1', 'c0', 'c1']);
      expectStrictlyIncreasing(childrenOf(stored, null));
    });

    it('删除并提升子节点（被删节点不是根）：孙节点按原顺序追加到祖父组末尾，原有兄弟不改写', async () => {
      const c0 = await firstValueFrom(
        nodes().find({ where: { combinator: 'and', rules: [{ field: 'title', operator: '=', value: 'c0' }] } })
      );
      await seedRaw([node('g0', c0[0], 'a0'), node('g1', c0[0], 'a1')]);
      const before = childrenOf(await readStored(), 'R0');
      await promoteChildrenAndDelete(c0[0]);
      const after = childrenOf(await readStored(), 'R0');
      expect(after.map(([title]) => title)).toEqual(['c1', 'g0', 'g1']);
      expect(after[0]).toEqual(before[1]);
      expectStrictlyIncreasing(after);
    });
  });
}
