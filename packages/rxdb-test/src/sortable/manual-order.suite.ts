/**
 * @fileoverview 手动排序实体的跨适配器契约套件（US-028 阶段 A：AC#2 / #3 / #4 / #11；阶段 D 见分组用例）。
 *
 * @remarks
 * 键按码点比较才有序（`'Zz' < 'a0'`、`'a0V' < 'a0l'`），换成 locale 比较两组都会翻转。
 * 每条顺序断言都对照 JS `<` 算出的期望值，所以 SQLite 与 PGlite 两个 runner 同时通过即两端同序。
 *
 * 脏数据（空串 / 非法 / 重复 / 异字母表键、NULL 键）经本地主适配器的 `mutations` 直接写入，
 * 绕开门面校验——模拟同步拉取或旧数据落库；库里的真实键同样从适配器直接读回，不经实体缓存。
 */
import { type RuleGroup, SortOrderError } from '@aiao/rxdb';
import { filter, firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { generateTestDbName } from '../testing/generate-test-db-name.js';
import { SortableItem, SortableList, SortableListItem, SortableTeamItem, SortableTodo } from './fixtures.js';
import { describeManualOrderEdits } from './manual-order-edits.suite.js';
import { describeManualOrderGroups } from './manual-order-group.suite.js';
import { withTransactionBarrier } from './transaction-barrier.js';
import type { ManualOrderSuiteDatabase, ManualOrderSuiteFactory } from './types.js';

/** 套件入口参数。 */
export interface ManualOrderSuiteOptions {
  /** 被测 adapter 的接入点。 */
  readonly factory: ManualOrderSuiteFactory;
}

type Seed = readonly [title: string, sortOrder: string | null];

const ALL = { combinator: 'and', rules: [] } as RuleGroup<SortableItem>;
const CURSOR_ORDER_BY = [
  { field: 'sortOrder', sort: 'asc' },
  { field: 'id', sort: 'asc' }
] as const;

/** 码点序：键先比，同键按 id——与默认排序 `[sortOrder asc, id asc]` 一致 */
const byCodePoint = (a: SortableItem, b: SortableItem): number => {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder < b.sortOrder ? -1 : 1;
  return a.id < b.id ? -1 : 1;
};

const titles = (rows: readonly SortableItem[]): string[] => rows.map(row => row.title);

/**
 * 运行手动排序契约套件。
 *
 * @param options - 被测 adapter 的接入点
 */
export function runManualOrderSuite(options: ManualOrderSuiteOptions): void {
  const { factory } = options;

  describe(`manual order contract (${factory.name})`, () => {
    let database: ManualOrderSuiteDatabase;

    beforeEach(async () => {
      database = await factory.createDatabase({
        dbName: generateTestDbName('manual_order'),
        entities: [SortableItem, SortableList, SortableListItem, SortableTodo, SortableTeamItem]
      });
      return async () => {
        await database.dispose();
      };
    });

    const repository = () => database.rxdb.entityManager.getRepository(SortableItem);
    const localAdapter = () => firstValueFrom(database.rxdb.localAdapter$);

    const item = (title: string, sortOrder?: string | null): SortableItem => {
      const row = new SortableItem();
      row.title = title;
      if (sortOrder !== undefined) row.sortOrder = sortOrder as string;
      return row;
    };

    /** 绕开门面校验直接落库 */
    const seedRaw = async (seeds: readonly Seed[]): Promise<SortableItem[]> => {
      const rows = seeds.map(([title, sortOrder]) => item(title, sortOrder));
      const adapter = await localAdapter();
      await adapter.mutations({
        create: new Map([[SortableItem, new Set(rows)]]),
        update: new Map(),
        remove: new Map()
      });
      return rows;
    };

    /** 库里的真实键，按码点序：清掉实体缓存后从适配器直接读 */
    const readStored = async (): Promise<[string, string][]> => {
      database.rxdb.entityManager.cleanAllCache();
      const adapter = await localAdapter();
      const rows = await adapter.getRepository(SortableItem).find({ where: ALL, orderBy: [...CURSOR_ORDER_BY] });
      return rows.map(row => [row.title, row.sortOrder]);
    };

    const findAll = (where: RuleGroup<SortableItem> = ALL) => firstValueFrom(repository().find({ where }));

    /** 按游标逐页读完整个序列 */
    const pageThrough = async (limit: number): Promise<SortableItem[]> => {
      const pages: SortableItem[] = [];
      for (;;) {
        const page = await firstValueFrom(
          repository().findByCursor({ where: ALL, orderBy: [...CURSOR_ORDER_BY], limit, after: pages.at(-1) })
        );
        pages.push(...page);
        if (page.length < limit) return pages;
      }
    };

    const expectReason = async (write: Promise<unknown>, reason: SortOrderError['reason']): Promise<void> => {
      const error = await write.then(
        () => new Error('写入应被拒绝，却成功了'),
        (caught: unknown) => caught
      );
      expect(error).toBeInstanceOf(SortOrderError);
      expect((error as SortOrderError).reason).toBe(reason);
    };

    describe('创建追加（AC#2）', () => {
      it('缺键创建逐条与成批追加到尾部，显式合法键原样落库', async () => {
        await repository().create(item('first'));
        await item('second').save();
        await database.rxdb.entityManager.saveMany([item('third'), item('fourth'), item('fifth')]);
        await repository().create(item('head', 'Zz'));

        expect(await readStored()).toEqual([
          ['head', 'Zz'],
          ['first', 'a0'],
          ['second', 'a1'],
          ['third', 'a2'],
          ['fourth', 'a3'],
          ['fifth', 'a4']
        ]);
      });

      it('异步屏障把两次并发追加的事务请求挤到一起，键仍不碰撞', async () => {
        await repository().create(item('existing'));
        const adapter = await localAdapter();
        const arrived = await withTransactionBarrier(adapter, () =>
          Promise.all([repository().create(item('left')), repository().create(item('right'))])
        );

        expect(arrived).toBeGreaterThanOrEqual(2);
        const stored = await readStored();
        const keys = stored.map(([, key]) => key);
        expect(new Set(keys).size).toBe(3);
        expect(stored[0]).toEqual(['existing', 'a0']);
        expect(keys.slice(1).sort()).toEqual(['a1', 'a2']);
      });
    });

    describe('重排（AC#3）', () => {
      it('移到首部、两行之间、尾部，每次只改被移动行的键', async () => {
        const [a, b, c] = await seedRaw([
          ['A', 'a0'],
          ['B', 'a1'],
          ['C', 'a2']
        ]);

        await repository().reorder(c.id, { prevId: null, nextId: a.id });
        expect(titles(await findAll())).toEqual(['C', 'A', 'B']);
        await repository().reorder(b.id, { prevId: c.id, nextId: a.id });
        expect(titles(await findAll())).toEqual(['C', 'B', 'A']);
        await repository().reorder(c.id, { group: {} });

        const stored = await readStored();
        expect(stored.map(([title]) => title)).toEqual(['B', 'A', 'C']);
        expect(stored.find(([title]) => title === 'A')?.[1]).toBe('a0');
      });
    });

    describe('码点序：初查、游标翻页、增量合并、刷新、区间条件（AC#4 / #11）', () => {
      // localeCompare 下 'a0' < 'Zz'、'a0l' < 'a0V'；码点序两组都相反
      const KEYS = ['a0l', 'Zz', 'a1', 'a0V', 'aZ', 'a0'];
      let seeded: SortableItem[];

      beforeEach(async () => {
        seeded = KEYS.map(key => item(key, key));
        await database.rxdb.entityManager.saveMany(seeded);
      });

      const expected = (rows: readonly SortableItem[]) => titles([...rows].sort(byCodePoint));

      it('初查与刷新都按码点序', async () => {
        expect(titles(await findAll())).toEqual(['Zz', 'a0', 'a0V', 'a0l', 'a1', 'aZ']);
        expect(titles(await findAll())).toEqual(expected(seeded));
        database.rxdb.entityManager.cleanAllCache();
        expect(titles(await findAll())).toEqual(expected(seeded));
      });

      it('游标翻页拼出的序列与初查一致（游标边界在 SQL 里按码点比较）', async () => {
        expect(titles(await pageThrough(2))).toEqual(expected(seeded));
      });

      it('区间条件按码点比较', async () => {
        const where = {
          combinator: 'and',
          rules: [{ field: 'sortOrder', operator: '>', value: 'a0V' }]
        } as RuleGroup<SortableItem>;
        expect(titles(await findAll(where))).toEqual(['a0l', 'a1', 'aZ']);
      });

      it('活查询增量合并插入的新行落在码点序位置', async () => {
        const live$ = repository().find({ where: ALL });
        expect(titles(await firstValueFrom(live$))).toEqual(expected(seeded));
        const merged = firstValueFrom(live$.pipe(filter(rows => rows.length === seeded.length + 1)));

        const inserted = item('a0Z', 'a0Z');
        await repository().create(inserted);

        expect(titles(await merged)).toEqual(expected([...seeded, inserted]));
      });
    });

    describe('脏序列（AC#11）', () => {
      let rows: Record<'E' | 'A' | 'B' | 'D1' | 'D2' | 'W' | 'T', SortableItem>;

      beforeEach(async () => {
        const [E, A, B, D1, D2, W, T] = await seedRaw([
          ['E', ''],
          ['A', 'a1'],
          ['B', 'a2'],
          ['D1', 'a3'],
          ['D2', 'a3'],
          // 字母表外字符
          ['W', 'a5!'],
          // 整数部分过短的非法键，按码点排在最后，正是尾行
          ['T', 'b0']
        ]);
        rows = { E, A, B, D1, D2, W, T };
      });

      const duplicates = () => [rows.D1, rows.D2].sort(byCodePoint);

      it('查询与游标翻页不写库，按码点序（同键按 id）', async () => {
        const before = await readStored();
        const order = titles(Object.values(rows).sort(byCodePoint));

        expect(titles(await findAll())).toEqual(order);
        expect(titles(await pageThrough(3))).toEqual(order);
        expect(await readStored()).toEqual(before);
      });

      it('尾行键非法时缺键创建报 corruptAnchor、零写', async () => {
        const before = await readStored();
        await expectReason(repository().create(item('appended')), 'corruptAnchor');
        expect(await readStored()).toEqual(before);
      });

      it('锚点违反不变量时重排报 corruptAnchor、零写', async () => {
        const before = await readStored();
        const [lower, upper] = duplicates();
        // 重复键：prev < next 不成立
        await expectReason(repository().reorder(rows.A.id, { prevId: lower.id, nextId: upper.id }), 'corruptAnchor');
        // 异字母表键作邻居
        await expectReason(repository().reorder(rows.A.id, { prevId: rows.W.id, nextId: rows.T.id }), 'corruptAnchor');
        // 空串键作邻居
        await expectReason(repository().reorder(rows.B.id, { prevId: rows.E.id, nextId: rows.A.id }), 'corruptAnchor');
        // 非法尾键作目标组末尾的锚点
        await expectReason(repository().reorder(rows.A.id, { group: {} }), 'corruptAnchor');
        expect(await readStored()).toEqual(before);
      });

      it('空串键行移入两个合法邻居之间成功，只改它自己', async () => {
        const before = await readStored();
        const moved = await repository().reorder(rows.E.id, { prevId: rows.A.id, nextId: rows.B.id });

        expect(moved.sortOrder > 'a1' && moved.sortOrder < 'a2').toBe(true);
        const after = await readStored();
        expect(after.filter(([title]) => title !== 'E')).toEqual(before.filter(([title]) => title !== 'E'));
        expect(after.map(([title]) => title).slice(0, 3)).toEqual(['A', 'E', 'B']);
      });

      it('同步写入 NULL 键被 NOT NULL 拒绝', async () => {
        const before = await readStored();
        await expect(seedRaw([['N', null]])).rejects.toThrow();
        expect(await readStored()).toEqual(before);
      });
    });

    describeManualOrderGroups(() => database);
    describeManualOrderEdits(() => database);
  });
}
