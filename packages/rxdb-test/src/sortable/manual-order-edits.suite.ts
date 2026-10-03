/**
 * @fileoverview 手动排序与实例状态交界处的跨适配器契约用例（US-028 评审 RV-026 R01～R04）。
 *
 * @remarks
 * 四类边界：
 * - 重排时被移动行或邻居带着未保存编辑：算键只认库里的值，未保存编辑原样留在实例上、之后仍可保存；
 * - 同一批里显式给键与缺键追加落在同一组：自动键排在本批显式键之后，不碰撞；
 * - 事务失败：引擎赋上的自动键随之撤回，重试时重新追加，调用方显式给的键不动；
 * - 多字段分组只改一个分组字段：目标组取库里的值合并本次 patch，不读 patch 外的未保存编辑。
 *
 * 库里的真实值一律清掉实体缓存后从本地主适配器直接读回，不拿缓存实例当落库证据。
 */
import { type EntityType, getEntityStatus, type RuleGroup } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { SortableItem, SortableTeamItem, SortableTodo } from './fixtures.js';
import type { ManualOrderSuiteDatabase } from './types.js';

const ALL = { combinator: 'and', rules: [] } as RuleGroup;

type OrderField = { readonly field: string; readonly sort: 'asc' };
const orderBy = (...fields: string[]): OrderField[] => fields.map(field => ({ field, sort: 'asc' as const }));

const byTitle = <R extends { title: string }>(rows: readonly R[]): Record<string, R> =>
  Object.fromEntries(rows.map(row => [row.title, row]));

/**
 * 在外层 describe 里登记实例状态边界用例。
 *
 * @param database - 外层 `beforeEach` 建好的当前用例数据库
 */
export function describeManualOrderEdits(database: () => ManualOrderSuiteDatabase): void {
  const rxdb = () => database().rxdb;
  const localAdapter = () => firstValueFrom(rxdb().localAdapter$);
  const items = () => rxdb().entityManager.getRepository(SortableItem);
  const todos = () => rxdb().entityManager.getRepository(SortableTodo);
  const teams = () => rxdb().entityManager.getRepository(SortableTeamItem);

  /** 绕开门面直接落库 */
  const seed = async (EntityType: EntityType, rows: readonly object[]): Promise<void> => {
    const adapter = await localAdapter();
    await adapter.mutations({
      create: new Map([[EntityType, new Set(rows)]]) as never,
      update: new Map(),
      remove: new Map()
    });
  };

  /** 清掉实体缓存后按给定排序从适配器直接读 */
  const readRows = async <T extends EntityType>(EntityType: T, fields: string[]): Promise<InstanceType<T>[]> => {
    rxdb().entityManager.cleanAllCache();
    const adapter = await localAdapter();
    return adapter.getRepository(EntityType).find({ where: ALL, orderBy: orderBy(...fields, 'id') });
  };

  const storedItems = async (): Promise<[string, string][]> =>
    (await readRows(SortableItem, ['sortOrder'])).map(row => [row.title, row.sortOrder]);

  const storedTodos = async (): Promise<[string, boolean, string][]> =>
    (await readRows(SortableTodo, ['completed', 'sortOrder'])).map(row => [row.title, row.completed, row.sortOrder]);

  const storedTeams = async (): Promise<[string, string, string, string][]> =>
    (await readRows(SortableTeamItem, ['team', 'phase', 'sortOrder'])).map(row => [
      row.title,
      row.team,
      row.phase,
      row.sortOrder
    ]);

  const item = (title: string | null, sortOrder?: string): SortableItem => {
    const row = new SortableItem();
    if (title !== null) row.title = title;
    if (sortOrder !== undefined) row.sortOrder = sortOrder;
    return row;
  };

  const todo = (title: string | null, completed: boolean, sortOrder?: string): SortableTodo => {
    const row = new SortableTodo();
    if (title !== null) row.title = title;
    row.completed = completed;
    if (sortOrder !== undefined) row.sortOrder = sortOrder;
    return row;
  };

  const team = (title: string, values: Pick<SortableTeamItem, 'team' | 'phase'>, sortOrder?: string) => {
    const row = new SortableTeamItem();
    row.title = title;
    row.team = values.team;
    row.phase = values.phase;
    if (sortOrder !== undefined) row.sortOrder = sortOrder;
    return row;
  };

  describe('重排不借用带未保存编辑的实例（R01）', () => {
    let rows: Record<string, SortableItem>;

    beforeEach(async () => {
      await seed(SortableItem, [item('a', 'a0'), item('b', 'a1'), item('c', 'a2')]);
      rows = byTitle(await firstValueFrom(items().find({ where: ALL as RuleGroup<SortableItem> })));
    });

    it('被移动行带着未保存的键：按库里的键判定，真正移动', async () => {
      rows.c.sortOrder = 'a0V';
      await items().reorder(rows.c.id, { prevId: rows.a.id, nextId: rows.b.id });

      expect((await storedItems()).map(([title]) => title)).toEqual(['a', 'c', 'b']);
    });

    it('邻居带着未保存的键：锚点取库里的键，邻居的编辑留在实例上、之后仍可保存', async () => {
      rows.b.sortOrder = 'a9';
      await items().reorder(rows.c.id, { prevId: rows.a.id, nextId: rows.b.id });

      const stored = await storedItems();
      expect(stored.map(([title]) => title)).toEqual(['a', 'c', 'b']);
      expect(stored.find(([title]) => title === 'b')).toEqual(['b', 'a1']);
      expect(rows.b.sortOrder).toBe('a9');
      await rows.b.save();
      expect((await storedItems()).find(([title]) => title === 'b')).toEqual(['b', 'a9']);
    });

    it('被移动行的其他未保存字段不落库、不丢，之后仍可保存', async () => {
      rows.c.title = 'c-edited';
      await items().reorder(rows.c.id, { prevId: rows.a.id, nextId: rows.b.id });

      expect(rows.c.title).toBe('c-edited');
      expect((await storedItems()).map(([title]) => title)).toEqual(['a', 'c', 'b']);
      await rows.c.save();
      expect((await storedItems()).map(([title]) => title)).toEqual(['a', 'c-edited', 'b']);
    });
  });

  describe('同批显式键先预留，自动键接在其后（R02）', () => {
    it('空组：显式键与缺键同批，缺键排在显式键之后', async () => {
      await rxdb().entityManager.saveMany([item('explicit', 'a0'), item('missing')]);

      expect(await storedItems()).toEqual([
        ['explicit', 'a0'],
        ['missing', 'a1']
      ]);
    });

    it('非空组：显式键越过库里尾键时，缺键接在显式键之后', async () => {
      await seed(SortableItem, [item('old', 'a0')]);
      await rxdb().entityManager.saveMany([item('explicit', 'a5'), item('missing')]);

      expect(await storedItems()).toEqual([
        ['old', 'a0'],
        ['explicit', 'a5'],
        ['missing', 'a6']
      ]);
    });

    it('同批更新改了键：缺键接在更新后的键之后', async () => {
      await seed(SortableItem, [item('old', 'a0'), item('moved', 'a1')]);
      const { moved } = byTitle(await firstValueFrom(items().find({ where: ALL as RuleGroup<SortableItem> })));
      moved.sortOrder = 'a8';
      await rxdb().entityManager.saveMany([moved, item('missing')]);

      expect(await storedItems()).toEqual([
        ['old', 'a0'],
        ['moved', 'a8'],
        ['missing', 'a9']
      ]);
    });

    it('显式改组与自动改组同批：自动改组接在显式键之后', async () => {
      await seed(SortableTodo, [todo('o0', false, 'a0'), todo('o1', false, 'a1'), todo('d0', true, 'a0')]);
      const { o0, o1 } = byTitle(await firstValueFrom(todos().find({ where: ALL as RuleGroup<SortableTodo> })));
      o1.completed = true;
      o0.completed = true;
      o0.sortOrder = 'a3';
      await rxdb().entityManager.saveMany([o1, o0]);

      expect(await storedTodos()).toEqual([
        ['d0', true, 'a0'],
        ['o0', true, 'a3'],
        ['o1', true, 'a4']
      ]);
    });

    it('跨组混排：只预留同组的显式键，别的组照常从自己的尾键追加', async () => {
      await seed(SortableTeamItem, [team('x0', { team: 'x', phase: 'open' }, 'a0')]);
      await rxdb().entityManager.saveMany([
        team('x-explicit', { team: 'x', phase: 'open' }, 'a5'),
        team('x-missing', { team: 'x', phase: 'open' }),
        team('y-missing', { team: 'y', phase: 'open' })
      ]);

      expect(await storedTeams()).toEqual([
        ['x0', 'x', 'open', 'a0'],
        ['x-explicit', 'x', 'open', 'a5'],
        ['x-missing', 'x', 'open', 'a6'],
        ['y-missing', 'y', 'open', 'a0']
      ]);
    });
  });

  describe('事务失败撤回自动键（R03）', () => {
    it('单条缺键创建失败：键撤回，期间别的写入之后重试重新追加', async () => {
      const retry = item(null);
      await expect(items().create(retry)).rejects.toThrow();
      expect(retry.sortOrder).toBeUndefined();

      await items().create(item('other'));
      retry.title = 'retry';
      await items().create(retry);

      expect(await storedItems()).toEqual([
        ['other', 'a0'],
        ['retry', 'a1']
      ]);
    });

    it('批量创建失败：缺键行撤回，显式键原样保留；重试重新追加', async () => {
      const appended = item('appended');
      const explicit = item('explicit', 'a5');
      const broken = item(null);
      await expect(rxdb().entityManager.saveMany([appended, explicit, broken])).rejects.toThrow();
      expect(appended.sortOrder).toBeUndefined();
      expect(broken.sortOrder).toBeUndefined();
      expect(explicit.sortOrder).toBe('a5');

      await items().create(item('other'));
      broken.title = 'broken';
      await rxdb().entityManager.saveMany([appended, explicit, broken]);

      expect(await storedItems()).toEqual([
        ['other', 'a0'],
        ['explicit', 'a5'],
        ['appended', 'a6'],
        ['broken', 'a7']
      ]);
    });

    it('批量改组失败：改组行的键回到原值，重试追加到新组当时的末尾', async () => {
      await seed(SortableTodo, [todo('o0', false, 'a0'), todo('d0', true, 'a0')]);
      const { o0 } = byTitle(await firstValueFrom(todos().find({ where: ALL as RuleGroup<SortableTodo> })));
      o0.completed = true;
      await expect(rxdb().entityManager.saveMany([o0, todo(null, false)])).rejects.toThrow();
      expect(o0.sortOrder).toBe('a0');
      expect(getEntityStatus(o0).patch).toEqual({ completed: true });

      await todos().create(todo('d1', true));
      await rxdb().entityManager.saveMany([o0, todo('o1', false)]);

      expect(await storedTodos()).toEqual([
        ['o1', false, 'a1'],
        ['d0', true, 'a0'],
        ['d1', true, 'a1'],
        ['o0', true, 'a2']
      ]);
    });
  });

  describe('多字段分组的目标组取库里的值合并 patch（R04）', () => {
    it('只改 team 时 phase 的未保存编辑不参与定组、不落库，仍留在实例上', async () => {
      await seed(SortableTeamItem, [
        team('moving', { team: 'x', phase: 'open' }, 'a0'),
        team('target', { team: 'y', phase: 'open' }, 'a5'),
        team('other', { team: 'y', phase: 'closed' }, 'a0')
      ]);
      const { moving } = byTitle(await firstValueFrom(teams().find({ where: ALL as RuleGroup<SortableTeamItem> })));
      moving.phase = 'closed';
      await teams().update(moving, { team: 'y' });

      expect(moving.phase).toBe('closed');
      expect(getEntityStatus(moving).patch).toEqual({ phase: 'closed' });
      const stored = await storedTeams();
      const [, storedTeam, storedPhase, key] = stored.find(([title]) => title === 'moving') ?? [];
      expect([storedTeam, storedPhase]).toEqual(['y', 'open']);
      expect(key !== undefined && key > 'a5').toBe(true);
    });
  });
}
