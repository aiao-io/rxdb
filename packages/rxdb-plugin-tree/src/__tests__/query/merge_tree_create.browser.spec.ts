import { ENTITY_STATIC_TYPES, QueryTask, type RxDBEntityLocalCreatedEventData } from '@aiao/rxdb';
import { collectEmissions, createHarnessQueryTask, type HarnessTaskOptions } from '@aiao/rxdb/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { merge_create as query_merge_create_cache_impl } from '../../query/merge_create.js';
import { createTreeSqlScenario, type TreeSqlScenario } from './tree-sql-reference.js';

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
      it('应该在创建目标实体时将其添加到结果中，库里已有的祖先回 SQL 补齐', () => {
        // 场景：查询 id='3' 的祖先，3 还不存在（CTE 一行都没有）；它的父节点 2 与根 1 早已在库里。
        // 3 新建后 SQL 返回整条链，而 2、1 从没进过结果集、也不在本批事件里，本地拼不出来，只能回 SQL
        const scenario = createTreeSqlScenario(
          TestEntity,
          { type: 'findAncestors', options: { entityId: '3', where: { combinator: 'and', rules: [] } } },
          [
            { id: '1', name: 'root', parentId: null },
            { id: '2', name: 'parent', parentId: '1' }
          ]
        );
        const target = { id: '3', name: 'target', parentId: '2' };

        scenario.rows.push(target);
        query_merge_create_cache(scenario.task, [createMockEntityEvent(target)]);

        expect(scenario.sqlRuns()).toBe(2);
        expect(scenario.sql()).toHaveLength(3);
        expect(scenario.live()).toEqual(scenario.sql());
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

      it('应该支持创建目标实体的同时创建新的祖先，父链接上库里已有的根时回 SQL', () => {
        // 场景：同批创建 target(3) 和它的 parent(2)，而 2 的父节点 1 早已在库里。
        // 本批只认识 3、2 两行，走到 1 就断了，本地补不出 1，交回 SQL 重算
        const scenario = createTreeSqlScenario(
          TestEntity,
          { type: 'findAncestors', options: { entityId: '3', where: { combinator: 'and', rules: [] } } },
          [{ id: '1', name: 'root', parentId: null }]
        );
        const created = [
          { id: '2', name: 'parent', parentId: '1' },
          { id: '3', name: 'target', parentId: '2' }
        ];

        scenario.rows.push(...created);
        query_merge_create_cache(scenario.task, created.map(createMockEntityEvent));

        expect(scenario.sqlRuns()).toBe(2);
        expect(scenario.sql()).toHaveLength(3);
        expect(scenario.live()).toEqual(scenario.sql());
      });

      it('目标实体是基准成员，不受 where 过滤：不匹配 where 的目标新建后同样进结果', () => {
        const target = { id: '3', name: 'target', parentId: null, isActive: false };
        const scenario = createTreeSqlScenario(
          TestEntity,
          {
            type: 'findAncestors',
            options: {
              entityId: '3',
              where: { combinator: 'and', rules: [{ field: 'isActive', operator: '=', value: true }] }
            }
          },
          []
        );

        scenario.rows.push(target);
        query_merge_create_cache(scenario.task, [createMockEntityEvent(target)]);

        expect(scenario.sql()).toEqual([target]);
        expect(scenario.live()).toEqual(scenario.sql());
        // 目标挂在根上，祖先链本地即可算清，不必回 SQL
        expect(scenario.sqlRuns()).toBe(1);
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

      it('目标与父节点同批新建、父链在批内成环时，判定照样收敛（不应死循环）', () => {
        // 延迟外键允许同一事务里互指的两行一起提交；走父链判定本地能否算清时必须靠 visited 收住
        const task = createMockQueryTask({
          type: 'findAncestors',
          options: { entityId: 't', where: { combinator: 'and', rules: [] } },
          runner: () => of<TestEntityData[]>([])
        });
        const emissions = collectEmissions(task);

        query_merge_create_cache(task, [
          createMockEntityEvent({ id: 't', parentId: 'p' }),
          createMockEntityEvent({ id: 'p', parentId: 't' })
        ]);

        expect(emissions).toEqual([
          [],
          [
            { id: 't', parentId: 'p' },
            { id: 'p', parentId: 't' }
          ]
        ]);
      });
    });
  });

  /**
   * 基准成员（查全树时 `parentId` 为空的根、指定 `entityId` 时目标自己）在 SQL 里不过 where 也不过 level，
   * 只有递归成员才过。新建的基准成员哪怕不匹配 where 也要即时进结果、进计数，否则活查询停在旧值，
   * 直到别的事件把它拉回 SQL。runner 在内存表上按 `generate_tree_sql` 的口径重跑，见 `tree-sql-reference.ts`。
   */
  describe('新建基准成员：即时结果与重跑 SQL 一致', () => {
    const activeOnly = {
      combinator: 'and' as const,
      rules: [{ field: 'active', operator: '=' as const, value: true }]
    };

    /** 先落表、再发 CREATE 事件，与「先提交、后发事件」同序 */
    const insert = (scenario: TreeSqlScenario<TestEntityType>, ...rows: TestEntityData[]): void => {
      scenario.rows.push(...rows);
      query_merge_create_cache(scenario.task, rows.map(createMockEntityEvent));
    };

    it.each([undefined, 0])('findDescendants 全树（level=%s）：不匹配 where 的新根进结果', level => {
      const root = { id: 'r', parentId: null, active: false };
      const scenario = createTreeSqlScenario(
        TestEntity,
        { type: 'findDescendants', options: { entityId: null, level, where: activeOnly } },
        []
      );

      insert(scenario, root);

      expect(scenario.sql()).toEqual([root]);
      expect(scenario.live()).toEqual(scenario.sql());
    });

    it.each([undefined, 0])('countDescendants 全树（level=%s）：不匹配 where 的新根计入', level => {
      const scenario = createTreeSqlScenario(
        TestEntity,
        { type: 'countDescendants', options: { entityId: null, level, where: activeOnly } },
        []
      );

      insert(scenario, { id: 'r', parentId: null, active: false });

      expect(scenario.sql()).toBe(1);
      expect(scenario.live()).toBe(1);
    });

    it('findAncestors 全树：新根不论是否匹配 where 都进结果，新建的非根不进', () => {
      const roots = [
        { id: 'a', parentId: null, active: true },
        { id: 'r', parentId: null, active: false }
      ];
      const scenario = createTreeSqlScenario(
        TestEntity,
        { type: 'findAncestors', options: { entityId: null, where: activeOnly } },
        [roots[0]]
      );

      // 查全树的祖先：递归成员往上找不到东西，结果就是全部根
      insert(scenario, roots[1], { id: 'c', parentId: 'a', active: true });

      expect(scenario.sql()).toEqual(roots);
      expect(scenario.live()).toEqual(scenario.sql());
    });

    it('countAncestors 全树：不匹配 where 的新根计入', () => {
      const scenario = createTreeSqlScenario(
        TestEntity,
        { type: 'countAncestors', options: { entityId: null, where: activeOnly } },
        [{ id: 'a', parentId: null, active: true }]
      );

      insert(scenario, { id: 'r', parentId: null, active: false });

      expect(scenario.sql()).toBe(2);
      expect(scenario.live()).toBe(2);
    });

    it('findDescendants 显式目标：不匹配 where 的新目标连同同批匹配的子节点进结果', () => {
      const scenario = createTreeSqlScenario(
        TestEntity,
        { type: 'findDescendants', options: { entityId: 't', where: activeOnly } },
        []
      );

      insert(scenario, { id: 't', parentId: null, active: false }, { id: 'c', parentId: 't', active: true });

      expect(scenario.sql()).toHaveLength(2);
      expect(scenario.live()).toEqual(scenario.sql());
    });

    it('findDescendants 全树：新根名下不匹配 where 的子节点截断它下面的孙节点', () => {
      const root = { id: 'r', parentId: null, active: false };
      const scenario = createTreeSqlScenario(
        TestEntity,
        { type: 'findDescendants', options: { entityId: null, where: activeOnly } },
        []
      );

      insert(scenario, root, { id: 'c', parentId: 'r', active: false }, { id: 'g', parentId: 'c', active: true });

      expect(scenario.sql()).toEqual([root]);
      expect(scenario.live()).toEqual(scenario.sql());
    });

    it.each([undefined, 0])('findAncestors 显式目标（level=%s）：新目标挂在已有父节点下，祖先链与 SQL 一致', level => {
      const scenario = createTreeSqlScenario(
        TestEntity,
        { type: 'findAncestors', options: { entityId: 't', level, where: activeOnly } },
        [{ id: 'p', parentId: null, active: true }]
      );

      insert(scenario, { id: 't', parentId: 'p', active: false });

      expect(scenario.sql()).toHaveLength(level === 0 ? 1 : 2);
      expect(scenario.live()).toEqual(scenario.sql());
    });

    it('findAncestors 显式目标：父链在本批里被 where 截断时本地算清，不回 SQL', () => {
      const target = { id: 't', parentId: 'p', active: false };
      const scenario = createTreeSqlScenario(
        TestEntity,
        { type: 'findAncestors', options: { entityId: 't', where: activeOnly } },
        []
      );

      insert(scenario, { id: 'r', parentId: null, active: true }, { id: 'p', parentId: 'r', active: false }, target);

      expect(scenario.sql()).toEqual([target]);
      expect(scenario.live()).toEqual(scenario.sql());
      expect(scenario.sqlRuns()).toBe(1);
    });

    it('countAncestors 显式目标：不匹配 where 的新目标挂在已有父节点下，计数回 SQL', () => {
      const scenario = createTreeSqlScenario(
        TestEntity,
        { type: 'countAncestors', options: { entityId: 't', where: activeOnly } },
        [{ id: 'p', parentId: null, active: true }]
      );

      insert(scenario, { id: 't', parentId: 'p', active: false });

      expect(scenario.sql()).toBe(1);
      expect(scenario.live()).toBe(1);
    });
  });
});
