/**
 * @fileoverview 依赖图测试
 */

import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  buildDependencyGraph,
  collectConnectedRepositories,
  findDependencyCycles,
  getAllDependencies,
  getAllRequiredBy,
  getDirectChildren,
  getDirectParents,
  type DependencyGraph
} from '../dependency-graph.js';
import { graphInputs } from './fixtures/dependency-graph-input.js';

describe('dependency-graph', () => {
  describe('buildDependencyGraph', () => {
    it('should build empty graph for no entities', () => {
      const graph = buildDependencyGraph(graphInputs([]));
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

      const graph = buildDependencyGraph(graphInputs(entities));

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

      const graph = buildDependencyGraph(graphInputs(entities));

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

      const graph = buildDependencyGraph(graphInputs(entities));

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

      const graph = buildDependencyGraph(graphInputs(entities));

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

      const graph = buildDependencyGraph(graphInputs(entities));

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

      const graph = buildDependencyGraph(graphInputs(entities));

      const commentDep = graph.get('public:Comment');
      expect(commentDep!.dependsOn).toEqual([
        { namespace: 'public', entity: 'User' },
        { namespace: 'public', entity: 'Todo' }
      ]);
    });
  });

  describe('findDependencyCycles', () => {
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

      expect(findDependencyCycles(graph)).toEqual([]);
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

      expect(findDependencyCycles(graph)).toEqual([]);
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

      // US-038：环不再整体抛错。两条都是非空外键，排不出写入顺序：标成断不开，记下从最小仓库键出发的环路
      const graph = buildDependencyGraph(graphInputs(entities));
      const cycle = graph.get('public:User')?.cycle;
      expect(cycle).toBeDefined();
      expect(graph.get('public:Profile')?.cycle).toBe(cycle);
      expect(cycle?.breakEdges).toBeNull();
      expect(cycle?.path).toEqual(['public:Profile', 'public:User', 'public:Profile']);
      expect(cycle?.members.map(member => member.entity)).toEqual(['Profile', 'User']);
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

      const graph = buildDependencyGraph(graphInputs(entities));
      const cycle = graph.get('public:A')?.cycle;
      expect(cycle?.breakEdges).toBeNull();
      expect(cycle?.path).toEqual(['public:A', 'public:B', 'public:C', 'public:A']);
      for (const key of ['public:B', 'public:C']) expect(graph.get(key)?.cycle).toBe(cycle);
    });

    it('US-038 环上有可空外键：按（仓库，属性）排序逐条加回，加回会成环的就是断环边；成员按断环之后父在前', () => {
      // A.b → B 可空，B.a → A 非空：先写 A（b 先空着），再写 B，最后补写 A.bId
      const graph = buildDependencyGraph(
        graphInputs([
          {
            name: 'A',
            namespace: 'public',
            relations: [{ name: 'b', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'B', nullable: true }]
          },
          {
            name: 'B',
            namespace: 'public',
            relations: [{ name: 'a', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'A' }]
          }
        ])
      );

      const cycle = graph.get('public:B')?.cycle;
      expect(cycle?.members.map(member => member.entity)).toEqual(['A', 'B']);
      expect(cycle?.path).toEqual([]);
      expect(cycle?.breakEdges).toEqual([
        {
          from: { namespace: 'public', entity: 'A' },
          to: { namespace: 'public', entity: 'B' },
          name: 'b',
          properties: ['bId'],
          nullable: true,
          nullableProperties: ['bId']
        }
      ]);
      expect(graph.get('public:A')?.foreignKeys).toEqual(cycle?.breakEdges);
    });

    it('US-038 没有环的节点不带 cycle；自引用（树）不算环', () => {
      const graph = buildDependencyGraph(
        graphInputs([
          { name: 'User', namespace: 'public' },
          {
            name: 'Menu',
            namespace: 'public',
            relations: [
              { name: 'parent', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'Menu', nullable: true },
              { name: 'owner', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'User' }
            ]
          }
        ])
      );

      expect(graph.get('public:Menu')?.cycle).toBeUndefined();
      expect(graph.get('public:User')?.cycle).toBeUndefined();
      expect(graph.get('public:Menu')?.foreignKeys?.map(edge => edge.name)).toEqual(['parent', 'owner']);
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

      const graph = buildDependencyGraph(graphInputs(entities));
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

      const graph = buildDependencyGraph(graphInputs(entities));
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

      const graph = buildDependencyGraph(graphInputs(entities));
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

      const graph = buildDependencyGraph(graphInputs(entities));
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

      const graph = buildDependencyGraph(graphInputs(entities));
      const children = getDirectChildren('public', 'User', graph);

      expect(children).toEqual([{ namespace: 'public', entity: 'Todo' }]);
    });
  });

  describe('边界图结构', () => {
    it('关系缺省时不创建依赖，并为未指定 namespace 的关系使用当前 namespace', () => {
      const graph = buildDependencyGraph(
        graphInputs([
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
        ])
      );

      expect(graph.get('tenant:User')).toEqual({
        repository: { namespace: 'tenant', entity: 'User' },
        dependsOn: [],
        requiredBy: [{ namespace: 'tenant', entity: 'Todo' }],
        foreignKeys: []
      });
      expect(graph.get('tenant:Todo')?.dependsOn).toEqual([{ namespace: 'tenant', entity: 'User' }]);
      expect(graph.get('tenant:Audit')?.dependsOn).toEqual([{ namespace: 'shared', entity: 'ExternalUser' }]);
      expect(graph.has('shared:ExternalUser')).toBe(false);
      expect(getAllDependencies('tenant', 'Audit', graph)).toEqual([{ namespace: 'tenant', entity: 'Audit' }]);
    });

    it('允许自引用关系且递归查询只返回一次自身', () => {
      const graph = buildDependencyGraph(
        graphInputs([
          {
            name: 'Branch',
            namespace: 'rxdb',
            relations: [{ kind: RelationKind.MANY_TO_ONE, mappedEntity: 'Branch' }]
          }
        ])
      );

      expect(findDependencyCycles(graph)).toEqual([]);
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

      expect(findDependencyCycles(graph)).toEqual([]);
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
      const graph = buildDependencyGraph(graphInputs([{ name: 'User', namespace: 'public' }]));
      const message = 'Repository public:Missing not found in dependency graph';

      expect(() => getAllDependencies('public', 'Missing', graph)).toThrow(message);
      expect(() => getAllRequiredBy('public', 'Missing', graph)).toThrow(message);
      expect(() => getDirectParents('public', 'Missing', graph)).toThrow(message);
      expect(() => getDirectChildren('public', 'Missing', graph)).toThrow(message);
    });
  });
});

/**
 * US-037：依赖边取自合并后的元数据。
 *
 * `relations` 只装本类自己声明的关系；关系声明在父类上时它是空的，合并视图在 `relationMap`。
 * 实体级复合外键 `foreignKeys` 同样是一条外键。两处漏掉任何一处，推送就会把引用方排在被引用方前面。
 */
describe('依赖边取自合并后的元数据（US-037）', () => {
  @Entity({ name: 'GraphOwner', properties: [{ name: 'name', type: PropertyType.string }] })
  class GraphOwner extends EntityBase {
    name!: string;
  }

  @Entity({
    name: 'GraphOwnedBase',
    relations: [{ name: 'owner', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'GraphOwner', mappedProperty: 'owned' }]
  })
  class GraphOwnedBase extends EntityBase {}

  @Entity({ name: 'GraphOwnedDoc', properties: [{ name: 'title', type: PropertyType.string }] })
  class GraphOwnedDoc extends GraphOwnedBase {
    title!: string;
  }

  @Entity({
    name: 'GraphKeyed',
    properties: [
      { name: 'ownerKey', type: PropertyType.uuid },
      { name: 'ownerName', type: PropertyType.string }
    ],
    foreignKeys: [
      {
        name: 'graph_keyed_owner',
        properties: ['ownerKey', 'ownerName'],
        mappedEntity: 'GraphOwner',
        mappedProperties: ['id', 'name']
      }
    ]
  })
  class GraphKeyed extends EntityBase {
    ownerKey!: string;
    ownerName!: string;
  }

  const owner = { namespace: 'public', entity: 'GraphOwner' };

  it('关系声明在父类上：子类实体依赖被引用实体', () => {
    const graph = buildDependencyGraph([GraphOwnedDoc, GraphOwner].map(EntityClass => getEntityMetadata(EntityClass)));

    expect(graph.get('public:GraphOwnedDoc')?.dependsOn).toEqual([owner]);
    expect(graph.get('public:GraphOwner')?.requiredBy).toEqual([{ namespace: 'public', entity: 'GraphOwnedDoc' }]);
  });

  it('只用实体级 foreignKeys 声明的外键同样成边', () => {
    const graph = buildDependencyGraph([GraphKeyed, GraphOwner].map(EntityClass => getEntityMetadata(EntityClass)));

    expect(graph.get('public:GraphKeyed')?.dependsOn).toEqual([owner]);
    expect(graph.get('public:GraphOwner')?.requiredBy).toEqual([{ namespace: 'public', entity: 'GraphKeyed' }]);
  });

  it('同一对实体之间的多条外键只成一条边', () => {
    const graph = buildDependencyGraph(
      graphInputs([
        { name: 'Owner', namespace: 'public' },
        {
          name: 'Doc',
          namespace: 'public',
          relations: [
            { name: 'author', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'Owner' },
            { name: 'editor', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'Owner' }
          ],
          foreignKeys: [{ mappedEntity: 'Owner' }]
        }
      ])
    );

    expect(graph.get('public:Doc')?.dependsOn).toEqual([{ namespace: 'public', entity: 'Owner' }]);
    expect(graph.get('public:Owner')?.requiredBy).toEqual([{ namespace: 'public', entity: 'Doc' }]);
  });
});

/**
 * US-037：单仓推送推目标所在的连通分量。
 *
 * 只收父仓不够：提交会把父仓的待推删除一起推上去，那些删除需要父仓的其他子仓先删。
 */
describe('collectConnectedRepositories（US-037）', () => {
  // User ← Post → Category；User ← Note；Tag 独立
  const graph = buildDependencyGraph(
    graphInputs([
      { name: 'User', namespace: 'public' },
      { name: 'Category', namespace: 'public' },
      {
        name: 'Post',
        namespace: 'public',
        relations: [
          { name: 'author', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'User' },
          { name: 'category', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'Category' }
        ]
      },
      {
        name: 'Note',
        namespace: 'public',
        relations: [
          { name: 'user', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'User' },
          { name: 'external', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'Missing', mappedNamespace: 'other' }
        ]
      },
      { name: 'Tag', namespace: 'public' }
    ])
  );

  it('沿 dependsOn 与 requiredBy 双向闭包，取到整个连通分量', () => {
    expect([...collectConnectedRepositories(graph, ['public:Category'])].sort()).toEqual([
      'public:Category',
      'public:Note',
      'public:Post',
      'public:User'
    ]);
  });

  it('多个起点取各自分量的并集；孤立仓库只有自己', () => {
    expect([...collectConnectedRepositories(graph, ['public:Tag'])]).toEqual(['public:Tag']);
    expect([...collectConnectedRepositories(graph, ['public:Tag', 'public:Note'])].sort()).toEqual([
      'public:Category',
      'public:Note',
      'public:Post',
      'public:Tag',
      'public:User'
    ]);
  });

  it('悬挂依赖（未注册的实体）不进分量', () => {
    expect(collectConnectedRepositories(graph, ['public:Note']).has('other:Missing')).toBe(false);
  });
});

describe('双向一对一成环（US-038）', () => {
  // 与 shop 夹具同形：User.idCard 可空一对一 + 复合外键 (idCardId, id) → IdCard(id, ownerId)；IdCard.owner 非空一对一
  @Entity({
    name: 'CycleUser',
    namespace: 'cycle',
    properties: [{ name: 'name', type: PropertyType.string }],
    relations: [
      {
        name: 'idCard',
        kind: RelationKind.ONE_TO_ONE,
        mappedEntity: 'CycleIdCard',
        mappedProperty: 'owner',
        nullable: true
      }
    ],
    foreignKeys: [
      {
        name: 'id_card_owner_consistency',
        properties: ['idCardId', 'id'],
        mappedEntity: 'CycleIdCard',
        mappedProperties: ['id', 'ownerId']
      }
    ]
  })
  class CycleUser extends EntityBase {}

  @Entity({
    name: 'CycleIdCard',
    namespace: 'cycle',
    properties: [{ name: 'code', type: PropertyType.string }],
    relations: [
      {
        name: 'owner',
        kind: RelationKind.ONE_TO_ONE,
        mappedEntity: 'CycleUser',
        mappedProperty: 'idCard',
        nullable: false
      }
    ]
  })
  class CycleIdCard extends EntityBase {}

  it('断环边是 User 的两条外键（共用可空的 idCardId），成员先 User 后 IdCard；不再抛 Circular dependency', () => {
    const graph = buildDependencyGraph([getEntityMetadata(CycleIdCard), getEntityMetadata(CycleUser)]);
    const cycle = graph.get('cycle:CycleUser')?.cycle;

    expect(graph.get('cycle:CycleIdCard')?.cycle).toBe(cycle);
    expect(cycle?.members.map(member => member.entity)).toEqual(['CycleUser', 'CycleIdCard']);
    expect(cycle?.breakEdges?.map(edge => [edge.name, edge.properties, edge.nullableProperties])).toEqual([
      ['idCard', ['idCardId'], ['idCardId']],
      ['id_card_owner_consistency', ['idCardId', 'id'], ['idCardId']]
    ]);
    expect(graph.get('cycle:CycleIdCard')?.foreignKeys).toEqual([
      {
        from: { namespace: 'cycle', entity: 'CycleIdCard' },
        to: { namespace: 'cycle', entity: 'CycleUser' },
        name: 'owner',
        properties: ['ownerId'],
        nullable: false,
        nullableProperties: []
      }
    ]);
  });
});
