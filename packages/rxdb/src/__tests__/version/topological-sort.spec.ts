/**
 * @fileoverview 拓扑排序测试
 */

import { describe, expect, it } from 'vitest';
import { PropertyType, RelationKind } from '../../entity/metadata-options.interface.js';
import { buildDependencyGraph } from '../../version/dependency-graph.js';
import {
  filterAndSort,
  topologicalSort,
  topologicalSortForAction,
  topologicalSortForPull,
  topologicalSortForPush
} from '../../version/topological-sort.js';

describe('topological-sort', () => {
  describe('topologicalSort - pull direction', () => {
    it('should sort single entity', () => {
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        }
      ];

      const graph = buildDependencyGraph(entities);
      const result = topologicalSort(graph, 'pull');

      expect(result).toEqual([{ namespace: 'public', entity: 'User' }]);
    });

    it('should sort parent before child (User -> Todo)', () => {
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        },
        {
          name: 'Todo',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'userId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'user',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedNamespace: 'public'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);
      const result = topologicalSort(graph, 'pull');

      expect(result).toEqual([
        { namespace: 'public', entity: 'User' },
        { namespace: 'public', entity: 'Todo' }
      ]);
    });

    it('should sort multi-level dependency chain (User -> Todo -> Comment)', () => {
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        },
        {
          name: 'Todo',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'userId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'user',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedNamespace: 'public'
            }
          ]
        },
        {
          name: 'Comment',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'todoId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'todo',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Todo',
              mappedNamespace: 'public'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);
      const result = topologicalSort(graph, 'pull');

      expect(result).toEqual([
        { namespace: 'public', entity: 'User' },
        { namespace: 'public', entity: 'Todo' },
        { namespace: 'public', entity: 'Comment' }
      ]);
    });

    it('should handle diamond dependency (A <- B <- D, A <- C <- D)', () => {
      const entities = [
        {
          name: 'A',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        },
        {
          name: 'B',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'aId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'a',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'A',
              mappedNamespace: 'public'
            }
          ]
        },
        {
          name: 'C',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'aId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'a',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'A',
              mappedNamespace: 'public'
            }
          ]
        },
        {
          name: 'D',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'bId', type: PropertyType.string },
            { name: 'cId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'b',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'B',
              mappedNamespace: 'public'
            },
            {
              name: 'c',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'C',
              mappedNamespace: 'public'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);
      const result = topologicalSort(graph, 'pull');

      // A 必须在最前，D 必须在最后。
      expect(result[0]).toEqual({ namespace: 'public', entity: 'A' });
      expect(result[3]).toEqual({ namespace: 'public', entity: 'D' });
      // B 和 C 的顺序可以任意。
      const middle = result.slice(1, 3).map((r: { entity: string }) => r.entity);
      expect(middle).toContain('B');
      expect(middle).toContain('C');
    });
  });

  describe('topologicalSort - push direction', () => {
    it('should sort child before parent (Comment -> Todo -> User)', () => {
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        },
        {
          name: 'Todo',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'userId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'user',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedNamespace: 'public'
            }
          ]
        },
        {
          name: 'Comment',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'todoId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'todo',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Todo',
              mappedNamespace: 'public'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);
      const result = topologicalSort(graph, 'push');

      expect(result).toEqual([
        { namespace: 'public', entity: 'Comment' },
        { namespace: 'public', entity: 'Todo' },
        { namespace: 'public', entity: 'User' }
      ]);
    });

    it('should be reverse of pull direction', () => {
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        },
        {
          name: 'Todo',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'userId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'user',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedNamespace: 'public'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);
      const pullOrder = topologicalSort(graph, 'pull');
      const pushOrder = topologicalSort(graph, 'push');

      expect(pushOrder).toEqual([...pullOrder].reverse());
    });
  });

  describe('topologicalSortForPull', () => {
    it('should be shorthand for pull direction', () => {
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        },
        {
          name: 'Todo',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'userId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'user',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedNamespace: 'public'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);
      const result1 = topologicalSortForPull(graph);
      const result2 = topologicalSort(graph, 'pull');

      expect(result1).toEqual(result2);
    });
  });

  describe('topologicalSortForPush', () => {
    it('should be shorthand for push direction', () => {
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        },
        {
          name: 'Todo',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'userId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'user',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedNamespace: 'public'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);
      const result1 = topologicalSortForPush(graph);
      const result2 = topologicalSort(graph, 'push');

      expect(result1).toEqual(result2);
    });
  });

  /**
   * RXD-060：「push 就是子→父」只对 DELETE 成立。同一张图，INSERT/UPDATE 要父先
   * （子行的外键得有得指），DELETE 要子先（父行不能还被引用着）。
   */
  describe('topologicalSortForAction', () => {
    const entities = [
      {
        name: 'User',
        namespace: 'public',
        properties: [{ name: 'id', type: PropertyType.string, primary: true }],
        relations: []
      },
      {
        name: 'Todo',
        namespace: 'public',
        properties: [
          { name: 'id', type: PropertyType.string, primary: true },
          { name: 'userId', type: PropertyType.string }
        ],
        relations: [
          {
            name: 'user',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'User',
            mappedNamespace: 'public'
          }
        ]
      }
    ];
    const graph = buildDependencyGraph(entities);

    const USER = { namespace: 'public', entity: 'User' };
    const TODO = { namespace: 'public', entity: 'Todo' };

    it.each([
      { action: 'INSERT' as const, expected: [USER, TODO], why: '父先：Todo.userId 指向的 User 行必须已存在' },
      { action: 'UPDATE' as const, expected: [USER, TODO], why: '父先：改后的行同样可能新引用一个刚建的父行' },
      { action: 'DELETE' as const, expected: [TODO, USER], why: '子先：User 行还被 Todo 引用着，先删就是 FK 失败' }
    ])('$action → $why', ({ action, expected }) => {
      expect(topologicalSortForAction(graph, action)).toEqual(expected);
    });

    it('INSERT 与 DELETE 的顺序互为逆序（同一张图不可能用一个顺序扫完）', () => {
      expect(topologicalSortForAction(graph, 'INSERT')).toEqual(
        [...topologicalSortForAction(graph, 'DELETE')].reverse()
      );
    });
  });

  describe('filterAndSort', () => {
    it('should filter and sort specified repositories', () => {
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        },
        {
          name: 'Todo',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'userId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'user',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedNamespace: 'public'
            }
          ]
        },
        {
          name: 'Comment',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'todoId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'todo',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Todo',
              mappedNamespace: 'public'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);

      // 只同步 Todo 和 Comment，跳过 User。
      const result = filterAndSort(
        graph,
        [
          { namespace: 'public', entity: 'Todo' },
          { namespace: 'public', entity: 'Comment' }
        ],
        'pull'
      );

      expect(result).toEqual([
        { namespace: 'public', entity: 'Todo' },
        { namespace: 'public', entity: 'Comment' }
      ]);
    });

    it('should preserve dependency order in filtered subset', () => {
      const entities = [
        {
          name: 'A',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        },
        {
          name: 'B',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'aId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'a',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'A',
              mappedNamespace: 'public'
            }
          ]
        },
        {
          name: 'C',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'bId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'b',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'B',
              mappedNamespace: 'public'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);

      // 只筛选 A 和 C（跳过 B）。
      const result = filterAndSort(
        graph,
        [
          { namespace: 'public', entity: 'A' },
          { namespace: 'public', entity: 'C' }
        ],
        'pull'
      );

      // A 和 C 应保持顺序，但在该子集中 C 不直接依赖 A。
      expect(result).toEqual([
        { namespace: 'public', entity: 'A' },
        { namespace: 'public', entity: 'C' }
      ]);
    });

    it('should work with push direction', () => {
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        },
        {
          name: 'Todo',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'userId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'user',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedNamespace: 'public'
            }
          ]
        },
        {
          name: 'Comment',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'todoId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'todo',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Todo',
              mappedNamespace: 'public'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);

      const result = filterAndSort(
        graph,
        [
          { namespace: 'public', entity: 'Todo' },
          { namespace: 'public', entity: 'Comment' }
        ],
        'push'
      );

      expect(result).toEqual([
        { namespace: 'public', entity: 'Comment' },
        { namespace: 'public', entity: 'Todo' }
      ]);
    });
  });

  /**
   * 依赖图第二遍反向填充 requiredBy 时对缺失父节点是宽容的（`if (parentDep)`），
   * 但 dependsOn 是无条件 push 的。只要有一个关系指向未注册进 config.entities
   * 的实体（跨 namespace 部分注册、按需加载模块），拓扑排序就不能整个崩掉，
   * 否则 pullBatch / pullWithCascade / pushWithCascade / bulkSync 全线不可用。
   */
  describe('悬挂依赖（关系指向未注册实体）', () => {
    const entitiesWithDanglingRelation = () => [
      {
        name: 'Todo',
        namespace: 'public',
        properties: [{ name: 'id', type: PropertyType.string, primary: true }],
        relations: [
          {
            name: 'owner',
            kind: RelationKind.MANY_TO_ONE,
            // User 没有被注册进本次 entities
            mappedEntity: 'User',
            mappedNamespace: 'public'
          }
        ]
      }
    ];

    it('pull 方向跳过悬挂依赖而不是抛错', () => {
      const graph = buildDependencyGraph(entitiesWithDanglingRelation());

      expect(() => topologicalSort(graph, 'pull')).not.toThrow();
      expect(topologicalSort(graph, 'pull')).toEqual([{ namespace: 'public', entity: 'Todo' }]);
    });

    it('push 方向同样跳过悬挂依赖', () => {
      const graph = buildDependencyGraph(entitiesWithDanglingRelation());

      expect(topologicalSortForPush(graph)).toEqual([{ namespace: 'public', entity: 'Todo' }]);
    });

    it('已注册的部分仍保持正确顺序', () => {
      const entities = [
        ...entitiesWithDanglingRelation(),
        {
          name: 'Comment',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: [
            {
              name: 'todo',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Todo',
              mappedNamespace: 'public'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);

      expect(topologicalSortForPull(graph)).toEqual([
        { namespace: 'public', entity: 'Todo' },
        { namespace: 'public', entity: 'Comment' }
      ]);
    });
  });
});
