import { EntityMetadata, EntityPropertyMetadata, EntityRelationMetadata, PropertyType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { MAIN_TABLE_ALIAS, RelationPair, format_table_alias, get_relation_key } from '../../query/join_sql.js';
import { buildRuleGroupPG } from '../../query/query_sql.js';

describe('query 工具函数 (PGlite)', () => {
  describe('MAIN_TABLE_ALIAS', () => {
    it('应该是 _', () => {
      expect(MAIN_TABLE_ALIAS).toBe('_');
    });
  });

  describe('format_table_alias', () => {
    it('主表别名应原样返回（不带引号）', () => {
      expect(format_table_alias(MAIN_TABLE_ALIAS)).toBe('_');
    });

    it('其他别名应返回双引号包裹的字符串', () => {
      expect(format_table_alias('users')).toBe('"users"');
      expect(format_table_alias('posts')).toBe('"posts"');
    });
  });

  describe('get_relation_key', () => {
    it('单个关系时应返回关系名称', () => {
      const relation = { name: 'author' } as EntityRelationMetadata;
      const relations: RelationPair[] = [{ metadata: {} as EntityMetadata, relation }];
      expect(get_relation_key(relations, 'posts', relation)).toBe('author');
    });

    it('多个关系时应返回表名_关系名', () => {
      const relation1 = { name: 'author' } as EntityRelationMetadata;
      const relation2 = { name: 'category' } as EntityRelationMetadata;
      const relations: RelationPair[] = [
        { metadata: {} as EntityMetadata, relation: relation1 },
        { metadata: {} as EntityMetadata, relation: relation2 }
      ];
      expect(get_relation_key(relations, 'posts', relation1)).toBe('posts_author');
      expect(get_relation_key(relations, 'posts', relation2)).toBe('posts_category');
    });
  });

  describe('buildRuleGroupPG - 规则构建（参数化）', () => {
    it('空规则组应返回空字符串', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG({ combinator: 'and', rules: [] }, params);
      expect(result).toBe('');
      expect(params).toEqual([]);
    });

    it('单条规则不加括号', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'name', operator: '=', value: 'Alice' }] },
        params
      );
      expect(result).not.toMatch(/^\(/);
      expect(params).toEqual(['Alice']);
    });

    it('多条规则用 AND 连接并加括号', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        {
          combinator: 'and',
          rules: [
            { field: 'name', operator: '=', value: 'Alice' },
            { field: 'age', operator: '>', value: 18 }
          ]
        },
        params
      );
      expect(result).toContain('AND');
      expect(result).toMatch(/^\(/);
      expect(result).toMatch(/\)$/);
      expect(params).toEqual(['Alice', 18]);
    });

    it('多条规则用 OR 连接', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        {
          combinator: 'or',
          rules: [
            { field: 'status', operator: '=', value: 'active' },
            { field: 'status', operator: '=', value: 'pending' }
          ]
        },
        params
      );
      expect(result).toContain('OR');
      expect(params).toEqual(['active', 'pending']);
    });

    it('嵌套规则组', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        {
          combinator: 'and',
          rules: [
            { field: 'active', operator: '=', value: true },
            {
              combinator: 'or',
              rules: [
                { field: 'role', operator: '=', value: 'admin' },
                { field: 'role', operator: '=', value: 'editor' }
              ]
            }
          ]
        },
        params
      );
      // 外层 AND，内层 OR
      expect(result).toContain('AND');
      expect(result).toContain('OR');
      expect(params.length).toBe(3);
    });

    it('= null 应转换为 IS NULL', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'email', operator: '=', value: null }] },
        params
      );
      expect(result).toContain('IS NULL');
      expect(params).toEqual([]);
    });

    it('!= null 应转换为 IS NOT NULL', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'email', operator: '!=', value: null }] },
        params
      );
      expect(result).toContain('IS NOT NULL');
      expect(params).toEqual([]);
    });

    it('null 操作符应转换为 IS NULL（不需要 value）', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG({ combinator: 'and', rules: [{ field: 'deletedAt', operator: 'null' }] }, params);
      expect(result).toContain('IS NULL');
      expect(params).toEqual([]);
    });

    it('notNull 操作符应转换为 IS NOT NULL（不需要 value）', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'publishedAt', operator: 'notNull' }] },
        params
      );
      expect(result).toContain('IS NOT NULL');
      expect(params).toEqual([]);
    });

    it('!= 操作符', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'age', operator: '!=', value: 25 }] },
        params
      );
      expect(result).toContain('!=');
      expect(result).toContain('$1');
      expect(params).toEqual([25]);
    });

    it('> 操作符', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'score', operator: '>', value: 100 }] },
        params
      );
      expect(result).toContain('>');
      expect(params).toEqual([100]);
    });

    it('<= 操作符', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'price', operator: '<=', value: 50.99 }] },
        params
      );
      expect(result).toContain('<=');
      expect(params).toEqual([50.99]);
    });

    it('contains 操作符应转换为 LIKE %value%', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'description', operator: 'contains', value: 'test' }] },
        params
      );
      expect(result).toContain('LIKE');
      expect(params).toEqual(['%test%']);
    });

    it('notContains 操作符应转换为 NOT LIKE %value%', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'name', operator: 'notContains', value: 'bad' }] },
        params
      );
      expect(result).toContain('NOT LIKE');
      expect(params).toEqual(['%bad%']);
    });

    it('startsWith 操作符应转换为 LIKE value%', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'name', operator: 'startsWith', value: 'hello' }] },
        params
      );
      expect(result).toContain('LIKE');
      expect(params).toEqual(['hello%']);
    });

    it('endsWith 操作符应转换为 LIKE %value', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'email', operator: 'endsWith', value: '@example.com' }] },
        params
      );
      expect(result).toContain('LIKE');
      expect(params).toEqual(['%@example.com']);
    });

    it('between 操作符应生成两个参数', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'age', operator: 'between', value: [18, 65] }] },
        params
      );
      expect(result).toContain('BETWEEN');
      expect(result).toContain('$1');
      expect(result).toContain('$2');
      expect(params).toEqual([18, 65]);
    });

    it('in 操作符应转换为 = ANY($n)', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'status', operator: 'in', value: ['active', 'pending'] }] },
        params
      );
      expect(result).toContain('= ANY');
      expect(params).toEqual([['active', 'pending']]);
    });

    it('notIn 操作符应转换为 != ALL($n)', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'role', operator: 'notIn', value: ['banned', 'deleted'] }] },
        params
      );
      expect(result).toContain('!= ALL');
      expect(params).toEqual([['banned', 'deleted']]);
    });

    it('空数组 in 操作符应生成永假条件', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'status', operator: 'in', value: [] }] },
        params
      );
      expect(result).toContain('1=0');
      expect(params).toEqual([]);
    });

    it('空数组 notIn 操作符应生成永真条件', () => {
      const params: unknown[] = [];
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'status', operator: 'notIn', value: [] }] },
        params
      );
      expect(result).toContain('1=1');
      expect(params).toEqual([]);
    });

    it('JSONB contains 操作符应使用 @> 操作符', () => {
      const params: unknown[] = [];
      const entityMetadata = {
        propertyMap: new Map([['data', { type: PropertyType.keyValue, columnName: 'data' } as EntityPropertyMetadata]])
      } as EntityMetadata;
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'data', operator: 'contains', value: { name: 'John' } }] },
        params,
        new Map(),
        entityMetadata
      );
      expect(result).toContain('@>');
      expect(result).toContain('::jsonb');
      expect(params).toEqual([JSON.stringify({ name: 'John' })]);
    });

    it('stringArray in 操作符应使用 PostgreSQL 数组 @> 操作符', () => {
      const params: unknown[] = [];
      const entityMetadata = {
        propertyMap: new Map([
          ['tags', { type: PropertyType.stringArray, columnName: 'tags' } as EntityPropertyMetadata]
        ])
      } as EntityMetadata;
      const result = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'tags', operator: 'in', value: ['tag1', 'tag2'] }] },
        params,
        new Map(),
        entityMetadata
      );
      // PGlite 使用原生 PostgreSQL 数组 @>，而非 SQLite 的 json_each/EXISTS
      expect(result).toContain('@>');
      expect(result).toContain('text[]');
      expect(params).toEqual([['tag1', 'tag2']]);
    });

    it('参数索引应连续递增（多规则）', () => {
      const params: unknown[] = [];
      buildRuleGroupPG(
        {
          combinator: 'and',
          rules: [
            { field: 'name', operator: '=', value: 'Alice' },
            { field: 'age', operator: '>', value: 18 },
            { field: 'city', operator: '=', value: 'NYC' }
          ]
        },
        params
      );
      expect(params).toEqual(['Alice', 18, 'NYC']);
    });
  });
});
