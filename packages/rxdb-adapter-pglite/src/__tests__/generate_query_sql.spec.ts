import { UserRuleGroup } from '@aiao/rxdb-test/shop';
import { describe, expect, it } from 'vitest';
import { buildRuleGroupPG } from '../query/query_sql.js';

describe('构建PG规则组', () => {
  describe('字符串操作符', () => {
    it('in 操作符应转换为 = ANY($n)', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'in', value: ['a', 'b'] }]
        },
        params
      );
      expect(result).toEqual(`"name" = ANY($1)`);
      expect(params).toEqual([['a', 'b']]);
    });

    it('notIn 操作符应转换为 != ALL($n)', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'notIn', value: ['a', 'b'] }]
        },
        params
      );
      expect(result).toEqual(`"name" != ALL($1)`);
      expect(params).toEqual([['a', 'b']]);
    });

    it('between 操作符应正确转换', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'between', value: ['a', 'b'] }]
        },
        params
      );
      expect(result).toEqual(`"name" BETWEEN $1 AND $2`);
      expect(params).toEqual(['a', 'b']);
    });

    it('not between 操作符应正确转换', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'notBetween', value: ['a', 'b'] }]
        },
        params
      );
      expect(result).toEqual(`"name" NOT BETWEEN $1 AND $2`);
      expect(params).toEqual(['a', 'b']);
    });

    it('等于操作符应正确转换', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: '=',
              value: 'a'
            }
          ]
        },
        params
      );
      expect(result).toEqual(`"name" = $1`);
      expect(params).toEqual(['a']);
    });

    it('不等于操作符应正确转换', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: '!=',
              value: '26'
            }
          ]
        },
        params
      );
      expect(result).toEqual(`"name" != $1`);
      expect(params).toEqual(['26']);
    });

    it('包含操作符应转换为带百分号的LIKE', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'contains', value: 'a' }]
        },
        params
      );
      expect(result).toEqual(`"name" LIKE $1`);
      expect(params).toEqual(['%a%']);
    });

    it('不包含操作符应转换为NOT LIKE', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'notContains', value: 'a' }]
        },
        params
      );
      expect(result).toEqual(`"name" NOT LIKE $1`);
      expect(params).toEqual(['%a%']);
    });

    it('以某字符开头操作符应转换为LIKE前缀%', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'startsWith', value: 'a' }]
        },
        params
      );
      expect(result).toEqual(`"name" LIKE $1`);
      expect(params).toEqual(['a%']);
    });

    it('以某字符结尾操作符应转换为LIKE %后缀', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'endsWith', value: 'a' }]
        },
        params
      );
      expect(result).toEqual(`"name" LIKE $1`);
      expect(params).toEqual(['%a']);
    });
  });

  describe('日期操作符', () => {
    it('大于操作符应正确转换', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [
            {
              field: 'createdAt',
              operator: '>',
              value: new Date('2025-09-13T16:02:59.679Z')
            }
          ]
        },
        params
      );
      expect(result).toEqual(`"createdAt" > $1`);
      expect(params).toEqual([new Date('2025-09-13T16:02:59.679Z')]);
    });
  });

  describe('关联字段', () => {
    it('带点符号的关联字段应正确处理', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'idCard.code', operator: '=', value: 'aaa' }]
        },
        params
      );
      expect(result).toEqual(`"idCard"."code" = $1`);
      expect(params).toEqual(['aaa']);
    });
  });

  describe('特殊情况', () => {
    it('空数组的in操作符应转换为永假条件(1=0)', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'in', value: [] }]
        },
        params
      );
      expect(result).toEqual(`1=0`);
      expect(params).toEqual([]);
    });

    it('notIn with empty array -> always true (1=1)', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'notIn', value: [] }]
        },
        params
      );
      expect(result).toEqual(`1=1`);
      expect(params).toEqual([]);
    });

    it('= null -> IS NULL', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'gender', operator: '=', value: null }]
        },
        params
      );
      expect(result).toEqual(`"gender" IS NULL`);
      expect(params).toEqual([]);
    });

    it('!= null -> IS NOT NULL', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'gender', operator: '!=', value: null }]
        },
        params
      );
      expect(result).toEqual(`"gender" IS NOT NULL`);
      expect(params).toEqual([]);
    });

    it('null 操作符（不需要 value）', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'gender', operator: 'null' }]
        },
        params
      );
      expect(result).toEqual(`"gender" IS NULL`);
      expect(params).toEqual([]);
    });

    it('notNull 操作符（不需要 value）', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'gender', operator: 'notNull' }]
        },
        params
      );
      expect(result).toEqual(`"gender" IS NOT NULL`);
      expect(params).toEqual([]);
    });

    it('null 和 notNull 操作符组合使用', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'or',
          rules: [
            { field: 'gender', operator: 'null' },
            { field: 'idCardId', operator: 'notNull' }
          ]
        },
        params
      );
      expect(result).toEqual(`("gender" IS NULL OR "idCardId" IS NOT NULL)`);
      expect(params).toEqual([]);
    });

    it('date between -> parameterized dates', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [
            {
              field: 'createdAt',
              operator: 'between',
              value: [new Date('2020-01-01'), new Date('2020-02-01')]
            }
          ]
        },
        params
      );
      expect(result).toEqual(`"createdAt" BETWEEN $1 AND $2`);
      expect(params).toEqual([new Date('2020-01-01'), new Date('2020-02-01')]);
    });

    it('boolean true -> true (PostgreSQL native)', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG<UserRuleGroup>(
        {
          combinator: 'and',
          rules: [{ field: 'married', operator: '=', value: true }]
        },
        params
      );
      expect(result).toEqual(`"married" = $1`);
      expect(params).toEqual([true]);
    });
  });
});
