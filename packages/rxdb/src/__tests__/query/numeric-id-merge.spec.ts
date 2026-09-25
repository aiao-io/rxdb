/**
 * @fileoverview 数值主键实体的查询缓存合并回归（RXD-069）
 *
 * `RxDBEntityId = string | number | bigint`，数值主键是**公开契约支持**的用法，
 * 但缓存合并链路（INSERT / UPDATE / DELETE）此前只有字符串 ID 的用例，
 * 唯一一条数值用例还是靠 `0 as unknown as string` 塞进字符串 ID 实体里 ——
 * 那只能证明内部函数能处理非法运行时对象，证明不了用户能以类型安全的方式走到这里。
 *
 * 本 spec 用**合法声明**的数值 ID 实体（`idType: number`）重跑三条合并路径，
 * 并把 `0` 这个假值边界覆盖到 `entityId` / `id` 两个位置 ——
 * `0` 会被 `??` 之外的任何真值判断吃掉，是数值主键最容易出错的地方。
 *
 * 树查询（`findAncestors` / `findDescendants`）上同一批边界由
 * `@aiao/rxdb-plugin-tree` 的 `numeric-id-tree-merge.spec.ts` 覆盖：US-025 阶段 E
 * 之后那四个任务类型不再由核心的 merge 处理。
 */

import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import query_merge_create_cache_impl from '../../query/merge_create.js';
import query_merge_remove_cache_impl from '../../query/merge_remove.js';
import query_merge_update_cache_impl from '../../query/merge_update.js';
import { QueryTask } from '../../repository/QueryTask.js';
import type {
  RxDBEntityLocalCreatedEventData,
  RxDBEntityLocalRemovedEventData,
  RxDBEntityLocalUpdatedEventData
} from '../../rxdb-events.js';
import { createHarnessQueryTask, type HarnessTaskOptions } from '../../testing/query-task-harness.js';

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

    it('数值 id 的 count 查询在删除后应该触发 SQL 重数', () => {
      // count 分支不再本地做 `current_count - matched.length`（见 merge_remove.ts 的
      // count 分支注释），命中 where 的 DELETE 一律回 SQL 重数——这里用按调用次序
      // 依次返回的 runner 模拟「每次重数都去库里读一遍」，固定返回 `of(2)` 会让
      // refresh 后的第二次运行拿到同一个值，指纹未变不再发射，emission 序列止步于 [2]。
      let call = 0;
      const counts = [2, 1];
      const task = createMockQueryTask<number>({
        type: 'count',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () => of(counts[Math.min(call++, counts.length - 1)])
      });

      return expectEmissions(task, [2, 1], () =>
        query_merge_remove_cache_impl(task as unknown as QueryTask<NumericEntityType>, [
          removeEvent({ id: 0, name: 'zero' })
        ])
      );
    });
  });
});
