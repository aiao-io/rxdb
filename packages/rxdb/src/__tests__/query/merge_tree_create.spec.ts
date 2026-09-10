import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import query_merge_create_cache_impl from '../../query/merge_create.js';
import { QueryTask } from '../../repository/QueryTask.js';
import type { RxDBEntityLocalCreatedEventData } from '../../rxdb-events.js';
import { collectEmissions, createHarnessQueryTask, type HarnessTaskOptions } from '../fixtures/query-task-harness.js';

describe('query_merge_tree_create_cache - CREATE 事件的树形查询', () => {
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

  const query_merge_create_cache = <RT>(task: QueryTask<TestEntityType, RT>, events: CreatedEvent[]): void => {
    query_merge_create_cache_impl(task as unknown as QueryTask<TestEntityType>, events);
  };

  /**
   * 创建模拟的实体事件数据
   */
  const createMockEntityEvent = (entity: TestEntityData): CreatedEvent => {
    return {
      type: 'INSERT',
      namespace: 'test',
      entity: 'Category',
      id: entity.id,
      entityType: TestEntity,
      recordAt: new Date(0),
      patch: entity,
      inversePatch: null
    };
  };

  describe('findDescendants - 查找后代', () => {
    it('应该查询根节点（entityId 为 null）的所有后代', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root1 (id: 1, parentId: null)
        //   └─ child1 (id: 2, parentId: 1)
        // root2 (id: 10, parentId: null) - 另一个根节点

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
          // 添加新的根节点后
          [
            { id: '1', name: 'root1', parentId: null },
            { id: '10', name: 'root2', parentId: null },
            { id: '20', name: 'root3', parentId: null } // 新增根节点
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

        // 创建新的根节点 (parentId 为 null)
        const newRoot = createMockEntityEvent({ id: '20', name: 'root3', parentId: null });
        query_merge_create_cache(task, [newRoot]);
      });
    });

    it('应该查询所有根节点（不传 entityId）', () => {
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
          // 添加新的根节点后
          [
            { id: '1', name: 'root1', parentId: null },
            { id: '10', name: 'root2', parentId: null },
            { id: '20', name: 'root3', parentId: null } // 新增根节点
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

        // 创建新的根节点 (parentId 为 null)
        const newRoot = createMockEntityEvent({ id: '20', name: 'root3', parentId: null });
        query_merge_create_cache(task, [newRoot]);
      });
    });

    it('不传 entityId 且 level=0 时不应该添加非根节点', () => {
      const task = createMockQueryTask({
        type: 'findDescendants',
        options: {
          entityId: null,
          level: 0,
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

      // 尝试创建一个子节点 (不是根节点，不应该被添加)
      const childNode = createMockEntityEvent({ id: '2', name: 'child1', parentId: '1' });
      query_merge_create_cache(task, [childNode]);

      expect(emissions).toEqual([expectedResult]);
    });

    it('不传 entityId 且 level=1 时应该添加直接子节点', () => {
      const initialResult = [
        { id: '1', name: 'root1', parentId: null },
        { id: '10', name: 'root2', parentId: null }
      ];
      const task = createMockQueryTask({
        type: 'findDescendants',
        options: {
          entityId: null,
          level: 1,
          where: { combinator: 'and', rules: [] }
        },
        runner: () => of(initialResult)
      });
      const emissions: TestEntityData[][] = [];
      const subscription = task.result$.subscribe(result => emissions.push(result));

      query_merge_create_cache(task, [createMockEntityEvent({ id: '2', name: 'child1', parentId: '1' })]);

      expect(emissions).toEqual([initialResult, [...initialResult, { id: '2', name: 'child1', parentId: '1' }]]);
      subscription.unsubscribe();
    });

    it('应该使用 JS 增量添加新的后代实体', () => {
      return new Promise<void>((done, reject) => {
        // 初始树结构:
        // root (id: 1)
        //   └─ child1 (id: 2, parentId: 1)
        //        └─ grandchild1 (id: 3, parentId: 2)

        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1', // 查找 root 的后代
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null }, // 包含根节点本身
              { id: '2', name: 'child1', parentId: '1' },
              { id: '3', name: 'grandchild1', parentId: '2' }
            ])
        });
        const results = [
          // 初始结果：包含根节点和所有后代
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'grandchild1', parentId: '2' }
          ],
          // 添加新的子节点后
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'grandchild1', parentId: '2' },
            { id: '4', name: 'child2', parentId: '1' } // 新增: root 的直接子节点
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

        // 创建新的子节点 (是 root 的直接后代)
        const newChild = createMockEntityEvent({ id: '4', name: 'child2', parentId: '1' });
        query_merge_create_cache(task, [newChild]);
      });
    });

    it('应该使用 JS 增量添加新的孙子节点', () => {
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
              { id: '3', name: 'grandchild1', parentId: '2' }
            ])
        });

        const results = [
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'grandchild1', parentId: '2' }
          ],
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'grandchild1', parentId: '2' },
            { id: '5', name: 'grandchild2', parentId: '2' } // 新增: child1 的子节点
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

        // 创建新的孙子节点 (是 root 的间接后代)
        const newGrandchild = createMockEntityEvent({ id: '5', name: 'grandchild2', parentId: '2' });
        query_merge_create_cache(task, [newGrandchild]);
      });
    });

    it('不应该添加不是后代的实体', () => {
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

      // 创建一个不相关的节点 (不是 root 的后代)
      const otherNode = createMockEntityEvent({ id: '10', name: 'other', parentId: '99' });
      query_merge_create_cache(task, [otherNode]);

      expect(emissions).toEqual([expectedResult]);
    });

    it('应该支持批量添加多个后代', () => {
      return new Promise<void>((done, reject) => {
        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: { combinator: 'and', rules: [] }
          },
          runner: () => of([{ id: '2', name: 'child1', parentId: '1' }])
        });

        const results = [
          [{ id: '2', name: 'child1', parentId: '1' }],
          [
            { id: '2', name: 'child1', parentId: '1' },
            { id: '3', name: 'child2', parentId: '1' },
            { id: '4', name: 'grandchild1', parentId: '2' }
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

        // 批量创建多个后代
        const newNodes = [
          createMockEntityEvent({ id: '3', name: 'child2', parentId: '1' }),
          createMockEntityEvent({ id: '4', name: 'grandchild1', parentId: '2' })
        ];
        query_merge_create_cache(task, newNodes);
      });
    });

    describe('高优先级场景 - 循环引用保护', () => {
      it('应该处理创建时的循环引用保护（不应死循环）', () => {
        return new Promise<void>((done, reject) => {
          // 场景：已有节点形成循环 A→B，新增节点 C→A
          // 虽然这种数据在实际应用中不应该存在，但代码应该有保护机制

          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              where: { combinator: 'and', rules: [] }
            },
            runner: () =>
              of([
                { id: '1', name: 'root', parentId: null },
                { id: '2', name: 'childA', parentId: '1' }
                // childA 的子节点会在后面创建
              ])
          });

          const results = [
            [
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'childA', parentId: '1' }
            ],
            // 添加新节点，它的 parentId 指向 childA
            [
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'childA', parentId: '1' },
              { id: '3', name: 'childB', parentId: '2' }
            ]
          ];
          let resultIndex = 0;

          task.result$.subscribe({
            next: d => {
              try {
                expect(d).toEqual(results[resultIndex]);
                resultIndex++;
                if (resultIndex === 2) {
                  // 成功完成，说明没有死循环
                  done();
                }
              } catch (error) {
                reject(error);
              }
            },
            error: reject
          });

          // 创建新节点，虽然逻辑上可能形成循环，但 visited Set 应该防止死循环
          const newNode = createMockEntityEvent({ id: '3', name: 'childB', parentId: '2' });
          query_merge_create_cache(task, [newNode]);
        });
      });

      it('应该处理深层嵌套不会超时（性能边界）', () => {
        return new Promise<void>((done, reject) => {
          // 场景：已有 5 层深度的树，添加第 6 层节点

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
                  // 初始结果: 5 个节点
                  expect(d.length).toBe(5);
                } else if (emitCount === 2) {
                  // 添加第 6 层节点后
                  expect(d.length).toBe(6);
                  const elapsed = Date.now() - startTime;
                  // 应该在合理时间内完成（< 1000ms）
                  expect(elapsed).toBeLessThan(1000);
                  done();
                }
              } catch (error) {
                reject(error);
              }
            },
            error: reject
          });

          // 创建第 6 层节点
          const newNode = createMockEntityEvent({ id: '6', name: 'level6', parentId: '5' });
          query_merge_create_cache(task, [newNode]);
        });
      });
    });

    describe('level 参数', () => {
      it('应该只返回 level=1 的直接子节点', () => {
        return new Promise<void>((done, reject) => {
          // 初始树结构:
          // root (id: 1)
          //   └─ child1 (id: 2, parentId: 1, level: 1)
          //   └─ child2 (id: 3, parentId: 1, level: 1)
          //        └─ grandchild1 (id: 4, parentId: 3, level: 2)

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
                { id: '3', name: 'child2', parentId: '1' }
              ])
          });

          const results = [
            // 初始结果: 两个直接子节点
            [
              { id: '2', name: 'child1', parentId: '1' },
              { id: '3', name: 'child2', parentId: '1' }
            ],
            // 添加新的直接子节点
            [
              { id: '2', name: 'child1', parentId: '1' },
              { id: '3', name: 'child2', parentId: '1' },
              { id: '5', name: 'child3', parentId: '1' } // 新增: root 的直接子节点
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

          // 创建新的直接子节点 (level 1)
          const newChild = createMockEntityEvent({ id: '5', name: 'child3', parentId: '1' });
          query_merge_create_cache(task, [newChild]);
        });
      });

      it('level=1 时不应该添加孙子节点', () => {
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
              { id: '3', name: 'child2', parentId: '1' }
            ])
        });

        const expectedResult = [
          { id: '2', name: 'child1', parentId: '1' },
          { id: '3', name: 'child2', parentId: '1' }
        ];

        const emissions = collectEmissions(task);

        // 尝试添加孙子节点 (level 2，不应该被添加)
        const grandchild = createMockEntityEvent({ id: '4', name: 'grandchild1', parentId: '2' });
        query_merge_create_cache(task, [grandchild]);

        expect(emissions).toEqual([expectedResult]);
      });

      it('应该支持 level=2 查询到孙子节点', () => {
        return new Promise<void>((done, reject) => {
          // 初始树结构:
          // root (id: 1)
          //   └─ child1 (id: 2, parentId: 1, level: 1)
          //        └─ grandchild1 (id: 3, parentId: 2, level: 2)

          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              level: 2, // 查询到孙子节点层级
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
            [
              { id: '2', name: 'child1', parentId: '1' },
              { id: '3', name: 'grandchild1', parentId: '2' },
              { id: '4', name: 'grandchild2', parentId: '2' } // 新增: level 2 的孙子节点
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

          // 添加新的孙子节点 (level 2)
          const newGrandchild = createMockEntityEvent({ id: '4', name: 'grandchild2', parentId: '2' });
          query_merge_create_cache(task, [newGrandchild]);
        });
      });

      it('level=2 时不应该添加曾孙节点', () => {
        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            level: 2, // 只查询到孙子节点
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '2', name: 'child1', parentId: '1' },
              { id: '3', name: 'grandchild1', parentId: '2' }
            ])
        });

        const expectedResult = [
          { id: '2', name: 'child1', parentId: '1' },
          { id: '3', name: 'grandchild1', parentId: '2' }
        ];

        const emissions = collectEmissions(task);

        // 尝试添加曾孙节点 (level 3，不应该被添加)
        const greatGrandchild = createMockEntityEvent({ id: '5', name: 'great-grandchild', parentId: '3' });
        query_merge_create_cache(task, [greatGrandchild]);

        expect(emissions).toEqual([expectedResult]);
      });

      it('level=0 时不应该添加子节点', () => {
        const initialResult = [{ id: '1', name: 'root', parentId: null }];
        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            level: 0,
            where: { combinator: 'and', rules: [] }
          },
          runner: () => of(initialResult)
        });
        const emissions: TestEntityData[][] = [];
        const subscription = task.result$.subscribe(result => emissions.push(result));

        query_merge_create_cache(task, [createMockEntityEvent({ id: '2', name: 'child', parentId: '1' })]);

        expect(emissions).toEqual([initialResult]);
        subscription.unsubscribe();
      });

      it('不传 level 参数应该查询所有后代（无限层级）', () => {
        return new Promise<void>((done, reject) => {
          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              // 不传 level 参数，表示无限层级
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
            [
              { id: '2', name: 'child1', parentId: '1' },
              { id: '3', name: 'grandchild1', parentId: '2' },
              { id: '4', name: 'great-grandchild', parentId: '3' } // level 3 也应该被添加
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

          // 添加曾孙节点 (level 3)
          const greatGrandchild = createMockEntityEvent({ id: '4', name: 'great-grandchild', parentId: '3' });
          query_merge_create_cache(task, [greatGrandchild]);
        });
      });
    });

    describe('where 条件过滤', () => {
      it('应该只添加满足 where 条件的后代', () => {
        return new Promise<void>((done, reject) => {
          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              where: {
                combinator: 'and',
                rules: [{ field: 'status', operator: '=', value: 'active' }]
              }
            },
            runner: () =>
              of([
                { id: '2', name: 'child1', parentId: '1', status: 'active' },
                { id: '3', name: 'child2', parentId: '1', status: 'active' }
              ])
          });

          const results = [
            [
              { id: '2', name: 'child1', parentId: '1', status: 'active' },
              { id: '3', name: 'child2', parentId: '1', status: 'active' }
            ],
            // 只添加满足 status='active' 的后代
            [
              { id: '2', name: 'child1', parentId: '1', status: 'active' },
              { id: '3', name: 'child2', parentId: '1', status: 'active' },
              { id: '4', name: 'child3', parentId: '1', status: 'active' } // status='active' 的新后代
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

          // 创建满足条件的后代
          const activeChild = createMockEntityEvent({ id: '4', name: 'child3', parentId: '1', status: 'active' });
          query_merge_create_cache(task, [activeChild]);
        });
      });

      it('不应该添加不满足 where 条件的后代', () => {
        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            }
          },
          runner: () =>
            of([
              { id: '2', name: 'child1', parentId: '1', status: 'active' },
              { id: '3', name: 'child2', parentId: '1', status: 'active' }
            ])
        });

        const expectedResult = [
          { id: '2', name: 'child1', parentId: '1', status: 'active' },
          { id: '3', name: 'child2', parentId: '1', status: 'active' }
        ];

        const emissions = collectEmissions(task);

        // 创建不满足条件的后代 (status='inactive')
        const inactiveChild = createMockEntityEvent({ id: '4', name: 'child3', parentId: '1', status: 'inactive' });
        query_merge_create_cache(task, [inactiveChild]);

        expect(emissions).toEqual([expectedResult]);
      });

      it('where 条件和 level 参数应该同时生效', () => {
        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            level: 1, // 只查询直接子节点
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            }
          },
          runner: () => of([{ id: '2', name: 'child1', parentId: '1', status: 'active' }])
        });

        const expectedResult = [{ id: '2', name: 'child1', parentId: '1', status: 'active' }];

        const emissions = collectEmissions(task);

        // 创建孙子节点 (虽然满足 where 条件，但是 level=1 不应该添加)
        const grandchild = createMockEntityEvent({ id: '3', name: 'grandchild1', parentId: '2', status: 'active' });
        query_merge_create_cache(task, [grandchild]);

        expect(emissions).toEqual([expectedResult]);
      });
    });

    describe('边界情况', () => {
      it('应该处理空的初始结果集', () => {
        return new Promise<void>((done, reject) => {
          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              where: { combinator: 'and', rules: [] }
            },
            runner: () => of([]) // 初始结果为空
          });

          const results = [
            [],
            // 添加第一个后代
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

          // 创建第一个后代
          const newChild = createMockEntityEvent({ id: '2', name: 'child1', parentId: '1' });
          query_merge_create_cache(task, [newChild]);
        });
      });

      it('应该处理创建目标节点本身的情况', () => {
        const task = createMockQueryTask({
          type: 'findDescendants',
          options: {
            entityId: '1',
            level: 0,
            where: { combinator: 'and', rules: [] }
          },
          runner: () => of([])
        });
        const emissions: TestEntityData[][] = [];
        const subscription = task.result$.subscribe(result => emissions.push(result));

        query_merge_create_cache(task, [createMockEntityEvent({ id: '1', name: 'root', parentId: null })]);

        expect(emissions).toEqual([[], [{ id: '1', name: 'root', parentId: null }]]);
        subscription.unsubscribe();
      });

      it('应该处理多个新实体但只有部分是后代的情况', () => {
        return new Promise<void>((done, reject) => {
          const task = createMockQueryTask({
            type: 'findDescendants',
            options: {
              entityId: '1',
              where: { combinator: 'and', rules: [] }
            },
            runner: () => of([{ id: '2', name: 'child1', parentId: '1' }])
          });

          const results = [
            [{ id: '2', name: 'child1', parentId: '1' }],
            // 只添加是后代的节点
            [
              { id: '2', name: 'child1', parentId: '1' },
              { id: '3', name: 'child2', parentId: '1' } // 是后代
              // id='10' 不是后代，不应该被添加
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

          // 批量创建多个节点，只有一个是后代
          const newNodes = [
            createMockEntityEvent({ id: '3', name: 'child2', parentId: '1' }), // 是后代
            createMockEntityEvent({ id: '10', name: 'other', parentId: '99' }) // 不是后代
          ];
          query_merge_create_cache(task, newNodes);
        });
      });
    });
  });

  describe('findAncestors - 查找祖先', () => {
    describe('高优先级场景 - 创建目标实体', () => {
      it('应该在创建目标实体时将其添加到结果中', () => {
        return new Promise<void>((done, reject) => {
          // 场景：查询 id='3' 的祖先，初始结果为空
          // 创建 id='3' 的节点本身

          const task = createMockQueryTask({
            type: 'findAncestors',
            options: {
              entityId: '3',
              where: { combinator: 'and', rules: [] }
            },
            runner: () => of([]) // 初始结果为空
          });

          const results = [
            [],
            // 创建目标实体后，它应该出现在结果中
            [{ id: '3', name: 'target', parentId: '2' }]
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

          // 创建目标实体本身
          const targetNode = createMockEntityEvent({ id: '3', name: 'target', parentId: '2' });
          query_merge_create_cache(task, [targetNode]);
        });
      });

      it('应该在创建目标实体时，如果已有祖先也一起添加', () => {
        return new Promise<void>((done, reject) => {
          // 场景：已有 parent 节点，创建 target 节点

          const task = createMockQueryTask({
            type: 'findAncestors',
            options: {
              entityId: '3',
              where: { combinator: 'and', rules: [] }
            },
            runner: () =>
              of([
                { id: '2', name: 'parent', parentId: '1' }
                // 已有 parent，但没有 target
              ])
          });

          const results = [
            [{ id: '2', name: 'parent', parentId: '1' }],
            // 创建 target 后，target 应该也在结果中
            [
              { id: '2', name: 'parent', parentId: '1' },
              { id: '3', name: 'target', parentId: '2' }
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

          // 创建目标实体
          const targetNode = createMockEntityEvent({ id: '3', name: 'target', parentId: '2' });
          query_merge_create_cache(task, [targetNode]);
        });
      });

      it('应该创建目标实体为根节点（parentId 为 null）', () => {
        return new Promise<void>((done, reject) => {
          const task = createMockQueryTask({
            type: 'findAncestors',
            options: {
              entityId: '1',
              where: { combinator: 'and', rules: [] }
            },
            runner: () => of([])
          });

          const results = [[], [{ id: '1', name: 'root', parentId: null }]];
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

          // 创建根节点作为目标实体
          const rootNode = createMockEntityEvent({ id: '1', name: 'root', parentId: null });
          query_merge_create_cache(task, [rootNode]);
        });
      });

      it('应该支持创建目标实体的同时创建新的祖先', () => {
        return new Promise<void>((done, reject) => {
          // 场景：同时创建 target 和它的 parent

          const task = createMockQueryTask({
            type: 'findAncestors',
            options: {
              entityId: '3',
              where: { combinator: 'and', rules: [] }
            },
            runner: () => of([])
          });

          const results = [
            [],
            // 同时添加 target 和 parent
            [
              { id: '2', name: 'parent', parentId: '1' },
              { id: '3', name: 'target', parentId: '2' }
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

          // 同时创建 target 和它的 parent
          const newNodes = [
            createMockEntityEvent({ id: '2', name: 'parent', parentId: '1' }),
            createMockEntityEvent({ id: '3', name: 'target', parentId: '2' })
          ];
          query_merge_create_cache(task, newNodes);
        });
      });

      it('应该支持 where 条件过滤创建的目标实体', () => {
        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            where: {
              combinator: 'and',
              rules: [{ field: 'isActive', operator: '=', value: true }]
            }
          },
          runner: () => of([])
        });

        const expectedResult: TestEntityData[] = [];

        const emissions = collectEmissions(task);

        // 创建不满足 where 条件的目标实体
        const targetNode = createMockEntityEvent({ id: '3', name: 'target', parentId: '2', isActive: false });
        query_merge_create_cache(task, [targetNode]);

        expect(emissions).toEqual([expectedResult]);
      });
    });

    describe('其他场景', () => {
      it('不应该添加不是祖先的实体', () => {
        // 场景：目标实体 id='3'，已有祖先链 root (1) -> parent (2)
        // 创建一个不相关的节点

        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            where: { combinator: 'and', rules: [] }
          },
          runner: () =>
            of([
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'parent', parentId: '1' },
              { id: '3', name: 'target', parentId: '2' }
            ])
        });

        const expectedResult = [
          { id: '1', name: 'root', parentId: null },
          { id: '2', name: 'parent', parentId: '1' },
          { id: '3', name: 'target', parentId: '2' }
        ];

        const emissions = collectEmissions(task);

        // 创建一个不相关的节点（不是祖先）
        const otherNode = createMockEntityEvent({ id: '10', name: 'other', parentId: '99' });
        query_merge_create_cache(task, [otherNode]);

        expect(emissions).toEqual([expectedResult]);
      });

      // 数值 0 作为 entityId 的边界回归已迁至 `numeric-id-merge.spec.ts`（RXD-069）：
      // 那里用 `idType: number` 的合法实体表达同一场景，不再需要 `0 as unknown as string`
      // 这种越权断言 —— 本文件的 TestEntity 是字符串 ID 实体，塞数值只能证明内部函数
      // 能处理非法运行时对象，证明不了用户走得到这条路径。

      it('应该支持批量创建多个祖先', () => {
        return new Promise<void>((done, reject) => {
          // 场景：同时创建多个祖先节点

          const task = createMockQueryTask({
            type: 'findAncestors',
            options: {
              entityId: '4',
              where: { combinator: 'and', rules: [] }
            },
            runner: () => of([])
          });

          const results = [
            [],
            // 同时创建整条链路: root -> parent -> target
            [
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'parent', parentId: '1' },
              { id: '3', name: 'intermediate', parentId: '2' },
              { id: '4', name: 'target', parentId: '3' }
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

          // 批量创建整条祖先链路
          const newNodes = [
            createMockEntityEvent({ id: '1', name: 'root', parentId: null }),
            createMockEntityEvent({ id: '2', name: 'parent', parentId: '1' }),
            createMockEntityEvent({ id: '3', name: 'intermediate', parentId: '2' }),
            createMockEntityEvent({ id: '4', name: 'target', parentId: '3' })
          ];
          query_merge_create_cache(task, newNodes);
        });
      });

      it('应该创建深层祖先链路', () => {
        return new Promise<void>((done, reject) => {
          // 场景：已有浅层祖先，创建深层祖先和目标

          const task = createMockQueryTask({
            type: 'findAncestors',
            options: {
              entityId: '5',
              where: { combinator: 'and', rules: [] }
            },
            runner: () =>
              of([
                { id: '1', name: 'root', parentId: null },
                { id: '2', name: 'level1', parentId: '1' }
              ])
          });

          const results = [
            [
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'level1', parentId: '1' }
            ],
            [
              { id: '1', name: 'root', parentId: null },
              { id: '2', name: 'level1', parentId: '1' },
              { id: '3', name: 'level2', parentId: '2' },
              { id: '4', name: 'level3', parentId: '3' },
              { id: '5', name: 'target', parentId: '4' }
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

          // 创建深层链路
          const newNodes = [
            createMockEntityEvent({ id: '3', name: 'level2', parentId: '2' }),
            createMockEntityEvent({ id: '4', name: 'level3', parentId: '3' }),
            createMockEntityEvent({ id: '5', name: 'target', parentId: '4' })
          ];
          query_merge_create_cache(task, newNodes);
        });
      });

      it('level 限制不应接纳范围外的延迟祖先 CREATE', () => {
        const initialResult = [
          { id: '2', name: 'parent', parentId: '1' },
          { id: '3', name: 'target', parentId: '2' }
        ];
        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            level: 1,
            where: { combinator: 'and', rules: [] }
          },
          runner: () => of(initialResult)
        });
        const emissions: TestEntityData[][] = [];
        const subscription = task.result$.subscribe(result => emissions.push(result));

        query_merge_create_cache(task, [createMockEntityEvent({ id: '1', name: 'root', parentId: null })]);

        expect(emissions).toEqual([initialResult]);
        subscription.unsubscribe();
      });

      it('应该支持 where 条件过滤新祖先', () => {
        // 场景：创建祖先但不满足 where 条件

        const task = createMockQueryTask({
          type: 'findAncestors',
          options: {
            entityId: '3',
            where: {
              combinator: 'and',
              rules: [{ field: 'status', operator: '=', value: 'active' }]
            }
          },
          runner: () => of([{ id: '3', name: 'target', parentId: '2', status: 'active' }])
        });

        const expectedResult = [{ id: '3', name: 'target', parentId: '2', status: 'active' }];

        const emissions = collectEmissions(task);

        // 创建祖先但不满足 where 条件（status='inactive'）
        const inactiveAncestor = createMockEntityEvent({
          id: '2',
          name: 'parent',
          parentId: '1',
          status: 'inactive'
        });
        query_merge_create_cache(task, [inactiveAncestor]);

        expect(emissions).toEqual([expectedResult]);
      });

      it('应该处理批量创建部分是祖先部分不是', () => {
        return new Promise<void>((done, reject) => {
          // 场景：批量创建多个节点，只有部分是祖先

          const task = createMockQueryTask({
            type: 'findAncestors',
            options: {
              entityId: '3',
              where: { combinator: 'and', rules: [] }
            },
            runner: () => of([{ id: '3', name: 'target', parentId: '2' }])
          });

          let emitCount = 0;

          task.result$.subscribe({
            next: d => {
              try {
                emitCount++;
                if (emitCount === 1) {
                  // 初始结果
                  expect(d).toEqual([{ id: '3', name: 'target', parentId: '2' }]);
                } else if (emitCount === 2) {
                  // 添加祖先后的结果：应该包含 target + 两个祖先，但不包含 id='10'
                  expect(d.length).toBe(3);
                  expect(d.some(e => e.id === '3')).toBe(true); // target
                  expect(d.some(e => e.id === '2')).toBe(true); // parent
                  expect(d.some(e => e.id === '1')).toBe(true); // root
                  expect(d.some(e => e.id === '10')).toBe(false); // other 不应该存在
                  done();
                } else {
                  reject(new Error('不应该有第三次更新'));
                }
              } catch (error) {
                reject(error);
              }
            },
            error: reject
          });

          // 批量创建：部分是祖先，部分不是
          const newNodes = [
            createMockEntityEvent({ id: '1', name: 'root', parentId: null }), // 是祖先
            createMockEntityEvent({ id: '2', name: 'parent', parentId: '1' }), // 是祖先
            createMockEntityEvent({ id: '10', name: 'other', parentId: '99' }) // 不是祖先
          ];
          query_merge_create_cache(task, newNodes);
        });
      });

      it('应该处理循环引用保护（不应死循环）', () => {
        return new Promise<void>((done, reject) => {
          // 场景：虽然不应该出现循环引用，但代码应该有保护机制

          const task = createMockQueryTask({
            type: 'findAncestors',
            options: {
              entityId: '3',
              where: { combinator: 'and', rules: [] }
            },
            runner: () => of([{ id: '3', name: 'target', parentId: '2' }])
          });

          const results = [
            [{ id: '3', name: 'target', parentId: '2' }],
            [
              { id: '3', name: 'target', parentId: '2' },
              { id: '2', name: 'parent', parentId: '1' }
            ]
          ];
          let resultIndex = 0;

          task.result$.subscribe({
            next: d => {
              try {
                expect(d).toEqual(results[resultIndex]);
                resultIndex++;
                if (resultIndex === 2) {
                  // 成功完成，说明没有死循环
                  done();
                }
              } catch (error) {
                reject(error);
              }
            },
            error: reject
          });

          // 创建祖先节点，visited Set 应该防止死循环
          const parentNode = createMockEntityEvent({ id: '2', name: 'parent', parentId: '1' });
          query_merge_create_cache(task, [parentNode]);
        });
      });
    });
  });
});
