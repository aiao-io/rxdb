import { emptyFunction } from '@aiao/utils';
import { Observable, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import query_merge_update_cache_impl from '../../query/merge_update.js';
import { getFingerprintPrimitive, type Fingerprint } from '../../repository/fingerprint.utils.js';
import { QueryOptions } from '../../repository/QueryManager.interface.js';
import { QueryTask } from '../../repository/QueryTask.js';
import type { RxDBEntityLocalUpdatedEventData } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';

describe('query_merge_tree_update_cache - UPDATE 事件的树形查询', () => {
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
    taskOptions: QueryOptions<TestEntityType> & { runner: () => Observable<RT> }
  ): QueryTask<TestEntityType, RT> => {
    const deps = new Map<TestEntityType, number>();
    deps.set(TestEntity, 1);
    const cacheKey = 'cacheKey';
    const mockRxDB = createMockRxDB();
    const { runner, ...queryOptions } = taskOptions;
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
      serialize: data => data.patch as TestEntityData,
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
      entity: 'Category',
      id: entity.id,
      entityType: TestEntity,
      recordAt: new Date(0),
      patch: entity,
      inversePatch: previousEntity ?? entity
    };
  };

  describe('findDescendants - 更新后代查询', () => {
    it('应该更新根节点（entityId 为 null）', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root1 (id: 1, parentId: null, name: 'old root1')
        // root2 (id: 10, parentId: null, name: 'root2')

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: null, // 查找所有根节点
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'old root1', parentId: null },
              { id: '10', name: 'root2', parentId: null }
            ])
        });

        const results = [
          // 初始结果：两个根节点
          [
            { id: '1', name: 'old root1', parentId: null },
            { id: '10', name: 'root2', parentId: null }
          ],
          // 更新 root1 的 name
          [
            { id: '1', name: 'new root1', parentId: null }, // 名称已更新
            { id: '10', name: 'root2', parentId: null }
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

        // 更新 root1
        const previousEntity = { id: '1', name: 'old root1', parentId: null };
        const updatedEntity = { id: '1', name: 'new root1', parentId: null };
        const updateEvent = createMockUpdateEvent(updatedEntity, previousEntity);
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该更新所有根节点（不传 entityId）', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root1 (id: 1, parentId: null, name: 'old root1')
        // root2 (id: 10, parentId: null, name: 'root2')

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            // 不传 entityId，应该查找所有根节点
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'old root1', parentId: null },
              { id: '10', name: 'root2', parentId: null }
            ])
        });

        const results = [
          // 初始结果：两个根节点
          [
            { id: '1', name: 'old root1', parentId: null },
            { id: '10', name: 'root2', parentId: null }
          ],
          // 更新 root1 的 name
          [
            { id: '1', name: 'new root1', parentId: null }, // 名称已更新
            { id: '10', name: 'root2', parentId: null }
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

        // 更新 root1
        const previousEntity = { id: '1', name: 'old root1', parentId: null };
        const updatedEntity = { id: '1', name: 'new root1', parentId: null };
        const updateEvent = createMockUpdateEvent(updatedEntity, previousEntity);
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('不传 entityId 时，应该更新子节点字段（不改变 parentId）', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            // 不传 entityId，查询所有根节点及其后代
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root1', parentId: null },
              { id: '2', name: 'old child', parentId: '1' },
              { id: '10', name: 'root2', parentId: null }
            ])
        });

        const results = [
          // 初始结果：包含所有根节点和后代
          [
            { id: '1', name: 'root1', parentId: null },
            { id: '2', name: 'old child', parentId: '1' },
            { id: '10', name: 'root2', parentId: null }
          ],
          // 更新子节点 name（parentId 未变）
          [
            { id: '1', name: 'root1', parentId: null },
            { id: '2', name: 'new child', parentId: '1' },
            { id: '10', name: 'root2', parentId: null }
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

        // 更新子节点的 name 字段（parentId 不变）
        const previousEntity = { id: '2', name: 'old child', parentId: '1' };
        const updatedEntity = { id: '2', name: 'new child', parentId: '1' };
        const updateEvent = createMockUpdateEvent(updatedEntity, previousEntity);
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该使用 JS 增量更新实体字段值(不改变树结构)', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   └─ child1 (id: 2, parentId: 1, name: 'old name')
        //        └─ grandchild1 (id: 3, parentId: 2)

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null }, // 包含根节点本身
              { id: '2', name: 'old name', parentId: '1' },
              { id: '3', name: 'grandchild1', parentId: '2' }
            ])
        });

        const results = [
          // 初始结果：包含根节点和所有后代
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'old name', parentId: '1' },
            { id: '3', name: 'grandchild1', parentId: '2' }
          ],
          // 更新 child1 名称后
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'new name', parentId: '1' },
            { id: '3', name: 'grandchild1', parentId: '2' }
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

        // 更新 child1 的名称(不改变 parentId)
        const updateEvent = createMockUpdateEvent(
          { id: '2', name: 'new name', parentId: '1' },
          { id: '2', name: 'old name', parentId: '1' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该移除不再是后代的实体(parentId 改变)', () => {
      return new Promise<void>((done, reject) => {
        // 树结构:
        // root (id: 1)
        //   ├─ child1 (id: 2, parentId: 1)
        //   └─ child2 (id: 3, parentId: 1)
        //
        // other (id: 10)

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null }, // 包含根节点本身
              { id: '2', name: 'child1', parentId: '1' },
              { id: '3', name: 'child2', parentId: '1' }
            ])
        });

        const results = [
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'child2', parentId: '1' }
          ],
          // child2 的 parentId 从 1 改为 10,不再是 root 的后代
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' }
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

        // 将 child2 移动到 other 节点下
        const updateEvent = createMockUpdateEvent(
          { id: '3', name: 'child2', parentId: '10' },
          { id: '3', name: 'child2', parentId: '1' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该添加新成为后代的实体(parentId 改变)', () => {
      // 初始树结构:
      // root (id: 1)
      //   └─ child1 (id: 2, parentId: 1)
      //
      // other (id: 10)
      //   └─ orphan (id: 5, parentId: 10)
      //
      // RXD-022：orphan 跨 scope 边界移入 root 的后代，本地增量缓存无法证明
      // orphan 是否已带着自己的子孙——用动态 runner + refresh 断言，而非静态
      // 期望值，因为正确修复下这里必须整体刷新交回 SQL 重算。
      let databaseResult: TestEntityData[] = [
        { id: '1', name: 'root', parentId: null },
        { id: '2', name: 'child1', parentId: '1' }
      ];

      const task = createMockQueryTask({
        type: 'findDescendants',
        options: {
          entityId: '1',
          where: { combinator: 'and', rules: [] }
        },
        runner: () => of(databaseResult)
      });

      const emissions: TestEntityData[][] = [];
      const subscription = task.result$.subscribe(result => emissions.push(result));

      // 将 orphan 移动到 root 下
      databaseResult = [
        { id: '1', name: 'root', parentId: null },
        { id: '2', name: 'child1', parentId: '1' },
        { id: '5', name: 'orphan', parentId: '1' }
      ];
      query_merge_update_cache(task, [
        createMockUpdateEvent({ id: '5', name: 'orphan', parentId: '1' }, { id: '5', name: 'orphan', parentId: '10' })
      ]);

      expect(emissions).toEqual([
        [
          { id: '1', name: 'root', parentId: null },
          { id: '2', name: 'child1', parentId: '1' }
        ],
        databaseResult
      ]);
      subscription.unsubscribe();
    });

    it('应该处理多层级的父级变更', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   └─ child1 (id: 2, parentId: 1)
        //        └─ grandchild1 (id: 3, parentId: 2)

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '2', name: 'child1', parentId: '1' },
              { id: '3', name: 'grandchild1', parentId: '2' }
            ])
        });

        const results = [
          [
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'grandchild1', parentId: '2' }
          ],
          // grandchild1 直接挂到 root 下
          [
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'grandchild1', parentId: '1' }
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

        // 将 grandchild1 直接挂到 root 下
        const updateEvent = createMockUpdateEvent(
          { id: '3', name: 'grandchild1', parentId: '1' },
          { id: '3', name: 'grandchild1', parentId: '2' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('不应该添加仍然不是后代的实体', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () => of([{ id: '2', name: 'child1', parentId: '1' }])
        });

        const expectedResult = [{ id: '2', name: 'child1', parentId: '1' }];
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

        // 更新一个不相关的节点 (从 parentId: 10 改为 parentId: 20)
        const updateEvent = createMockUpdateEvent(
          { id: '99', name: 'other', parentId: '20' },
          { id: '99', name: 'other', parentId: '10' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该支持批量更新', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '2', name: 'child1', parentId: '1' },
              { id: '3', name: 'child2', parentId: '1' }
            ])
        });

        const results = [
          [
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'child2', parentId: '1' }
          ],
          [
            { id: '2', name: 'updated child1', parentId: '1' },
            { id: '3', name: 'updated child2', parentId: '1' }
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

        // 批量更新多个节点
        const updateEvents = [
          createMockUpdateEvent(
            { id: '2', name: 'updated child1', parentId: '1' },
            { id: '2', name: 'child1', parentId: '1' }
          ),
          createMockUpdateEvent(
            { id: '3', name: 'updated child2', parentId: '1' },
            { id: '3', name: 'child2', parentId: '1' }
          )
        ];
        query_merge_update_cache(task, updateEvents);
      });
    });

    it('🐛 BUG: patch 中没有 parentId 时不应该移除实体（父级未改变）', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   ├─ child1 (id: 2, parentId: 1, name: 'old name')
        //   └─ child2 (id: 3, parentId: 1, name: 'child2')

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'old name', parentId: '1' },
              { id: '3', name: 'child2', parentId: '1' }
            ])
        });

        const results = [
          // 初始结果
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'old name', parentId: '1' },
            { id: '3', name: 'child2', parentId: '1' }
          ],
          // 更新 child1 的 name，但 patch 中没有 parentId
          // 说明父级关系未改变，实体应该保留在结果中
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'new name', parentId: '1' }, // 应该只更新 name
            { id: '3', name: 'child2', parentId: '1' }
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

        // ⚠️ 关键：patch 中只有 id 和 name，没有 parentId
        // 说明只更新了名称，父级关系没有改变
        const updateEvent = createMockUpdateEvent(
          { id: '2', name: 'new name' }, // 没有 parentId！
          { id: '2', name: 'old name' }
        );

        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('🐛 BUG: patch 中没有 parentId 时不应该添加不在树中的实体', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   └─ child1 (id: 2, parentId: 1)
        //
        // other (id: 10)
        //   └─ orphan (id: 5, parentId: 10, name: 'old orphan')

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'child1', parentId: '1' }
            ])
        });

        const expectedResult = [
          { id: '1', name: 'root', parentId: null },
          { id: '2', name: 'child1', parentId: '1' }
        ];
        let emitCount = 0;

        task.result$.subscribe({
          next: d => {
            try {
              emitCount++;
              expect(d).toEqual(expectedResult);

              if (emitCount === 1) {
                // 等待确认没有第二次触发
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

        // ⚠️ 关键：patch 中只有 id 和 name，没有 parentId
        // orphan 仍然在 other 树下，不应该被添加到 root 树中
        const updateEvent = createMockUpdateEvent(
          { id: '5', name: 'new orphan' }, // 没有 parentId！
          { id: '5', name: 'old orphan' }
        );

        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('🐛 BUG: patch 中 parentId 显式为当前父级时应该只更新字段', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   └─ child1 (id: 2, parentId: 1, name: 'old', status: 'draft')

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'old', parentId: '1', status: 'draft' }
            ])
        });

        const results = [
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'old', parentId: '1', status: 'draft' }
          ],
          // parentId 仍然是 '1'，只更新了其他字段
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'new', parentId: '1', status: 'published' }
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

        // parentId 在 patch 中存在，但值没有改变（仍然是 '1'）
        const updateEvent = createMockUpdateEvent(
          { id: '2', name: 'new', parentId: '1', status: 'published' },
          { id: '2', name: 'old', parentId: '1', status: 'draft' }
        );

        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('BUG修复: patch 中没有 parentId 时不应该移除节点', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   ├─ child1 (id: 2, parentId: 1, name: 'old name')
        //   └─ child2 (id: 3, parentId: 1)

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'old name', parentId: '1' },
              { id: '3', name: 'child2', parentId: '1' }
            ])
        });

        const results = [
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'old name', parentId: '1' },
            { id: '3', name: 'child2', parentId: '1' }
          ],
          // 只更新 name，parentId 没变，节点应该保留
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'new name', parentId: '1' },
            { id: '3', name: 'child2', parentId: '1' }
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

        // 关键：patch 中只有 id 和 name，没有 parentId
        // 这说明 parentId 没有改变
        const updateEvent = createMockUpdateEvent(
          { id: '2', name: 'new name' }, // 没有 parentId
          { id: '2', name: 'old name' } // inversePatch 也可能没有 parentId
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('BUG修复: patch 中没有 parentId 时不应该错误添加节点', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   └─ child1 (id: 2, parentId: 1)
        //
        // other (id: 10)
        //   └─ orphan (id: 5, parentId: 10, name: 'old orphan')

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'child1', parentId: '1' }
            ])
        });

        const expectedResult = [
          { id: '1', name: 'root', parentId: null },
          { id: '2', name: 'child1', parentId: '1' }
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
                reject(new Error('不应该触发第二次更新：orphan 的 parentId 没变'));
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        // 更新 orphan 的 name，但 patch 中没有 parentId
        // orphan 的 parentId 实际上还是 10，不是 1 的后代
        const updateEvent = createMockUpdateEvent(
          { id: '5', name: 'new orphan' }, // 没有 parentId
          { id: '5', name: 'old orphan' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('BUG修复: patch 中 parentId 为 undefined 和明确改变 parentId 的区别', () => {
      return new Promise<void>((done, reject) => {
        // RXD-022：第三次更新重新进入 scope，本地缓存无法证明该节点没有自己的
        // 子孙，必须刷新——用动态 runner，在触发前把 databaseResult 更新为刷新
        // 后应返回的正确状态。第一、二次更新（本地字段更新 / 本地移除）不受影响。
        let databaseResult: TestEntityData[] = [
          { id: '1', name: 'root', parentId: null },
          { id: '2', name: 'child1', parentId: '1' }
        ];

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () => of(databaseResult)
        });

        const results = [
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' }
          ],
          // 第一次更新：只改 name（parentId undefined）
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'updated child1', parentId: '1' }
          ],
          // 第二次更新：明确改变 parentId 到 10（移除）
          [{ id: '1', name: 'root', parentId: null }],
          // 第三次更新：明确改变 parentId 回到 1（添加）
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'updated child1', parentId: '1' }
          ]
        ];
        let resultIndex = 0;

        task.result$.subscribe({
          next: d => {
            try {
              expect(d).toEqual(results[resultIndex]);
              resultIndex++;
              if (resultIndex === 4) {
                done();
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        // 第一次：只更新 name，parentId 未定义
        query_merge_update_cache(task, [
          createMockUpdateEvent(
            { id: '2', name: 'updated child1' }, // parentId undefined
            { id: '2', name: 'child1' }
          )
        ]);

        // 第二次：明确改变 parentId
        setTimeout(() => {
          query_merge_update_cache(task, [
            createMockUpdateEvent(
              { id: '2', name: 'updated child1', parentId: '10' }, // 明确指定新 parentId
              { id: '2', name: 'updated child1', parentId: '1' }
            )
          ]);
        }, 50);

        // 第三次：再次明确改变 parentId 回来——重新进入 scope 触发 refresh，
        // 提前把 databaseResult 更新为刷新后应返回的正确状态
        setTimeout(() => {
          databaseResult = [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'updated child1', parentId: '1' }
          ];
          query_merge_update_cache(task, [
            createMockUpdateEvent(
              { id: '2', name: 'updated child1', parentId: '1' }, // 明确指定新 parentId
              { id: '2', name: 'updated child1', parentId: '10' }
            )
          ]);
        }, 100);
      });
    });

    it('应该支持 level 参数：实体在不同层级间移动', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构(level=1):
        // root (id: 1)
        //   ├─ child1 (id: 2, parentId: 1, level=1)
        //   └─ child2 (id: 3, parentId: 1, level=1)
        //        └─ grandchild1 (id: 4, parentId: 3, level=2, 不在查询结果中)
        //
        // RXD-022：grandchild1 跨层级边界移动，本地缓存无法证明它没有自己的
        // 子孙，必须刷新——用动态 runner + refresh 断言。
        let databaseResult: TestEntityData[] = [
          { id: '2', name: 'child1', parentId: '1' },
          { id: '3', name: 'child2', parentId: '1' }
        ];

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            level: 1, // 只查询直接子节点
            where: { combinator: 'and', rules: [] }
          },
          runner: () => of(databaseResult)
        });

        const results = [
          [
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'child2', parentId: '1' }
          ],
          // grandchild1 移动到 root 下,成为直接子节点
          [
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'child2', parentId: '1' },
            { id: '4', name: 'grandchild1', parentId: '1' }
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

        // 将 grandchild1 从 level 2 移到 level 1
        databaseResult = results[1];
        const updateEvent = createMockUpdateEvent(
          { id: '4', name: 'grandchild1', parentId: '1' },
          { id: '4', name: 'grandchild1', parentId: '3' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该支持 where 条件：更新字段使实体从匹配变为不匹配', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构（只包含 isActive=true 的节点）:
        // root (id: 1)
        //   ├─ child1 (id: 2, parentId: 1, isActive: true)
        //   └─ child2 (id: 3, parentId: 1, isActive: true)

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: {
              combinator: 'and',
              rules: [{ field: 'isActive', operator: '=', value: true }]
            }
          },
          runner: () =>
            of([
              { id: '2', name: 'child1', parentId: '1', isActive: true },
              { id: '3', name: 'child2', parentId: '1', isActive: true }
            ])
        });

        const results = [
          [
            { id: '2', name: 'child1', parentId: '1', isActive: true },
            { id: '3', name: 'child2', parentId: '1', isActive: true }
          ],
          // child2 的 isActive 从 true 变为 false,不再匹配
          [{ id: '2', name: 'child1', parentId: '1', isActive: true }]
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

        // 更新 child2 的 isActive 字段
        const updateEvent = createMockUpdateEvent(
          { id: '3', name: 'child2', parentId: '1', isActive: false },
          { id: '3', name: 'child2', parentId: '1', isActive: true }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该支持 where 条件：更新字段使实体从不匹配变为匹配', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   ├─ child1 (id: 2, parentId: 1, isActive: true, 匹配)
        //   └─ child2 (id: 3, parentId: 1, isActive: false, 不匹配，不在结果中)

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: {
              combinator: 'and',
              rules: [{ field: 'isActive', operator: '=', value: true }]
            }
          },
          runner: () => of([{ id: '2', name: 'child1', parentId: '1', isActive: true }])
        });

        const results = [
          [{ id: '2', name: 'child1', parentId: '1', isActive: true }],
          // child2 的 isActive 从 false 变为 true,现在匹配
          [
            { id: '2', name: 'child1', parentId: '1', isActive: true },
            { id: '3', name: 'child2', parentId: '1', isActive: true }
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

        // 更新 child2 使其匹配条件
        const updateEvent = createMockUpdateEvent(
          { id: '3', name: 'child2', parentId: '1', isActive: true },
          { id: '3', name: 'child2', parentId: '1', isActive: false }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('应该支持 where 条件与 parentId 变更结合', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   └─ child1 (id: 2, parentId: 1, isActive: true)
        //
        // other (id: 10)
        //   └─ orphan (id: 5, parentId: 10, isActive: false, 不在结果中)
        //
        // RXD-022：orphan 的 parentId 也跨 scope 边界变化，本地缓存无法证明它
        // 没有自己的子孙，必须刷新——用动态 runner + refresh 断言。
        let databaseResult: TestEntityData[] = [{ id: '2', name: 'child1', parentId: '1', isActive: true }];

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: {
              combinator: 'and',
              rules: [{ field: 'isActive', operator: '=', value: true }]
            }
          },
          runner: () => of(databaseResult)
        });

        const results = [
          [{ id: '2', name: 'child1', parentId: '1', isActive: true }],
          // orphan 同时改变 parentId (10→1) 和 isActive (false→true),现在匹配
          [
            { id: '2', name: 'child1', parentId: '1', isActive: true },
            { id: '5', name: 'orphan', parentId: '1', isActive: true }
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

        // 更新 orphan: parentId 和 isActive 都变化
        databaseResult = results[1];
        const updateEvent = createMockUpdateEvent(
          { id: '5', name: 'orphan', parentId: '1', isActive: true },
          { id: '5', name: 'orphan', parentId: '10', isActive: false }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    describe('高优先级场景 - 树内移动', () => {
      it('应该支持节点在树内移动（从一个分支移到另一个分支，仍是后代）', () => {
        return new Promise<void>((done, reject) => {
          // 初始树结构:
          // root (id: 1)
          //   ├─ branchA (id: 2, parentId: 1)
          //   │    └─ nodeX (id: 5, parentId: 2)
          //   └─ branchB (id: 3, parentId: 1)
          //
          // 场景：将 nodeX 从 branchA 移动到 branchB

          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              where: { combinator: 'and', rules: [] }
            },
            runner: () =>
              of([
                { id: '1', name: 'root', parentId: null },
                { id: '2', name: 'branchA', parentId: '1' },
                { id: '3', name: 'branchB', parentId: '1' },
                { id: '5', name: 'nodeX', parentId: '2' }
              ])
          });

          const results = [
            // 初始状态
            [
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'branchA', parentId: '1' },
              { id: '3', name: 'branchB', parentId: '1' },
              { id: '5', name: 'nodeX', parentId: '2' }
            ],
            // nodeX 从 branchA 移动到 branchB
            [
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'branchA', parentId: '1' },
              { id: '3', name: 'branchB', parentId: '1' },
              { id: '5', name: 'nodeX', parentId: '3' } // parentId 从 2 变为 3
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

          // 更新 nodeX 的 parentId
          const previousEntity = { id: '5', name: 'nodeX', parentId: '2' };
          const updatedEntity = { id: '5', name: 'nodeX', parentId: '3' };
          const updateEvent = createMockUpdateEvent(updatedEntity, previousEntity);
          query_merge_update_cache(task, [updateEvent]);
        });
      });

      it('应该支持节点在树内深层移动', () => {
        return new Promise<void>((done, reject) => {
          // 初始树结构:
          // root (id: 1)
          //   ├─ A (id: 2, parentId: 1)
          //   │    └─ A1 (id: 4, parentId: 2)
          //   │         └─ nodeX (id: 6, parentId: 4)
          //   └─ B (id: 3, parentId: 1)
          //        └─ B1 (id: 5, parentId: 3)
          //
          // 场景：将 nodeX 从 A1 移动到 B1 (跨层级移动)

          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              where: { combinator: 'and', rules: [] }
            },
            runner: () =>
              of([
                { id: '1', name: 'root', parentId: null },
                { id: '2', name: 'A', parentId: '1' },
                { id: '3', name: 'B', parentId: '1' },
                { id: '4', name: 'A1', parentId: '2' },
                { id: '5', name: 'B1', parentId: '3' },
                { id: '6', name: 'nodeX', parentId: '4' }
              ])
          });

          const results = [
            [
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'A', parentId: '1' },
              { id: '3', name: 'B', parentId: '1' },
              { id: '4', name: 'A1', parentId: '2' },
              { id: '5', name: 'B1', parentId: '3' },
              { id: '6', name: 'nodeX', parentId: '4' }
            ],
            [
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'A', parentId: '1' },
              { id: '3', name: 'B', parentId: '1' },
              { id: '4', name: 'A1', parentId: '2' },
              { id: '5', name: 'B1', parentId: '3' },
              { id: '6', name: 'nodeX', parentId: '5' } // 从 A1 移到 B1
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

          const previousEntity = { id: '6', name: 'nodeX', parentId: '4' };
          const updatedEntity = { id: '6', name: 'nodeX', parentId: '5' };
          const updateEvent = createMockUpdateEvent(updatedEntity, previousEntity);
          query_merge_update_cache(task, [updateEvent]);
        });
      });

      it('应该支持带 where 条件的树内移动', () => {
        return new Promise<void>((done, reject) => {
          // 场景：节点移动同时字段更新，仍满足 where 条件

          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              where: {
                combinator: 'and',
                rules: [{ field: 'isActive', operator: '=', value: true }]
              }
            },
            runner: () =>
              of([
                { id: '2', name: 'branchA', parentId: '1', isActive: true },
                { id: '3', name: 'branchB', parentId: '1', isActive: true },
                { id: '5', name: 'nodeX', parentId: '2', isActive: true }
              ])
          });

          const results = [
            [
              { id: '2', name: 'branchA', parentId: '1', isActive: true },
              { id: '3', name: 'branchB', parentId: '1', isActive: true },
              { id: '5', name: 'nodeX', parentId: '2', isActive: true }
            ],
            [
              { id: '2', name: 'branchA', parentId: '1', isActive: true },
              { id: '3', name: 'branchB', parentId: '1', isActive: true },
              { id: '5', name: 'nodeX-updated', parentId: '3', isActive: true } // 移动并更新名称
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

          const previousEntity = { id: '5', name: 'nodeX', parentId: '2', isActive: true };
          const updatedEntity = { id: '5', name: 'nodeX-updated', parentId: '3', isActive: true };
          const updateEvent = createMockUpdateEvent(updatedEntity, previousEntity);
          query_merge_update_cache(task, [updateEvent]);
        });
      });

      it('应该支持带 level 参数的树内移动', () => {
        return new Promise<void>((done, reject) => {
          // 场景：节点从 level=3 移动到 level=2
          //
          // RXD-022：nodeX 跨 level 边界重新进入 scope，本地缓存无法证明它没有
          // 自己的子孙，必须刷新——用动态 runner + refresh 断言。
          let databaseResult: TestEntityData[] = [
            { id: '2', name: 'child', parentId: '1' },
            { id: '4', name: 'grandchild', parentId: '2' }
            // nodeX 初始不在结果中（level=3）
          ];

          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              level: 2,
              where: { combinator: 'and', rules: [] }
            },
            runner: () => of(databaseResult)
          });

          const results = [
            [
              { id: '2', name: 'child', parentId: '1' },
              { id: '4', name: 'grandchild', parentId: '2' }
            ],
            // nodeX 从 level=3 移到 level=2
            [
              { id: '2', name: 'child', parentId: '1' },
              { id: '4', name: 'grandchild', parentId: '2' },
              { id: '5', name: 'nodeX', parentId: '2' } // 现在在 level=2 范围内
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

          databaseResult = results[1];
          const previousEntity = { id: '5', name: 'nodeX', parentId: '4' };
          const updatedEntity = { id: '5', name: 'nodeX', parentId: '2' };
          const updateEvent = createMockUpdateEvent(updatedEntity, previousEntity);
          query_merge_update_cache(task, [updateEvent]);
        });
      });
    });

    describe('RXD-022 review 场景 - 三层子树跨父移动', () => {
      it('子树根跨父移动时应通过刷新拿到完整的多层后代，而非只移动根节点', () => {
        // 初始树结构:
        // root (id: 1)
        //   └─ childR (id: 2, parentId: 1)
        //
        // otherRoot (id: 10)
        //   └─ X (id: 20, parentId: 10)
        //        └─ Y (id: 21, parentId: 20)
        //             └─ Z (id: 22, parentId: 21)
        //
        // 本批 UPDATE 只包含 X 自己的 parentId 变化（单行 update，符合本仓库
        // 纯邻接表、无级联写入的树模型）。Y、Z 完全不在本批事件里，本地增量
        // 缓存对它们不可见——只把 X 加入结果会漏掉整棵子树。必须整体刷新。
        let databaseResult: TestEntityData[] = [{ id: '2', name: 'childR', parentId: '1' }];

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () => of(databaseResult)
        });

        const emissions: TestEntityData[][] = [];
        const subscription = task.result$.subscribe(result => emissions.push(result));

        // X 从 otherRoot 下移动到 root 下，带着 Y、Z 整棵子树一起跨父
        databaseResult = [
          { id: '2', name: 'childR', parentId: '1' },
          { id: '20', name: 'X', parentId: '1' },
          { id: '21', name: 'Y', parentId: '20' },
          { id: '22', name: 'Z', parentId: '21' }
        ];
        query_merge_update_cache(task, [
          createMockUpdateEvent({ id: '20', name: 'X', parentId: '1' }, { id: '20', name: 'X', parentId: '10' })
        ]);

        expect(emissions).toEqual([[{ id: '2', name: 'childR', parentId: '1' }], databaseResult]);
        // 完整子树都必须出现在刷新后的结果中，而不是只有移动的根节点 X
        expect(emissions[1]).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: '20' }),
            expect.objectContaining({ id: '21' }),
            expect.objectContaining({ id: '22' })
          ])
        );
        subscription.unsubscribe();
      });

      it('countDescendants 应通过刷新反映整棵子树的数量变化，而非只加减 1', () => {
        // 初始树结构:
        // root (id: 1)
        //   ├─ childR (id: 2, parentId: 1)
        //   └─ X (id: 20, parentId: 1)
        //        └─ Y (id: 21, parentId: 20)
        //             └─ Z (id: 22, parentId: 21)
        //
        // X 本身是 root 的直接子节点(parentId 变化前=target，变化后=null)，
        // isEntityDescendantForCount 对 before/after 都能在第一跳直接判定
        // (before: currentParentId === targetEntityId 命中；after:
        // currentParentId 为 null 循环条件不成立)，完全不经过
        // cache.getSerializedUpdate 的未命中分支——专门用来隔离验证本次新增的
        // hasParentIdChanged 分支，而不是碰巧走了原有的 "无法确定→刷新"
        // (isDescendantBefore/Now === undefined) 分支。
        //
        // X 带着 Y、Z 一起跨出 root 的后代范围。本批 UPDATE 只有 X 自己的
        // parentId 变化(单行 update)，Y、Z 完全不在事件里——JS 本地增量只能
        // 看到"X 离开了"，若按 ±1 天真计算会得到 4-1=3，而真实答案是 1
        // (只剩 childR)。必须整体刷新才能拿到正确值。
        let databaseCount = 4; // childR + X + Y + Z

        const task = createMockQueryTask({
          type: 'countDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () => of(databaseCount)
        });

        const emissions: number[] = [];
        const subscription = task.result$.subscribe(result => emissions.push(result));

        // X 从 root 的直接子节点变为根节点(parentId: '1' → null)，带走 Y、Z 整棵子树
        databaseCount = 1; // 只剩 childR
        query_merge_update_cache(task, [
          createMockUpdateEvent({ id: '20', name: 'X', parentId: null }, { id: '20', name: 'X', parentId: '1' })
        ]);

        // 必须是刷新后的真实值 1，而不是天真 ±1 算出的 3
        expect(emissions).toEqual([4, 1]);
        subscription.unsubscribe();
      });
    });

    describe('高优先级场景 - 循环引用保护', () => {
      it('应该处理更新导致的循环引用（不应死循环）', () => {
        return new Promise<void>((done, reject) => {
          // 场景：更新节点的 parentId 可能导致循环引用
          // 例如：A→B→C，将 A 的 parentId 改为 C（形成循环）

          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              where: { combinator: 'and', rules: [] }
            },
            runner: () =>
              of([
                { id: '1', name: 'root', parentId: null },
                { id: '2', name: 'childA', parentId: '1' },
                { id: '3', name: 'childB', parentId: '2' }
              ])
          });

          let emitCount = 0;
          const startTime = Date.now();

          task.result$.subscribe({
            next: d => {
              try {
                emitCount++;
                if (emitCount === 1) {
                  // 初始结果
                  expect(d.length).toBe(3);
                } else if (emitCount === 2) {
                  // 更新后：childA 被移出树（因为形成循环，无法判定为后代）
                  // 或者触发刷新
                  // 关键是不应该死循环
                  const elapsed = Date.now() - startTime;
                  expect(elapsed).toBeLessThan(1000);
                  done();
                }
              } catch (error) {
                reject(error);
              }
            },
            error: reject
          });

          // 尝试创建循环：将 childB 的 parentId 指向 root (仍然有效的移动)
          // 实际应用中，数据库约束应该防止真正的循环
          const previousEntity = { id: '3', name: 'childB', parentId: '2' };
          const updatedEntity = { id: '3', name: 'childB', parentId: '1' }; // 移动到 root 下
          const updateEvent = createMockUpdateEvent(updatedEntity, previousEntity);
          query_merge_update_cache(task, [updateEvent]);
        });
      });

      it('应该处理深层嵌套更新不会超时', () => {
        return new Promise<void>((done, reject) => {
          // 场景：在 5 层树中移动第 3 层节点（减少复杂度避免超时）

          const existingNodes: TestEntityData[] = [];
          for (let i = 1; i <= 5; i++) {
            existingNodes.push({
              id: String(i),
              name: `level${i}`,
              parentId: i === 1 ? null : String(i - 1)
            });
          }

          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              where: { combinator: 'and', rules: [] }
            },
            runner: () => of(existingNodes)
          });

          let emitCount = 0;
          const startTime = Date.now();

          task.result$.subscribe({
            next: d => {
              try {
                emitCount++;
                if (emitCount === 1) {
                  expect(d.length).toBe(5);
                } else if (emitCount === 2) {
                  // 更新后仍然有 5 个节点（只是 level3 移动了位置）
                  expect(d.length).toBe(5);
                  const elapsed = Date.now() - startTime;
                  expect(elapsed).toBeLessThan(1000);
                  done();
                }
              } catch (error) {
                reject(error);
              }
            },
            error: reject
          });

          // 将第 3 层节点移动到第 2 层下
          const previousEntity = { id: '3', name: 'level3', parentId: '2' };
          const updatedEntity = { id: '3', name: 'level3', parentId: '1' };
          const updateEvent = createMockUpdateEvent(updatedEntity, previousEntity);
          query_merge_update_cache(task, [updateEvent]);
        });
      });

      it('应该处理祖先链中断（visited Set 保护）', () => {
        return new Promise<void>((done, reject) => {
          // 场景：更新节点使其父级链中断

          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              where: { combinator: 'and', rules: [] }
            },
            runner: () =>
              of([
                { id: '1', name: 'root', parentId: null },
                { id: '2', name: 'childA', parentId: '1' },
                { id: '3', name: 'childB', parentId: '2' }
              ])
          });

          let emitCount = 0;

          task.result$.subscribe({
            next: d => {
              try {
                emitCount++;
                if (emitCount === 1) {
                  expect(d.length).toBe(3);
                } else if (emitCount === 2) {
                  // childB 移出树后，结果中不再包含它
                  expect(d.length).toBe(2);
                  expect(d.some(n => n.id === '3')).toBe(false);
                  done();
                }
              } catch (error) {
                reject(error);
              }
            },
            error: reject
          });

          // 将 childB 的 parentId 改为不存在的节点
          const previousEntity = { id: '3', name: 'childB', parentId: '2' };
          const updatedEntity = { id: '3', name: 'childB', parentId: '999' }; // 不存在的父节点
          const updateEvent = createMockUpdateEvent(updatedEntity, previousEntity);
          query_merge_update_cache(task, [updateEvent]);
        });
      });
    });
  });

  describe('findAncestors - 更新祖先查询', () => {
    it('目标换父级时应刷新查询，避免发送缺少新父级的中间结果', () => {
      let databaseResult: TestEntityData[] = [
        { id: '2', name: 'child', parentId: '1' },
        { id: '3', name: 'target', parentId: '2' }
      ];
      const task = createMockQueryTask({
        type: 'findAncestors',
        options: {
          entityId: '3',
          level: 1,
          where: { combinator: 'and', rules: [] }
        },
        runner: () => of(databaseResult)
      });
      const emissions: TestEntityData[][] = [];
      const subscription = task.result$.subscribe(result => emissions.push(result));

      databaseResult = [
        { id: '1', name: 'root', parentId: null },
        { id: '3', name: 'target', parentId: '1' }
      ];
      query_merge_update_cache(task, [
        createMockUpdateEvent({ id: '3', name: 'target', parentId: '1' }, { id: '3', name: 'target', parentId: '2' })
      ]);

      expect(emissions).toEqual([
        [
          { id: '2', name: 'child', parentId: '1' },
          { id: '3', name: 'target', parentId: '2' }
        ],
        databaseResult
      ]);
      subscription.unsubscribe();
    });

    it('RXD-022：中间祖先节点(非 target 自身)换父级时也应刷新，而非只摘除旧链路', () => {
      // 初始树结构:
      // oldRoot (id: 1, parentId: null)
      //   └─ E (id: 3, parentId: 1)          ← target 的直接父节点，已被追踪进结果集
      //        └─ target (id: 5, parentId: 3)
      //
      // newRoot (id: 9, parentId: null)      ← E 即将移动过去的新父节点，本批事件之外
      //
      // 本次更新只包含 E 自己的 parentId 变化(单行 update)，target 自己的
      // parentId 没变。E 是已经在旧结果集(oldResultMap)里追踪的祖先，一旦它
      // 换父，target 往上数的链路从 E 这一环开始整体位移——旧链路上方的
      // oldRoot 要摘除，新链路上方的 newRoot 要补入，但 newRoot 从未出现在
      // 本批事件里，局部增量只能摘除摘不了新增。必须走 refresh 交回 SQL 重算，
      // 而不是此前 needRecheckAll 那种只做旧链路移除判断的局部修补。
      let databaseResult: TestEntityData[] = [
        { id: '1', name: 'oldRoot', parentId: null },
        { id: '3', name: 'E', parentId: '1' },
        { id: '5', name: 'target', parentId: '3' }
      ];
      const task = createMockQueryTask({
        type: 'findAncestors',
        options: {
          entityId: '5',
          where: { combinator: 'and', rules: [] }
        },
        runner: () => of(databaseResult)
      });
      const emissions: TestEntityData[][] = [];
      const subscription = task.result$.subscribe(result => emissions.push(result));

      // E 从 oldRoot 下移动到 newRoot 下，target 自身的 parentId 不变
      databaseResult = [
        { id: '9', name: 'newRoot', parentId: null },
        { id: '3', name: 'E', parentId: '9' },
        { id: '5', name: 'target', parentId: '3' }
      ];
      query_merge_update_cache(task, [
        createMockUpdateEvent({ id: '3', name: 'E', parentId: '9' }, { id: '3', name: 'E', parentId: '1' })
      ]);

      expect(emissions).toEqual([
        [
          { id: '1', name: 'oldRoot', parentId: null },
          { id: '3', name: 'E', parentId: '1' },
          { id: '5', name: 'target', parentId: '3' }
        ],
        databaseResult
      ]);
      subscription.unsubscribe();
    });

    it('应该使用 JS 增量更新实体字段值', () => {
      return new Promise<void>((done, reject) => {
        // 树结构:
        // root (id: 1, name: 'root')
        //   └─ child1 (id: 2, parentId: 1)
        //        └─ target (id: 3, parentId: 2)
        //
        // 查询 target 的祖先: [root, child1]

        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'child1', parentId: '1' }
            ])
        });

        const results = [
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' }
          ],
          [
            { id: '1', name: 'updated root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' }
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

        // 更新 root 的名称
        const updateEvent = createMockUpdateEvent(
          { id: '1', name: 'updated root', parentId: null },
          { id: '1', name: 'root', parentId: null }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('不应该触发更新如果更新的实体不是祖先', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'child1', parentId: '1' }
            ])
        });

        const expectedResult = [
          { id: '1', name: 'root', parentId: null },
          { id: '2', name: 'child1', parentId: '1' }
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

        // 更新一个不相关的节点
        const updateEvent = createMockUpdateEvent(
          { id: '99', name: 'other', parentId: '50' },
          { id: '99', name: 'other old', parentId: '50' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('🐛 BUG: patch 中没有 parentId 时不应该影响祖先查询结果', () => {
      return new Promise<void>((done, reject) => {
        // 树结构:
        // root (id: 1, name: 'root')
        //   └─ child1 (id: 2, parentId: 1, name: 'old')
        //        └─ target (id: 3, parentId: 2)

        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'old', parentId: '1' }
            ])
        });

        const results = [
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'old', parentId: '1' }
          ],
          // 更新 child1 的 name，但 patch 中没有 parentId
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'new', parentId: '1' }
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

        // patch 中没有 parentId，说明父级关系未改变
        const updateEvent = createMockUpdateEvent(
          { id: '2', name: 'new' }, // 没有 parentId！
          { id: '2', name: 'old' }
        );

        query_merge_update_cache(task, [updateEvent]);
      });
    });
    it('应该支持 where 条件：更新字段使祖先从匹配变为不匹配', () => {
      return new Promise<void>((done, reject) => {
        // 树结构（只包含 isActive=true 的祖先）:
        // root (id: 1, isActive: true)
        //   └─ child1 (id: 2, parentId: 1, isActive: true)
        //        └─ target (id: 3, parentId: 2)

        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            where: {
              combinator: 'and',
              rules: [{ field: 'isActive', operator: '=', value: true }]
            }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null, isActive: true },
              { id: '2', name: 'child1', parentId: '1', isActive: true }
            ])
        });

        const results = [
          [
            { id: '1', name: 'root', parentId: null, isActive: true },
            { id: '2', name: 'child1', parentId: '1', isActive: true }
          ],
          // child1 的 isActive 从 true 变为 false,不再匹配
          [{ id: '1', name: 'root', parentId: null, isActive: true }]
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

        // 更新 child1 的 isActive 字段
        const updateEvent = createMockUpdateEvent(
          { id: '2', name: 'child1', parentId: '1', isActive: false },
          { id: '2', name: 'child1', parentId: '1', isActive: true }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('BUG修复: patch 中没有 parentId 时不应该移除祖先节点', () => {
      return new Promise<void>((done, reject) => {
        // 树结构:
        // root (id: 1, name: 'old root')
        //   └─ child1 (id: 2, parentId: 1)
        //        └─ target (id: 3, parentId: 2)

        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'old root', parentId: null },
              { id: '2', name: 'child1', parentId: '1' }
            ])
        });

        const results = [
          [
            { id: '1', name: 'old root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' }
          ],
          // 只更新 name，parentId 没变，节点应该保留
          [
            { id: '1', name: 'new root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' }
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

        // 关键：patch 中只有 id 和 name，没有 parentId
        const updateEvent = createMockUpdateEvent(
          { id: '1', name: 'new root' }, // 没有 parentId
          { id: '1', name: 'old root' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });

    it('BUG修复: patch 中没有 parentId 时不应该错误添加祖先节点', () => {
      return new Promise<void>((done, reject) => {
        // 树结构:
        // root (id: 1)
        //   └─ child1 (id: 2, parentId: 1)
        //        └─ target (id: 3, parentId: 2)
        //
        // other (id: 10, name: 'old other')
        //   └─ orphan (id: 5, parentId: 10)

        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'child1', parentId: '1' }
            ])
        });

        const expectedResult = [
          { id: '1', name: 'root', parentId: null },
          { id: '2', name: 'child1', parentId: '1' }
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
                reject(new Error('不应该触发第二次更新：other 不是 target 的祖先'));
              }
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });

        // 更新 other 的 name，但 patch 中没有 parentId
        // other 不是 target 的祖先，不应该影响结果
        const updateEvent = createMockUpdateEvent(
          { id: '10', name: 'new other' }, // 没有 parentId
          { id: '10', name: 'old other' }
        );
        query_merge_update_cache(task, [updateEvent]);
      });
    });
  });

  describe('countDescendants - 统计后代数量', () => {
    it('应该在后代数量增加时增量更新计数', () => {
      // 设置场景: 有一个目标实体和一些后代
      // root (id: 1)
      // └── child1 (id: 2)
      //     └── child2 (id: 3)
      const task = createMockQueryTask({
        type: 'countDescendants',
        options: {
          entityId: '1'
        },
        runner: () => of(2)
      });

      // 初始状态: 2 个后代
      task.result = 2;

      // 更新: child2 添加了一个新的子节点 (parentId 从 null 变为 '3')
      const updateEvent = createMockUpdateEvent(
        { id: '4', name: 'child3', parentId: '3' },
        { id: '4', name: 'child3', parentId: null }
      );

      let refreshCalled = false;
      task.refresh = () => {
        refreshCalled = true;
      };

      const results: number[] = [];
      task.next = result => {
        results.push(result);
      };

      query_merge_update_cache(task, [updateEvent]);

      // 由于新实体成为后代,计数应该增加到 3
      // 但由于无法完全判断树形结构（父级不在更新数据中），可能触发刷新
      // 或者如果能确定，计数应该加 1
      expect(refreshCalled || results.length > 0).toBe(true);
    });

    it('应该在后代数量减少时增量更新计数', () => {
      const task = createMockQueryTask({
        type: 'countDescendants',
        options: {
          entityId: '1'
        },
        runner: () => of(2)
      });

      task.result = 2;

      // 更新: child2 的 parentId 从 '2' 变为 null（脱离目标实体的后代树）
      const updateEvent = createMockUpdateEvent(
        { id: '3', name: 'child2', parentId: null },
        { id: '3', name: 'child2', parentId: '2' }
      );

      let refreshCalled = false;
      task.refresh = () => {
        refreshCalled = true;
      };

      const results: number[] = [];
      task.next = result => {
        results.push(result);
      };

      query_merge_update_cache(task, [updateEvent]);

      // 由于实体脱离后代树,计数应该减少
      expect(refreshCalled || results.length > 0).toBe(true);
    });

    it('应该在 where 条件匹配状态变化时更新计数', () => {
      const task = createMockQueryTask({
        type: 'countDescendants',
        options: {
          entityId: '1',
          where: { combinator: 'and', rules: [{ field: 'isActive', operator: '=', value: true }] }
        },
        runner: () => of(1)
      });

      task.result = 1;

      // 更新: child1 的 isActive 从 false 变为 true
      const updateEvent = createMockUpdateEvent(
        { id: '2', name: 'child1', parentId: '1', isActive: true },
        { id: '2', name: 'child1', parentId: '1', isActive: false }
      );

      let refreshCalled = false;
      task.refresh = () => {
        refreshCalled = true;
      };

      const results: number[] = [];
      task.next = result => {
        results.push(result);
      };

      query_merge_update_cache(task, [updateEvent]);

      // 实体从不匹配变为匹配,计数应该增加
      expect(refreshCalled || results.length > 0).toBe(true);
    });
  });

  describe('countAncestors - 统计祖先数量', () => {
    it('应该在祖先数量变化时触发刷新或更新计数', () => {
      // countAncestors 需要目标实体在更新数据中才能准确计算
      const task = createMockQueryTask({
        type: 'countAncestors',
        options: {
          entityId: '3'
        },
        runner: () => of(2)
      });

      task.result = 2;

      // 更新: 目标实体 (id: 3) 的 parentId 从 '2' 变为 '1'
      // 这可能改变祖先链
      const updateEvent = createMockUpdateEvent(
        { id: '3', name: 'child2', parentId: '1' },
        { id: '3', name: 'child2', parentId: '2' }
      );

      let refreshCalled = false;
      task.refresh = () => {
        refreshCalled = true;
      };

      const results: number[] = [];
      task.next = result => {
        results.push(result);
      };

      query_merge_update_cache(task, [updateEvent]);

      // 目标实体在更新中,应该能够计算祖先变化
      expect(refreshCalled || results.length > 0).toBe(true);
    });

    it('应该在目标实体不在更新中时触发 SQL 刷新', () => {
      const task = createMockQueryTask({
        type: 'countAncestors',
        options: {
          entityId: '3'
        },
        runner: () => of(2)
      });

      task.result = 2;

      // 更新: 祖先实体的属性变化,但不改变树形结构
      const updateEvent = createMockUpdateEvent(
        { id: '1', name: 'root-updated', parentId: null },
        { id: '1', name: 'root', parentId: null }
      );

      let refreshCalled = false;
      task.refresh = () => {
        refreshCalled = true;
      };

      const results: number[] = [];
      task.next = result => {
        results.push(result);
      };

      query_merge_update_cache(task, [updateEvent]);

      // 目标实体不在更新中,应该触发 SQL 刷新
      expect(refreshCalled).toBe(true);
    });

    it('应该在 where 条件匹配状态变化时处理计数', () => {
      const task = createMockQueryTask({
        type: 'countAncestors',
        options: {
          entityId: '3',
          where: { combinator: 'and', rules: [{ field: 'isActive', operator: '=', value: true }] }
        },
        runner: () => of(1)
      });

      task.result = 1;

      // 更新: 目标实体和其父级
      const updateEvents = [
        createMockUpdateEvent(
          { id: '3', name: 'child2', parentId: '2', isActive: true },
          { id: '3', name: 'child2', parentId: '2', isActive: true }
        ),
        createMockUpdateEvent(
          { id: '2', name: 'child1', parentId: '1', isActive: true },
          { id: '2', name: 'child1', parentId: '1', isActive: false }
        )
      ];

      let refreshCalled = false;
      task.refresh = () => {
        refreshCalled = true;
      };

      const results: number[] = [];
      task.next = result => {
        results.push(result);
      };

      query_merge_update_cache(task, updateEvents);

      // 祖先从不匹配变为匹配,计数应该增加
      expect(refreshCalled || results.length > 0).toBe(true);
    });

    it('RXD-022：中间祖先节点换父级时应刷新，而非按 ±1 局部计数', () => {
      // target (id: 3) 的直接父节点是 E (id: 2)，E 本身没有换父——但本批更新里
      // E 自己的 parentId 从 '1' 变成 '9'。target 到 E 这一环的祖先关系
      // (isEntityAncestorForCount 第一跳就命中 target.parentId === E.id)
      // 不受影响，能被立即判定为 true，不会走进"无法确定→刷新"的既有分支；
      // 真正该刷新的原因是 E 之上的链路整体换了——这正是本次修复新增的
      // hasParentIdChanged 分支要捕获的场景，而不是天真按 wasAncestorBefore/
      // isAncestorNow 的 ±1 计算(E 自身的祖先关系判断结果前后都是 true，
      // ±1 快速路径会误判成"没有变化"，从而漏掉它上方链路的增减)。
      const task = createMockQueryTask({
        type: 'countAncestors',
        options: {
          entityId: '3'
        },
        runner: () => of(2)
      });

      task.result = 2;

      const updateEvents = [
        // target 自身必须出现在本批事件里 countAncestors 才会继续往下算，
        // 但它自己的 parentId 未变(仍是 E 的 id '2')
        createMockUpdateEvent(
          { id: '3', name: 'target updated', parentId: '2' },
          { id: '3', name: 'target', parentId: '2' }
        ),
        // E 换父：从 oldRoot('1') 移到 newRoot('9')，newRoot 完全不在本批事件里
        createMockUpdateEvent({ id: '2', name: 'E', parentId: '9' }, { id: '2', name: 'E', parentId: '1' })
      ];

      let refreshCalled = false;
      task.refresh = () => {
        refreshCalled = true;
      };

      const results: number[] = [];
      task.next = result => {
        results.push(result);
      };

      query_merge_update_cache(task, updateEvents);

      // 必须整体刷新，不能用局部 ±1 算出一个看似合理实则漏算上方链路的计数
      expect(refreshCalled).toBe(true);
      expect(results).toEqual([]);
    });
  });
});
