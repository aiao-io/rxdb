import { describe, expect, it } from 'vitest';
import { isEntityEffectOrderBy, isEntityMatchWhere } from '../../query/query-matching.utils.js';
import type { OrderBy } from '../../repository/query-options.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';

describe('query.utils', () => {
  describe('isEntityMatchWhere', () => {
    it('传递非法参数会报错', () => {
      try {
        isEntityMatchWhere({ id: 1 }, {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=123', value: 1 }]
        } as unknown as RuleGroup<{ id: number }>);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('测试等于操作符', () => {
      const is = isEntityMatchWhere(
        { id: 1 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: 1 }]
        }
      );
      expect(is).toBe(true);
    });
    it('测试不等于操作符', () => {
      const is = isEntityMatchWhere(
        { id: 1 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: '!=', value: 1 }]
        }
      );
      expect(is).toBe(false);
    });
    it('测试大于等于操作符', () => {
      const is = isEntityMatchWhere(
        { id: 1 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: '>=', value: 1 }]
        }
      );
      expect(is).toBe(true);
    });
    it('测试大于操作符', () => {
      const is = isEntityMatchWhere(
        { id: 1 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: '>', value: 1 }]
        }
      );
      expect(is).toBe(false);
    });
    it('测试小于等于操作符', () => {
      const is = isEntityMatchWhere(
        { id: 1 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: '<=', value: 1 }]
        }
      );
      expect(is).toBe(true);
    });
    it('测试小于操作符', () => {
      const is = isEntityMatchWhere(
        { id: 1 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: '<', value: 1 }]
        }
      );
      expect(is).toBe(false);
    });
    it('测试包含操作符', () => {
      const is = isEntityMatchWhere(
        { id: 1 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'in', value: [1, 2] }]
        }
      );
      expect(is).toBe(true);
    });
    it('测试不包含操作符', () => {
      const is = isEntityMatchWhere(
        { id: 1 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'notIn', value: [1, 2] }]
        }
      );
      expect(is).toBe(false);
    });
    it('测试区间操作符', () => {
      const is = isEntityMatchWhere(
        { id: 1 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'between', value: [0, 2] }]
        }
      );
      expect(is).toBe(true);
    });
    it('测试非区间操作符', () => {
      const is = isEntityMatchWhere(
        { id: 1 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'notBetween', value: [0, 2] }]
        }
      );
      expect(is).toBe(false);
    });

    it('测试字符串包含操作符', () => {
      const is = isEntityMatchWhere(
        { id: 123 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'contains', value: 2 }]
        }
      );
      expect(is).toBe(true);
    });
    it('测试字符串不包含操作符', () => {
      const is = isEntityMatchWhere(
        { id: 123 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'notContains', value: 2 }]
        }
      );
      expect(is).toBe(false);
    });
    it('测试字符串开头匹配操作符', () => {
      const is = isEntityMatchWhere(
        { id: 123 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'startsWith', value: 1 }]
        }
      );
      expect(is).toBe(true);
    });
    it('测试字符串开头不匹配操作符', () => {
      const is = isEntityMatchWhere(
        { id: 123 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'notStartsWith', value: 1 }]
        }
      );
      expect(is).toBe(false);
    });
    it('测试字符串结尾匹配操作符', () => {
      const is = isEntityMatchWhere(
        { id: 123 },
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'endsWith', value: 1 }]
        }
      );
      expect(is).toBe(false);
    });
    it('测试字符串结尾不匹配操作符', () => {
      const is = isEntityMatchWhere(
        { id: 123 },
        {
          combinator: 'or',
          rules: [{ field: 'id', operator: 'notEndsWith', value: 3 }]
        }
      );
      expect(is).toBe(false);
    });
  });

  describe('isEntityEffectOrderBy', () => {
    // RXD-065：并列判定用 compareOrderValues（按值），收窄并列集却用 `===`（按对象引用）。
    // 两个不同的 Date 对象表示同一时刻时并列集被清空，第二排序键不再参与判定，
    // `createdAt asc, id asc` 下同时刻更小 id 的新行会被判成「无影响」，当前页不刷新。
    it('同时刻的不同 Date 对象必须仍按值并列，让第二排序键继续判定', () => {
      const instant = '2026-01-01T00:00:00.000Z';
      const entity = { createdAt: new Date(instant), id: 'a' };
      const result = [{ createdAt: new Date(instant), id: 'b' }];
      const orderBy: OrderBy<string>[] = [
        { field: 'createdAt', sort: 'asc' },
        { field: 'id', sort: 'asc' }
      ];

      // 'a' < 'b'，第二键判定应得出「影响」
      expect(isEntityEffectOrderBy(entity, result, orderBy)).toBe(true);
    });

    it('升序排列：值小于所有元素时影响列表', () => {
      const entity = { value: 0 };
      const result = [{ value: 1 }, { value: 2 }];
      const orderBy: OrderBy<string>[] = [
        {
          field: 'value',
          sort: 'asc'
        }
      ];
      expect(isEntityEffectOrderBy(entity, result, orderBy)).toBe(true);
    });

    it('升序排列：值等于某元素时影响列表', () => {
      const entity = { value: 1 };
      const result = [{ value: 1 }, { value: 2 }];
      const orderBy: OrderBy<string>[] = [
        {
          field: 'value',
          sort: 'asc'
        }
      ];
      expect(isEntityEffectOrderBy(entity, result, orderBy)).toBe(true);
    });
    it('升序排列：值等于最大元素时可能影响列表', () => {
      const entity = { value: 2 };
      const result = [{ value: 1 }, { value: 2 }];
      const orderBy: OrderBy<string>[] = [
        {
          field: 'value',
          sort: 'asc'
        }
      ];
      // 「可能影响」就是影响：并列时位置不确定，必须刷新
      expect(isEntityEffectOrderBy(entity, result, orderBy)).toBe(true);
    });

    it('升序排列：多字段排序时的边界情况测试', () => {
      const entity = { id: 3, value: 2 };
      const result = [
        { id: 1, value: 1 },
        { id: 2, value: 2 }
      ];
      const orderBy: OrderBy<string>[] = [
        {
          field: 'value',
          sort: 'asc'
        },
        {
          field: 'id',
          sort: 'asc'
        }
      ];
      expect(isEntityEffectOrderBy(entity, result, orderBy)).toBe(false);
    });

    it('升序排列：值大于所有元素时不影响列表', () => {
      const entity = { value: 3 };
      const result = [{ value: 1 }, { value: 2 }];
      const orderBy: OrderBy<string>[] = [
        {
          field: 'value',
          sort: 'asc'
        }
      ];
      expect(isEntityEffectOrderBy(entity, result, orderBy)).toBe(false);
    });

    it('降序排列：值小于所有元素时不影响列表', () => {
      const entity = { value: 0 };
      const result = [{ value: 2 }, { value: 1 }];
      const orderBy: OrderBy<string>[] = [
        {
          field: 'value',
          sort: 'desc'
        }
      ];
      expect(isEntityEffectOrderBy(entity, result, orderBy)).toBe(false);
    });

    it('降序排列：值大于所有元素时影响列表', () => {
      const entity = { value: 3 };
      const result = [{ value: 2 }, { value: 1 }];
      const orderBy: OrderBy<string>[] = [
        {
          field: 'value',
          sort: 'desc'
        }
      ];
      expect(isEntityEffectOrderBy(entity, result, orderBy)).toBe(true);
    });

    it('降序排列：值等于最小元素时可能影响列表', () => {
      const entity = { value: 1 };
      const result = [{ value: 2 }, { value: 1 }];
      const orderBy: OrderBy<string>[] = [
        {
          field: 'value',
          sort: 'desc'
        }
      ];
      // 同上：判不出来一律按影响处理
      expect(isEntityEffectOrderBy(entity, result, orderBy)).toBe(true);
    });

    it('排序条件是空的时候返回 true', () => {
      const entity = { value: 1 };
      const result = [{ value: 2 }, { value: 1 }];
      const orderBy: OrderBy<string>[] = [];
      expect(isEntityEffectOrderBy(entity, result, orderBy)).toBe(true);
    });
  });

  describe('EXISTS 操作符匹配', () => {
    describe('基础 EXISTS 匹配', () => {
      it('应该匹配有关联实体的 ONE_TO_MANY 关系', () => {
        const entity = {
          id: '1',
          name: 'Parent',
          children: [
            { id: '2', name: 'Child1' },
            { id: '3', name: 'Child2' }
          ]
        };

        const result = isEntityMatchWhere(entity, {
          combinator: 'and',
          rules: [{ field: 'children', operator: 'exists' }]
        });

        expect(result).toBe(true);
      });

      it('应该匹配没有关联实体的 NOT EXISTS', () => {
        const entity = {
          id: '1',
          name: 'Parent',
          children: []
        };

        const result = isEntityMatchWhere(entity, {
          combinator: 'and',
          rules: [{ field: 'children', operator: 'notExists' }]
        });

        expect(result).toBe(true);
      });

      it('应该匹配有关联实体的 MANY_TO_ONE 关系', () => {
        const entity = {
          id: '1',
          name: 'Child',
          parent: { id: '2', name: 'Parent' }
        };

        const result = isEntityMatchWhere(entity, {
          combinator: 'and',
          rules: [{ field: 'parent', operator: 'exists' }]
        });

        expect(result).toBe(true);
      });

      it('应该匹配 null 关联的 NOT EXISTS', () => {
        const entity = {
          id: '1',
          name: 'Child',
          parent: null
        };

        const result = isEntityMatchWhere(entity, {
          combinator: 'and',
          rules: [{ field: 'parent', operator: 'notExists' }]
        });

        expect(result).toBe(true);
      });
    });

    describe('带 where 条件的 EXISTS 匹配', () => {
      it('应该匹配 ONE_TO_MANY 关系中满足条件的子实体', () => {
        const entity = {
          id: '1',
          name: 'Parent',
          children: [
            { id: '2', name: 'Child1', active: true },
            { id: '3', name: 'Child2', active: false }
          ]
        };

        const result = isEntityMatchWhere(entity, {
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
        });

        expect(result).toBe(true);
      });

      it('应该不匹配 ONE_TO_MANY 关系中没有满足条件的子实体', () => {
        const entity = {
          id: '1',
          name: 'Parent',
          children: [
            { id: '2', name: 'Child1', active: false },
            { id: '3', name: 'Child2', active: false }
          ]
        };

        const result = isEntityMatchWhere(entity, {
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
        });

        expect(result).toBe(false);
      });

      it('应该匹配 NOT EXISTS 当所有子实体都不满足条件', () => {
        const entity = {
          id: '1',
          name: 'Parent',
          children: [
            { id: '2', name: 'Child1', active: false },
            { id: '3', name: 'Child2', active: false }
          ]
        };

        const result = isEntityMatchWhere(entity, {
          combinator: 'and',
          rules: [
            {
              field: 'children',
              operator: 'notExists',
              where: {
                combinator: 'and',
                rules: [{ field: 'active', operator: '=', value: true }]
              }
            }
          ]
        });

        expect(result).toBe(true);
      });

      it('应该匹配 MANY_TO_ONE 关系中满足条件的父实体', () => {
        const entity = {
          id: '1',
          name: 'Child',
          parent: { id: '2', name: 'Parent', active: true }
        };

        const result = isEntityMatchWhere(entity, {
          combinator: 'and',
          rules: [
            {
              field: 'parent',
              operator: 'exists',
              where: {
                combinator: 'and',
                rules: [{ field: 'active', operator: '=', value: true }]
              }
            }
          ]
        });

        expect(result).toBe(true);
      });

      it('应该不匹配 MANY_TO_ONE 关系中不满足条件的父实体', () => {
        const entity = {
          id: '1',
          name: 'Child',
          parent: { id: '2', name: 'Parent', active: false }
        };

        const result = isEntityMatchWhere(entity, {
          combinator: 'and',
          rules: [
            {
              field: 'parent',
              operator: 'exists',
              where: {
                combinator: 'and',
                rules: [{ field: 'active', operator: '=', value: true }]
              }
            }
          ]
        });

        expect(result).toBe(false);
      });

      it('应该支持复杂的 where 条件组合', () => {
        const entity = {
          id: '1',
          name: 'Parent',
          children: [
            { id: '2', name: 'Child1', age: 10, active: true },
            { id: '3', name: 'Child2', age: 20, active: false },
            { id: '4', name: 'Child3', age: 15, active: true }
          ]
        };

        const result = isEntityMatchWhere(entity, {
          combinator: 'and',
          rules: [
            {
              field: 'children',
              operator: 'exists',
              where: {
                combinator: 'and',
                rules: [
                  { field: 'active', operator: '=', value: true },
                  { field: 'age', operator: '>=', value: 15 }
                ]
              }
            }
          ]
        });

        expect(result).toBe(true);
      });
    });

    describe('边界情况', () => {
      it('应该处理空数组的情况', () => {
        const entity = {
          id: '1',
          children: []
        };

        const result = isEntityMatchWhere(entity, {
          combinator: 'and',
          rules: [{ field: 'children', operator: 'exists' }]
        });

        expect(result).toBe(false);
      });

      it('应该处理 undefined 关系的情况', () => {
        const entity = {
          id: '1'
        };

        const result = isEntityMatchWhere(entity, {
          combinator: 'and',
          rules: [{ field: 'parent', operator: 'notExists' }]
        });

        expect(result).toBe(true);
      });
    });
  });

  describe('关系路径字段匹配（点号 field，RXD-017）', () => {
    /**
     * SchemaManager.getFieldRelations 证实点号 field（如 'branch.activated'）在本
     * 代码库中专指关系穿透路径（生产用例见 create-branch.ts:99），且 orderBy 侧
     * （isEntityEffectOrderBy）已用 get() 支持同样的深路径取值（见上方"嵌套字段
     * 一致性"用例）。where 侧的 get_entity_match_rule 却仍用 Reflect.get 做字面量
     * 键查找 —— 'branch.activated' 不是实体上真实存在的属性键，即使关系已加载为
     * 嵌套对象（entity.branch.activated），也永远判不匹配。
     */
    it('=、!= 应该按深路径读取已加载的关系字段，而不是按字面量键查找', () => {
      const entity = { id: '1', branch: { id: 'b1', activated: true } };

      const matches = isEntityMatchWhere(entity, {
        combinator: 'and',
        rules: [{ field: 'branch.activated', operator: '=', value: true }]
      });
      const notMatches = isEntityMatchWhere(entity, {
        combinator: 'and',
        rules: [{ field: 'branch.activated', operator: '!=', value: true }]
      });

      expect(matches).toBe(true);
      expect(notMatches).toBe(false);
    });
  });

  describe('null / notNull 操作符', () => {
    it('null 匹配字段为 null 的实体', () => {
      expect(
        isEntityMatchWhere(
          { id: '1', deletedAt: null },
          {
            combinator: 'and',
            rules: [{ field: 'deletedAt', operator: 'null' }]
          }
        )
      ).toBe(true);
    });

    it('null 匹配字段为 undefined 的实体', () => {
      expect(
        isEntityMatchWhere(
          { id: '1' },
          {
            combinator: 'and',
            rules: [{ field: 'deletedAt', operator: 'null' }]
          }
        )
      ).toBe(true);
    });

    it('null 不匹配字段有值的实体', () => {
      expect(
        isEntityMatchWhere(
          { id: '1', deletedAt: new Date(0) },
          {
            combinator: 'and',
            rules: [{ field: 'deletedAt', operator: 'null' }]
          }
        )
      ).toBe(false);
    });

    it('notNull 匹配字段有值的实体', () => {
      expect(
        isEntityMatchWhere(
          { id: '1', deletedAt: new Date(0) },
          {
            combinator: 'and',
            rules: [{ field: 'deletedAt', operator: 'notNull' }]
          }
        )
      ).toBe(true);
    });

    it('notNull 不匹配字段为 null 的实体', () => {
      expect(
        isEntityMatchWhere(
          { id: '1', deletedAt: null },
          {
            combinator: 'and',
            rules: [{ field: 'deletedAt', operator: 'notNull' }]
          }
        )
      ).toBe(false);
    });

    it('null/notNull 不应抛 Unknown operator 错误（回归）', () => {
      expect(() =>
        isEntityMatchWhere(
          { id: '1', deletedAt: null },
          {
            combinator: 'and',
            rules: [{ field: 'deletedAt', operator: 'notNull' }]
          }
        )
      ).not.toThrow();
    });
  });

  describe('isEntityEffectOrderBy 嵌套字段一致性', () => {
    it('嵌套排序字段对实体与结果集都使用深路径取值', () => {
      const entity = { user: { age: 1 } };
      const result = [{ user: { age: 2 } }, { user: { age: 3 } }];
      const orderBy: OrderBy<string>[] = [{ field: 'user.age', sort: 'asc' }];
      expect(isEntityEffectOrderBy(entity, result, orderBy)).toBe(true);
    });

    it('按 Date 值比较排序影响', () => {
      const result = [{ createdAt: new Date('2026-01-02T00:00:00.000Z') }];
      const orderBy: OrderBy<string>[] = [{ field: 'createdAt', sort: 'asc' }];

      expect(isEntityEffectOrderBy({ createdAt: new Date('2026-01-01T00:00:00.000Z') }, result, orderBy)).toBe(true);
    });

    it('升序时 null 排在非空值之前', () => {
      const result = [{ rank: 1 }];
      const orderBy: OrderBy<string>[] = [{ field: 'rank', sort: 'asc' }];

      expect(isEntityEffectOrderBy({ rank: null }, result, orderBy)).toBe(true);
    });

    it('降序时 null 排在非空值之后', () => {
      const result = [{ rank: 1 }];
      const orderBy: OrderBy<string>[] = [{ field: 'rank', sort: 'desc' }];

      expect(isEntityEffectOrderBy({ rank: null }, result, orderBy)).toBe(false);
    });

    /**
     * 排序键全部并列时位置无法判定：新实体可能落在结果集中间的任意位置。
     * 调用方（query-rules-builder）用 `.some(...)` 收敛结果，返回 undefined 会被
     * 当成 false —— 查询不刷新，新建实体永远不出现。判不出来必须往「影响」判。
     */
    it('所有排序键都并列时判定为影响结果，而不是返回 undefined', () => {
      const result = [{ rank: 1, group: 'a' }];
      const orderBy: OrderBy<string>[] = [
        { field: 'rank', sort: 'asc' },
        { field: 'group', sort: 'asc' }
      ];

      expect(isEntityEffectOrderBy({ rank: 1, group: 'a' }, result, orderBy)).toBe(true);
    });

    it('并列后仍有可判定的次级排序键时，以次级键的结论为准', () => {
      const result = [{ rank: 1, group: 'b' }];
      const orderBy: OrderBy<string>[] = [
        { field: 'rank', sort: 'asc' },
        { field: 'group', sort: 'asc' }
      ];

      // rank 并列 → 看 group：'a' < 'b'，排在前面，影响结果
      expect(isEntityEffectOrderBy({ rank: 1, group: 'a' }, result, orderBy)).toBe(true);
      // rank 并列 → 看 group：'c' > 'b'，排在后面，不影响当前页
      expect(isEntityEffectOrderBy({ rank: 1, group: 'c' }, result, orderBy)).toBe(false);
    });
  });

  describe('RXD-024: JS 匹配与 SQL 三值逻辑/空规则组/集合语义对齐', () => {
    it('!= 对缺失字段应判定不匹配（SQL 里 col != value 在 col IS NULL 时是 UNKNOWN，被 WHERE 排除，不是"当匹配"）', () => {
      const is = isEntityMatchWhere(
        { id: 1, role: null },
        {
          combinator: 'and',
          rules: [{ field: 'role', operator: '!=', value: 'admin' }]
        }
      );
      expect(is).toBe(false);
    });

    it('notIn 对缺失字段应判定不匹配', () => {
      const is = isEntityMatchWhere(
        { id: 1, role: null },
        {
          combinator: 'and',
          rules: [{ field: 'role', operator: 'notIn', value: ['admin', 'user'] }]
        }
      );
      expect(is).toBe(false);
    });

    it('notBetween 对缺失字段应判定不匹配（不能把 null 强转成 0 参与数值比较凑出"在范围内"）', () => {
      const is = isEntityMatchWhere(
        { id: 1, score: null },
        {
          combinator: 'and',
          rules: [{ field: 'score', operator: 'notBetween', value: [5, 10] }]
        }
      );
      expect(is).toBe(false);
    });

    it('notContains 对缺失字段应判定不匹配', () => {
      const is = isEntityMatchWhere(
        { id: 1, name: null },
        {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'notContains', value: 'x' }]
        }
      );
      expect(is).toBe(false);
    });

    it('notStartsWith 对缺失字段应判定不匹配', () => {
      const is = isEntityMatchWhere(
        { id: 1, name: null },
        {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'notStartsWith', value: 'x' }]
        }
      );
      expect(is).toBe(false);
    });

    it('< 对缺失字段应判定不匹配（不能把 null 强转成 0 参与数值比较）', () => {
      const is = isEntityMatchWhere(
        { id: 1, score: null },
        {
          combinator: 'and',
          rules: [{ field: 'score', operator: '<', value: 10 }]
        }
      );
      expect(is).toBe(false);
    });

    it('空 or 规则组应判定匹配所有实体（与三个 SQL 适配器"空规则数组即省略 WHERE，匹配全部"对齐）', () => {
      const is = isEntityMatchWhere({ id: 1 }, { combinator: 'or', rules: [] });
      expect(is).toBe(true);
    });

    it('空 and 规则组本来就已经匹配所有实体（回归保护，确认这一侧本来就和 SQL 一致）', () => {
      const is = isEntityMatchWhere({ id: 1 }, { combinator: 'and', rules: [] });
      expect(is).toBe(true);
    });

    it('in 对数组字段应做逐元素交集匹配，而不是把整个数组当一个候选值做 includes', () => {
      const is = isEntityMatchWhere(
        { id: 1, tags: ['a', 'b', 'c'] },
        {
          combinator: 'and',
          rules: [{ field: 'tags', operator: 'in', value: ['x', 'b'] }]
        }
      );
      expect(is).toBe(true);
    });

    it('notIn 对数组字段应做逐元素交集判断，有交集就不算 notIn 命中', () => {
      const is = isEntityMatchWhere(
        { id: 1, tags: ['a', 'b', 'c'] },
        {
          combinator: 'and',
          rules: [{ field: 'tags', operator: 'notIn', value: ['x', 'b'] }]
        }
      );
      expect(is).toBe(false);
    });
  });
});
