import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import query_merge_remove_cache_impl from '../../query/merge_remove.js';
import { QueryTask } from '../../repository/QueryTask.js';
import type { RxDBEntityLocalRemovedEventData } from '../../rxdb-events.js';
import { collectEmissions, createHarnessQueryTask, type HarnessTaskOptions } from '../fixtures/query-task-harness.js';

describe('query_merge_tree_remove_cache - REMOVE 事件的树形查询', () => {
  class TestEntity {
    [key: string]: unknown;
    static [ENTITY_STATIC_TYPES] = { idType: '' as string };
    id = '';
  }

  type TestEntityType = typeof TestEntity;
  type TestEntityData = InstanceType<TestEntityType>;
  type RemovedEvent = RxDBEntityLocalRemovedEventData<TestEntityType>;

  /** 经真正的 `QueryManager` 造查询任务，`result$` 与 `serialize` 全部来自生产代码。 */
  const createMockQueryTask = <RT>(
    taskOptions: HarnessTaskOptions<TestEntityType, RT>
  ): QueryTask<TestEntityType, RT> => createHarnessQueryTask(TestEntity, taskOptions);

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
      entity: 'Category',
      id: entity.id,
      entityType: TestEntity,
      recordAt: new Date(0),
      patch: null,
      inversePatch: entity
    };
  };

  describe('findDescendants - 删除后代查询', () => {
    it('应该删除根节点（entityId 为 null）', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root1 (id: 1, parentId: null)
        // root2 (id: 10, parentId: null)

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: null, // 查找所有根节点
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root1', parentId: null },
              { id: '10', name: 'root2', parentId: null }
            ])
        });

        const results = [
          // 初始结果：两个根节点
          [
            { id: '1', name: 'root1', parentId: null },
            { id: '10', name: 'root2', parentId: null }
          ],
          // 删除 root1 后
          [{ id: '10', name: 'root2', parentId: null }]
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

        // 删除 root1
        const removeEvent = createMockRemoveEvent({ id: '1', name: 'root1', parentId: null });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('应该删除所有根节点（不传 entityId）', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root1 (id: 1, parentId: null)
        // root2 (id: 10, parentId: null)

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            // 不传 entityId，应该查找所有根节点
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root1', parentId: null },
              { id: '10', name: 'root2', parentId: null }
            ])
        });

        const results = [
          // 初始结果：两个根节点
          [
            { id: '1', name: 'root1', parentId: null },
            { id: '10', name: 'root2', parentId: null }
          ],
          // 删除 root1 后
          [{ id: '10', name: 'root2', parentId: null }]
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

        // 删除 root1
        const removeEvent = createMockRemoveEvent({ id: '1', name: 'root1', parentId: null });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('不传 entityId 时，不应该删除非根节点', () => {
      const task = createMockQueryTask({
        type: 'findDescendants',
        options: {
          // 不传 entityId，应该只查找根节点
          where: { combinator: 'and', rules: [] }
        },
        runner: () =>
          of([
            { id: '1', name: 'root1', parentId: null },
            { id: '10', name: 'root2', parentId: null }
          ])
      });

      const expectedResult = [
        { id: '1', name: 'root1', parentId: null },
        { id: '10', name: 'root2', parentId: null }
      ];

      const emissions = collectEmissions(task);

      // 尝试删除一个子节点 (不是根节点，不应该影响结果)
      const childNode = createMockRemoveEvent({ id: '2', name: 'child1', parentId: '1' });
      query_merge_remove_cache(task, [childNode]);

      expect(emissions).toEqual([expectedResult]);
    });

    it('应该使用 JS 增量删除单个后代实体', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   ├─ child1 (id: 2, parentId: 1)
        //   └─ child2 (id: 3, parentId: 1)

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
          // 初始结果：包含根节点和所有后代
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'child2', parentId: '1' }
          ],
          // 删除 child1 后
          [
            { id: '1', name: 'root', parentId: null },
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

        // 删除 child1
        const removeEvent = createMockRemoveEvent({ id: '2', name: 'child1', parentId: '1' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('应该删除中间节点及其所有失去连接的后代', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   └─ child1 (id: 2, parentId: 1)
        //        ├─ grandchild1 (id: 3, parentId: 2)
        //        └─ grandchild2 (id: 4, parentId: 2)

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
              { id: '3', name: 'grandchild1', parentId: '2' },
              { id: '4', name: 'grandchild2', parentId: '2' }
            ])
        });

        const results = [
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'grandchild1', parentId: '2' },
            { id: '4', name: 'grandchild2', parentId: '2' }
          ],
          // 删除 child1 后,它的所有后代也失去到 root 的连接
          [{ id: '1', name: 'root', parentId: null }]
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

        // 删除 child1 (中间节点)
        const removeEvent = createMockRemoveEvent({ id: '2', name: 'child1', parentId: '1' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('应该删除中间节点但保留其他分支', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   ├─ child1 (id: 2, parentId: 1)
        //   │    └─ grandchild1 (id: 3, parentId: 2)
        //   └─ child2 (id: 4, parentId: 1)
        //        └─ grandchild2 (id: 5, parentId: 4)

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
              { id: '3', name: 'grandchild1', parentId: '2' },
              { id: '4', name: 'child2', parentId: '1' },
              { id: '5', name: 'grandchild2', parentId: '4' }
            ])
        });

        const results = [
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'grandchild1', parentId: '2' },
            { id: '4', name: 'child2', parentId: '1' },
            { id: '5', name: 'grandchild2', parentId: '4' }
          ],
          // 删除 child1 及其子树,但保留 child2 的分支
          [
            { id: '1', name: 'root', parentId: null },
            { id: '4', name: 'child2', parentId: '1' },
            { id: '5', name: 'grandchild2', parentId: '4' }
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

        // 删除 child1 (会连带删除 grandchild1)
        const removeEvent = createMockRemoveEvent({ id: '2', name: 'child1', parentId: '1' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('应该删除叶子节点而不影响其他节点', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   └─ child1 (id: 2, parentId: 1)
        //        ├─ grandchild1 (id: 3, parentId: 2)
        //        └─ grandchild2 (id: 4, parentId: 2)

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
              { id: '3', name: 'grandchild1', parentId: '2' },
              { id: '4', name: 'grandchild2', parentId: '2' }
            ])
        });

        const results = [
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'grandchild1', parentId: '2' },
            { id: '4', name: 'grandchild2', parentId: '2' }
          ],
          // 删除叶子节点 grandchild1
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '4', name: 'grandchild2', parentId: '2' }
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

        // 删除叶子节点 grandchild1
        const removeEvent = createMockRemoveEvent({ id: '3', name: 'grandchild1', parentId: '2' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('不应该触发更新如果删除的不是后代', () => {
      const task = createMockQueryTask({
        type: 'findDescendants',
        options: {
          entityId: '1',
          where: { combinator: 'and', rules: [] }
        },
        runner: () =>
          of([
            { id: '1', name: 'root', parentId: null }, // 包含根节点本身
            { id: '2', name: 'child1', parentId: '1' }
          ])
      });

      const expectedResult = [
        { id: '1', name: 'root', parentId: null },
        { id: '2', name: 'child1', parentId: '1' }
      ];

      const emissions = collectEmissions(task);

      // 删除一个不相关的节点
      const removeEvent = createMockRemoveEvent({ id: '99', name: 'other', parentId: '50' });
      query_merge_remove_cache(task, [removeEvent]);

      expect(emissions).toEqual([expectedResult]);
    });

    it('应该支持批量删除多个后代', () => {
      return new Promise<void>((done, reject) => {
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
              { id: '3', name: 'child2', parentId: '1' },
              { id: '4', name: 'child3', parentId: '1' }
            ])
        });

        const results = [
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'child2', parentId: '1' },
            { id: '4', name: 'child3', parentId: '1' }
          ],
          // 批量删除 child1 和 child3
          [
            { id: '1', name: 'root', parentId: null },
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

        // 批量删除多个节点
        const removeEvents = [
          createMockRemoveEvent({ id: '2', name: 'child1', parentId: '1' }),
          createMockRemoveEvent({ id: '4', name: 'child3', parentId: '1' })
        ];
        query_merge_remove_cache(task, removeEvents);
      });
    });

    it('应该支持 level 参数：level=1 时删除直接子节点', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   ├─ child1 (id: 2, parentId: 1, level=1)
        //   │    └─ grandchild1 (id: 3, parentId: 2, level=2)
        //   └─ child2 (id: 4, parentId: 1, level=1)

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            level: 1, // 只查询直接子节点
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '2', name: 'child1', parentId: '1' },
              { id: '4', name: 'child2', parentId: '1' }
              // level=1 不包含 grandchild1
            ])
        });

        const results = [
          [
            { id: '2', name: 'child1', parentId: '1' },
            { id: '4', name: 'child2', parentId: '1' }
          ],
          // 删除 child1 后，只剩 child2
          [{ id: '4', name: 'child2', parentId: '1' }]
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

        // 删除 child1
        const removeEvent = createMockRemoveEvent({ id: '2', name: 'child1', parentId: '1' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('应该支持 level 参数：level=2 时删除孙节点', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   └─ child1 (id: 2, parentId: 1, level=1)
        //        ├─ grandchild1 (id: 3, parentId: 2, level=2)
        //        └─ grandchild2 (id: 4, parentId: 2, level=2)

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            level: 2, // 查询到孙节点层级
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '2', name: 'child1', parentId: '1' },
              { id: '3', name: 'grandchild1', parentId: '2' },
              { id: '4', name: 'grandchild2', parentId: '2' }
            ])
        });

        const results = [
          [
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'grandchild1', parentId: '2' },
            { id: '4', name: 'grandchild2', parentId: '2' }
          ],
          // 删除 grandchild1 后
          [
            { id: '2', name: 'child1', parentId: '1' },
            { id: '4', name: 'grandchild2', parentId: '2' }
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

        // 删除 grandchild1
        const removeEvent = createMockRemoveEvent({ id: '3', name: 'grandchild1', parentId: '2' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('应该支持 where 条件：删除后正确过滤结果', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构（只包含 isActive=true 的节点）:
        // root (id: 1)
        //   ├─ child1 (id: 2, parentId: 1, isActive: true)
        //   ├─ child2 (id: 3, parentId: 1, isActive: true)
        //   └─ child3 (id: 4, parentId: 1, isActive: true)

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
              { id: '3', name: 'child2', parentId: '1', isActive: true },
              { id: '4', name: 'child3', parentId: '1', isActive: true }
            ])
        });

        const results = [
          [
            { id: '2', name: 'child1', parentId: '1', isActive: true },
            { id: '3', name: 'child2', parentId: '1', isActive: true },
            { id: '4', name: 'child3', parentId: '1', isActive: true }
          ],
          // 删除 child2 后
          [
            { id: '2', name: 'child1', parentId: '1', isActive: true },
            { id: '4', name: 'child3', parentId: '1', isActive: true }
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

        // 删除 child2
        const removeEvent = createMockRemoveEvent({ id: '3', name: 'child2', parentId: '1', isActive: true });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    describe('高优先级场景 - 删除目标实体本身', () => {
      it('应该删除目标实体本身，所有后代都应被移除', () => {
        return new Promise<void>((done, reject) => {
          // 初始树结构:
          // root (id: 1) ← 目标实体
          //   ├─ child1 (id: 2, parentId: 1)
          //   │    └─ grandchild1 (id: 3, parentId: 2)
          //   └─ child2 (id: 4, parentId: 1)
          //
          // 删除目标实体 root 后，所有后代都失去连接

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
                { id: '3', name: 'grandchild1', parentId: '2' },
                { id: '4', name: 'child2', parentId: '1' }
              ])
          });

          const results = [
            [
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'child1', parentId: '1' },
              { id: '3', name: 'grandchild1', parentId: '2' },
              { id: '4', name: 'child2', parentId: '1' }
            ],
            // 删除目标实体后，结果应该为空
            []
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

          // 删除目标实体本身
          const removeEvent = createMockRemoveEvent({ id: '1', name: 'root', parentId: null });
          query_merge_remove_cache(task, [removeEvent]);
        });
      });

      it('应该删除目标实体但不包括它的子树（如果子树不在结果中）', () => {
        return new Promise<void>((done, reject) => {
          // 场景：使用 level=0 只查询目标实体本身

          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              level: 0, // 只查询目标实体本身，不包括后代
              where: { combinator: 'and', rules: [] }
            },
            runner: () =>
              of([
                { id: '1', name: 'root', parentId: null } // 只有目标实体
                // 不包含子节点
              ])
          });

          const results = [
            [{ id: '1', name: 'root', parentId: null }],
            // 删除目标实体后，结果为空
            []
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

          const removeEvent = createMockRemoveEvent({ id: '1', name: 'root', parentId: null });
          query_merge_remove_cache(task, [removeEvent]);
        });
      });

      it('应该删除目标实体及其深层后代', () => {
        return new Promise<void>((done, reject) => {
          // 5 层树结构
          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              where: { combinator: 'and', rules: [] }
            },
            runner: () =>
              of([
                { id: '1', name: 'root', parentId: null },
                { id: '2', name: 'level1', parentId: '1' },
                { id: '3', name: 'level2', parentId: '2' },
                { id: '4', name: 'level3', parentId: '3' },
                { id: '5', name: 'level4', parentId: '4' }
              ])
          });

          const results = [
            [
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'level1', parentId: '1' },
              { id: '3', name: 'level2', parentId: '2' },
              { id: '4', name: 'level3', parentId: '3' },
              { id: '5', name: 'level4', parentId: '4' }
            ],
            []
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

          const removeEvent = createMockRemoveEvent({ id: '1', name: 'root', parentId: null });
          query_merge_remove_cache(task, [removeEvent]);
        });
      });

      it('应该删除目标实体时考虑 where 条件', () => {
        return new Promise<void>((done, reject) => {
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
                { id: '1', name: 'root', parentId: null, isActive: true },
                { id: '2', name: 'child1', parentId: '1', isActive: true }
              ])
          });

          const results = [
            [
              { id: '1', name: 'root', parentId: null, isActive: true },
              { id: '2', name: 'child1', parentId: '1', isActive: true }
            ],
            []
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

          const removeEvent = createMockRemoveEvent({ id: '1', name: 'root', parentId: null, isActive: true });
          query_merge_remove_cache(task, [removeEvent]);
        });
      });
    });
  });

  describe('findAncestors - 删除祖先查询', () => {
    it('应该使用 JS 增量删除单个祖先实体', () => {
      return new Promise<void>((done, reject) => {
        // 树结构:
        // root (id: 1)
        //   └─ child1 (id: 2, parentId: 1)
        //        └─ target (id: 3, parentId: 2)
        //
        // 查询 target 的祖先: [target, child1, root]

        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '3', name: 'target', parentId: '2' }, // 包含目标节点本身
              { id: '2', name: 'child1', parentId: '1' },
              { id: '1', name: 'root', parentId: null }
            ])
        });

        const results = [
          [
            { id: '3', name: 'target', parentId: '2' },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '1', name: 'root', parentId: null }
          ],
          // 删除 child1 (直接父级)
          [
            { id: '3', name: 'target', parentId: '2' },
            { id: '1', name: 'root', parentId: null }
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

        // 删除 child1
        const removeEvent = createMockRemoveEvent({ id: '2', name: 'child1', parentId: '1' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('应该删除根节点祖先', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '3', name: 'target', parentId: '2' }, // 包含目标节点本身
              { id: '2', name: 'child1', parentId: '1' },
              { id: '1', name: 'root', parentId: null }
            ])
        });

        const results = [
          [
            { id: '3', name: 'target', parentId: '2' },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '1', name: 'root', parentId: null }
          ],
          // 删除 root
          [
            { id: '3', name: 'target', parentId: '2' },
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

        // 删除 root
        const removeEvent = createMockRemoveEvent({ id: '1', name: 'root', parentId: null });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('不应该触发更新如果删除的不是祖先', () => {
      const task = createMockQueryTask({
        type: 'findAncestors',
        options: {
          entityId: '3',
          where: { combinator: 'and', rules: [] }
        },
        runner: () =>
          of([
            { id: '3', name: 'target', parentId: '2' }, // 包含目标节点本身
            { id: '2', name: 'child1', parentId: '1' },
            { id: '1', name: 'root', parentId: null }
          ])
      });

      const expectedResult = [
        { id: '3', name: 'target', parentId: '2' },
        { id: '2', name: 'child1', parentId: '1' },
        { id: '1', name: 'root', parentId: null }
      ];

      const emissions = collectEmissions(task);

      // 删除一个不相关的节点
      const removeEvent = createMockRemoveEvent({ id: '99', name: 'other', parentId: '50' });
      query_merge_remove_cache(task, [removeEvent]);

      expect(emissions).toEqual([expectedResult]);
    });

    it('应该支持批量删除多个祖先', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '4',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'child1', parentId: '1' },
              { id: '3', name: 'child2', parentId: '2' }
            ])
        });

        const results = [
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'child2', parentId: '2' }
          ],
          // 批量删除 root 和 child2
          [{ id: '2', name: 'child1', parentId: '1' }]
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

        // 批量删除多个祖先
        const removeEvents = [
          createMockRemoveEvent({ id: '1', name: 'root', parentId: null }),
          createMockRemoveEvent({ id: '3', name: 'child2', parentId: '2' })
        ];
        query_merge_remove_cache(task, removeEvents);
      });
    });

    it('应该支持 level 参数：level=1 时删除直接父级', () => {
      return new Promise<void>((done, reject) => {
        // 树结构:
        // root (id: 1)
        //   └─ child1 (id: 2, parentId: 1, level=1 相对于 target)
        //        └─ target (id: 3, parentId: 2)
        //
        // 查询 target 的祖先(level=1): [child1]

        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            level: 1, // 只查询直接父级
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '2', name: 'child1', parentId: '1' }
              // level=1 不包含 root
            ])
        });

        const results = [
          [{ id: '2', name: 'child1', parentId: '1' }],
          // 删除 child1 后，没有祖先了
          []
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

        // 删除 child1
        const removeEvent = createMockRemoveEvent({ id: '2', name: 'child1', parentId: '1' });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    it('应该支持 where 条件：删除后正确过滤祖先', () => {
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
          // 删除 child1 后
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

        // 删除 child1
        const removeEvent = createMockRemoveEvent({ id: '2', name: 'child1', parentId: '1', isActive: true });
        query_merge_remove_cache(task, [removeEvent]);
      });
    });

    describe('高优先级场景 - 删除目标实体本身', () => {
      it('应该删除目标实体本身，结果应该清空', () => {
        return new Promise<void>((done, reject) => {
          // 树结构:
          // root (id: 1)
          //   └─ child1 (id: 2, parentId: 1)
          //        └─ target (id: 3, parentId: 2) ← 目标实体
          //
          // 删除目标实体后，祖先查询结果应该为空

          const task = createMockQueryTask({
            type: 'findAncestors',
            options: {
              entityId: '3',
              where: { combinator: 'and', rules: [] }
            },
            runner: () =>
              of([
                { id: '3', name: 'target', parentId: '2' }, // 包含目标节点本身
                { id: '2', name: 'child1', parentId: '1' },
                { id: '1', name: 'root', parentId: null }
              ])
          });

          const results = [
            [
              { id: '3', name: 'target', parentId: '2' },
              { id: '2', name: 'child1', parentId: '1' },
              { id: '1', name: 'root', parentId: null }
            ],
            // 删除目标实体后，结果应该为空（祖先查询依赖目标实体存在）
            [
              { id: '2', name: 'child1', parentId: '1' },
              { id: '1', name: 'root', parentId: null }
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

          // 删除目标实体本身
          const removeEvent = createMockRemoveEvent({ id: '3', name: 'target', parentId: '2' });
          query_merge_remove_cache(task, [removeEvent]);
        });
      });

      it('应该删除目标实体（根节点）', () => {
        return new Promise<void>((done, reject) => {
          // 场景：查询根节点的祖先（只有它自己）

          const task = createMockQueryTask({
            type: 'findAncestors',
            options: {
              entityId: '1',
              where: { combinator: 'and', rules: [] }
            },
            runner: () =>
              of([
                { id: '1', name: 'root', parentId: null } // 根节点没有祖先，只有自己
              ])
          });

          const results = [
            [{ id: '1', name: 'root', parentId: null }],
            // 删除根节点后，结果为空
            []
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

          const removeEvent = createMockRemoveEvent({ id: '1', name: 'root', parentId: null });
          query_merge_remove_cache(task, [removeEvent]);
        });
      });

      it('应该删除目标实体时考虑 where 条件', () => {
        return new Promise<void>((done, reject) => {
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
                { id: '3', name: 'target', parentId: '2', isActive: true },
                { id: '2', name: 'child1', parentId: '1', isActive: true },
                { id: '1', name: 'root', parentId: null, isActive: true }
              ])
          });

          const results = [
            [
              { id: '3', name: 'target', parentId: '2', isActive: true },
              { id: '2', name: 'child1', parentId: '1', isActive: true },
              { id: '1', name: 'root', parentId: null, isActive: true }
            ],
            [
              { id: '2', name: 'child1', parentId: '1', isActive: true },
              { id: '1', name: 'root', parentId: null, isActive: true }
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

          const removeEvent = createMockRemoveEvent({ id: '3', name: 'target', parentId: '2', isActive: true });
          query_merge_remove_cache(task, [removeEvent]);
        });
      });

      it('应该删除目标实体时支持 level 参数', () => {
        // 场景：只查询 level=1 的直接父级
        // 目标实体不在结果中，删除目标实体不应该触发更新

        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            level: 1,
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '2', name: 'child1', parentId: '1' } // 只有直接父级
              // 不包含 root 和 target
            ])
        });

        const emissions = collectEmissions(task);

        // 删除目标实体（不在结果中）
        const removeEvent = createMockRemoveEvent({ id: '3', name: 'target', parentId: '2' });
        query_merge_remove_cache(task, [removeEvent]);

        expect(emissions).toEqual([[{ id: '2', name: 'child1', parentId: '1' }]]);
      });
    });
  });
});
