/**
 * @fileoverview 分组手动排序的跨适配器契约用例（US-028 阶段 D：AC#13～16）。
 *
 * @remarks
 * 两种分组列：可空外键 `listId`（含 NULL 组，AC#13 的验收形态）与 boolean `completed`（Todo 形态）。
 * 顺序断言对照 JS 比较算出的期望（NULL 最小、外键按码点、`false < true`），SQLite 与 PGlite 同时通过即两端同序。
 *
 * 种子经本地主适配器的 `mutations` 直接写入，绕开门面追加；同步写入走适配器的 `mergeChanges`，正是拉取的写路径。
 */
import { type RuleGroup, SortOrderError, type SwitchVersionActions } from '@aiao/rxdb';
import { filter, firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { SortableList, SortableListItem, SortableTodo } from './fixtures.js';
import { withTransactionBarrier } from './transaction-barrier.js';
import type { ManualOrderSuiteDatabase } from './types.js';

type ListKey = 'A' | 'B' | 'C';
type ItemSeed = readonly [title: string, list: ListKey | null, sortOrder: string];
type StoredItem = readonly [title: string, list: ListKey | null, sortOrder: string];
type TodoSeed = readonly [title: string, completed: boolean, sortOrder: string];
type StoredTodo = readonly [title: string, completed: boolean, sortOrder: string];

const ALL = { combinator: 'and', rules: [] } as RuleGroup;
const ITEM_ORDER_BY = [
  { field: 'listId', sort: 'asc' },
  { field: 'sortOrder', sort: 'asc' },
  { field: 'id', sort: 'asc' }
] as const;
const TODO_ORDER_BY = [
  { field: 'completed', sort: 'asc' },
  { field: 'sortOrder', sort: 'asc' },
  { field: 'id', sort: 'asc' }
] as const;
const NAMESPACE = 'manual-order-fixtures';

/** 码点比较；NULL 最小，与两端默认排序的 NULL 位置一致 */
const compareNullable = (a: string | null, b: string | null): number => {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
};

/** 默认排序 `[listId asc, sortOrder asc, id asc]` 的 JS 口径 */
const byGroupThenKey = (a: SortableListItem, b: SortableListItem): number =>
  compareNullable(a.listId, b.listId) || compareNullable(a.sortOrder, b.sortOrder) || compareNullable(a.id, b.id);

const titles = (rows: readonly { title: string }[]): string[] => rows.map(row => row.title);

const expectReason = async (write: Promise<unknown>, reason: SortOrderError['reason']): Promise<void> => {
  const error = await write.then(
    () => new Error('写入应被拒绝，却成功了'),
    (caught: unknown) => caught
  );
  expect(error).toBeInstanceOf(SortOrderError);
  expect((error as SortOrderError).reason).toBe(reason);
};

/**
 * 在外层 describe 里登记分组用例。
 *
 * @param database - 外层 `beforeEach` 建好的当前用例数据库
 */
export function describeManualOrderGroups(database: () => ManualOrderSuiteDatabase): void {
  const rxdb = () => database().rxdb;
  const localAdapter = () => firstValueFrom(rxdb().localAdapter$);
  const items = () => rxdb().entityManager.getRepository(SortableListItem);
  const todos = () => rxdb().entityManager.getRepository(SortableTodo);

  describe('分组：可空外键 listId（AC#13～15）', () => {
    let lists: Record<ListKey, SortableList>;
    let seeded: Record<string, SortableListItem>;

    const listIdOf = (key: ListKey | null): string | null => (key === null ? null : lists[key].id);
    const listKeyOf = (listId: string | null): ListKey | null =>
      (Object.keys(lists) as ListKey[]).find(key => lists[key].id === listId) ?? null;

    const item = (title: string, list: ListKey | null, sortOrder?: string): SortableListItem => {
      const row = new SortableListItem();
      row.title = title;
      row.listId = listIdOf(list);
      if (sortOrder !== undefined) row.sortOrder = sortOrder;
      return row;
    };

    /** 库里的真实键，按默认排序：清掉实体缓存后从适配器直接读 */
    const readStored = async (): Promise<StoredItem[]> => {
      rxdb().entityManager.cleanAllCache();
      const adapter = await localAdapter();
      const rows = await adapter.getRepository(SortableListItem).find({ where: ALL, orderBy: [...ITEM_ORDER_BY] });
      return rows.map(row => [row.title, listKeyOf(row.listId), row.sortOrder]);
    };

    const groupOf = (stored: readonly StoredItem[], list: ListKey | null) =>
      stored.filter(([, key]) => key === list).map(([title, , sortOrder]) => [title, sortOrder]);

    const findAll = (where: RuleGroup<SortableListItem> = ALL as RuleGroup<SortableListItem>) =>
      firstValueFrom(items().find({ where }));

    beforeEach(async () => {
      lists = { A: new SortableList(), B: new SortableList(), C: new SortableList() };
      for (const [key, list] of Object.entries(lists)) list.title = key;
      // 各组键都从 a0 起，组间重复键合法；C 组留空
      const seeds: ItemSeed[] = [
        ['B1', 'B', 'a1'],
        ['n0', null, 'a0'],
        ['A1', 'A', 'a1'],
        ['B0', 'B', 'a0'],
        ['n1', null, 'a1'],
        ['A0', 'A', 'a0']
      ];
      const rows = seeds.map(([title, list, sortOrder]) => item(title, list, sortOrder));
      const adapter = await localAdapter();
      await adapter.mutations({
        create: new Map<never, Set<never>>([
          [SortableList as never, new Set(Object.values(lists)) as never],
          [SortableListItem as never, new Set(rows) as never]
        ]),
        update: new Map(),
        remove: new Map()
      });
      seeded = Object.fromEntries(rows.map(row => [row.title, row]));
    });

    it('不带 orderBy 按 [listId, sortOrder, id]，NULL 组整体在最前，刷新后同序', async () => {
      const expected = titles(Object.values(seeded).sort(byGroupThenKey));
      expect(expected.slice(0, 2)).toEqual(['n0', 'n1']);
      expect(titles(await findAll())).toEqual(expected);
      rxdb().entityManager.cleanAllCache();
      expect(titles(await findAll())).toEqual(expected);
    });

    it('按组等值（含 IS NULL）查询：初查与活查询增量合并同序', async () => {
      const inList = { combinator: 'and', rules: [{ field: 'listId', operator: '=', value: lists.A.id }] };
      expect(titles(await findAll(inList as RuleGroup<SortableListItem>))).toEqual(['A0', 'A1']);

      const isNull = { combinator: 'and', rules: [{ field: 'listId', operator: 'null' }] };
      const live$ = items().find({ where: isNull as RuleGroup<SortableListItem> });
      expect(titles(await firstValueFrom(live$))).toEqual(['n0', 'n1']);
      const merged = firstValueFrom(live$.pipe(filter(rows => rows.length === 3)));

      await items().create(item('n2', null));

      expect(titles(await merged)).toEqual(['n0', 'n1', 'n2']);
    });

    it('缺键创建追加到本组末尾：普通组、NULL 组、空组；同批跨组混排按组拆分，其他组不变', async () => {
      await items().create(item('A2', 'A'));
      await item('n2', null).save();
      await items().create(item('C0', 'C'));
      await rxdb().entityManager.saveMany([
        item('A3', 'A'),
        item('B2', 'B'),
        item('n3', null),
        item('A4', 'A'),
        item('C1', 'C')
      ]);

      const stored = await readStored();
      expect(groupOf(stored, null)).toEqual([
        ['n0', 'a0'],
        ['n1', 'a1'],
        ['n2', 'a2'],
        ['n3', 'a3']
      ]);
      expect(groupOf(stored, 'A')).toEqual([
        ['A0', 'a0'],
        ['A1', 'a1'],
        ['A2', 'a2'],
        ['A3', 'a3'],
        ['A4', 'a4']
      ]);
      expect(groupOf(stored, 'B')).toEqual([
        ['B0', 'a0'],
        ['B1', 'a1'],
        ['B2', 'a2']
      ]);
      expect(groupOf(stored, 'C')).toEqual([
        ['C0', 'a0'],
        ['C1', 'a1']
      ]);
    });

    it('异步屏障把同组两次并发追加挤到一起，键仍不碰撞', async () => {
      const adapter = await localAdapter();
      const arrived = await withTransactionBarrier(adapter, () =>
        Promise.all([items().create(item('left', 'A')), items().create(item('right', 'A'))])
      );

      expect(arrived).toBeGreaterThanOrEqual(2);
      const group = groupOf(await readStored(), 'A');
      expect(group.slice(0, 2)).toEqual([
        ['A0', 'a0'],
        ['A1', 'a1']
      ]);
      expect(group.slice(2).map(([, key]) => key)).toEqual(['a2', 'a3']);
    });

    it('组内移动只写 sortOrder；跨组移到两邻之间写 listId 与 sortOrder，原组剩余行不变', async () => {
      await items().reorder(seeded.A1.id, { prevId: null, nextId: seeded.A0.id });
      const inGroup = await readStored();
      expect(groupOf(inGroup, 'A').map(([title]) => title)).toEqual(['A1', 'A0']);

      await items().reorder(seeded.A0.id, { prevId: seeded.B0.id, nextId: seeded.B1.id });
      const stored = await readStored();
      expect(groupOf(stored, 'A')).toEqual(groupOf(inGroup, 'A').filter(([title]) => title !== 'A0'));
      expect(groupOf(stored, 'B').map(([title]) => title)).toEqual(['B0', 'A0', 'B1']);
      const [, moved] = groupOf(stored, 'B')[1];
      expect(moved > 'a0' && moved < 'a1').toBe(true);
    });

    it('跨组追加到目标组末尾：空组得 a0，NULL 组接在尾键之后', async () => {
      await items().reorder(seeded.A0.id, { group: { listId: lists.C.id } });
      await items().reorder(seeded.B1.id, { group: { listId: null } });

      const stored = await readStored();
      expect(groupOf(stored, 'C')).toEqual([['A0', 'a0']]);
      expect(groupOf(stored, null)).toEqual([
        ['n0', 'a0'],
        ['n1', 'a1'],
        ['B1', 'a2']
      ]);
      expect(groupOf(stored, 'A')).toEqual([['A1', 'a1']]);
    });

    it('邻居不同组报 staleTarget、group 键与分组字段不符报 invalidTarget，都零写', async () => {
      const before = await readStored();
      await expectReason(items().reorder(seeded.A0.id, { prevId: seeded.n1.id, nextId: seeded.B0.id }), 'staleTarget');
      await expectReason(items().reorder(seeded.A0.id, { group: {} }), 'invalidTarget');
      expect(await readStored()).toEqual(before);
    });
  });

  describe('分组：boolean completed，改分组字段追加到新组末尾（AC#16）', () => {
    let seeded: Record<string, SortableTodo>;

    const todo = (title: string, completed: boolean, sortOrder: string): SortableTodo => {
      const row = new SortableTodo();
      row.title = title;
      row.completed = completed;
      row.sortOrder = sortOrder;
      return row;
    };

    const readStored = async (): Promise<StoredTodo[]> => {
      rxdb().entityManager.cleanAllCache();
      const adapter = await localAdapter();
      const rows = await adapter.getRepository(SortableTodo).find({ where: ALL, orderBy: [...TODO_ORDER_BY] });
      return rows.map(row => [row.title, row.completed, row.sortOrder]);
    };

    /** 经门面读出的实体：门面写入要用带原值的实例判定「改了分组字段」 */
    const loaded = async (): Promise<Record<string, SortableTodo>> => {
      const rows = await firstValueFrom(todos().find({ where: ALL as RuleGroup<SortableTodo> }));
      return Object.fromEntries(rows.map(row => [row.title, row]));
    };

    beforeEach(async () => {
      const seeds: TodoSeed[] = [
        ['o0', false, 'a0'],
        ['o1', false, 'a1'],
        ['o2', false, 'a2'],
        ['o3', false, 'a3'],
        ['o4', false, 'a4'],
        ['o5', false, 'a5'],
        ['d0', true, 'a0']
      ];
      const rows = seeds.map(([title, completed, sortOrder]) => todo(title, completed, sortOrder));
      const adapter = await localAdapter();
      await adapter.mutations({
        create: new Map([[SortableTodo, new Set(rows)]]),
        update: new Map(),
        remove: new Map()
      });
      seeded = Object.fromEntries(rows.map(row => [row.title, row]));
    });

    it('默认排序 false 组在前', async () => {
      const rows = await firstValueFrom(todos().find({ where: ALL as RuleGroup<SortableTodo> }));
      expect(titles(rows)).toEqual(['o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'd0']);
    });

    it('update / save / saveMany 只改分组字段：依次追加到新组末尾，同批按批内顺序', async () => {
      const rows = await loaded();
      await todos().update(rows.o0, { completed: true });
      rows.o1.completed = true;
      await rows.o1.save();
      rows.o2.completed = true;
      rows.o3.completed = true;
      await rxdb().entityManager.saveMany([rows.o2, rows.o3]);

      expect(await readStored()).toEqual([
        ['o4', false, 'a4'],
        ['o5', false, 'a5'],
        ['d0', true, 'a0'],
        ['o0', true, 'a1'],
        ['o1', true, 'a2'],
        ['o2', true, 'a3'],
        ['o3', true, 'a4']
      ]);
    });

    it('同一次写入另给合法键原样保留，非法键报 invalidKey、零写', async () => {
      const rows = await loaded();
      await todos().update(rows.o0, { completed: true, sortOrder: 'Zz' });
      const before = await readStored();
      await expectReason(todos().update(rows.o1, { completed: true, sortOrder: '!!' }), 'invalidKey');

      expect(before.find(([title]) => title === 'o0')).toEqual(['o0', true, 'Zz']);
      expect(await readStored()).toEqual(before);
    });

    it('同步写入（mergeChanges）改了分组字段的行原样落库，不改写键', async () => {
      const { id } = seeded.o5;
      const actions: SwitchVersionActions = {
        deletes: new Map(),
        inserts: new Map(),
        updates: new Map([
          [
            `${NAMESPACE}:SortableTodo:${id}`,
            { patch: { id, completed: true }, inversePatch: { id, completed: false } }
          ]
        ])
      };
      const adapter = await localAdapter();
      await adapter.mergeChanges(actions);

      // 带着原键 a5 进入已完成组：不追加、不改写，排在 d0（a0）之后
      const stored = await readStored();
      expect(stored.find(([title]) => title === 'o5')).toEqual(['o5', true, 'a5']);
      expect(stored.filter(([, completed]) => completed).map(([title]) => title)).toEqual(['d0', 'o5']);
    });
  });
}
