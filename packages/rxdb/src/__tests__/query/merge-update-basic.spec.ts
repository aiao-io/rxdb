import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
  handleCountUpdate,
  handleFindAllUpdate,
  handleFindByCursorUpdate,
  handleFindOneUpdate,
  handleFindUpdate
} from '../../query/merge-update-basic.js';
import { UpdateDataCache, type UpdateClassification } from '../../query/merge-update.utils.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import type { QueryOptions } from '../../repository/QueryManager.interface.js';
import { QueryTask } from '../../repository/QueryTask.js';
import type { RxDBEntityLocalUpdatedEventData } from '../../rxdb-events.js';
import type { RxDB } from '../../RxDB.js';

class Item {
  id!: string;
  status!: 'active' | 'inactive';
  score!: number;
}

const activeWhere = {
  combinator: 'and',
  rules: [{ field: 'status', operator: '=', value: 'active' }]
} satisfies RuleGroup<Item>;

const createItem = (id: string | undefined, status: Item['status'], score: number): Item => {
  const item = new Item();
  if (id !== undefined) item.id = id;
  item.status = status;
  item.score = score;
  return item;
};

const createTask = (options: QueryOptions<typeof Item>): QueryTask<typeof Item> =>
  new QueryTask<typeof Item>({
    cacheKey: options.type,
    options,
    runner: () => of<unknown>(undefined),
    entityType: Item,
    rxdb: {} as RxDB,
    depEntityTypeMap: new Map(),
    serialize: data => data as unknown as Item,
    onClean: () => undefined,
    getFingerprint: result => [JSON.stringify(result)]
  });

const createClassification = (overrides: Partial<UpdateClassification> = {}): UpdateClassification => ({
  updatedIds: new Set(),
  matchNowIds: new Set(),
  matchBeforeIds: new Set(),
  newlyMatchedIds: new Set(),
  newlyUnmatchedIds: new Set(),
  stillMatchedIds: new Set(),
  ...overrides
});

const createUpdate = (
  id: string,
  patch: Readonly<Partial<Item>>,
  inversePatch: Readonly<Partial<Item>> = {}
): RxDBEntityLocalUpdatedEventData<typeof Item> => ({
  type: 'UPDATE',
  namespace: 'public',
  entity: 'Item',
  id,
  recordAt: new Date('2026-01-01T00:00:00.000Z'),
  patch,
  inversePatch
});

const serializeUpdate = (event: RxDBEntityLocalUpdatedEventData<typeof Item>): Item =>
  createItem(event.id, event.patch.status ?? 'inactive', event.patch.score ?? 0);

describe('merge-update-basic', () => {
  it('merges existing patches, removes unmatched rows, adds new matches, and reorders findAll results', () => {
    const task = createTask({
      type: 'findAll',
      options: {
        where: activeWhere,
        orderBy: [{ field: 'score', sort: 'asc' }]
      }
    });
    const withoutId = createItem(undefined, 'active', 99);
    const updated = createItem('a', 'active', 3);
    const removed = createItem('b', 'active', 2);
    const untouched = createItem('c', 'active', 4);
    task.next([withoutId, updated, removed, untouched]);

    const cache = new UpdateDataCache(
      [
        createUpdate('a', { status: 'active', score: 1 }),
        createUpdate('b', { status: 'inactive' }),
        createUpdate('d', { status: 'active', score: 0 })
      ],
      serializeUpdate
    );

    handleFindAllUpdate(task, createClassification({ newlyMatchedIds: new Set(['c', 'd', 'missing']) }), cache);

    expect(task.result).toEqual([expect.objectContaining({ id: 'd', score: 0 }), updated, untouched, withoutId]);
    expect(updated).toMatchObject({ status: 'active', score: 1 });
    expect(removed.status).toBe('inactive');
  });

  it('refreshes find when an existing result is updated', () => {
    const task = createTask({ type: 'find', options: { where: activeWhere } });
    task.next([createItem('a', 'active', 1)]);
    const refresh = vi.spyOn(task, 'refresh');

    handleFindUpdate(task, createClassification({ updatedIds: new Set(['a']) }));

    expect(refresh).toHaveBeenCalledOnce();
  });

  it('refreshes find when a new entity matches and ignores unrelated updates', () => {
    const affected = createTask({ type: 'find', options: { where: activeWhere } });
    const unaffected = createTask({ type: 'find', options: { where: activeWhere } });
    affected.next([createItem(undefined, 'active', 1)]);
    unaffected.next([createItem(undefined, 'active', 1)]);
    const affectedRefresh = vi.spyOn(affected, 'refresh');
    const unaffectedRefresh = vi.spyOn(unaffected, 'refresh');

    handleFindUpdate(affected, createClassification({ newlyMatchedIds: new Set(['a']) }));
    handleFindUpdate(unaffected, createClassification({ updatedIds: new Set(['a']) }));

    expect(affectedRefresh).toHaveBeenCalledOnce();
    expect(unaffectedRefresh).not.toHaveBeenCalled();
  });

  it('refreshes cursor results for updated rows or new matches', () => {
    const updatedTask = createTask({
      type: 'findByCursor',
      options: { where: activeWhere, orderBy: [{ field: 'id', sort: 'asc' }] }
    });
    const newMatchTask = createTask({
      type: 'findByCursor',
      options: { where: activeWhere, orderBy: [{ field: 'id', sort: 'asc' }] }
    });
    const unaffectedTask = createTask({
      type: 'findByCursor',
      options: { where: activeWhere, orderBy: [{ field: 'id', sort: 'asc' }] }
    });
    updatedTask.next([createItem('a', 'active', 1)]);
    newMatchTask.next([]);
    unaffectedTask.next([createItem(undefined, 'active', 1)]);
    const updatedRefresh = vi.spyOn(updatedTask, 'refresh');
    const newMatchRefresh = vi.spyOn(newMatchTask, 'refresh');
    const unaffectedRefresh = vi.spyOn(unaffectedTask, 'refresh');

    handleFindByCursorUpdate(updatedTask, createClassification({ updatedIds: new Set(['a']) }));
    handleFindByCursorUpdate(newMatchTask, createClassification({ newlyMatchedIds: new Set(['b']) }));
    handleFindByCursorUpdate(unaffectedTask, createClassification({ updatedIds: new Set(['a']) }));

    expect(updatedRefresh).toHaveBeenCalledOnce();
    expect(newMatchRefresh).toHaveBeenCalledOnce();
    expect(unaffectedRefresh).not.toHaveBeenCalled();
  });

  it('refreshes an empty findOne only when a new entity matches', () => {
    const affected = createTask({ type: 'findOne', options: { where: activeWhere } });
    const unaffected = createTask({ type: 'findOne', options: { where: activeWhere } });
    affected.next(null);
    unaffected.next(undefined);
    const affectedRefresh = vi.spyOn(affected, 'refresh');
    const unaffectedRefresh = vi.spyOn(unaffected, 'refresh');

    handleFindOneUpdate(
      affected,
      createClassification({ newlyMatchedIds: new Set(['a']) }),
      new UpdateDataCache([], serializeUpdate)
    );
    handleFindOneUpdate(unaffected, createClassification(), new UpdateDataCache([], serializeUpdate));

    expect(affectedRefresh).toHaveBeenCalledOnce();
    expect(unaffectedRefresh).not.toHaveBeenCalled();
  });

  it('ignores a findOne result without an id', () => {
    const task = createTask({ type: 'findOne', options: { where: activeWhere } });
    task.next(createItem(undefined, 'active', 1));
    const refresh = vi.spyOn(task, 'refresh');

    handleFindOneUpdate(
      task,
      createClassification({ newlyMatchedIds: new Set(['a']) }),
      new UpdateDataCache([], serializeUpdate)
    );

    expect(refresh).not.toHaveBeenCalled();
  });

  it('merges a still-matching findOne patch without a database refresh', () => {
    const task = createTask({ type: 'findOne', options: { where: activeWhere } });
    const current = createItem('a', 'active', 1);
    task.next(current);
    const refresh = vi.spyOn(task, 'refresh');

    handleFindOneUpdate(
      task,
      createClassification(),
      new UpdateDataCache([createUpdate('a', { score: 5 })], serializeUpdate)
    );

    expect(refresh).not.toHaveBeenCalled();
    expect(task.result).toBe(current);
    expect(current.score).toBe(5);
  });

  it('refreshes findOne when a patch stops matching or can change ordered precedence', () => {
    const unmatchedTask = createTask({ type: 'findOne', options: { where: activeWhere } });
    const orderedTask = createTask({
      type: 'findOne',
      options: { where: activeWhere, orderBy: [{ field: 'score', sort: 'asc' }] }
    });
    unmatchedTask.next(createItem('a', 'active', 1));
    orderedTask.next(createItem('b', 'active', 2));
    const unmatchedRefresh = vi.spyOn(unmatchedTask, 'refresh');
    const orderedRefresh = vi.spyOn(orderedTask, 'refresh');

    handleFindOneUpdate(
      unmatchedTask,
      createClassification(),
      new UpdateDataCache([createUpdate('a', { status: 'inactive' })], serializeUpdate)
    );
    handleFindOneUpdate(
      orderedTask,
      createClassification(),
      new UpdateDataCache([createUpdate('b', { score: 0 })], serializeUpdate)
    );

    expect(unmatchedRefresh).toHaveBeenCalledOnce();
    expect(orderedRefresh).toHaveBeenCalledOnce();
  });

  it('refreshes an unchanged findOne when another entity starts matching', () => {
    const task = createTask({ type: 'findOne', options: { where: activeWhere } });
    task.next(createItem('a', 'active', 1));
    const refresh = vi.spyOn(task, 'refresh');

    handleFindOneUpdate(
      task,
      createClassification({ newlyMatchedIds: new Set(['b']) }),
      new UpdateDataCache([], serializeUpdate)
    );

    expect(refresh).toHaveBeenCalledOnce();
  });

  it('updates and clamps count results only when the classification changes the count', () => {
    const changed = createTask({ type: 'count', options: { where: activeWhere } });
    const unchanged = createTask({ type: 'count', options: { where: activeWhere } });
    changed.next(1);
    unchanged.next(5);
    const unchangedNext = vi.spyOn(unchanged, 'next');

    handleCountUpdate(
      changed,
      createClassification({ newlyMatchedIds: new Set(['a']), newlyUnmatchedIds: new Set(['b', 'c', 'd']) })
    );
    handleCountUpdate(unchanged, createClassification());

    expect(changed.result).toBe(0);
    expect(unchanged.result).toBe(5);
    expect(unchangedNext).not.toHaveBeenCalled();
  });

  /**
   * count 模式下 `resultEntityIds` 是**跨批次的去重集合**，不是结果集镜像。
   *
   * `QueryTask#next` 在 `autoCache=true` 时无条件 `resultEntityIds.clear()`，而 count 的
   * 结果是个 number，清空后不会被重新填充。`merge_create` / `merge_remove` 的 count 分支
   * 为此都显式传了 `false`；update 分支漏传，于是一次计数更新就把去重记录抹干净，
   * 同一个实体的后续 CREATE 会被重复计入。
   */
  it('count 更新不清空跨批次去重集合', () => {
    const task = createTask({ type: 'count', options: { where: activeWhere } });
    task.next(2, false);
    task.resultEntityIds.add('a');
    task.resultEntityIds.add('b');

    handleCountUpdate(task, createClassification({ newlyMatchedIds: new Set(['c']) }));

    expect(task.result).toBe(3);
    expect([...task.resultEntityIds]).toEqual(['a', 'b']);
  });
});
