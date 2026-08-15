import { emptyFunction } from '@aiao/utils';
import { firstValueFrom, map, Observable, of, timer } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import query_merge_remove_cache_impl from '../../query/merge_remove.js';
import { getFingerprintPrimitive, type Fingerprint } from '../../repository/fingerprint.utils.js';
import { QueryOptions } from '../../repository/QueryManager.interface.js';
import { QueryManager } from '../../repository/QueryManager.js';
import { QueryTask } from '../../repository/QueryTask.js';
import type { Repository } from '../../repository/Repository.js';
import { RxDBEntityLocalRemovedEventData } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';
import { METADATA } from '../../rxdb.private.js';

describe('query_merge_remove_cache', () => {
  class TestEntity {
    [key: string]: unknown;
    static [ENTITY_STATIC_TYPES] = { idType: '' as string };
    id = '';
  }

  type TestEntityType = typeof TestEntity;
  type TestEntityData = InstanceType<TestEntityType>;
  type RemovedEvent = RxDBEntityLocalRemovedEventData<TestEntityType>;

  /**
   * 创建模拟的 RxDB 实例
   * 提供测试所需的最小化 RxDB 接口实现
   *
   * `entityManager.getEntityRef` 是 RXD-018 修复后的必需依赖：merge_remove 要靠它比对
   * DELETE 事件与实体缓存的 `updatedAt`，识别「删除之后又被更新过」的乱序删除事件。
   * 默认返回 `undefined`（缓存未命中 = 事件即唯一信息源，正常放行删除），需要模拟陈旧
   * 删除的用例传入 `cachedById`。
   */
  const createMockRxDB = (cachedById: Record<string, unknown> = {}): RxDB => {
    return {
      schemaManager: {
        getFieldRelations: vi.fn(() => ({ relations: [], isForeignKey: false, property: {}, propertyName: '' })),
        getEntityType: vi.fn(),
        getEntityMetadata: vi.fn()
      },
      // QueryManager 需要注册事件监听器
      addEventListener: vi.fn(),
      entityManager: {
        // 序列化实体时需要创建实体引用
        createEntityRef: vi.fn((_entityType: TestEntityType, entity: TestEntityData) => entity),
        getEntityRef: vi.fn((_entityType: unknown, id: string) => cachedById[id])
      }
    } as unknown as RxDB;
  };
  const getFingerprintByPrimitive = (value: unknown): Fingerprint[] =>
    getFingerprintPrimitive(value as Fingerprint | Fingerprint[]);
  const getFingerprintByMockEntity = (entity: unknown): Fingerprint[] => [JSON.stringify({ ...(entity as object) })];
  const getFingerprintByMockEntities = (entities: unknown): Fingerprint[] =>
    Array.isArray(entities) ? entities.map(e => JSON.stringify({ ...(e as object) })) : [];

  /**
   * 使用真实的 QueryManager 创建查询任务
   *
   * 优势:
   * 1. 测试真实的 QueryManager 实现,而不是模拟的 QueryTask
   * 2. 可以同时测试 QueryManager 和 merge_remove 的集成
   * 3. 减少手动模拟代码,使用真实的查询任务生命周期管理
   * 4. 更贴近实际使用场景
   *
   * @param queryOptions 查询选项(类型、条件、排序等)
   * @param runner 查询执行函数,返回查询结果的 Observable
   * @returns QueryTask 实例,包含 result$ 可订阅查询结果
   */
  const createMockQueryTask = <RT>(
    queryOptions: QueryOptions<TestEntityType>,
    runner: () => Observable<RT>
  ): QueryTask<TestEntityType, RT> => {
    const mockRxDB = createMockRxDB();
    const mockRepository = {} as unknown as Repository<TestEntityType>;

    // 使用真实的 QueryManager 创建任务
    const queryManager = new QueryManager(mockRxDB, TestEntity, mockRepository);

    // 选择合适的指纹计算方法
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

    return queryManager.createTask({
      options: queryOptions,
      runner,
      getFingerprint: pickFingerprint()
    });
  };

  const query_merge_remove_cache = <RT>(task: QueryTask<TestEntityType, RT>, events: RemovedEvent[]): void => {
    query_merge_remove_cache_impl(task as unknown as QueryTask<TestEntityType>, events);
  };

  /**
   * 创建模拟的删除事件数据
   */
  const createMockRemoveEvent = (entity: TestEntityData): RemovedEvent => {
    return {
      type: 'DELETE',
      namespace: 'test',
      entity: 'TestEntity',
      id: entity.id,
      entityType: TestEntity,
      recordAt: new Date(0),
      patch: null,
      inversePatch: entity
    };
  };

  describe('get - 单实体查询', () => {
    it('应该在当前实体被删除时触发 SQL 刷新', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'get',
            options: 'run-1'
          },
          () => of({ id: 'run-1', status: 'queued' })
        );

        const refreshSpy = vi.spyOn(task, 'refresh');
        let emitted = false;

        task.result$.subscribe({
          next: () => {
            if (emitted) {
              return;
            }
            emitted = true;

            query_merge_remove_cache(task, [createMockRemoveEvent({ id: 'run-1', status: 'queued' })]);

            try {
              expect(refreshSpy).toHaveBeenCalledTimes(1);
              done();
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });
      });
    });
  });

  describe('findAll - 全量查询', () => {
    it('应该使用 JS 计算从结果中移除被删除的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'findAll',
            options: {
              where: {
                combinator: 'and',
                rules: [{ field: 'status', operator: '=', value: 'active' }]
              }
            }
          },
          () =>
            of([
              { id: '1', title: 'Task 1', status: 'active' },
              { id: '2', title: 'Task 2', status: 'active' },
              { id: '3', title: 'Task 3', status: 'active' }
            ])
        );

        const results = [
          // 初始结果
          [
            { id: '1', title: 'Task 1', status: 'active' },
            { id: '2', title: 'Task 2', status: 'active' },
            { id: '3', title: 'Task 3', status: 'active' }
          ],
          // 删除 Task 2 后
          [
            { id: '1', title: 'Task 1', status: 'active' },
            { id: '3', title: 'Task 3', status: 'active' }
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

        const removeEvent = createMockRemoveEvent({ id: '2', title: 'Task 2', status: 'active' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('应该在删除后重新排序', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'findAll',
            options: {
              where: { combinator: 'and', rules: [] },
              orderBy: [{ field: 'priority', sort: 'desc' }]
            }
          },
          () =>
            of([
              { id: '1', title: 'Task 1', priority: 10 },
              { id: '2', title: 'Task 2', priority: 5 },
              { id: '3', title: 'Task 3', priority: 3 }
            ])
        );

        const results = [
          [
            { id: '1', title: 'Task 1', priority: 10 },
            { id: '2', title: 'Task 2', priority: 5 },
            { id: '3', title: 'Task 3', priority: 3 }
          ],
          // 删除中间的实体后,剩余实体仍然按顺序
          [
            { id: '1', title: 'Task 1', priority: 10 },
            { id: '3', title: 'Task 3', priority: 3 }
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

        const removeEvent = createMockRemoveEvent({ id: '2', title: 'Task 2', priority: 5 });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('不应该移除不在结果集中的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'findAll',
            options: { where: { combinator: 'and', rules: [] } }
          },
          () =>
            of([
              { id: '1', title: 'Task 1' },
              { id: '2', title: 'Task 2' }
            ])
        );

        const expectedResult = [
          { id: '1', title: 'Task 1' },
          { id: '2', title: 'Task 2' }
        ];
        let emitCount = 0;

        task.result$.subscribe({
          next: d => {
            try {
              emitCount++;
              expect(d).toEqual(expectedResult);

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

        // 删除不在结果集中的实体
        const removeEvent = createMockRemoveEvent({ id: '999', title: 'Task 999' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('应该批量删除多个实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'findAll',
            options: { where: { combinator: 'and', rules: [] } }
          },
          () =>
            of([
              { id: '1', title: 'Task 1' },
              { id: '2', title: 'Task 2' },
              { id: '3', title: 'Task 3' },
              { id: '4', title: 'Task 4' }
            ])
        );

        const results = [
          [
            { id: '1', title: 'Task 1' },
            { id: '2', title: 'Task 2' },
            { id: '3', title: 'Task 3' },
            { id: '4', title: 'Task 4' }
          ],
          // 批量删除 Task 2 和 Task 3
          [
            { id: '1', title: 'Task 1' },
            { id: '4', title: 'Task 4' }
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

        const removeEvents = [
          createMockRemoveEvent({ id: '2', title: 'Task 2' }),
          createMockRemoveEvent({ id: '3', title: 'Task 3' })
        ];
        query_merge_remove_cache(task, removeEvents);
      });
    });
  });

  describe('find - 分页查询', () => {
    it('应该在删除结果集中的实体时触发 SQL 刷新', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'find',
            options: {
              where: { combinator: 'and', rules: [] },
              limit: 3,
              orderBy: [{ field: 'id', sort: 'asc' }]
            }
          },
          () =>
            of([
              { id: '1', title: 'Task 1' },
              { id: '2', title: 'Task 2' },
              { id: '3', title: 'Task 3' }
            ])
        );

        const refreshSpy = vi.spyOn(task, 'refresh');

        task.result$.subscribe({
          next: () => {
            setTimeout(() => {
              try {
                // 应该触发刷新以补充数据
                expect(refreshSpy).toHaveBeenCalledTimes(1);
                done();
              } catch (error) {
                reject(error);
              }
            }, 100);
          },
          error: reject
        });

        // 删除结果集中的实体
        const removeEvent = createMockRemoveEvent({ id: '2', title: 'Task 2' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('不应该在删除不在结果集中的实体时触发刷新', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'find',
            options: {
              where: { combinator: 'and', rules: [] },
              limit: 3
            }
          },
          () =>
            of([
              { id: '1', title: 'Task 1' },
              { id: '2', title: 'Task 2' },
              { id: '3', title: 'Task 3' }
            ])
        );

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

        // 删除不在结果集中的实体
        const removeEvent = createMockRemoveEvent({ id: '999', title: 'Task 999' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });
  });

  describe('findByCursor - 游标分页查询', () => {
    it('应该使用 JS 计算从游标范围内移除被删除的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'findByCursor',
            options: {
              where: { combinator: 'and', rules: [] },
              orderBy: [{ field: 'id', sort: 'asc' }],
              limit: 3
            }
          },
          () =>
            of([
              { id: '1', title: 'Task 1' },
              { id: '2', title: 'Task 2' },
              { id: '3', title: 'Task 3' }
            ])
        );

        const results = [
          [
            { id: '1', title: 'Task 1' },
            { id: '2', title: 'Task 2' },
            { id: '3', title: 'Task 3' }
          ],
          // 删除 Task 2 后,不需要补充数据
          [
            { id: '1', title: 'Task 1' },
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

        const removeEvent = createMockRemoveEvent({ id: '2', title: 'Task 2' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('不应该移除不在结果集中的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'findByCursor',
            options: {
              where: { combinator: 'and', rules: [] },
              orderBy: [{ field: 'id', sort: 'asc' }],
              limit: 3
            }
          },
          () =>
            of([
              { id: '1', title: 'Task 1' },
              { id: '2', title: 'Task 2' }
            ])
        );

        const expectedResult = [
          { id: '1', title: 'Task 1' },
          { id: '2', title: 'Task 2' }
        ];
        let emitCount = 0;

        task.result$.subscribe({
          next: d => {
            try {
              emitCount++;
              expect(d).toEqual(expectedResult);

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

        const removeEvent = createMockRemoveEvent({ id: '999', title: 'Task 999' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });
  });

  describe('findOne - 单条查询', () => {
    it('应该在当前结果被删除时触发 SQL 刷新', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'findOne',
            options: {
              where: {
                combinator: 'and',
                rules: [{ field: 'status', operator: '=', value: 'active' }]
              }
            }
          },
          () => of({ id: '1', title: 'Task 1', status: 'active' })
        );

        const refreshSpy = vi.spyOn(task, 'refresh');

        task.result$.subscribe({
          next: () => {
            setTimeout(() => {
              try {
                // 应该触发刷新以获取新的结果
                expect(refreshSpy).toHaveBeenCalledTimes(1);
                done();
              } catch (error) {
                reject(error);
              }
            }, 100);
          },
          error: reject
        });

        // 删除当前结果
        const removeEvent = createMockRemoveEvent({ id: '1', title: 'Task 1', status: 'active' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('不应该在删除其他实体时触发刷新', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'findOne',
            options: {
              where: {
                combinator: 'and',
                rules: [{ field: 'status', operator: '=', value: 'active' }]
              }
            }
          },
          () => of({ id: '1', title: 'Task 1', status: 'active' })
        );

        const refreshSpy = vi.spyOn(task, 'refresh');

        let emitCount = 0;
        const expectedResult = { id: '1', title: 'Task 1', status: 'active' };

        task.result$.subscribe({
          next: d => {
            try {
              emitCount++;
              expect(d).toEqual(expectedResult);

              if (emitCount === 1) {
                setTimeout(() => {
                  expect(emitCount).toBe(1);
                  expect(refreshSpy).not.toHaveBeenCalled();
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

        // 删除其他实体
        const removeEvent = createMockRemoveEvent({ id: '999', title: 'Task 999', status: 'active' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('应该在当前无结果时不触发刷新', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'findOne',
            options: { where: { combinator: 'and', rules: [] } }
          },
          () => of(null)
        );

        const refreshSpy = vi.spyOn(task, 'refresh');

        let emitCount = 0;
        task.result$.subscribe({
          next: d => {
            emitCount++;
            expect(d).toEqual(null);

            if (emitCount === 1) {
              setTimeout(() => {
                try {
                  expect(emitCount).toBe(1);
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

        const removeEvent = createMockRemoveEvent({ id: '1', title: 'Task 1' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });
  });

  describe('count - 计数查询', () => {
    it('应该使用 JS 计算减少计数', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'count',
            options: {
              where: {
                combinator: 'and',
                rules: [{ field: 'completed', operator: '=', value: false }]
              }
            }
          },
          () => of(10)
        );

        const results = [10, 9]; // 10 - 1 = 9
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

        const removeEvent = createMockRemoveEvent({ id: '1', title: 'Task 1', completed: false });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('应该批量减少计数', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'count',
            options: { where: { combinator: 'and', rules: [] } }
          },
          () => of(20)
        );

        const results = [20, 17]; // 20 - 3 = 17
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

        const removeEvents = [
          createMockRemoveEvent({ id: '1', title: 'Task 1' }),
          createMockRemoveEvent({ id: '2', title: 'Task 2' }),
          createMockRemoveEvent({ id: '3', title: 'Task 3' })
        ];
        query_merge_remove_cache(task, removeEvents);
      });
    });

    it('应该确保计数不小于 0', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'count',
            options: { where: { combinator: 'and', rules: [] } }
          },
          () => of(2)
        );

        const results = [2, 0]; // 2 - 5 = max(0, -3) = 0
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

        const removeEvents = [
          createMockRemoveEvent({ id: '1', title: 'Task 1' }),
          createMockRemoveEvent({ id: '2', title: 'Task 2' }),
          createMockRemoveEvent({ id: '3', title: 'Task 3' }),
          createMockRemoveEvent({ id: '4', title: 'Task 4' }),
          createMockRemoveEvent({ id: '5', title: 'Task 5' })
        ];
        query_merge_remove_cache(task, removeEvents);
      });
    });

    it('不应该减少不匹配 where 条件的实体计数', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'count',
            options: {
              where: {
                combinator: 'and',
                rules: [{ field: 'status', operator: '=', value: 'active' }]
              }
            }
          },
          () => of(8)
        );

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

        // 删除不匹配条件的实体（inversePatch 中 status 是 'inactive'）
        const removeEvent = createMockRemoveEvent({ id: '1', title: 'Task 1', status: 'inactive' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('混合删除事件中只减少匹配 where 的实体计数', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'count',
            options: {
              where: {
                combinator: 'and',
                rules: [{ field: 'status', operator: '=', value: 'active' }]
              }
            }
          },
          () => of(10)
        );

        const results = [10, 9]; // 3 个删除事件中只有 1 个匹配 where，10 - 1 = 9
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

        const removeEvents = [
          createMockRemoveEvent({ id: '1', status: 'active' }), // 匹配
          createMockRemoveEvent({ id: '2', status: 'inactive' }), // 不匹配
          createMockRemoveEvent({ id: '3', status: 'archived' }) // 不匹配
        ];
        query_merge_remove_cache(task, removeEvents);
      });
    });

    // RXD-020 对称清理：merge_create.ts 的 count 分支把已计数的 id 记进
    // task.resultEntityIds 去重；这里删除时必须同步摘掉，否则被删 id 会一直卡在去重集合里，
    // 之后同 id 重建（如 undo/redo 撤销删除）时会被误判成"已经计过数的重复事件"而漏计数。
    it('删除匹配的实体后应该把对应 id 从 resultEntityIds 去重集合中摘除', () => {
      const task = createMockQueryTask(
        {
          type: 'count',
          options: { where: { combinator: 'and', rules: [] } }
        },
        () => of(1)
      );

      task.result$.subscribe();
      // 模拟 CREATE 侧已经把这个 id 记进去重集合
      task.resultEntityIds.add('1');

      const removeEvent = createMockRemoveEvent({ id: '1', title: 'Task 1' });
      query_merge_remove_cache(task, [removeEvent]);

      expect(task.result).toBe(0);
      expect(task.resultEntityIds.has('1')).toBe(false);
    });

    it('删除一个 id 不应该清空 resultEntityIds 中其它未涉及的 id', () => {
      const task = createMockQueryTask(
        {
          type: 'count',
          options: { where: { combinator: 'and', rules: [] } }
        },
        () => of(2)
      );

      task.result$.subscribe();
      task.resultEntityIds.add('1');
      task.resultEntityIds.add('2');

      const removeEvent = createMockRemoveEvent({ id: '1', title: 'Task 1' });
      query_merge_remove_cache(task, [removeEvent]);

      expect(task.result).toBe(1);
      expect(task.resultEntityIds.has('1')).toBe(false);
      expect(task.resultEntityIds.has('2')).toBe(true);
    });
  });

  // 与 merge_create / merge_update 的同款守卫：首个权威结果落地前收到 DELETE 事件，
  // count 分支会用 `(result || 0) - matched` 伪造出首发结果 0；其余分支虽是空转，
  // 但 runner 的快照可能取自删除提交之前，静默丢弃会让这行死数据永远留在活查询里。
  describe('权威基线落地前的 DELETE 事件', () => {
    it('不得成为首个结果，而应交回 SQL 重算', async () => {
      let runs = 0;
      const task = createMockQueryTask({ type: 'count', options: { where: { combinator: 'and', rules: [] } } }, () => {
        runs++;
        // 权威读要等一个宏任务——事件正是在这段窗口里到达的
        return timer(0).pipe(map(() => 3));
      });

      const first = firstValueFrom(task.result$);
      query_merge_remove_cache(task, [createMockRemoveEvent({ id: 'gone-1', title: 'gone' })]);

      await expect(first).resolves.toBe(3);
      // 重跑而不是静默丢弃：事件也可能新于 runner 的快照，丢掉会让这次删除永远缺席
      expect(runs).toBe(2);
    });
  });

  describe('边界情况', () => {
    it('应该处理空的删除事件数组', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'findAll',
            options: { where: { combinator: 'and', rules: [] } }
          },
          () => of([{ id: '1', title: 'Task 1' }])
        );

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

        query_merge_remove_cache(task, []);
      });
    });

    it('应该处理删除全部结果', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'findAll',
            options: { where: { combinator: 'and', rules: [] } }
          },
          () =>
            of([
              { id: '1', title: 'Task 1' },
              { id: '2', title: 'Task 2' }
            ])
        );

        const results = [
          [
            { id: '1', title: 'Task 1' },
            { id: '2', title: 'Task 2' }
          ],
          [] // 全部删除后为空数组
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

        const removeEvents = [
          createMockRemoveEvent({ id: '1', title: 'Task 1' }),
          createMockRemoveEvent({ id: '2', title: 'Task 2' })
        ];
        query_merge_remove_cache(task, removeEvents);
      });
    });

    it('应该处理 count 为 0 的情况', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask(
          {
            type: 'count',
            options: { where: { combinator: 'and', rules: [] } }
          },
          () => of(1)
        );
        const results = [1, 0]; // 1 - 1 = 0
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

        const removeEvent = createMockRemoveEvent({ id: '1', title: 'Task 1' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });
  });

  // RXD-018：DELETE 关系与乱序保护失效
  describe('EXISTS operator integration（RXD-018）', () => {
    it('should refresh when related entity is removed (EXISTS dependency)', () => {
      return new Promise<void>((resolve, reject) => {
        let refreshCount = 0;

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
        const childrenRelation = {
          name: 'children',
          propertyName: 'children',
          kind: 'ONE_TO_MANY',
          mappedEntity: 'Menu',
          mappedNamespace: 'test',
          mappedProperty: 'parent'
        };
        const menuMetadata = {
          name: 'Menu',
          namespace: 'test',
          target: Menu,
          properties: [],
          primary: { name: 'id', type: 'string' },
          relations: [childrenRelation],
          // whereUsesRelations（严格策略需要）靠 relationMap 判断 where 字段是否是关系字段；
          // 真实 metadata 里 relationMap 由装饰器反射生成，含全部（含继承）关系，这里手动
          // 对齐，不能像 CREATE 的测试 fixture 那样留空 —— CREATE 不检查 whereUsesRelations，
          // 空 Map 不会暴露问题，但 REMOVE/UPDATE 的严格策略会。
          relationMap: new Map([['children', childrenRelation]]),
          propertyMap: new Map(),
          indexes: []
        };
        Object.assign(Menu, { [METADATA]: menuMetadata });

        const mockRxDB = {
          schemaManager: {
            getFieldRelations: vi.fn(() => ({ relations: [], isForeignKey: false, property: {}, propertyName: '' })),
            getEntityType: vi.fn(() => Menu),
            getEntityMetadata: vi.fn((entity: string, namespace: string) => {
              if (entity === 'Menu' && namespace === 'test') {
                return menuMetadata;
              }
              return undefined;
            })
          },
          entityManager: { getEntityRef: vi.fn(() => undefined) }
        } as unknown as RxDB;
        const deps = new Map<typeof Menu, number>([[Menu, 1]]);

        const task = new QueryTask<typeof Menu, Menu[]>({
          cacheKey: 'cacheKey',
          options: {
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
            }
          },
          runner: () => of([]),
          entityType: Menu,
          rxdb: mockRxDB,
          depEntityTypeMap: deps,
          serialize: data => Object.assign(new Menu(), data.inversePatch ?? {}),
          onClean: emptyFunction,
          getFingerprint: (entities: unknown) =>
            Array.isArray(entities) ? entities.map(e => JSON.stringify({ ...(e as object) })) : []
        });
        task.result$ = new Observable<Menu[]>(observer => {
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

        const originalRefresh = task.refresh;
        task.refresh = () => {
          refreshCount++;
          originalRefresh.call(task);
        };

        task.result$.subscribe({
          next: () => {
            // EXISTS 查询应该在关联实体删除时触发刷新：被删除的子菜单可能不再满足 EXISTS 条件
            setTimeout(() => {
              expect(refreshCount).toBeGreaterThan(0);
              resolve();
            }, 10);
          },
          error: reject
        });

        // 删除一个子菜单（关系实体）
        const childMenu = Object.assign(new MenuChild(), {
          id: 'menu-child-1',
          parentId: 'menu-parent-1',
          active: true
        });
        const childMenuRemoveEvent: RxDBEntityLocalRemovedEventData<typeof Menu> = {
          type: 'DELETE',
          namespace: 'test',
          entity: 'Menu',
          id: childMenu.id,
          entityType: Menu,
          recordAt: new Date(0),
          patch: null,
          inversePatch: childMenu
        };

        query_merge_remove_cache_impl(task as unknown as QueryTask<typeof Menu>, [childMenuRemoveEvent]);
      });
    });
  });

  describe('RXD-023: count 删除路径关系门控缺失', () => {
    it('where 依赖关系字段时，删除当前实体不能靠扁平快照做 notExists 判断，必须走 SQL 刷新', () => {
      return new Promise<void>((resolve, reject) => {
        let refreshCount = 0;

        class User {
          static [ENTITY_STATIC_TYPES] = { idType: '' as string };
          id = '';
        }
        const idCardRelation = {
          name: 'idCard',
          propertyName: 'idCard',
          kind: '1:1',
          mappedEntity: 'IdCard',
          mappedNamespace: 'test',
          mappedProperty: 'owner'
        };
        const userMetadata = {
          name: 'User',
          namespace: 'test',
          target: User,
          properties: [],
          primary: { name: 'id', type: 'string' },
          relations: [idCardRelation],
          // count 分支的门控走 QueryRulesBuilder 的严格策略，whereUsesRelations 靠 relationMap
          // 判断字段是否是关系字段——留空 Map 不会暴露这里要验证的门控缺失。
          relationMap: new Map([['idCard', idCardRelation]]),
          propertyMap: new Map(),
          indexes: []
        };
        Object.assign(User, { [METADATA]: userMetadata });

        const mockRxDB = {
          schemaManager: {
            getFieldRelations: vi.fn(() => ({ relations: [], isForeignKey: false, property: {}, propertyName: '' })),
            getEntityType: vi.fn(() => User),
            getEntityMetadata: vi.fn((entity: string, namespace: string) => {
              if (entity === 'User' && namespace === 'test') {
                return userMetadata;
              }
              return undefined;
            })
          },
          entityManager: { getEntityRef: vi.fn(() => undefined) }
        } as unknown as RxDB;
        const deps = new Map<typeof User, number>([[User, 1]]);

        const task = new QueryTask<typeof User, number>({
          cacheKey: 'cacheKey',
          options: {
            type: 'count',
            options: {
              where: {
                combinator: 'and',
                rules: [{ field: 'idCard', operator: 'notExists' }]
              }
            }
          } as unknown as QueryOptions<typeof User>,
          runner: () => of(2),
          entityType: User,
          rxdb: mockRxDB,
          depEntityTypeMap: deps,
          serialize: data => data.inversePatch as unknown as InstanceType<typeof User>,
          onClean: emptyFunction,
          getFingerprint: getFingerprintPrimitive
        });

        task.result$ = new Observable<number>(observer => {
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

        const originalRefresh = task.refresh;
        task.refresh = () => {
          refreshCount++;
          originalRefresh.call(task);
        };

        task.result$.subscribe({
          next: () => {
            setTimeout(() => {
              try {
                // 被删除的 user1 通过 idCardId 关联着既存 IdCard，notExists 本该为 false，
                // 删除它不应该影响"无 idCard 用户数"这个计数；但 DELETE 事件的 inversePatch
                // 是扁平快照，不含已加载的 idCard 关系对象，isEntityMatchWhere 对 notExists 的
                // 兜底语义会把"关系字段未加载"误判为"关系不存在"，导致 count 分支错误地把这次
                // 删除当成命中 where 而直接减计数。一旦当前实体的 where 依赖关系字段，就不能
                // 信任这份快照做 JS 增量计算，只能交给 SQL 刷新拿到基于关系表联接的真实结果。
                expect(refreshCount).toBeGreaterThan(0);
                resolve();
              } catch (error) {
                reject(error);
              }
            }, 100);
          },
          error: reject
        });

        const removedUser = {
          type: 'DELETE',
          namespace: 'test',
          entity: 'User',
          id: 'user1',
          entityType: User,
          recordAt: new Date(0),
          patch: null,
          inversePatch: { id: 'user1', name: 'John', idCardId: 'card-1' }
        } as unknown as RxDBEntityLocalRemovedEventData<typeof User>;

        query_merge_remove_cache_impl(task as unknown as QueryTask<typeof User>, [removedUser]);
      });
    });
  });

  describe('乱序删除保护（RXD-018）', () => {
    it('缓存中的实体比 DELETE 事件新时，不应该用旧删除清掉较新的缓存', () => {
      return new Promise<void>((resolve, reject) => {
        const NEWER = { id: '1', title: 'Task 1', updatedAt: new Date('2026-07-30T00:00:02.000Z') };
        const task = createMockQueryTask(
          {
            type: 'findAll',
            options: { where: { combinator: 'and', rules: [] } }
          },
          () => of([NEWER])
        );

        // 覆盖 task.rxdb 的 entityManager.getEntityRef，模拟缓存里已有比即将到来的 DELETE 更新的实体
        const getEntityRefMock = vi.fn(() => NEWER) as unknown as RxDB['entityManager']['getEntityRef'];
        (task.rxdb as unknown as RxDB).entityManager.getEntityRef = getEntityRefMock;

        let nextCount = 0;
        task.result$.subscribe({
          next: d => {
            nextCount++;
            if (nextCount !== 1) return;

            try {
              expect(d).toEqual([NEWER]);
            } catch (error) {
              reject(error);
              return;
            }

            const staleRemoveEvent = createMockRemoveEvent({
              id: '1',
              title: 'Task 1',
              updatedAt: new Date('2026-07-30T00:00:01.000Z')
            });
            query_merge_remove_cache(task, [staleRemoveEvent]);

            // 陈旧删除必须被过滤掉：不应该有第二次 emit（实体没有被从结果集里移除）
            setTimeout(() => {
              try {
                expect(nextCount).toBe(1);
                resolve();
              } catch (error) {
                reject(error);
              }
            }, 10);
          },
          error: reject
        });
      });
    });
  });

  describe('图查询 - findNeighbors/countNeighbors/findPaths（RXD-025）', () => {
    /**
     * merge_remove 的 switch 目前没有这三种图查询类型的 case，refresh_rules/recalculate_rules
     * 保持空数组——runMatches 对空规则数组恒返回 false，命中 where 的 DELETE 事件永远不会
     * 触发 task.refresh()，活查询永久 stale。
     */
    it.each(['findNeighbors', 'countNeighbors', 'findPaths'] as const)(
      '%s 命中 where 条件的删除事件应该触发 SQL 刷新',
      type => {
        return new Promise<void>((resolve, reject) => {
          const task = createMockQueryTask(
            {
              type,
              options: {
                where: { combinator: 'and', rules: [{ field: 'name', operator: '=', value: 'Alice' }] }
              }
            } as unknown as QueryOptions<TestEntityType>,
            () => of((type === 'countNeighbors' ? 0 : []) as never)
          );

          const refreshSpy = vi.spyOn(task, 'refresh');
          let emitted = false;

          task.result$.subscribe({
            next: () => {
              if (emitted) {
                return;
              }
              emitted = true;

              query_merge_remove_cache(task, [createMockRemoveEvent({ id: 'alice-1', name: 'Alice' })]);

              try {
                expect(refreshSpy).toHaveBeenCalledTimes(1);
                resolve();
              } catch (error) {
                reject(error);
              }
            },
            error: reject
          });
        });
      }
    );
  });
});
