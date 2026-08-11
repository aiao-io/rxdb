/**
 * @fileoverview 依赖图测试
 */

import { describe, expect, it } from 'vitest';
import { PropertyType, RelationKind } from '../../entity/metadata-options.interface.js';
import {
  buildDependencyGraph,
  detectCycles,
  getAllDependencies,
  getAllRequiredBy,
  getDirectChildren,
  getDirectParents,
  type DependencyGraph
} from '../../version/dependency-graph.js';

describe('dependency-graph', () => {
  describe('buildDependencyGraph', () => {
    it('should build empty graph for no entities', () => {
      const graph = buildDependencyGraph([]);
      expect(graph.size).toBe(0);
    });

    it('should build graph with single independent entity', () => {
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        }
      ];

      const graph = buildDependencyGraph(entities);

      expect(graph.size).toBe(1);
      const userDep = graph.get('public:User');
      expect(userDep).toBeDefined();
      expect(userDep!.dependsOn).toEqual([]);
      expect(userDep!.requiredBy).toEqual([]);
    });

    it('should detect MANY_TO_ONE dependency', () => {
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
              mappedNamespace: 'public',
              mappedProperty: 'todos'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);

      const todoDep = graph.get('public:Todo');
      expect(todoDep!.dependsOn).toEqual([{ namespace: 'public', entity: 'User' }]);

      const userDep = graph.get('public:User');
      expect(userDep!.requiredBy).toEqual([{ namespace: 'public', entity: 'Todo' }]);
    });

    it('should detect ONE_TO_ONE dependency', () => {
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        },
        {
          name: 'Profile',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'userId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'user',
              kind: RelationKind.ONE_TO_ONE,
              mappedEntity: 'User',
              mappedNamespace: 'public',
              mappedProperty: 'todos'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);

      const profileDep = graph.get('public:Profile');
      expect(profileDep!.dependsOn).toEqual([{ namespace: 'public', entity: 'User' }]);

      const userDep = graph.get('public:User');
      expect(userDep!.requiredBy).toEqual([{ namespace: 'public', entity: 'Profile' }]);
    });

    it('should ignore ONE_TO_MANY and MANY_TO_MANY relations', () => {
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: [
            {
              name: 'todos',
              kind: RelationKind.ONE_TO_MANY,
              mappedEntity: 'Todo',
              mappedNamespace: 'public',
              mappedProperty: 'user'
            }
          ]
        },
        {
          name: 'Todo',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        }
      ];

      const graph = buildDependencyGraph(entities);

      const userDep = graph.get('public:User');
      expect(userDep!.dependsOn).toEqual([]);
      expect(userDep!.requiredBy).toEqual([]);
    });

    it('should build multi-level dependency chain', () => {
      // User -> Todo -> Comment
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
              mappedNamespace: 'public',
              mappedProperty: 'todos'
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
              mappedNamespace: 'public',
              mappedProperty: 'comments'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);

      expect(graph.get('public:Comment')!.dependsOn).toEqual([{ namespace: 'public', entity: 'Todo' }]);
      expect(graph.get('public:Todo')!.dependsOn).toEqual([{ namespace: 'public', entity: 'User' }]);
      expect(graph.get('public:User')!.requiredBy).toEqual([{ namespace: 'public', entity: 'Todo' }]);
      expect(graph.get('public:Todo')!.requiredBy).toEqual([{ namespace: 'public', entity: 'Comment' }]);
    });

    it('should handle multiple parents', () => {
      // Comment 同时依赖 User 和 Todo。
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
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        },
        {
          name: 'Comment',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'userId', type: PropertyType.string },
            { name: 'todoId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'user',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedNamespace: 'public',
              mappedProperty: 'todos'
            },
            {
              name: 'todo',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Todo',
              mappedNamespace: 'public',
              mappedProperty: 'comments'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);

      const commentDep = graph.get('public:Comment');
      expect(commentDep!.dependsOn).toEqual([
        { namespace: 'public', entity: 'User' },
        { namespace: 'public', entity: 'Todo' }
      ]);
    });
  });

  describe('detectCycles', () => {
    it('should not throw for acyclic graph', () => {
      const graph: DependencyGraph = new Map([
        [
          'public:User',
          {
            repository: { namespace: 'public', entity: 'User' },
            dependsOn: [],
            requiredBy: [{ namespace: 'public', entity: 'Todo' }]
          }
        ],
        [
          'public:Todo',
          {
            repository: { namespace: 'public', entity: 'Todo' },
            dependsOn: [{ namespace: 'public', entity: 'User' }],
            requiredBy: []
          }
        ]
      ]);

      expect(() => detectCycles(graph)).not.toThrow();
    });

    /**
     * dfs 遇到不在图里的 key 会提前 return，此前没有回滚 recStack / path。
     * 该 key 已被记进 visited + recStack，后续任何真实路径再指向它时
     * `recStack.has(parentKey)` 恒真 → 报出并不存在的循环依赖。
     */
    it('悬挂依赖不得污染 recStack 而误报循环依赖', () => {
      // Todo -> Ghost（不在图里）；Comment -> Ghost 同样悬挂。
      // 两条独立的无环路径，不该因为共用一个悬挂节点就被判成环。
      const graph: DependencyGraph = new Map([
        [
          'public:Todo',
          {
            repository: { namespace: 'public', entity: 'Todo' },
            dependsOn: [{ namespace: 'public', entity: 'Ghost' }],
            requiredBy: []
          }
        ],
        [
          'public:Comment',
          {
            repository: { namespace: 'public', entity: 'Comment' },
            dependsOn: [{ namespace: 'public', entity: 'Ghost' }],
            requiredBy: []
          }
        ]
      ]);

      expect(() => detectCycles(graph)).not.toThrow();
    });

    it('should detect direct cycle', () => {
      // User -> Profile -> User
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'profileId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'profile',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Profile',
              mappedNamespace: 'public',
              mappedProperty: 'user'
            }
          ]
        },
        {
          name: 'Profile',
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
              mappedNamespace: 'public',
              mappedProperty: 'todos'
            }
          ]
        }
      ];

      expect(() => buildDependencyGraph(entities)).toThrow(/Circular dependency/);
    });

    it('should detect indirect cycle', () => {
      // A -> B -> C -> A
      const entities = [
        {
          name: 'A',
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
              mappedNamespace: 'public',
              mappedProperty: 'as'
            }
          ]
        },
        {
          name: 'B',
          namespace: 'public',
          properties: [
            { name: 'id', type: PropertyType.string, primary: true },
            { name: 'cId', type: PropertyType.string }
          ],
          relations: [
            {
              name: 'c',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'C',
              mappedNamespace: 'public',
              mappedProperty: 'bs'
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
              mappedNamespace: 'public',
              mappedProperty: 'cs'
            }
          ]
        }
      ];

      expect(() => buildDependencyGraph(entities)).toThrow(/Circular dependency/);
    });
  });

  describe('getAllDependencies', () => {
    it('should return all dependencies in topological order', () => {
      // Comment -> Todo -> User
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
              mappedNamespace: 'public',
              mappedProperty: 'todos'
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
              mappedNamespace: 'public',
              mappedProperty: 'comments'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);
      const deps = getAllDependencies('public', 'Comment', graph);

      expect(deps).toEqual([
        { namespace: 'public', entity: 'User' },
        { namespace: 'public', entity: 'Todo' },
        { namespace: 'public', entity: 'Comment' }
      ]);
    });

    it('should return only self for entity with no dependencies', () => {
      const entities = [
        {
          name: 'User',
          namespace: 'public',
          properties: [{ name: 'id', type: PropertyType.string, primary: true }],
          relations: []
        }
      ];

      const graph = buildDependencyGraph(entities);
      const deps = getAllDependencies('public', 'User', graph);

      expect(deps).toEqual([{ namespace: 'public', entity: 'User' }]);
    });
  });

  describe('getAllRequiredBy', () => {
    it('should return all required-by entities in reverse topological order', () => {
      // User <- Todo <- Comment
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
              mappedNamespace: 'public',
              mappedProperty: 'todos'
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
              mappedNamespace: 'public',
              mappedProperty: 'comments'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);
      const requiredBy = getAllRequiredBy('public', 'User', graph);

      expect(requiredBy).toEqual([
        { namespace: 'public', entity: 'Comment' },
        { namespace: 'public', entity: 'Todo' },
        { namespace: 'public', entity: 'User' }
      ]);
    });
  });

  describe('getDirectParents', () => {
    it('should return only direct parents', () => {
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
              mappedNamespace: 'public',
              mappedProperty: 'todos'
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
              mappedNamespace: 'public',
              mappedProperty: 'comments'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);
      const parents = getDirectParents('public', 'Comment', graph);

      expect(parents).toEqual([{ namespace: 'public', entity: 'Todo' }]);
    });
  });

  describe('getDirectChildren', () => {
    it('should return only direct children', () => {
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
              mappedNamespace: 'public',
              mappedProperty: 'todos'
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
              mappedNamespace: 'public',
              mappedProperty: 'comments'
            }
          ]
        }
      ];

      const graph = buildDependencyGraph(entities);
      const children = getDirectChildren('public', 'User', graph);

      expect(children).toEqual([{ namespace: 'public', entity: 'Todo' }]);
    });
  });

  describe('边界图结构', () => {
    it('关系缺省时不创建依赖，并为未指定 namespace 的关系使用当前 namespace', () => {
      const graph = buildDependencyGraph([
        { name: 'User', namespace: 'tenant' },
        {
          name: 'Todo',
          namespace: 'tenant',
          relations: [{ kind: RelationKind.MANY_TO_ONE, mappedEntity: 'User' }]
        },
        {
          name: 'Audit',
          namespace: 'tenant',
          relations: [
            {
              kind: RelationKind.ONE_TO_ONE,
              mappedEntity: 'ExternalUser',
              mappedNamespace: 'shared'
            }
          ]
        }
      ]);

      expect(graph.get('tenant:User')).toEqual({
        repository: { namespace: 'tenant', entity: 'User' },
        dependsOn: [],
        requiredBy: [{ namespace: 'tenant', entity: 'Todo' }]
      });
      expect(graph.get('tenant:Todo')?.dependsOn).toEqual([{ namespace: 'tenant', entity: 'User' }]);
      expect(graph.get('tenant:Audit')?.dependsOn).toEqual([{ namespace: 'shared', entity: 'ExternalUser' }]);
      expect(graph.has('shared:ExternalUser')).toBe(false);
      expect(getAllDependencies('tenant', 'Audit', graph)).toEqual([{ namespace: 'tenant', entity: 'Audit' }]);
    });

    it('允许自引用关系且递归查询只返回一次自身', () => {
      const graph = buildDependencyGraph([
        {
          name: 'Branch',
          namespace: 'rxdb',
          relations: [{ kind: RelationKind.MANY_TO_ONE, mappedEntity: 'Branch' }]
        }
      ]);

      expect(() => detectCycles(graph)).not.toThrow();
      expect(getDirectParents('rxdb', 'Branch', graph)).toEqual([{ namespace: 'rxdb', entity: 'Branch' }]);
      expect(getDirectChildren('rxdb', 'Branch', graph)).toEqual([{ namespace: 'rxdb', entity: 'Branch' }]);
      expect(getAllDependencies('rxdb', 'Branch', graph)).toEqual([{ namespace: 'rxdb', entity: 'Branch' }]);
      expect(getAllRequiredBy('rxdb', 'Branch', graph)).toEqual([{ namespace: 'rxdb', entity: 'Branch' }]);
    });

    it('菱形依赖通过 visited 防重且保持拓扑顺序', () => {
      const graph: DependencyGraph = new Map([
        [
          'public:Leaf',
          {
            repository: { namespace: 'public', entity: 'Leaf' },
            dependsOn: [
              { namespace: 'public', entity: 'Left' },
              { namespace: 'public', entity: 'Right' }
            ],
            requiredBy: []
          }
        ],
        [
          'public:Left',
          {
            repository: { namespace: 'public', entity: 'Left' },
            dependsOn: [{ namespace: 'public', entity: 'Root' }],
            requiredBy: [{ namespace: 'public', entity: 'Leaf' }]
          }
        ],
        [
          'public:Right',
          {
            repository: { namespace: 'public', entity: 'Right' },
            dependsOn: [{ namespace: 'public', entity: 'Root' }],
            requiredBy: [{ namespace: 'public', entity: 'Leaf' }]
          }
        ],
        [
          'public:Root',
          {
            repository: { namespace: 'public', entity: 'Root' },
            dependsOn: [],
            requiredBy: [
              { namespace: 'public', entity: 'Left' },
              { namespace: 'public', entity: 'Right' }
            ]
          }
        ]
      ]);

      expect(() => detectCycles(graph)).not.toThrow();
      expect(getAllDependencies('public', 'Leaf', graph)).toEqual([
        { namespace: 'public', entity: 'Root' },
        { namespace: 'public', entity: 'Left' },
        { namespace: 'public', entity: 'Right' },
        { namespace: 'public', entity: 'Leaf' }
      ]);
      expect(getAllRequiredBy('public', 'Root', graph)).toEqual([
        { namespace: 'public', entity: 'Leaf' },
        { namespace: 'public', entity: 'Left' },
        { namespace: 'public', entity: 'Right' },
        { namespace: 'public', entity: 'Root' }
      ]);
    });

    it('递归查询忽略缺失的被依赖节点', () => {
      const graph: DependencyGraph = new Map([
        [
          'public:Root',
          {
            repository: { namespace: 'public', entity: 'Root' },
            dependsOn: [],
            requiredBy: [{ namespace: 'public', entity: 'MissingChild' }]
          }
        ]
      ]);

      expect(getAllRequiredBy('public', 'Root', graph)).toEqual([{ namespace: 'public', entity: 'Root' }]);
    });

    it('查询不存在的 repository 时抛出明确错误', () => {
      const graph = buildDependencyGraph([{ name: 'User', namespace: 'public' }]);
      const message = 'Repository public:Missing not found in dependency graph';

      expect(() => getAllDependencies('public', 'Missing', graph)).toThrow(message);
      expect(() => getAllRequiredBy('public', 'Missing', graph)).toThrow(message);
      expect(() => getDirectParents('public', 'Missing', graph)).toThrow(message);
      expect(() => getDirectChildren('public', 'Missing', graph)).toThrow(message);
    });
  });
});
