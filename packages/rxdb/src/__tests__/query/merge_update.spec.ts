import { emptyFunction } from '@aiao/utils';
import { firstValueFrom, map, Observable, of, timer } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import query_merge_update_cache_impl from '../../query/merge_update.js';
import { getFingerprintPrimitive, type Fingerprint } from '../../repository/fingerprint.utils.js';
import { QueryOptions } from '../../repository/QueryManager.interface.js';
import { QueryTask } from '../../repository/QueryTask.js';
import type { RxDBEntityLocalEventData, RxDBEntityLocalUpdatedEventData } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';

describe('query_merge_update_cache', () => {
  class TestEntity {
    [key: string]: unknown;
    static [ENTITY_STATIC_TYPES] = { idType: '' as string };
    id = '';
  }

  type TestEntityType = typeof TestEntity;
  type TestEntityData = InstanceType<TestEntityType>;
  type UpdateEvent = RxDBEntityLocalUpdatedEventData<TestEntityType>;

  /**
   * 创建模拟的 RxDB 实例
   */
  const createMockRxDB = (): RxDB => {
    return {
      schemaManager: {
        getFieldRelations: vi.fn(() => ({ relations: [], isForeignKey: false, property: {}, propertyName: '' })),
        getEntityType: vi.fn(),
        getEntityMetadata: vi.fn()
      }
    } as unknown as RxDB;
  };

  const getFingerprintByPrimitive = (value: unknown): Fingerprint[] =>
    getFingerprintPrimitive(value as Fingerprint | Fingerprint[]);
  const getFingerprintByMockEntity = (entity: unknown): Fingerprint[] => [JSON.stringify({ ...(entity as object) })];
  const getFingerprintByMockEntities = (entities: unknown): Fingerprint[] =>
    Array.isArray(entities) ? entities.map(e => JSON.stringify({ ...(e as object) })) : [];

  /**
   * 创建模拟的查询任务
   */
  const createMockQueryTask = <RT>(
    taskOptions: QueryOptions<TestEntityType> & {
      runner: () => Observable<RT>;
      // 默认原样返回 patch(等价于"整个实体当 patch"的旧约定)。真实的增量 patch 场景
      // (只含被改字段)需要调用方传入模拟实体缓存合并的 serialize,复现生产环境
      // QueryManager#serialize 借助 entityManager 缓存把偏差 patch 补全成完整实体的行为。
      serialize?: (data: RxDBEntityLocalEventData<TestEntityType>) => TestEntityData;
    }
  ): QueryTask<TestEntityType, RT> => {
    const deps = new Map<TestEntityType, number>();
    deps.set(TestEntity, 1);
    const cacheKey = 'cacheKey';
    const mockRxDB = createMockRxDB();
    const { runner, serialize, ...queryOptions } = taskOptions;
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
    const task = new QueryTask<TestEntityType, RT>({
      cacheKey,
      options: queryOptions,
      runner,
      entityType: TestEntity,
      rxdb: mockRxDB,
      depEntityTypeMap: deps,
      serialize: serialize ?? (data => data.patch as TestEntityData),
      onClean: emptyFunction,
      getFingerprint: pickFingerprint()
    });
    task.result$ = new Observable<RT>(observer => {
      task.observerCount++;
      if (task.result !== undefined) {
        observer.next(task.result);
      }
      task.observers.add(observer);
      task.run();
      return (): void => {
        task.observerCount--;
        task.observers.delete(observer);
        if (task.observerCount <= 0) {
          task.clean();
        }
      };
    });
    return task;
  };

  const query_merge_update_cache = <RT>(task: QueryTask<TestEntityType, RT>, events: UpdateEvent[]): void => {
    query_merge_update_cache_impl(task as unknown as QueryTask<TestEntityType>, events);
  };

  /**
   * 创建模拟的更新事件数据
   */
  const createMockUpdateEvent = (entity: TestEntityData, previousEntity?: Partial<TestEntityData>): UpdateEvent => {
    return {
      type: 'UPDATE',
      namespace: 'test',
      entity: 'TestEntity',
      id: entity.id,
      entityType: TestEntity,
      recordAt: new Date(0),
      patch: entity,
      inversePatch: previousEntity ?? entity
    };
  };

  describe('get - 单实体查询', () => {
    it('应该合并匹配 id 的增量 patch', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'get',
          options: 'run-1',
          runner: () => of({ id: 'run-1', title: 'Delay task', status: 'queued' })
        });

        const results = [
          { id: 'run-1', title: 'Delay task', status: 'queued' },
          { id: 'run-1', title: 'Delay task', status: 'completed' }
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

        query_merge_update_cache(task, [
          createMockUpdateEvent(
            { id: 'run-1', status: 'completed' },
            { id: 'run-1', title: 'Delay task', status: 'queued' }
          )
        ]);
      });
    });
  });

  describe('findAll - 全量查询', () => {
    it('应该移除不再匹配 where 条件的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            }
          },
          runner: () =>
            of([
              { id: '1', title: 'Task 1', status: 'active' },
              { id: '2', title: 'Task 2', status: 'active' }
            ])
        });

        const results = [
          [
            { id: '1', title: 'Task 1', status: 'active' },
            { id: '2', title: 'Task 2', status: 'active' }
          ],
          // Task 2 状态变为 completed,应该被移除
          [{ id: '1', title: 'Task 1', status: 'active' }]
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

        // Task 2 从 active 变为 completed
        const updateEvent = createMockUpdateEvent(
          { id: '2', title: 'Task 2', status: 'completed' },
          { id: '2', title: 'Task 2', status: 'active' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该添加新匹配 where 条件的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            }
          },
          runner: () => of([{ id: '1', title: 'Task 1', status: 'active' }])
        });

        const results = [
          [{ id: '1', title: 'Task 1', status: 'active' }],
          // Task 2 状态从 inactive 变为 active,应该被添加
          [
            { id: '1', title: 'Task 1', status: 'active' },
            { id: '2', title: 'Task 2', status: 'active' }
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

        // Task 2 从 inactive 变为 active
        const updateEvent = createMockUpdateEvent(
          { id: '2', title: 'Task 2', status: 'active' },
          { id: '2', title: 'Task 2', status: 'inactive' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该更新仍然匹配的实体的字段值', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            }
          },
          runner: () =>
            of([
              { id: '1', title: 'Task 1', status: 'active', priority: 5 },
              { id: '2', title: 'Task 2', status: 'active', priority: 3 }
            ])
        });

        const results = [
          [
            { id: '1', title: 'Task 1', status: 'active', priority: 5 },
            { id: '2', title: 'Task 2', status: 'active', priority: 3 }
          ],
          // Task 1 优先级从 5 变为 10,仍然匹配,字段值更新
          [
            { id: '1', title: 'Task 1', status: 'active', priority: 10 },
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

        const updateEvent = createMockUpdateEvent(
          { id: '1', title: 'Task 1', status: 'active', priority: 10 },
          { id: '1', title: 'Task 1', status: 'active', priority: 5 }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该在更新后按 orderBy 重新排序', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: { combinator: 'and', rules: [] },
            orderBy: [{ field: 'priority', sort: 'desc' }]
          },
          runner: () =>
            of([
              { id: '1', title: 'Task 1', priority: 10 },
              { id: '2', title: 'Task 2', priority: 5 },
              { id: '3', title: 'Task 3', priority: 3 }
            ])
        });

        const results = [
          [
            { id: '1', title: 'Task 1', priority: 10 },
            { id: '2', title: 'Task 2', priority: 5 },
            { id: '3', title: 'Task 3', priority: 3 }
          ],
          // Task 3 优先级从 3 变为 15,应该排到最前面
          [
            { id: '3', title: 'Task 3', priority: 15 },
            { id: '1', title: 'Task 1', priority: 10 },
            { id: '2', title: 'Task 2', priority: 5 }
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

        const updateEvent = createMockUpdateEvent(
          { id: '3', title: 'Task 3', priority: 15 },
          { id: '3', title: 'Task 3', priority: 3 }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该同时处理新匹配和不再匹配的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'completed', operator: '=', value: false }]
            }
          },
          runner: () =>
            of([
              { id: '1', title: 'Task 1', completed: false },
              { id: '2', title: 'Task 2', completed: false }
            ])
        });

        const results = [
          [
            { id: '1', title: 'Task 1', completed: false },
            { id: '2', title: 'Task 2', completed: false }
          ],
          // Task 1 变为 completed(移除), Task 3 变为 false(添加)
          [
            { id: '2', title: 'Task 2', completed: false },
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

        const updateEvents = [
          createMockUpdateEvent(
            { id: '1', title: 'Task 1', completed: true },
            { id: '1', title: 'Task 1', completed: false }
          ),
          createMockUpdateEvent(
            { id: '3', title: 'Task 3', completed: false },
            { id: '3', title: 'Task 3', completed: true }
          )
        ];
        query_merge_update_cache(task, updateEvents);
      });
    });
  });

  describe('find - 分页查询', () => {
    it('应该在结果集受影响时触发 SQL 刷新', () => {
      return new Promise<void>((done, reject) => {
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
              { id: '2', title: 'Task 2', priority: 5 },
              { id: '3', title: 'Task 3', priority: 3 }
            ])
        });

        const refreshSpy = vi.spyOn(task, 'refresh');

        task.result$.subscribe({
          next: () => {
            // 等待更新事件处理完成
            setTimeout(() => {
              try {
                // 应该触发刷新
                expect(refreshSpy).toHaveBeenCalledTimes(1);
                done();
              } catch (error) {
                reject(error);
              }
            }, 100);
          },
          error: reject
        });

        // Task 2 优先级变化,影响当前结果集
        const updateEvent = createMockUpdateEvent(
          { id: '2', title: 'Task 2', priority: 15 },
          { id: '2', title: 'Task 2', priority: 5 }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该在有新匹配实体时触发 SQL 刷新', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'find',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            },
            limit: 3
          },
          runner: () =>
            of([
              { id: '1', title: 'Task 1', status: 'active' },
              { id: '2', title: 'Task 2', status: 'active' }
            ])
        });

        const refreshSpy = vi.spyOn(task, 'refresh');

        task.result$.subscribe({
          next: () => {
            setTimeout(() => {
              try {
                // 应该触发刷新
                expect(refreshSpy).toHaveBeenCalledTimes(1);
                done();
              } catch (error) {
                reject(error);
              }
            }, 100);
          },
          error: reject
        });

        // Task 3 从 inactive 变为 active
        const updateEvent = createMockUpdateEvent(
          { id: '3', title: 'Task 3', status: 'active' },
          { id: '3', title: 'Task 3', status: 'inactive' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('不应该在不影响结果集时触发刷新', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'find',
          options: {
            where: { combinator: 'and', rules: [] },
            limit: 3
          },
          runner: () =>
            of([
              { id: '1', title: 'Task 1', priority: 10 },
              { id: '2', title: 'Task 2', priority: 5 },
              { id: '3', title: 'Task 3', priority: 3 }
            ])
        });

        const refreshSpy = vi.spyOn(task, 'refresh');

        let emitCount = 0;
        task.result$.subscribe({
          next: () => {
            emitCount++;
            if (emitCount === 1) {
              setTimeout(() => {
                try {
                  // 不应该触发刷新
                  expect(refreshSpy).not.toHaveBeenCalled();
                  done();
                } catch (error) {
                  reject(error);
                }
              }, 100);
            }
          },
          error: reject
        });

        // Task 4 不在结果集中,更新不影响
        const updateEvent = createMockUpdateEvent(
          { id: '4', title: 'Task 4', priority: 8 },
          { id: '4', title: 'Task 4', priority: 1 }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });
  });

  describe('findByCursor - 游标分页查询', () => {
    it('应该在结果集受影响时触发 SQL 刷新', () => {
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

        const refreshSpy = vi.spyOn(task, 'refresh');

        task.result$.subscribe({
          next: () => {
            setTimeout(() => {
              try {
                expect(refreshSpy).toHaveBeenCalledTimes(1);
                done();
              } catch (error) {
                reject(error);
              }
            }, 100);
          },
          error: reject
        });

        // Task 2 被更新,可能影响排序
        const updateEvent = createMockUpdateEvent({ id: '2', title: 'Task 2 Updated' }, { id: '2', title: 'Task 2' });
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该在有新匹配实体时触发 SQL 刷新', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findByCursor',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'visible', operator: '=', value: true }]
            },
            orderBy: [{ field: 'id', sort: 'asc' }],
            limit: 3
          },
          runner: () =>
            of([
              { id: '1', title: 'Task 1', visible: true },
              { id: '2', title: 'Task 2', visible: true }
            ])
        });

        const refreshSpy = vi.spyOn(task, 'refresh');

        task.result$.subscribe({
          next: () => {
            setTimeout(() => {
              try {
                expect(refreshSpy).toHaveBeenCalledTimes(1);
                done();
              } catch (error) {
                reject(error);
              }
            }, 100);
          },
          error: reject
        });

        // Task 3 从 false 变为 true
        const updateEvent = createMockUpdateEvent(
          { id: '3', title: 'Task 3', visible: true },
          { id: '3', title: 'Task 3', visible: false }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });
  });

  describe('findOne - 单条查询', () => {
    it('应该在当前结果不再匹配时触发 SQL 刷新', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findOne',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            }
          },
          runner: () => of({ id: '1', title: 'Task 1', status: 'active' })
        });

        const refreshSpy = vi.spyOn(task, 'refresh');

        task.result$.subscribe({
          next: () => {
            setTimeout(() => {
              try {
                expect(refreshSpy).toHaveBeenCalledTimes(1);
                done();
              } catch (error) {
                reject(error);
              }
            }, 100);
          },
          error: reject
        });

        // Task 1 状态变为 completed,不再匹配
        const updateEvent = createMockUpdateEvent(
          { id: '1', title: 'Task 1', status: 'completed' },
          { id: '1', title: 'Task 1', status: 'active' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该在无排序时 JS 更新当前结果字段值', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findOne',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            }
            // 没有 orderBy
          },
          runner: () => of({ id: '1', title: 'Task 1', status: 'active', priority: 5 })
        });

        const results = [
          { id: '1', title: 'Task 1', status: 'active', priority: 5 },
          { id: '1', title: 'Task 1', status: 'active', priority: 10 } // 字段值更新
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

        // Task 1 优先级从 5 变为 10
        const updateEvent = createMockUpdateEvent(
          { id: '1', title: 'Task 1', status: 'active', priority: 10 },
          { id: '1', title: 'Task 1', status: 'active', priority: 5 }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该在有排序时触发 SQL 刷新', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findOne',
          options: {
            where: { combinator: 'and', rules: [] },
            orderBy: [{ field: 'priority', sort: 'desc' }]
          },
          runner: () => of({ id: '1', title: 'Task 1', priority: 10 })
        });

        const refreshSpy = vi.spyOn(task, 'refresh');

        task.result$.subscribe({
          next: () => {
            setTimeout(() => {
              try {
                expect(refreshSpy).toHaveBeenCalledTimes(1);
                done();
              } catch (error) {
                reject(error);
              }
            }, 100);
          },
          error: reject
        });

        // Task 1 优先级变化,可能不再是第一个
        const updateEvent = createMockUpdateEvent(
          { id: '1', title: 'Task 1', priority: 5 },
          { id: '1', title: 'Task 1', priority: 10 }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该在当前无结果且有新匹配时触发 SQL 刷新', () => {
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

        const refreshSpy = vi.spyOn(task, 'refresh');

        task.result$.subscribe({
          next: () => {
            setTimeout(() => {
              try {
                expect(refreshSpy).toHaveBeenCalledTimes(1);
                done();
              } catch (error) {
                reject(error);
              }
            }, 100);
          },
          error: reject
        });

        // Task 1 从 inactive 变为 active
        const updateEvent = createMockUpdateEvent(
          { id: '1', title: 'Task 1', status: 'active' },
          { id: '1', title: 'Task 1', status: 'inactive' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });
  });

  describe('count - 计数查询', () => {
    it('应该增加新匹配实体的计数', () => {
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

        // Task 1 从 completed: true 变为 false
        const updateEvent = createMockUpdateEvent(
          { id: '1', title: 'Task 1', completed: false },
          { id: '1', title: 'Task 1', completed: true }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('复合 where 下真实的增量 patch(只含被改字段)应该识别新匹配实体(RXD-017)', () => {
      return new Promise<void>((done, reject) => {
        // 模拟生产环境的实体缓存:更新前,id='1' 的完整实体已缓存为
        // { status: 'inactive', priority: 5 }。serialize 把增量 patch 合并进
        // 缓存实体后返回完整实体 —— 这是 QueryManager#serialize 借助
        // entityManager 缓存做的事,朴素的 `data => data.patch` 无法复现。
        const entityCache = new Map<string, TestEntityData>([
          ['1', { id: '1', status: 'inactive', priority: 5 } as TestEntityData]
        ]);
        const task = createMockQueryTask({
          type: 'count',
          options: {
            where: {
              combinator: 'and',
              rules: [
                { field: 'status', operator: '=', value: 'active' },
                { field: 'priority', operator: '=', value: 5 }
              ]
            }
          },
          runner: () => of(5),
          serialize: data => {
            const id = data.id as string;
            const prev = entityCache.get(id) ?? ({ id } as TestEntityData);
            const merged = { ...prev, ...(data.patch as object) } as TestEntityData;
            entityCache.set(id, merged);
            return merged;
          }
        });

        let emitCount = 0;

        task.result$.subscribe({
          next: d => {
            try {
              emitCount++;
              if (emitCount === 1) {
                expect(d).toEqual(5);
              } else {
                expect(d).toEqual(6);
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        // Task 1 的 priority 此前一直是 5(未变),本次更新只有 status 从
        // inactive 变为 active。真实的增量 patch 只含被改字段,不含未变的
        // priority —— 这是本用例要复现的关键条件,不同于 createMockUpdateEvent
        // 把整个实体当 patch 的简化写法。
        const updateEvent: UpdateEvent = {
          type: 'UPDATE',
          namespace: 'test',
          entity: 'TestEntity',
          id: '1',
          entityType: TestEntity,
          recordAt: new Date(0),
          patch: { status: 'active' },
          inversePatch: { status: 'inactive' }
        };
        query_merge_update_cache(task, [updateEvent]);

        setTimeout(() => {
          if (emitCount === 1) {
            reject(
              new Error(
                '复合 where 未识别新匹配实体:count 应从 5 变为 6,但始终停留在 5' +
                  '(gating 层用裸 patch 判定复合 where,缺失字段恒判 false,漏发 recalculate/refresh)'
              )
            );
          }
        }, 100);
      });
    });

    it('应该减少不再匹配实体的计数', () => {
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

        const results = [5, 4]; // 5 - 1 = 4
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

        // Task 1 从 completed: false 变为 true
        const updateEvent = createMockUpdateEvent(
          { id: '1', title: 'Task 1', completed: true },
          { id: '1', title: 'Task 1', completed: false }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该同时处理新匹配和不再匹配的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'count',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            }
          },
          runner: () => of(10)
        });

        const results = [10, 11]; // 10 + 2 - 1 = 11
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

        const updateEvents = [
          // Task 1 变为 active (+1)
          createMockUpdateEvent(
            { id: '1', title: 'Task 1', status: 'active' },
            { id: '1', title: 'Task 1', status: 'inactive' }
          ),
          // Task 2 变为 active (+1)
          createMockUpdateEvent(
            { id: '2', title: 'Task 2', status: 'active' },
            { id: '2', title: 'Task 2', status: 'inactive' }
          ),
          // Task 3 变为 inactive (-1)
          createMockUpdateEvent(
            { id: '3', title: 'Task 3', status: 'inactive' },
            { id: '3', title: 'Task 3', status: 'active' }
          )
        ];
        query_merge_update_cache(task, updateEvents);
      });
    });

    it('inversePatch 为空(更新前态未知)时必须 SQL 刷新,不能当作"没变化"', () => {
      return new Promise<void>((done, reject) => {
        // sqlite 的 UPDATE 钩子拿不到旧值,适配器对系统表(RxDBChange/RxDBSync/...)
        // 只能发出「patch = 整行新值 + inversePatch = {}」的事件。
        // 此时 getSerializedBefore 还原出来的"更新前态"与更新后完全相同,
        // 于是 match_where 与 match_where_before 恒同为 false ——
        // 一条从"匹配"变成"不匹配"的行(remoteId: null → 30348)在增量合并里彻底隐形。
        let runCount = 0;
        const task = createMockQueryTask({
          type: 'count',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'remoteId', operator: '=', value: null }]
            }
          },
          runner: () => {
            runCount++;
            return of(runCount === 1 ? 1 : 0);
          }
        });

        const results = [1, 0];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === results.length) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        query_merge_update_cache(task, [
          {
            type: 'UPDATE',
            namespace: 'test',
            entity: 'TestEntity',
            id: '1',
            entityType: TestEntity,
            recordAt: new Date(0),
            patch: { id: '1', remoteId: 30348, branchId: 'main' },
            inversePatch: {}
          }
        ]);

        setTimeout(() => {
          if (resultIndex < results.length) {
            reject(
              new Error(
                'count 停在 1 没有刷新:更新前态未知时既没 refresh 也没 recalculate,' + '活查询会永久停留在过期结果上'
              )
            );
          }
        }, 100);
      });
    });

    it('不应该改变仍然匹配实体的计数', () => {
      return new Promise<void>((done, reject) => {
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

        let emitCount = 0;

        task.result$.subscribe({
          next: d => {
            try {
              emitCount++;
              expect(d).toEqual(8);

              if (emitCount === 1) {
                setTimeout(() => {
                  expect(emitCount).toBe(1);
                  done();
                }, 100);
              } else {
                reject(new Error('不应该触发第二次更新'));
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        // Task 1 更新前后都是 active,不影响计数
        const updateEvent = createMockUpdateEvent(
          { id: '1', title: 'Task 1 Updated', status: 'active' },
          { id: '1', title: 'Task 1', status: 'active' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该确保计数不小于 0', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'count',
          options: {
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            }
          },
          runner: () => of(1)
        });

        const results = [1, 0]; // 1 - 2 = max(0, -1) = 0
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

        const updateEvents = [
          createMockUpdateEvent(
            { id: '1', title: 'Task 1', status: 'inactive' },
            { id: '1', title: 'Task 1', status: 'active' }
          ),
          createMockUpdateEvent(
            { id: '2', title: 'Task 2', status: 'inactive' },
            { id: '2', title: 'Task 2', status: 'active' }
          )
        ];
        query_merge_update_cache(task, updateEvents);
      });
    });
  });

  // 与 merge_create 的同款守卫：变更事件按批次投递、还可能跨进程（Tauri 的 stdio 宿主），
  // 一条 UPDATE 事件完全可能在活查询拿到首个权威结果之前送达。此刻 resultEntitySet 还是
  // 空的，findAll 的增量合并会把事件负载当成完整结果发射——订阅者第一眼看到的是
  // 只含「被更新那几行」的残缺答案（批量更新 A、B 后 findAll 只回了 B）。
  describe('权威基线落地前的 UPDATE 事件', () => {
    it('不得成为首个结果，而应交回 SQL 重算', async () => {
      let runs = 0;
      const authoritative = [
        { id: 'a', title: 'PosA' },
        { id: 'b', title: 'PosB' }
      ];
      const task = createMockQueryTask({
        type: 'findAll',
        options: { where: { combinator: 'and', rules: [] } },
        runner: () => {
          runs++;
          // 权威读要等一个宏任务——事件正是在这段窗口里到达的
          return timer(0).pipe(map(() => authoritative as TestEntityData[]));
        }
      });

      const first = firstValueFrom(task.result$);
      query_merge_update_cache(task, [createMockUpdateEvent({ id: 'b', title: 'PosB' })]);

      await expect(first).resolves.toEqual(authoritative);
      // 重跑而不是静默丢弃：事件也可能新于 runner 的快照，丢掉会让这次更新永远缺席
      expect(runs).toBe(2);
    });
  });

  describe('边界情况', () => {
    it('应该处理空的更新事件数组', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAll',
          options: { where: { combinator: 'and', rules: [] } },
          runner: () => of([{ id: '1', title: 'Task 1' }])
        });

        let emitCount = 0;

        task.result$.subscribe({
          next: () => {
            emitCount++;
            if (emitCount === 1) {
              setTimeout(() => {
                try {
                  expect(emitCount).toBe(1);
                  done();
                } catch (error) {
                  reject(error);
                }
              }, 100);
            }
          },
          error: reject
        });

        query_merge_update_cache(task, []);
      });
    });

    it('应该处理批量更新多个实体', () => {
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

        const results = [5, 8]; // 5 + 3 = 8
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

        const updateEvents = [
          createMockUpdateEvent(
            { id: '1', title: 'Task 1', completed: false },
            { id: '1', title: 'Task 1', completed: true }
          ),
          createMockUpdateEvent(
            { id: '2', title: 'Task 2', completed: false },
            { id: '2', title: 'Task 2', completed: true }
          ),
          createMockUpdateEvent(
            { id: '3', title: 'Task 3', completed: false },
            { id: '3', title: 'Task 3', completed: true }
          )
        ];
        query_merge_update_cache(task, updateEvents);
      });
    });
  });
});
