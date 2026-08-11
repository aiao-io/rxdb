/**
 * @fileoverview 数值主键实体的查询缓存合并回归（RXD-069）
 *
 * `RxDBEntityId = string | number | bigint`，数值主键是**公开契约支持**的用法，
 * 但缓存合并链路（INSERT / UPDATE / DELETE）此前只有字符串 ID 的用例，
 * 唯一一条数值用例还是靠 `0 as unknown as string` 塞进字符串 ID 实体里 ——
 * 那只能证明内部函数能处理非法运行时对象，证明不了用户能以类型安全的方式走到这里。
 *
 * 本 spec 用**合法声明**的数值 ID 实体（`idType: number`）重跑三条合并路径，
 * 并把 `0` 这个假值边界覆盖到 `entityId` / `id` / `parentId` 三个位置 ——
 * `0` 会被 `??` 之外的任何真值判断吃掉，是数值主键最容易出错的地方。
 */

import { emptyFunction } from '@aiao/utils';
import { Observable, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import query_merge_create_cache_impl from '../../query/merge_create.js';
import query_merge_remove_cache_impl from '../../query/merge_remove.js';
import query_merge_update_cache_impl from '../../query/merge_update.js';
import { getFingerprintPrimitive, type Fingerprint } from '../../repository/fingerprint.utils.js';
import { QueryOptions } from '../../repository/QueryManager.interface.js';
import { QueryTask } from '../../repository/QueryTask.js';
import type {
  RxDBEntityLocalCreatedEventData,
  RxDBEntityLocalRemovedEventData,
  RxDBEntityLocalUpdatedEventData
} from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';

describe('数值主键实体的查询缓存合并（RXD-069）', () => {
  /**
   * 合法的数值 ID 实体：`idType` 声明为 `number`，因此 `entityId` / `id` 全程
   * 不需要任何 cast —— 这正是 finding 要求的「公开契约实际支持的入口」。
   */
  class NumericEntity {
    [key: string]: unknown;
    static [ENTITY_STATIC_TYPES] = { idType: 0 as number };
    id = 0;
  }

  type NumericEntityType = typeof NumericEntity;
  type NumericEntityData = InstanceType<NumericEntityType>;
  type CreatedEvent = RxDBEntityLocalCreatedEventData<NumericEntityType>;
  type UpdatedEvent = RxDBEntityLocalUpdatedEventData<NumericEntityType>;
  type RemovedEvent = RxDBEntityLocalRemovedEventData<NumericEntityType>;

  const createMockRxDB = (cachedById: Record<number, unknown> = {}): RxDB =>
    ({
      schemaManager: {
        getFieldRelations: vi.fn(() => ({ relations: [], isForeignKey: false, property: {}, propertyName: '' })),
        getEntityType: vi.fn(),
        getEntityMetadata: vi.fn()
      },
      addEventListener: vi.fn(),
      entityManager: {
        createEntityRef: vi.fn((_entityType: NumericEntityType, entity: NumericEntityData) => entity),
        getEntityRef: vi.fn((_entityType: unknown, id: number) => cachedById[id])
      }
    }) as unknown as RxDB;

  const getFingerprintByPrimitive = (value: unknown): Fingerprint[] =>
    getFingerprintPrimitive(value as Fingerprint | Fingerprint[]);
  const getFingerprintByMockEntity = (entity: unknown): Fingerprint[] => [JSON.stringify({ ...(entity as object) })];
  const getFingerprintByMockEntities = (entities: unknown): Fingerprint[] =>
    Array.isArray(entities) ? entities.map(e => JSON.stringify({ ...(e as object) })) : [];

  const createMockQueryTask = <RT>(
    taskOptions: QueryOptions<NumericEntityType> & {
      runner: () => Observable<RT>;
      cachedById?: Record<number, unknown>;
    }
  ): QueryTask<NumericEntityType, RT> => {
    const deps = new Map<NumericEntityType, number>();
    deps.set(NumericEntity, 1);
    const { runner, cachedById, ...queryOptions } = taskOptions;
    const pickFingerprint = () => {
      switch (queryOptions.type) {
        case 'count':
        case 'countDescendants':
        case 'countAncestors':
          return getFingerprintByPrimitive;
        case 'findOne':
        case 'findOneOrFail':
        case 'get':
          return getFingerprintByMockEntity;
        default:
          return getFingerprintByMockEntities;
      }
    };
    const task = new QueryTask<NumericEntityType, RT>({
      cacheKey: 'cacheKey',
      options: queryOptions,
      runner,
      entityType: NumericEntity,
      rxdb: createMockRxDB(cachedById),
      depEntityTypeMap: deps,
      serialize: data => data.patch as NumericEntityData,
      onClean: emptyFunction,
      getFingerprint: pickFingerprint()
    });
    task.result$ = new Observable<RT>(observer => {
      task.observerCount++;
      if (task.result !== undefined) observer.next(task.result);
      task.observers.add(observer);
      task.run();
      return (): void => {
        task.observerCount--;
        task.observers.delete(observer);
        if (task.observerCount <= 0) task.clean();
      };
    });
    return task;
  };

  const createEvent = (entity: NumericEntityData): CreatedEvent => ({
    type: 'INSERT',
    namespace: 'test',
    entity: 'NumericEntity',
    id: entity.id,
    entityType: NumericEntity,
    recordAt: new Date(0),
    patch: entity,
    inversePatch: null
  });

  const updateEvent = (entity: NumericEntityData, previous?: Partial<NumericEntityData>): UpdatedEvent => ({
    type: 'UPDATE',
    namespace: 'test',
    entity: 'NumericEntity',
    id: entity.id,
    entityType: NumericEntity,
    recordAt: new Date(0),
    patch: entity,
    inversePatch: (previous ?? entity) as NumericEntityData
  });

  const removeEvent = (entity: NumericEntityData): RemovedEvent => ({
    type: 'DELETE',
    namespace: 'test',
    entity: 'NumericEntity',
    id: entity.id,
    entityType: NumericEntity,
    recordAt: new Date(0),
    patch: null,
    inversePatch: entity
  });

  /**
   * 订阅任务并按序断言每次发射，收齐 `expected.length` 次后完成。
   */
  const expectEmissions = <RT>(task: QueryTask<NumericEntityType, RT>, expected: unknown[], act: () => void) =>
    new Promise<void>((resolve, reject) => {
      let index = 0;
      task.result$.subscribe({
        next: value => {
          try {
            expect(value).toEqual(expected[index]);
            index++;
            if (index === expected.length) resolve();
          } catch (error) {
            reject(error);
          }
        },
        error: reject
      });
      act();
    });

  describe('INSERT', () => {
    it('数值 id 的新实体加入 find 结果', () => {
      const task = createMockQueryTask({
        type: 'find',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () => of([{ id: 1, name: 'one' }])
      });

      return expectEmissions(
        task,
        [
          [{ id: 1, name: 'one' }],
          [
            { id: 1, name: 'one' },
            { id: 0, name: 'zero' }
          ]
        ],
        () =>
          query_merge_create_cache_impl(task as unknown as QueryTask<NumericEntityType>, [
            createEvent({ id: 0, name: 'zero' })
          ])
      );
    });

    it('entityId=0 的 findAncestors 不会被当成「无 entityId」', () => {
      // 目标节点 id=0、parentId=1；新建的 1 号节点必须被识别为它的祖先。
      // 假值 id 一旦被 `if (entityId)` 之类的判断吃掉，这里会退化成「查所有根节点」。
      const task = createMockQueryTask({
        type: 'findAncestors',
        options: { entityId: 0, where: { combinator: 'and', rules: [] } },
        runner: () => of([{ id: 0, name: 'target-zero', parentId: 1 }])
      });

      return expectEmissions(
        task,
        [
          [{ id: 0, name: 'target-zero', parentId: 1 }],
          [
            { id: 0, name: 'target-zero', parentId: 1 },
            { id: 1, name: 'parent', parentId: null }
          ]
        ],
        () =>
          query_merge_create_cache_impl(task as unknown as QueryTask<NumericEntityType>, [
            createEvent({ id: 1, name: 'parent', parentId: null })
          ])
      );
    });

    it('parentId=0 的子节点能挂到 id=0 的父节点下', () => {
      const task = createMockQueryTask({
        type: 'findDescendants',
        options: { entityId: 0, where: { combinator: 'and', rules: [] } },
        runner: () => of([{ id: 0, name: 'root-zero', parentId: null }])
      });

      return expectEmissions(
        task,
        [
          [{ id: 0, name: 'root-zero', parentId: null }],
          [
            { id: 0, name: 'root-zero', parentId: null },
            { id: 2, name: 'child', parentId: 0 }
          ]
        ],
        () =>
          query_merge_create_cache_impl(task as unknown as QueryTask<NumericEntityType>, [
            createEvent({ id: 2, name: 'child', parentId: 0 })
          ])
      );
    });
  });

  describe('UPDATE', () => {
    it('数值 id 的 get 查询按 id 命中并合并 patch', () => {
      const task = createMockQueryTask({
        type: 'get',
        options: 0,
        runner: () => of({ id: 0, name: 'zero', status: 'queued' })
      });

      return expectEmissions(
        task,
        [
          { id: 0, name: 'zero', status: 'queued' },
          { id: 0, name: 'zero', status: 'done' }
        ],
        () =>
          query_merge_update_cache_impl(task as unknown as QueryTask<NumericEntityType>, [
            updateEvent({ id: 0, name: 'zero', status: 'done' })
          ])
      );
    });

    it('数值 id 的 findAll 结果按 id 定位并就地更新', () => {
      const task = createMockQueryTask({
        type: 'findAll',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () =>
          of([
            { id: 0, name: 'zero' },
            { id: 1, name: 'one' }
          ])
      });

      return expectEmissions(
        task,
        [
          [
            { id: 0, name: 'zero' },
            { id: 1, name: 'one' }
          ],
          [
            { id: 0, name: 'zero-renamed' },
            { id: 1, name: 'one' }
          ]
        ],
        () =>
          query_merge_update_cache_impl(task as unknown as QueryTask<NumericEntityType>, [
            updateEvent({ id: 0, name: 'zero-renamed' }, { id: 0, name: 'zero' })
          ])
      );
    });

    it('entityId=0 的 findDescendants 就地更新 parentId=0 的子节点', () => {
      // scope 根是 id=0：`targetEntityId` 与子节点的 `parentId` 都是假值 0，
      // 只要任何一处用真值判断代替 `!= null`，这里就会退化成「不在 scope 内」。
      const task = createMockQueryTask({
        type: 'findDescendants',
        options: { entityId: 0, where: { combinator: 'and', rules: [] } },
        runner: () =>
          of([
            { id: 0, name: 'root-zero', parentId: null },
            { id: 3, name: 'child', parentId: 0 }
          ])
      });

      return expectEmissions(
        task,
        [
          [
            { id: 0, name: 'root-zero', parentId: null },
            { id: 3, name: 'child', parentId: 0 }
          ],
          [
            { id: 0, name: 'root-zero', parentId: null },
            { id: 3, name: 'child-renamed', parentId: 0 }
          ]
        ],
        () =>
          query_merge_update_cache_impl(task as unknown as QueryTask<NumericEntityType>, [
            updateEvent({ id: 3, name: 'child-renamed', parentId: 0 }, { id: 3, name: 'child', parentId: 0 })
          ])
      );
    });
  });

  describe('DELETE', () => {
    it('删除 id=0 的实体会把它从 findAll 结果里摘掉', () => {
      const task = createMockQueryTask({
        type: 'findAll',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () =>
          of([
            { id: 0, name: 'zero' },
            { id: 1, name: 'one' }
          ])
      });

      return expectEmissions(
        task,
        [
          [
            { id: 0, name: 'zero' },
            { id: 1, name: 'one' }
          ],
          [{ id: 1, name: 'one' }]
        ],
        () =>
          query_merge_remove_cache_impl(task as unknown as QueryTask<NumericEntityType>, [
            removeEvent({ id: 0, name: 'zero' })
          ])
      );
    });

    it('删除数值 id 的祖先会同时移除它在 findAncestors 结果中的位置', () => {
      const task = createMockQueryTask({
        type: 'findAncestors',
        options: { entityId: 2, where: { combinator: 'and', rules: [] } },
        runner: () =>
          of([
            { id: 2, name: 'target', parentId: 0 },
            { id: 0, name: 'ancestor-zero', parentId: null }
          ])
      });

      return expectEmissions(
        task,
        [
          [
            { id: 2, name: 'target', parentId: 0 },
            { id: 0, name: 'ancestor-zero', parentId: null }
          ],
          [{ id: 2, name: 'target', parentId: 0 }]
        ],
        () =>
          query_merge_remove_cache_impl(task as unknown as QueryTask<NumericEntityType>, [
            removeEvent({ id: 0, name: 'ancestor-zero', parentId: null })
          ])
      );
    });

    it('数值 id 的 count 查询在删除后递减', () => {
      const task = createMockQueryTask({
        type: 'count',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () => of(2)
      });

      return expectEmissions(task, [2, 1], () =>
        query_merge_remove_cache_impl(task as unknown as QueryTask<NumericEntityType>, [
          removeEvent({ id: 0, name: 'zero' })
        ])
      );
    });
  });
});
