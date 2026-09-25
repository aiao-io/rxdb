/**
 * @fileoverview 数值主键树实体的查询缓存合并回归（RXD-069）
 *
 * @remarks
 * `RxDBEntityId = string | number | bigint`，数值主键是**公开契约支持**的用法。
 * 树查询在数值主键上多一层风险：`entityId` / `parentId` 同时可能是 `0`，
 * 而 `0` 会被 `??` 之外的任何真值判断吃掉 —— 一旦某处用 `if (entityId)` 代替 `!= null`，
 * `findAncestors` 会退化成「查所有根节点」、`findDescendants` 会把子节点判成「不在 scope 内」，
 * 两者都不报错，只是结果悄悄变了。
 *
 * 随 US-025 阶段 E 从核心的 `__tests__/query/numeric-id-merge.spec.ts` 搬来：
 * 那份 spec 里字符串/数值主键的通用三条路径留在核心，四条树查询的跟着树进插件。
 */

import {
  ENTITY_STATIC_TYPES,
  QueryTask,
  type RxDBEntityLocalCreatedEventData,
  type RxDBEntityLocalRemovedEventData,
  type RxDBEntityLocalUpdatedEventData
} from '@aiao/rxdb';
import { createHarnessQueryTask, type HarnessTaskOptions } from '@aiao/rxdb/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { merge_create as query_merge_create_cache_impl } from '../../query/merge_create.js';
import { merge_remove as query_merge_remove_cache_impl } from '../../query/merge_remove.js';
import { merge_update as query_merge_update_cache_impl } from '../../query/merge_update.js';

describe('数值主键树实体的查询缓存合并（RXD-069）', () => {
  /**
   * 合法的数值 ID 实体：`idType` 声明为 `number`，因此 `entityId` / `id` 全程
   * 不需要任何 cast —— 这正是「公开契约实际支持的入口」。
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

  /** 经真正的 `QueryManager` 造查询任务，`result$` 与 `serialize` 全部来自生产代码。 */
  const createMockQueryTask = <RT>(
    taskOptions: HarnessTaskOptions<NumericEntityType, RT>
  ): QueryTask<NumericEntityType, RT> => createHarnessQueryTask(NumericEntity, taskOptions);

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
  });
});
