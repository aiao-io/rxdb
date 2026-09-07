import { emptyFunction } from '@aiao/utils';
import { firstValueFrom, map, of, switchMap, throwError, timer } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES, type EntityType } from '../../entity/entity.interface.js';
import query_merge_create_cache_impl from '../../query/merge_create.js';
import { QueryTask } from '../../repository/QueryTask.js';
import type { RxDBEntityLocalCreatedEventData } from '../../rxdb-events.js';
import { METADATA } from '../../rxdb.private.js';
import {
  collectEmissions,
  createHarnessQueryTask,
  type HarnessSchemaOverrides,
  type HarnessTaskOptions
} from '../fixtures/query-task-harness.js';

describe('query_merge_create_cache', () => {
  class TestEntity {
    [key: string]: unknown;
    static [ENTITY_STATIC_TYPES] = { idType: '' as string };
    id = '';
  }

  type TestEntityType = typeof TestEntity;
  type TestEntityData = InstanceType<TestEntityType>;
  type CreatedEvent = RxDBEntityLocalCreatedEventData<TestEntityType>;

  /** 经真正的 `QueryManager` 造查询任务，`result$` 与 `serialize` 全部来自生产代码。 */
  const createMockQueryTask = <RT>(
    taskOptions: HarnessTaskOptions<TestEntityType, RT>
  ): QueryTask<TestEntityType, RT> => createHarnessQueryTask(TestEntity, taskOptions);

  const query_merge_create_cache = <T extends EntityType, RT>(
    task: QueryTask<T, RT>,
    events: RxDBEntityLocalCreatedEventData<T>[]
  ): void => {
    query_merge_create_cache_impl(task as unknown as QueryTask<T>, events);
  };

  /**
   * 创建模拟的实体事件数据
   */
  const createMockEntityEvent = (entity: TestEntityData): CreatedEvent => {
    return {
      type: 'INSERT',
      namespace: 'test',
      entity: 'TestEntity',
      id: entity.id,
      entityType: TestEntity,
      recordAt: new Date(0),
      patch: entity,
      inversePatch: null
    };
  };

  describe('get - 单实体查询', () => {
    it('应该在匹配 id 的创建事件时更新结果', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'get',
          options: 'run-1',
          runner: () => of({ id: 'run-1', status: 'pending' })
        });

        const results = [
          { id: 'run-1', status: 'pending' },
          { id: 'run-1', status: 'queued', name: 'world' }
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        query_merge_create_cache(task, [createMockEntityEvent({ id: 'run-1', status: 'queued', name: 'world' })]);
      });
    });

    it('首个权威结果落地前不得用创建事件抢答', async () => {
      const task = createMockQueryTask({
        type: 'get',
        options: 'run-1',
        // 权威读要说「查无此实体」，但要等一个宏任务——这正是级联删除后再 get 的那段窗口
        runner: () => timer(0).pipe(switchMap(() => throwError(() => new Error('Entity with id run-1 not found'))))
      });

      const settled = firstValueFrom(task.result$);
      query_merge_create_cache(task, [createMockEntityEvent({ id: 'run-1', status: 'queued' })]);

      await expect(settled).rejects.toThrow('Entity with id run-1 not found');
    });
  });

  describe('findAll - 全量查询', () => {
    it('应该在空结果中添加匹配条件的新实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'name', operator: '=', value: 'John' }]
            }
          },
          runner: () => of([])
        });

        const results = [[], [{ id: '1', name: 'John' }]];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entity_1 = createMockEntityEvent({ id: '1', name: 'John' });
        const entities = [entity_1];
        query_merge_create_cache(task, entities);
      });
    });

    it('应该在现有结果中添加匹配条件的新实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            }
          },
          runner: () => of([{ id: '1', name: 'Task 1', status: 'active' }])
        });

        const results = [
          [{ id: '1', name: 'Task 1', status: 'active' }],
          [
            { id: '1', name: 'Task 1', status: 'active' },
            { id: '2', name: 'Task 2', status: 'active' }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entity_2 = createMockEntityEvent({ id: '2', name: 'Task 2', status: 'active' });
        query_merge_create_cache(task, [entity_2]);
      });
    });

    it('不应该添加不匹配条件的新实体', () => {
      const task = createMockQueryTask({
        type: 'findAll',
        options: {
          where: {
            combinator: 'and',
            rules: [{ field: 'completed', operator: '=', value: false }]
          }
        },
        runner: () => of([{ id: '1', title: 'Task 1', completed: false }])
      });

      const expectedResult = [{ id: '1', title: 'Task 1', completed: false }];

      const emissions = collectEmissions(task);

      // 创建一个不符合条件的实体（completed: true）
      const entity = createMockEntityEvent({ id: '2', title: 'Task 2', completed: true });
      query_merge_create_cache(task, [entity]);

      expect(emissions).toEqual([expectedResult]);
    });

    it('应该按照 orderBy 规则正确排序新添加的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: { combinator: 'and', rules: [] },
            orderBy: [{ field: 'priority', sort: 'desc' }]
          },
          runner: () =>
            of([
              { id: '1', title: 'Task 1', priority: 5 },
              { id: '2', title: 'Task 2', priority: 3 }
            ])
        });

        const results = [
          [
            { id: '1', title: 'Task 1', priority: 5 },
            { id: '2', title: 'Task 2', priority: 3 }
          ],
          [
            { id: '3', title: 'Task 3', priority: 10 },
            { id: '1', title: 'Task 1', priority: 5 },
            { id: '2', title: 'Task 2', priority: 3 }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entity = createMockEntityEvent({ id: '3', title: 'Task 3', priority: 10 });
        query_merge_create_cache(task, [entity]);
      });
    });

    it('应该处理复杂的 where 条件(多个规则)', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: {
              combinator: 'and',
              rules: [
                { field: 'status', operator: '=', value: 'active' },
                { field: 'priority', operator: '=', value: 'high' }
              ]
            }
          },
          runner: () => of([])
        });

        const results = [[], [{ id: '1', title: 'High Priority Task', status: 'active', priority: 'high' }]];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        // 只有这个实体同时满足两个条件
        const matchingEntity = createMockEntityEvent({
          id: '1',
          title: 'High Priority Task',
          status: 'active',
          priority: 'high'
        });

        query_merge_create_cache(task, [matchingEntity]);
      });
    });

    it('应该批量添加多个匹配的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: { combinator: 'and', rules: [] }
          },
          runner: () => of([])
        });

        const results = [
          [],
          [
            { id: '1', title: 'Task 1' },
            { id: '2', title: 'Task 2' },
            { id: '3', title: 'Task 3' }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entities = [
          createMockEntityEvent({ id: '1', title: 'Task 1' }),
          createMockEntityEvent({ id: '2', title: 'Task 2' }),
          createMockEntityEvent({ id: '3', title: 'Task 3' })
        ];

        query_merge_create_cache(task, entities);
      });
    });

    it('应该在批量添加时过滤掉不匹配的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'completed', operator: '=', value: false }]
            }
          },
          runner: () => of([])
        });

        const results = [
          [],
          [
            { id: '1', title: 'Task 1', completed: false },
            { id: '3', title: 'Task 3', completed: false }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entities = [
          createMockEntityEvent({ id: '1', title: 'Task 1', completed: false }),
          createMockEntityEvent({ id: '2', title: 'Task 2', completed: true }), // 不匹配
          createMockEntityEvent({ id: '3', title: 'Task 3', completed: false })
        ];

        query_merge_create_cache(task, entities);
      });
    });
  });

  describe('find - 分页查询', () => {
    it('应该使用 JS 计算添加新实体到分页结果', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'find',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            },
            limit: 3,
            orderBy: [{ field: 'priority', sort: 'desc' }]
          },
          runner: () =>
            of([
              { id: '1', title: 'Task 1', status: 'active', priority: 5 },
              { id: '2', title: 'Task 2', status: 'active', priority: 3 }
            ])
        });

        const results = [
          // 初始结果（2条）
          [
            { id: '1', title: 'Task 1', status: 'active', priority: 5 },
            { id: '2', title: 'Task 2', status: 'active', priority: 3 }
          ],
          // 添加新实体后（3条，按 priority 降序）
          [
            { id: '3', title: 'Task 3', status: 'active', priority: 10 },
            { id: '1', title: 'Task 1', status: 'active', priority: 5 },
            { id: '2', title: 'Task 2', status: 'active', priority: 3 }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        // 创建一个高优先级的实体
        const entity = createMockEntityEvent({ id: '3', title: 'Task 3', status: 'active', priority: 10 });
        query_merge_create_cache(task, [entity]);
      });
    });

    it('应该在添加新实体后正确截取 limit 数量', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'find',
          options: {
            where: { combinator: 'and', rules: [] },
            limit: 2,
            orderBy: [{ field: 'id', sort: 'asc' }]
          },
          runner: () =>
            of([
              { id: '2', title: 'Task 2' },
              { id: '3', title: 'Task 3' }
            ])
        });

        const results = [
          [
            { id: '2', title: 'Task 2' },
            { id: '3', title: 'Task 3' }
          ],
          // 添加 id=1 后，应该保留前2条：id=1 和 id=2
          [
            { id: '1', title: 'Task 1' },
            { id: '2', title: 'Task 2' }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entity = createMockEntityEvent({ id: '1', title: 'Task 1' });
        query_merge_create_cache(task, [entity]);
      });
    });

    it('不应该添加不影响当前页的低优先级实体', async () => {
      const task = createMockQueryTask({
        type: 'find',
        options: {
          where: { combinator: 'and', rules: [] },
          limit: 2,
          orderBy: [{ field: 'priority', sort: 'desc' }]
        },
        runner: () =>
          of([
            { id: '1', title: 'Task 1', priority: 10 },
            { id: '2', title: 'Task 2', priority: 9 }
          ])
      });

      const expectedResult = [
        { id: '1', title: 'Task 1', priority: 10 },
        { id: '2', title: 'Task 2', priority: 9 }
      ];
      const emissions: unknown[] = [];
      const nextSpy = vi.spyOn(task, 'next');
      const refreshSpy = vi.spyOn(task, 'refresh');

      const subscription = task.result$.subscribe({
        next: d => emissions.push(d)
      });

      try {
        const entity = createMockEntityEvent({ id: '3', title: 'Task 3', priority: 1 });
        query_merge_create_cache(task, [entity]);

        await new Promise<void>(resolve => setTimeout(resolve, 0));

        expect(emissions).toEqual([expectedResult]);
        expect(nextSpy).not.toHaveBeenCalled();
        expect(refreshSpy).not.toHaveBeenCalled();
      } finally {
        subscription.unsubscribe();
      }
    });

    it('应该添加排序垫底但结果集未满容量的低优先级实体', async () => {
      // 与上一条"不应该添加不影响当前页的低优先级实体"对照：
      // 那条 limit=2、结果集已满 2 条（在容量边界上，新实体排序垫底确实不影响当前页）；
      // 这条 limit=3、结果集只有 2 条（未到容量上限），新实体即便排序垫底，
      // 也应该被追加进结果——它不影响"已有行的顺序"，但影响"结果集的内容"（多一条）。
      const task = createMockQueryTask({
        type: 'find',
        options: {
          where: { combinator: 'and', rules: [] },
          limit: 3,
          orderBy: [{ field: 'priority', sort: 'desc' }]
        },
        runner: () =>
          of([
            { id: '1', title: 'Task 1', priority: 10 },
            { id: '2', title: 'Task 2', priority: 9 }
          ])
      });

      const expectedResults = [
        [
          { id: '1', title: 'Task 1', priority: 10 },
          { id: '2', title: 'Task 2', priority: 9 }
        ],
        [
          { id: '1', title: 'Task 1', priority: 10 },
          { id: '2', title: 'Task 2', priority: 9 },
          { id: '3', title: 'Task 3', priority: 1 }
        ]
      ];
      const emissions: unknown[] = [];

      const subscription = task.result$.subscribe({
        next: d => emissions.push(d)
      });

      try {
        const entity = createMockEntityEvent({ id: '3', title: 'Task 3', priority: 1 });
        query_merge_create_cache(task, [entity]);

        await new Promise<void>(resolve => setTimeout(resolve, 0));

        expect(emissions).toEqual(expectedResults);
      } finally {
        subscription.unsubscribe();
      }
    });

    it('应该处理批量添加的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'find',
          options: {
            where: { combinator: 'and', rules: [] },
            limit: 3,
            orderBy: [{ field: 'priority', sort: 'desc' }]
          },
          runner: () => of([{ id: '1', title: 'Task 1', priority: 5 }])
        });

        const results = [
          [{ id: '1', title: 'Task 1', priority: 5 }],
          // 批量添加后，按优先级取前3条
          [
            { id: '2', title: 'Task 2', priority: 10 },
            { id: '3', title: 'Task 3', priority: 8 },
            { id: '1', title: 'Task 1', priority: 5 }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entities = [
          createMockEntityEvent({ id: '2', title: 'Task 2', priority: 10 }),
          createMockEntityEvent({ id: '3', title: 'Task 3', priority: 8 }),
          createMockEntityEvent({ id: '4', title: 'Task 4', priority: 3 }) // 不会进入前3
        ];
        query_merge_create_cache(task, entities);
      });
    });

    it('应该过滤不匹配 where 条件的实体', () => {
      const task = createMockQueryTask({
        type: 'find',
        options: {
          where: {
            combinator: 'and',
            rules: [{ field: 'status', operator: '=', value: 'active' }]
          },
          limit: 3
        },
        runner: () => of([{ id: '1', title: 'Task 1', status: 'active' }])
      });

      const expectedResult = [{ id: '1', title: 'Task 1', status: 'active' }];

      const emissions = collectEmissions(task);

      // 创建一个不匹配条件的实体
      const entity = createMockEntityEvent({ id: '2', title: 'Task 2', status: 'completed' });
      query_merge_create_cache(task, [entity]);

      expect(emissions).toEqual([expectedResult]);
    });

    it('分页查询（offset>0）创建新实体时应触发 SQL 刷新而非本地污染当前页缓存', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'find',
          options: {
            where: { combinator: 'and', rules: [] },
            limit: 2,
            offset: 2,
            orderBy: [{ field: 'priority', sort: 'desc' }]
          },
          // 当前为第二页：priority 10、9 在第一页（offset 截掉），这里返回第二页的 8、7
          runner: () =>
            of([
              { id: '3', title: 'Task 3', priority: 8 },
              { id: '4', title: 'Task 4', priority: 7 }
            ])
        });

        const expectedResult = [
          { id: '3', title: 'Task 3', priority: 8 },
          { id: '4', title: 'Task 4', priority: 7 }
        ];
        let emitCount = 0;

        const refreshSpy = vi.spyOn(task, 'refresh');
        const nextSpy = vi.spyOn(task, 'next');

        task.result$.subscribe({
          next: d => {
            try {
              emitCount++;
              if (emitCount === 1) {
                // 初始页内容
                expect(d).toEqual(expectedResult);

                // 创建一条高优先级实体（priority=100），它属于第一页，绝不应被插入当前第二页缓存
                const entity = createMockEntityEvent({ id: '0', title: 'Task 0', priority: 100 });
                query_merge_create_cache(task, [entity]);

                setTimeout(() => {
                  try {
                    // 必须触发 SQL 刷新（refresh）
                    expect(refreshSpy).toHaveBeenCalled();
                    // 绝不应通过 JS 增量把新记录插入当前页缓存
                    const polluted = nextSpy.mock.calls.some(
                      ([result]) => Array.isArray(result) && result.some(entity => entity.id === '0')
                    );
                    expect(polluted).toBe(false);
                    done();
                  } catch (error) {
                    reject(error);
                  }
                }, 50);
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });
      });
    });

    it('无分页查询（offset 未设置或为 0）创建新实体时仍走本地 JS 增量插入', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'find',
          options: {
            where: { combinator: 'and', rules: [] },
            limit: 3,
            offset: 0,
            orderBy: [{ field: 'priority', sort: 'desc' }]
          },
          runner: () =>
            of([
              { id: '1', title: 'Task 1', priority: 5 },
              { id: '2', title: 'Task 2', priority: 3 }
            ])
        });

        const refreshSpy = vi.spyOn(task, 'refresh');

        const results = [
          [
            { id: '1', title: 'Task 1', priority: 5 },
            { id: '2', title: 'Task 2', priority: 3 }
          ],
          [
            { id: '3', title: 'Task 3', priority: 10 },
            { id: '1', title: 'Task 1', priority: 5 },
            { id: '2', title: 'Task 2', priority: 3 }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                // 无分页查询不应该触发 SQL 刷新，走本地增量
                expect(refreshSpy).not.toHaveBeenCalled();
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entity = createMockEntityEvent({ id: '3', title: 'Task 3', priority: 10 });
        query_merge_create_cache(task, [entity]);
      });
    });

    // RXD-020：branch-merge 的 execute_switch_actions 对同一条 INSERT 会产生两次独立派发——
    // 一次是 dispatch_switch_events 同步派发，一次是触发器写入 rxdb_change 后经
    // update_hook 异步级联的 handle_rxdb_change 派发。两次派发描述的是同一个 id 的
    // 等价负载，但对象引用不同（不同事件对象、不同 patch 引用）。
    it('同一 id 的两次独立 CREATE 派发不应该在结果中出现重复条目', () => {
      const task = createMockQueryTask({
        type: 'find',
        options: {
          where: { combinator: 'and', rules: [] },
          limit: 10,
          orderBy: [{ field: 'id', sort: 'asc' }]
        },
        runner: () => of([{ id: '1', title: 'Task 1' }])
      });

      task.result$.subscribe();

      // 第一次派发：execute_switch_actions 的同步 dispatch_switch_events
      query_merge_create_cache(task, [createMockEntityEvent({ id: '2', title: 'Task 2' })]);
      // 第二次派发：触发器级联经 handle_rxdb_change 异步到达，同一 id、等价负载，
      // 但事件对象和 patch 都是不同的引用（模拟测试 fixture 的 serialize 不做身份缓存）
      query_merge_create_cache(task, [createMockEntityEvent({ id: '2', title: 'Task 2' })]);

      expect(task.result).toEqual([
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Task 2' }
      ]);
    });

    it('批内同一 id 出现两次也不应该在结果中出现重复条目', () => {
      const task = createMockQueryTask({
        type: 'find',
        options: {
          where: { combinator: 'and', rules: [] },
          limit: 10,
          orderBy: [{ field: 'id', sort: 'asc' }]
        },
        runner: () => of([])
      });

      task.result$.subscribe();

      query_merge_create_cache(task, [
        createMockEntityEvent({ id: '1', title: 'Task 1' }),
        createMockEntityEvent({ id: '1', title: 'Task 1' })
      ]);

      expect(task.result).toEqual([{ id: '1', title: 'Task 1' }]);
    });
  });

  describe('findByCursor - 游标分页查询', () => {
    it('应该在没有游标时使用 JS 计算添加新实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findByCursor',
          options: {
            where: { combinator: 'and', rules: [] },
            orderBy: [{ field: 'id', sort: 'asc' }],
            limit: 3
          },
          runner: () =>
            of([
              { id: '1', title: 'Task 1' },
              { id: '2', title: 'Task 2' }
            ])
        });

        const results = [
          [
            { id: '1', title: 'Task 1' },
            { id: '2', title: 'Task 2' }
          ],
          [
            { id: '1', title: 'Task 1' },
            { id: '1.5', title: 'Task 1.5' },
            { id: '2', title: 'Task 2' }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entity = createMockEntityEvent({ id: '1.5', title: 'Task 1.5' });
        query_merge_create_cache(task, [entity]);
      });
    });

    it('SQL 已返回实体时不应该被延迟的 CREATE 事件重复添加', () => {
      const existing = { id: '1', title: 'Task 1' };
      const task = createMockQueryTask({
        type: 'findByCursor',
        options: {
          where: { combinator: 'and', rules: [] },
          orderBy: [{ field: 'id', sort: 'asc' }],
          limit: 3
        },
        runner: () => of([existing])
      });

      task.result$.subscribe();
      query_merge_create_cache(task, [createMockEntityEvent({ id: '1', title: 'Task 1' })]);

      expect(task.result).toEqual([existing]);
    });

    it('应该在使用 after 游标时正确添加新实体', () => {
      return new Promise<void>((done, reject) => {
        const after_cursor = { id: '10', title: 'Task 10' };

        const task = createMockQueryTask({
          type: 'findByCursor',
          options: {
            where: { combinator: 'and', rules: [] },
            orderBy: [{ field: 'id', sort: 'asc' }],
            after: after_cursor,
            limit: 3
          },
          runner: () =>
            of([
              { id: '11', title: 'Task 11' },
              { id: '12', title: 'Task 12' },
              { id: '13', title: 'Task 13' }
            ])
        });

        const results = [
          [
            { id: '11', title: 'Task 11' },
            { id: '12', title: 'Task 12' },
            { id: '13', title: 'Task 13' }
          ],
          [
            { id: '11', title: 'Task 11' },
            { id: '11.5', title: 'Task 11.5' },
            { id: '12', title: 'Task 12' },
            { id: '13', title: 'Task 13' }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        // 添加到 resultEntitySet 中以模拟 after 游标
        task.resultEntitySet.add(after_cursor);

        const entity = createMockEntityEvent({ id: '11.5', title: 'Task 11.5' });
        query_merge_create_cache(task, [entity]);
      });
    });

    it('应该在使用 before 游标时正确添加新实体', () => {
      return new Promise<void>((done, reject) => {
        const before_cursor = { id: '20', title: 'Task 20' };

        const task = createMockQueryTask({
          type: 'findByCursor',
          options: {
            where: { combinator: 'and', rules: [] },
            orderBy: [{ field: 'id', sort: 'asc' }],
            before: before_cursor,
            limit: 3
          },
          runner: () =>
            of([
              { id: '17', title: 'Task 17' },
              { id: '18', title: 'Task 18' },
              { id: '19', title: 'Task 19' }
            ])
        });

        const results = [
          [
            { id: '17', title: 'Task 17' },
            { id: '18', title: 'Task 18' },
            { id: '19', title: 'Task 19' }
          ],
          [
            { id: '17', title: 'Task 17' },
            { id: '17.5', title: 'Task 17.5' },
            { id: '18', title: 'Task 18' },
            { id: '19', title: 'Task 19' }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        // 添加到 resultEntitySet 中以模拟 before 游标
        task.resultEntitySet.add(before_cursor);

        const entity = createMockEntityEvent({ id: '17.5', title: 'Task 17.5' });
        query_merge_create_cache(task, [entity]);
      });
    });

    it('应该在增量场景下结果集大小超过 limit', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findByCursor',
          options: {
            where: { combinator: 'and', rules: [] },
            orderBy: [{ field: 'id', sort: 'asc' }],
            limit: 3
          },
          runner: () =>
            of([
              { id: '1', title: 'Task 1' },
              { id: '2', title: 'Task 2' },
              { id: '3', title: 'Task 3' }
            ])
        });

        const results = [
          [
            { id: '1', title: 'Task 1' },
            { id: '2', title: 'Task 2' },
            { id: '3', title: 'Task 3' }
          ],
          // 增量场景下:新实体插入后,结果集从 3 条变成 4 条(超过 limit)
          [
            { id: '1', title: 'Task 1' },
            { id: '1.5', title: 'Task 1.5' },
            { id: '2', title: 'Task 2' },
            { id: '3', title: 'Task 3' }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entity = createMockEntityEvent({ id: '1.5', title: 'Task 1.5' });
        query_merge_create_cache(task, [entity]);
      });
    });

    it('不应该添加不符合 where 条件的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findByCursor',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            },
            orderBy: [{ field: 'id', sort: 'asc' }],
            limit: 3
          },
          runner: () =>
            of([
              { id: '1', title: 'Task 1', status: 'active' },
              { id: '2', title: 'Task 2', status: 'active' }
            ])
        });

        const expectedResult = [
          { id: '1', title: 'Task 1', status: 'active' },
          { id: '2', title: 'Task 2', status: 'active' }
        ];
        let emitCount = 0;

        task.result$.subscribe({
          next: d => {
            try {
              emitCount++;
              expect(d).toEqual(expectedResult);

              if (emitCount === 1) {
                // 创建不符合条件的实体后应该不会触发更新
                const entity = createMockEntityEvent({ id: '1.5', title: 'Task 1.5', status: 'inactive' });
                query_merge_create_cache(task, [entity]);

                setTimeout(() => {
                  try {
                    expect(emitCount).toBe(1); // 只有初始值，没有更新
                    done();
                  } catch (error) {
                    reject(error);
                  }
                }, 100);
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });
      });
    });
  });

  describe('findOne - 单条查询', () => {
    it('应该在无结果时使用 JS 计算返回第一个匹配的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findOne',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            }
          },
          runner: () => of(null)
        });

        const results = [
          null, // 初始无结果
          { id: '1', title: 'Task 1', status: 'active' } // 创建后返回第一个匹配的
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entity = createMockEntityEvent({ id: '1', title: 'Task 1', status: 'active' });
        query_merge_create_cache(task, [entity]);
      });
    });

    it('应该在有结果且无排序时不更新（保持第一个结果）', () => {
      const task = createMockQueryTask({
        type: 'findOne',
        options: {
          where: {
            combinator: 'and',
            rules: [{ field: 'status', operator: '=', value: 'active' }]
          }
          // 没有 orderBy
        },
        runner: () => of({ id: '1', title: 'Task 1', status: 'active' })
      });

      const expectedResult = { id: '1', title: 'Task 1', status: 'active' };

      const emissions = collectEmissions(task);

      // 创建新实体，但因为已有结果且无排序，不应该更新
      const entity = createMockEntityEvent({ id: '2', title: 'Task 2', status: 'active' });
      query_merge_create_cache(task, [entity]);

      expect(emissions).toEqual([expectedResult]);
      // 应该只有初始结果，不应该有第二次更新
    });

    it('应该在有排序时用更优的实体替换当前结果', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findOne',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'date', operator: '=', value: '2025-10-20' }]
            },
            orderBy: [{ field: 'createdAt', sort: 'asc' }]
          },
          runner: () => of({ id: '1', title: 'Task 1', date: '2025-10-20', createdAt: '08:00' })
        });

        const results = [
          { id: '1', title: 'Task 1', date: '2025-10-20', createdAt: '08:00' }, // 初始结果
          { id: '2', title: 'Task 2', date: '2025-10-20', createdAt: '07:00' } // 更早的实体应该替换
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        // 创建一个更早的实体（07:00 < 08:00）
        const entity = createMockEntityEvent({
          id: '2',
          title: 'Task 2',
          date: '2025-10-20',
          createdAt: '07:00'
        });
        query_merge_create_cache(task, [entity]);
      });
    });

    it('应该在有排序时不替换更优的当前结果', () => {
      const task = createMockQueryTask({
        type: 'findOne',
        options: {
          where: {
            combinator: 'and',
            rules: [{ field: 'date', operator: '=', value: '2025-10-20' }]
          },
          orderBy: [{ field: 'createdAt', sort: 'asc' }]
        },
        runner: () => of({ id: '1', title: 'Task 1', date: '2025-10-20', createdAt: '07:00' })
      });

      const expectedResult = { id: '1', title: 'Task 1', date: '2025-10-20', createdAt: '07:00' };

      const emissions = collectEmissions(task);

      // 创建一个更晚的实体（09:00 > 07:00），不应该替换
      const entity = createMockEntityEvent({
        id: '2',
        title: 'Task 2',
        date: '2025-10-20',
        createdAt: '09:00'
      });
      query_merge_create_cache(task, [entity]);

      expect(emissions).toEqual([expectedResult]);
      // 应该只有初始结果，不应该更新
    });

    it('应该在批量创建时返回排序后的第一个', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findOne',
          options: {
            where: { combinator: 'and', rules: [] },
            orderBy: [{ field: 'priority', sort: 'desc' }]
          },
          runner: () => of(null)
        });

        const results = [
          null,
          { id: '2', title: 'Task 2', priority: 10 } // 优先级最高的
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entities = [
          createMockEntityEvent({ id: '1', title: 'Task 1', priority: 5 }),
          createMockEntityEvent({ id: '2', title: 'Task 2', priority: 10 }),
          createMockEntityEvent({ id: '3', title: 'Task 3', priority: 3 })
        ];
        query_merge_create_cache(task, entities);
      });
    });

    it('不应该添加不匹配 where 条件的实体', () => {
      const task = createMockQueryTask({
        type: 'findOne',
        options: {
          where: {
            combinator: 'and',
            rules: [{ field: 'status', operator: '=', value: 'active' }]
          }
        },
        runner: () => of(null)
      });

      const emissions = collectEmissions(task);

      const entity = createMockEntityEvent({ id: '1', title: 'Task 1', status: 'completed' });
      query_merge_create_cache(task, [entity]);

      expect(emissions).toEqual([null]);
    });
  });

  describe('count - 计数查询', () => {
    it('应该使用 JS 计算增加计数', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'count',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'completed', operator: '=', value: false }]
            }
          },
          runner: () => of(5)
        });

        const results = [5, 6]; // 5 + 1 = 6
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entity = createMockEntityEvent({ id: '10', title: 'Task 10', completed: false });
        query_merge_create_cache(task, [entity]);
      });
    });

    it('应该批量增加计数', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'count',
          options: {
            where: { combinator: 'and', rules: [] }
          },
          runner: () => of(10)
        });

        const results = [10, 13]; // 10 + 3 = 13
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entities = [
          createMockEntityEvent({ id: '1', title: 'Task 1' }),
          createMockEntityEvent({ id: '2', title: 'Task 2' }),
          createMockEntityEvent({ id: '3', title: 'Task 3' })
        ];
        query_merge_create_cache(task, entities);
      });
    });

    it('不应该计数不匹配 where 条件的实体', () => {
      const task = createMockQueryTask({
        type: 'count',
        options: {
          where: {
            combinator: 'and',
            rules: [{ field: 'status', operator: '=', value: 'active' }]
          }
        },
        runner: () => of(8)
      });

      const emissions = collectEmissions(task);

      const entity = createMockEntityEvent({ id: '1', title: 'Task 1', status: 'completed' });
      query_merge_create_cache(task, [entity]);

      expect(emissions).toEqual([8]);
    });

    it('应该处理从 0 开始计数', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'count',
          options: {
            where: { combinator: 'and', rules: [] }
          },
          runner: () => of(0)
        });

        const results = [0, 1]; // 0 + 1 = 1
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entity = createMockEntityEvent({ id: '1', title: 'First Task' });
        query_merge_create_cache(task, [entity]);
      });
    });

    // RXD-020：同上（见 find 分支的说明）——branch-merge 对同一条 INSERT 的两次独立派发
    // 若不去重，count 会被 +1 两次。
    it('同一 id 的两次独立 CREATE 派发不应该重复计数', () => {
      const task = createMockQueryTask({
        type: 'count',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () => of(5)
      });

      task.result$.subscribe();

      query_merge_create_cache(task, [createMockEntityEvent({ id: '10', title: 'Task 10' })]);
      expect(task.result).toBe(6);

      // 同一 id 的第二次独立派发（等价负载、不同对象引用）不应该让 count 变成 7
      query_merge_create_cache(task, [createMockEntityEvent({ id: '10', title: 'Task 10' })]);
      expect(task.result).toBe(6);
    });

    it('批内同一 id 出现两次也不应该重复计数', () => {
      const task = createMockQueryTask({
        type: 'count',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () => of(0)
      });

      task.result$.subscribe();

      query_merge_create_cache(task, [
        createMockEntityEvent({ id: '1', title: 'Task 1' }),
        createMockEntityEvent({ id: '1', title: 'Task 1' })
      ]);

      expect(task.result).toBe(1);
    });

    it('不同 id 的多次派发仍应该分别计数（去重不应该误伤正常批量）', () => {
      const task = createMockQueryTask({
        type: 'count',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () => of(0)
      });

      task.result$.subscribe();

      query_merge_create_cache(task, [createMockEntityEvent({ id: '1', title: 'Task 1' })]);
      query_merge_create_cache(task, [createMockEntityEvent({ id: '2', title: 'Task 2' })]);
      query_merge_create_cache(task, [createMockEntityEvent({ id: '3', title: 'Task 3' })]);

      expect(task.result).toBe(3);
    });
  });

  // P0-004：CREATE 事件是异步批量投递的，投递期间实体可能已被再次修改。
  // 此时事件负载描述的是过期版本，JS 增量的前提「事件负载 = 实体当前状态」不成立——
  // 结果集里是旧成员关系，serialize 拿到的是新实例，拼出来的是从未存在过的中间态。
  describe('迟到的 CREATE 事件（实体缓存已更新）', () => {
    const STALE = new Date('2026-07-28T10:00:01.000Z');
    const NEWER = new Date('2026-07-28T10:00:02.000Z');

    it('负载旧于实体缓存时应交回 SQL 重算，而不是本地 JS 增量', () => {
      const task = createMockQueryTask({
        type: 'findAll',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () => of([]),
        cachedById: { 'stale-1': { id: 'stale-1', updatedAt: NEWER } }
      });
      const refresh = vi.spyOn(task, 'refresh').mockImplementation(emptyFunction);
      const next = vi.spyOn(task, 'next');

      // 必须先订阅：没有首个权威结果的任务一律交回 SQL 重算，那条更靠前的守卫会把这里要验的
      // 陈旧判定整个盖掉，测试就变成了空转。
      task.result$.subscribe();

      query_merge_create_cache(task, [createMockEntityEvent({ id: 'stale-1', updatedAt: STALE })]);

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    });

    it('负载与实体缓存同版本时仍走本地 JS 增量', () => {
      const task = createMockQueryTask({
        type: 'findAll',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () => of([]),
        cachedById: { 'fresh-1': { id: 'fresh-1', updatedAt: NEWER } }
      });
      const refresh = vi.spyOn(task, 'refresh').mockImplementation(emptyFunction);
      const next = vi.spyOn(task, 'next');

      task.result$.subscribe();

      query_merge_create_cache(task, [createMockEntityEvent({ id: 'fresh-1', updatedAt: NEWER })]);

      expect(refresh).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('实体缓存未命中时不判定陈旧（事件是唯一信息源）', () => {
      const task = createMockQueryTask({
        type: 'findAll',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () => of([])
      });
      const refresh = vi.spyOn(task, 'refresh').mockImplementation(emptyFunction);
      const next = vi.spyOn(task, 'next');

      task.result$.subscribe();

      query_merge_create_cache(task, [createMockEntityEvent({ id: 'uncached-1', updatedAt: STALE })]);

      expect(refresh).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  // 变更事件按批次投递，一条 CREATE 事件可能在实体被级联删除、或分支切走之后才送达。
  // 任务还没拿到首个权威结果时，增量合并没有可增量的基线，直接把事件负载当成第一个结果
  // 就是凭空捏造一次查询答案——活查询会因此多出一行当下并不存在的数据。
  describe('权威基线落地前的 CREATE 事件', () => {
    it('不得成为首个结果，而应交回 SQL 重算', async () => {
      let runs = 0;
      const task = createMockQueryTask({
        type: 'findAll',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () => {
          runs++;
          // 权威读要说「一行都没有」，但要等一个宏任务——事件正是在这段窗口里到达的
          return timer(0).pipe(map(() => [] as TestEntityData[]));
        }
      });

      const first = firstValueFrom(task.result$);
      query_merge_create_cache(task, [createMockEntityEvent({ id: 'ghost-1', title: 'ghost' })]);

      await expect(first).resolves.toEqual([]);
      // 重跑而不是静默丢弃：事件也可能新于 runner 的快照，丢掉会让这次写入永远缺席
      expect(runs).toBe(2);
    });
  });

  describe('边界情况', () => {
    it('应该处理空的实体数组', () => {
      const task = createMockQueryTask({
        type: 'findAll',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () => of([{ id: '1', title: 'Task 1' }])
      });

      const emissions = collectEmissions(task);

      query_merge_create_cache(task, []);

      expect(emissions).toHaveLength(1);
    });

    it('应该处理没有 orderBy 的查询', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: { combinator: 'and', rules: [] }
            // 没有 orderBy
          },
          runner: () => of([{ id: '1', title: 'Task 1' }])
        });

        const results = [
          [{ id: '1', title: 'Task 1' }],
          [
            { id: '1', title: 'Task 1' },
            { id: '2', title: 'Task 2' }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entity = createMockEntityEvent({ id: '2', title: 'Task 2' });
        query_merge_create_cache(task, [entity]);
      });
    });

    it('应该处理空的 where 条件（匹配所有）', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: { combinator: 'and', rules: [] }
          },
          runner: () => of([])
        });

        const results = [[], [{ id: '1', title: 'Any Task' }]];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        const entity = createMockEntityEvent({ id: '1', title: 'Any Task' });
        query_merge_create_cache(task, [entity]);
      });
    });
  });

  describe('关系实体变更处理', () => {
    /** 关系元数据的 schema 替身：User 1:1 IdCard，供依赖抽取解析 `idCard.code` 这类跨实体字段。 */
    const mockRelationSchemaManager = (): HarnessSchemaOverrides => ({
      getFieldRelations: vi.fn(() => ({ relations: [], isForeignKey: false, property: {}, propertyName: '' })),
      getEntityType: vi.fn(),
      getEntityMetadata: vi.fn((name: string, namespace: string) => {
        if (name === 'IdCard' && namespace === 'test') {
          return {
            name: 'IdCard',
            namespace: 'test',
            relations: [
              {
                kind: 'm:1', // MANY_TO_ONE
                name: 'owner',
                mappedEntity: 'User',
                mappedNamespace: 'test',
                mappedProperty: 'idCard'
              }
            ]
          };
        }
        if (name === 'User' && namespace === 'test') {
          return {
            name: 'User',
            namespace: 'test',
            relations: [
              {
                kind: '1:1', // ONE_TO_ONE
                name: 'idCard',
                mappedEntity: 'IdCard',
                mappedNamespace: 'test',
                mappedProperty: 'owner'
              }
            ]
          };
        }
        return { name, namespace, relations: [] };
      }),
      findMappedRelation: vi.fn((_metadata: unknown, relation: { name: string }) => {
        // 模拟 User.idCard -> IdCard.owner 的映射
        if (relation.name === 'idCard') {
          return {
            metadata: { name: 'IdCard', namespace: 'test' },
            relation: {
              kind: 'm:1',
              name: 'owner',
              mappedEntity: 'User',
              mappedNamespace: 'test',
              mappedProperty: 'idCard'
            }
          };
        }
        return undefined;
      })
    });

    /**
     * 创建带元数据的实体类(用于关系测试)
     */
    const createUserEntityClass = () => {
      class User {}
      // 添加元数据
      Object.assign(User, {
        [METADATA]: {
          name: 'User',
          namespace: 'test',
          relations: [
            {
              kind: '1:1',
              name: 'idCard',
              mappedEntity: 'IdCard',
              mappedNamespace: 'test',
              mappedProperty: 'owner'
            }
          ]
        }
      });
      return User;
    };

    it('当关系实体变更且与结果集相关时应该刷新查询', () => {
      const UserEntity = createUserEntityClass();
      let refreshCount = 0;

      const task = createHarnessQueryTask<typeof UserEntity, number>(UserEntity, {
        type: 'count',
        options: {
          where: {
            combinator: 'and',
            rules: [{ field: 'idCard.code', operator: '=', value: '111' }]
          }
        },
        runner: () => of(1),
        schemaManager: mockRelationSchemaManager()
      } as unknown as HarnessTaskOptions<typeof UserEntity, number>);

      // 设置初始结果集 ID
      task.resultEntityIds.add('user1');

      // 监听 refresh 调用
      const originalRefresh = task.refresh;
      task.refresh = () => {
        refreshCount++;
        originalRefresh.call(task);
      };

      const emissions = collectEmissions(task);

      // 创建关系实体事件 (IdCard)，ownerId 指向结果集中的 user1
      const idCardEntity: RxDBEntityLocalCreatedEventData<typeof UserEntity> = {
        type: 'INSERT',
        namespace: 'test',
        entity: 'IdCard',
        id: 'idcard1',
        entityType: UserEntity,
        recordAt: new Date(0),
        patch: { id: 'idcard1', code: '111', ownerId: 'user1' } as InstanceType<typeof UserEntity>,
        inversePatch: null
      };

      query_merge_create_cache(task, [idCardEntity]);

      // 应该调用了 refresh，因为关系实体与结果集相关
      expect(refreshCount).toBeGreaterThan(0);
    });

    it('当只有当前实体变更且无关系实体时应该使用 JS 增量计算', () => {
      return new Promise<void>((done, reject) => {
        let refreshCount = 0;

        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'name', operator: '=', value: 'John' }]
            }
          },
          runner: () => of([]),
          schemaManager: mockRelationSchemaManager()
        });

        const originalRefresh = task.refresh;
        task.refresh = () => {
          refreshCount++;
          originalRefresh.call(task);
        };

        const results = [[], [{ id: 'user1', name: 'John' }]];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 2) {
                // 应该使用 JS 增量计算，而不是刷新
                expect(refreshCount).toBe(0);
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        // 只创建当前实体的变更
        const userEntity: CreatedEvent = {
          type: 'INSERT',
          namespace: 'test',
          entity: 'User',
          id: 'user1',
          entityType: TestEntity,
          recordAt: new Date(0),
          patch: { id: 'user1', name: 'John' },
          inversePatch: null
        };

        query_merge_create_cache(task, [userEntity]);
      });
    });
  });

  // ✨ EXISTS 查询的增量更新测试
  describe('EXISTS operator integration', () => {
    it('should refresh when related entity is created (EXISTS dependency)', () => {
      let refreshCount = 0;

      // 模拟带关系的元数据。
      interface MenuRelation {
        active: boolean;
      }
      class Menu {
        static [ENTITY_STATIC_TYPES] = { idType: '' as string };
        children: MenuRelation[] = [];
      }
      class MenuChild extends Menu implements MenuRelation {
        id = '';
        parentId: string | null = null;
        active = false;
      }
      const menuMetadata = {
        name: 'Menu',
        namespace: 'test',
        target: Menu,
        properties: [],
        primary: { name: 'id', type: 'string' },
        relations: [
          {
            name: 'children',
            propertyName: 'children',
            kind: 'ONE_TO_MANY',
            mappedEntity: 'Menu',
            mappedNamespace: 'test',
            mappedProperty: 'parent'
          }
        ],
        relationMap: new Map(),
        propertyMap: new Map(),
        indexes: []
      };
      Object.assign(Menu, { [METADATA]: menuMetadata });

      const task = createHarnessQueryTask<typeof Menu, Menu[]>(Menu, {
        type: 'findAll',
        options: {
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children',
                operator: 'exists',
                where: {
                  combinator: 'and',
                  rules: [{ field: 'active', operator: '=', value: true }]
                }
              }
            ]
          }
        },
        runner: () => of([]),
        schemaManager: {
          getEntityMetadata: (entity: string, namespace: string) =>
            entity === 'Menu' && namespace === 'test' ? menuMetadata : undefined
        }
      });

      const originalRefresh = task.refresh;
      task.refresh = () => {
        refreshCount++;
        originalRefresh.call(task);
      };

      const emissions = collectEmissions(task);

      // 创建一个子菜单（关系实体）
      const childMenu = Object.assign(new MenuChild(), {
        id: 'menu-child-1',
        parentId: 'menu-parent-1',
        active: true
      });
      const childMenuEntity: RxDBEntityLocalCreatedEventData<typeof Menu> = {
        type: 'INSERT',
        namespace: 'test',
        entity: 'Menu',
        id: childMenu.id,
        entityType: Menu,
        recordAt: new Date(0),
        patch: childMenu,
        inversePatch: null
      };

      query_merge_create_cache(task, [childMenuEntity]);

      expect(refreshCount).toBeGreaterThan(0);
    });
  });

  describe('图查询 - findNeighbors/countNeighbors/findPaths（RXD-025）', () => {
    /**
     * merge_create 的 switch 目前没有这三种图查询类型的 case，refresh_rules/recalculate_rules
     * 保持空数组——runMatches 对空规则数组恒返回 false，命中 where 的 CREATE 事件永远不会
     * 触发 task.refresh()，活查询永久 stale。
     */
    const createGraphTask = <RT>(
      type: 'findNeighbors' | 'countNeighbors' | 'findPaths',
      runnerResult: RT
    ): QueryTask<TestEntityType, RT> => {
      const task = createHarnessQueryTask<TestEntityType, RT>(TestEntity, {
        type,
        options: {
          where: { combinator: 'and', rules: [{ field: 'name', operator: '=', value: 'Alice' }] }
        },
        runner: () => of(runnerResult)
      } as unknown as HarnessTaskOptions<TestEntityType, RT>);
      return task;
    };

    it.each(['findNeighbors', 'countNeighbors', 'findPaths'] as const)(
      '%s 命中 where 条件的新实体应该触发 SQL 刷新',
      type => {
        const task = createGraphTask(type, (type === 'countNeighbors' ? 0 : []) as never);
        const subscription = task.result$.subscribe({ error: () => undefined });
        const refreshSpy = vi.spyOn(task, 'refresh');

        query_merge_create_cache(task, [createMockEntityEvent({ id: 'alice-1', name: 'Alice' })]);

        expect(refreshSpy).toHaveBeenCalled();
        subscription.unsubscribe();
      }
    );
  });
});
