import { describe, expect, it } from 'vitest';

import { FilterCompileError, compileRuleGroup } from '../rule-group-to-sql.ts';

/** demo 实体 Recipe 的列白名单，与 db.ts 建表语句一致。 */
const COLUMNS = ['id', 'title', 'status', 'price', 'tag', 'updatedAt'] as const;

const compile = (where: unknown) => compileRuleGroup(where, COLUMNS);

/** `?` 占位符个数必须与绑定参数个数严格相等，否则 node:sqlite 会在 run 时抛错。 */
const countPlaceholders = (sql: string) => sql.split('?').length - 1;

describe('compileRuleGroup', () => {
  describe('空条件', () => {
    it('where 缺省时返回恒真式且不绑定任何参数', () => {
      expect(compile(undefined)).toEqual({ sql: '1 = 1', params: [] });
      expect(compile(null)).toEqual({ sql: '1 = 1', params: [] });
    });

    it('规则数组为空的组也是恒真式', () => {
      expect(compile({ combinator: 'and', rules: [] })).toEqual({ sql: '1 = 1', params: [] });
    });
  });

  describe('第一类：标量比较 = != < > <= >=', () => {
    it('把标量值绑成 ?，不拼进 SQL', () => {
      expect(compile({ combinator: 'and', rules: [{ field: 'status', operator: '=', value: 'published' }] })).toEqual({
        sql: '("status" = ?)',
        params: ['published']
      });
    });

    it.each([
      ['!=', '<>'],
      ['<', '<'],
      ['>', '>'],
      ['<=', '<='],
      ['>=', '>=']
    ])('operator %s 映射成 SQL 的 %s', (operator, sqlOperator) => {
      expect(compile({ combinator: 'and', rules: [{ field: 'price', operator, value: 10 }] })).toEqual({
        sql: `("price" ${sqlOperator} ?)`,
        params: [10]
      });
    });

    it('= null / != null 降级成 IS NULL / IS NOT NULL，不留占位符', () => {
      expect(compile({ combinator: 'and', rules: [{ field: 'tag', operator: '=', value: null }] })).toEqual({
        sql: '("tag" IS NULL)',
        params: []
      });
      expect(compile({ combinator: 'and', rules: [{ field: 'tag', operator: '!=', value: null }] })).toEqual({
        sql: '("tag" IS NOT NULL)',
        params: []
      });
    });

    it('大小比较配 null 值直接拒绝——三值逻辑下恒为 NULL，是写错了而不是「查不到」', () => {
      expect(() => compile({ combinator: 'and', rules: [{ field: 'price', operator: '<', value: null }] })).toThrow(
        FilterCompileError
      );
    });

    it('布尔值折成 SQLite 的 1 / 0 后绑定', () => {
      expect(compile({ combinator: 'and', rules: [{ field: 'title', operator: '=', value: true }] })).toEqual({
        sql: '("title" = ?)',
        params: [1]
      });
    });

    it('标量位置传数组 / 对象直接拒绝', () => {
      expect(() => compile({ combinator: 'and', rules: [{ field: 'status', operator: '=', value: ['a'] }] })).toThrow(
        FilterCompileError
      );
      expect(() => compile({ combinator: 'and', rules: [{ field: 'status', operator: '=', value: {} }] })).toThrow(
        FilterCompileError
      );
    });
  });

  describe('第二类：集合 in / notIn', () => {
    it('按元素个数展开占位符', () => {
      expect(compile({ combinator: 'and', rules: [{ field: 'tag', operator: 'in', value: ['sale', 'new'] }] })).toEqual(
        {
          sql: '("tag" IN (?, ?))',
          params: ['sale', 'new']
        }
      );
    });

    it('notIn 生成 NOT IN', () => {
      expect(compile({ combinator: 'and', rules: [{ field: 'tag', operator: 'notIn', value: ['sale'] }] })).toEqual({
        sql: '("tag" NOT IN (?))',
        params: ['sale']
      });
    });

    it('空数组折成常量而不是非法的 IN ()', () => {
      expect(compile({ combinator: 'and', rules: [{ field: 'tag', operator: 'in', value: [] }] })).toEqual({
        sql: '(1 = 0)',
        params: []
      });
      expect(compile({ combinator: 'and', rules: [{ field: 'tag', operator: 'notIn', value: [] }] })).toEqual({
        sql: '(1 = 1)',
        params: []
      });
    });

    it('in 的 value 不是数组时拒绝', () => {
      expect(() => compile({ combinator: 'and', rules: [{ field: 'tag', operator: 'in', value: 'sale' }] })).toThrow(
        FilterCompileError
      );
    });
  });

  describe('第三类：区间 between / notBetween', () => {
    it('绑定上下界两个参数', () => {
      expect(compile({ combinator: 'and', rules: [{ field: 'price', operator: 'between', value: [5, 20] }] })).toEqual({
        sql: '("price" BETWEEN ? AND ?)',
        params: [5, 20]
      });
    });

    it('notBetween 生成 NOT BETWEEN', () => {
      expect(
        compile({ combinator: 'and', rules: [{ field: 'price', operator: 'notBetween', value: [5, 20] }] })
      ).toEqual({
        sql: '("price" NOT BETWEEN ? AND ?)',
        params: [5, 20]
      });
    });

    it('元数不是 2 的 value 拒绝', () => {
      expect(() =>
        compile({ combinator: 'and', rules: [{ field: 'price', operator: 'between', value: [5] }] })
      ).toThrow(FilterCompileError);
      expect(() =>
        compile({ combinator: 'and', rules: [{ field: 'price', operator: 'between', value: [1, 2, 3] }] })
      ).toThrow(FilterCompileError);
    });
  });

  describe('第四类：子串 contains / startsWith / endsWith 及其否定', () => {
    it('contains 用 instr 而不是 LIKE——大小写敏感，与客户端本地过滤同结论', () => {
      expect(compile({ combinator: 'and', rules: [{ field: 'title', operator: 'contains', value: 'Pa' }] })).toEqual({
        sql: '(instr("title", ?) > 0)',
        params: ['Pa']
      });
    });

    it.each([
      ['notContains', '(instr("title", ?) = 0)'],
      ['startsWith', '(instr("title", ?) = 1)'],
      ['notStartsWith', '(instr("title", ?) <> 1)']
    ])('%s 生成 %s', (operator, sql) => {
      expect(compile({ combinator: 'and', rules: [{ field: 'title', operator, value: 'Pa' }] })).toEqual({
        sql,
        params: ['Pa']
      });
    });

    it('endsWith 用尾段切片比较，切片长度按码点计算', () => {
      const { sql, params } = compile({
        combinator: 'and',
        rules: [{ field: 'title', operator: 'endsWith', value: 'ta' }]
      });
      expect(sql).toBe('(substr("title", length("title") - 2 + 1) = ?)');
      expect(params).toEqual(['ta']);
    });

    it('子串匹配的值只能是字符串，数组 / 对象拒绝', () => {
      expect(() =>
        compile({ combinator: 'and', rules: [{ field: 'title', operator: 'contains', value: ['Pa'] }] })
      ).toThrow(FilterCompileError);
    });
  });

  describe('第五类：空值 null / notNull', () => {
    it('不带 value，也不产生占位符', () => {
      expect(compile({ combinator: 'and', rules: [{ field: 'tag', operator: 'null' }] })).toEqual({
        sql: '("tag" IS NULL)',
        params: []
      });
      expect(compile({ combinator: 'and', rules: [{ field: 'tag', operator: 'notNull' }] })).toEqual({
        sql: '("tag" IS NOT NULL)',
        params: []
      });
    });
  });

  describe('嵌套组合', () => {
    it('and / or 逐层加括号，参数按深度优先顺序排列', () => {
      const { sql, params } = compile({
        combinator: 'and',
        rules: [
          { field: 'status', operator: '=', value: 'published' },
          {
            combinator: 'or',
            rules: [
              { field: 'price', operator: '<=', value: 10 },
              { field: 'tag', operator: 'in', value: ['sale', 'new'] }
            ]
          }
        ]
      });

      expect(sql).toBe('("status" = ? AND ("price" <= ? OR "tag" IN (?, ?)))');
      expect(params).toEqual(['published', 10, 'sale', 'new']);
      expect(countPlaceholders(sql)).toBe(params.length);
    });

    it('combinator 不是 and / or 时拒绝', () => {
      expect(() => compile({ combinator: 'xor', rules: [{ field: 'tag', operator: 'null' }] })).toThrow(
        FilterCompileError
      );
    });
  });

  describe('列白名单', () => {
    it('未知列在触达 SQL 之前就被拒绝，且错误带 status 400', () => {
      let thrown: unknown;
      try {
        compile({ combinator: 'and', rules: [{ field: 'secret', operator: '=', value: 1 }] });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(FilterCompileError);
      expect((thrown as FilterCompileError).status).toBe(400);
      expect((thrown as FilterCompileError).message).toContain('secret');
    });

    it('把列名本身当注入载体也无效——白名单是相等匹配，不是转义', () => {
      expect(() =>
        compile({ combinator: 'and', rules: [{ field: 'title" FROM recipes; --', operator: '=', value: 1 }] })
      ).toThrow(FilterCompileError);
    });

    it('未知 operator 拒绝', () => {
      expect(() => compile({ combinator: 'and', rules: [{ field: 'title', operator: 'regex', value: 'a' }] })).toThrow(
        FilterCompileError
      );
    });

    it('关系型 exists / notExists 在本 demo 不支持，显式拒绝而不是静默忽略', () => {
      expect(() => compile({ combinator: 'and', rules: [{ field: 'tag', operator: 'exists' }] })).toThrow(
        FilterCompileError
      );
    });
  });

  describe('零字符串拼接', () => {
    it('注入载荷原样留在 params 里，SQL 文本不含它的任何片段', () => {
      const payload = "'; DROP TABLE recipes; --";
      const { sql, params } = compile({
        combinator: 'and',
        rules: [{ field: 'title', operator: 'contains', value: payload }]
      });

      expect(params).toEqual([payload]);
      expect(sql).not.toContain('DROP');
      expect(sql).not.toContain("'");
      expect(countPlaceholders(sql)).toBe(1);
    });

    it('任意规则组合下，SQL 里除了 ? 与列名不含任何字面量值', () => {
      const { sql, params } = compile({
        combinator: 'or',
        rules: [
          { field: 'title', operator: 'startsWith', value: 'a%b_c' },
          { field: 'price', operator: 'between', value: [1, 2] },
          { field: 'tag', operator: 'in', value: ['x', 'y', 'z'] }
        ]
      });

      expect(countPlaceholders(sql)).toBe(params.length);
      expect(params).toEqual(['a%b_c', 1, 2, 'x', 'y', 'z']);
      expect(sql).not.toContain('a%b_c');
    });
  });
});
