import {
  Entity,
  EntityBase,
  EntityMetadata,
  EntityPropertyMetadata,
  EntityRelationMetadata,
  PropertyType,
  RelationKind,
  RuleGroup
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  MAIN_TABLE_ALIAS,
  type RelationPair,
  type RxDBAdapterSqliteBase,
  buildRuleGroup,
  build_rule,
  format_table_alias,
  get_field_sql,
  get_relation_key,
  get_rule_value,
  get_sql_operator,
  handle_array_in,
  handle_exists,
  handle_flatmap_contains,
  resolve_column_name
} from '../../index.js';

describe('query_sql.utils', () => {
  describe('MAIN_TABLE_ALIAS', () => {
    it('应该是 _', () => {
      expect(MAIN_TABLE_ALIAS).toBe('_');
    });
  });

  describe('get_field_sql', () => {
    it('没有别名和点号时应返回带主表别名的字段', () => {
      expect(get_field_sql('name')).toBe('_."name"');
      expect(get_field_sql('age')).toBe('_."age"');
    });

    it('有别名时应返回别名', () => {
      expect(get_field_sql('table.name', 'alias_name')).toBe('alias_name');
      expect(get_field_sql('any.field', 'custom_alias')).toBe('custom_alias');
    });

    it('有点号但无别名时应格式化为带引号的表名和字段名', () => {
      expect(get_field_sql('users.name')).toBe('"users"."name"');
      expect(get_field_sql('posts.title')).toBe('"posts"."title"');
    });

    it('应该处理多个点号的情况', () => {
      expect(get_field_sql('schema.users.name')).toBe('"schema.users"."name"');
    });
  });

  describe('get_rule_value', () => {
    it('应该格式化 in 操作符的值', () => {
      expect(get_rule_value({ field: 'name', operator: 'in', value: ['a', 'b', 'c'] })).toBe("('a', 'b', 'c')");
      expect(get_rule_value({ field: 'name', operator: 'in', value: [1, 2, 3] })).toBe('(1, 2, 3)');
    });

    it('应该格式化 notIn 操作符的值', () => {
      expect(get_rule_value({ field: 'name', operator: 'notIn', value: ['x', 'y'] })).toBe("('x', 'y')");
    });

    it('in/notIn 操作符空数组应返回 (NULL)', () => {
      expect(get_rule_value({ field: 'name', operator: 'in', value: [] })).toBe('(NULL)');
      expect(get_rule_value({ field: 'name', operator: 'notIn', value: [] })).toBe('(NULL)');
    });

    /**
     * `get_sql_value` 对 `Date` / `Uint8Array` **返回对象本身**（那是给参数绑定用的），
     * 而 `format_in_values` 直接 `join(', ')` 成字符串 —— `Date` 会被 `toString()` 成
     * `Wed Jul 29 2026 ...` 这种带空格的裸文本拼进 SQL，直接语法错误。
     */
    it('in 操作符遇 Date 必须生成合法 SQL 字面量', () => {
      const sql = get_rule_value({
        field: 'createdAt',
        operator: 'in',
        value: [new Date('2026-01-01T00:00:00.000Z')]
      });

      // 不得出现未加引号的日期裸文本
      expect(sql).not.toMatch(/\(\s*\w{3}\s\w{3}\s\d{2}\s\d{4}/);
      expect(sql).toBe("('2026-01-01T00:00:00.000Z')");
    });

    it('in 操作符遇不支持的字面量类型应抛错而非拼出非法 SQL', () => {
      expect(() => get_rule_value({ field: 'blob', operator: 'in', value: [new Uint8Array([1, 2])] })).toThrow();
      expect(() => get_rule_value({ field: 'nested', operator: 'in', value: [[1, 2]] })).toThrow();
    });

    it('应该格式化 between 操作符的值', () => {
      expect(get_rule_value({ field: 'name', operator: 'between', value: [1, 10] })).toBe('1 and 10');
      expect(get_rule_value({ field: 'name', operator: 'between', value: ['a', 'z'] })).toBe("'a' and 'z'");
    });

    it('应该格式化 notBetween 操作符的值', () => {
      expect(get_rule_value({ field: 'name', operator: 'notBetween', value: [0, 100] })).toBe('0 and 100');
    });

    it('between 应该处理 Date 对象', () => {
      const date1 = new Date('2025-01-01T00:00:00.000Z');
      const date2 = new Date('2025-12-31T23:59:59.999Z');
      expect(get_rule_value({ field: 'name', operator: 'between', value: [date1, date2] })).toBe(
        "'2025-01-01T00:00:00.000Z' and '2025-12-31T23:59:59.999Z'"
      );
    });

    // SQLC-007：子串类操作符不再编译成 LIKE，因此这里不再产出带 `%` 的模式串，
    // 只返回字面量 —— 拼接由 build_rule 交给 instr/substr 完成。
    it('子串类操作符只返回字面量，不再拼 LIKE 模式（SQLC-007）', () => {
      expect(get_rule_value({ field: 'name', operator: 'contains', value: 'test' })).toBe("'test'");
      expect(get_rule_value({ field: 'name', operator: 'notContains', value: 'bad' })).toBe("'bad'");
      expect(get_rule_value({ field: 'name', operator: 'startsWith', value: 'hello' })).toBe("'hello'");
      expect(get_rule_value({ field: 'name', operator: 'notStartsWith', value: 'bad' })).toBe("'bad'");
      expect(get_rule_value({ field: 'name', operator: 'endsWith', value: 'end' })).toBe("'end'");
      expect(get_rule_value({ field: 'name', operator: 'notEndsWith', value: 'bad' })).toBe("'bad'");
    });

    it('应该格式化字符串值', () => {
      expect(get_rule_value({ field: 'name', operator: '=', value: 'hello' })).toBe("'hello'");
    });

    it('应该格式化数字值', () => {
      expect(get_rule_value({ field: 'name', operator: '=', value: 42 })).toBe('42');
      expect(get_rule_value({ field: 'name', operator: '=', value: 3.14 })).toBe('3.14');
    });

    it('应该格式化布尔值', () => {
      expect(get_rule_value({ field: 'name', operator: '=', value: true })).toBe('1');
      expect(get_rule_value({ field: 'name', operator: '=', value: false })).toBe('0');
    });

    it('应该格式化 Date 对象', () => {
      const date = new Date('2025-01-01T12:00:00.000Z');
      expect(get_rule_value({ field: 'name', operator: '=', value: date })).toBe("'2025-01-01T12:00:00.000Z'");
    });
  });

  describe('get_sql_operator', () => {
    it('应该返回正确的 SQL 操作符', () => {
      expect(get_sql_operator('=')).toBe('=');
      expect(get_sql_operator('!=')).toBe('!=');
      expect(get_sql_operator('>')).toBe('>');
      expect(get_sql_operator('>=')).toBe('>=');
      expect(get_sql_operator('<')).toBe('<');
      expect(get_sql_operator('<=')).toBe('<=');
    });

    it('应该转换操作符为大写', () => {
      expect(get_sql_operator('in')).toBe('IN');
      expect(get_sql_operator('notIn')).toBe('NOT IN');
      expect(get_sql_operator('between')).toBe('BETWEEN');
      expect(get_sql_operator('notBetween')).toBe('NOT BETWEEN');
    });

    // SQLC-007：子串类操作符不再有对应的中缀 SQL 操作符（改由 instr/substr 表达），
    // 继续返回 LIKE 只会把已被判定为错误的语义交给调用方，必须 fail-fast。
    it('子串类操作符不再映射为 LIKE 而是抛错（SQLC-007）', () => {
      for (const operator of ['contains', 'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith']) {
        expect(() => get_sql_operator(operator)).toThrow(/Unsupported query operator/);
      }
    });

    it('未知操作符应抛错而非透传（避免污染 SQL）', () => {
      expect(() => get_sql_operator('customOp')).toThrow(/Unsupported query operator/);
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

  describe('handle_flatmap_contains', () => {
    it('非 keyValue 属性应返回 null', () => {
      const metadata = {
        propertyMap: new Map([['data', { type: PropertyType.string, columnName: 'data' } as EntityPropertyMetadata]])
      } as EntityMetadata;
      const rule = { field: 'name', operator: 'contains', value: { test: 'value' } };
      expect(handle_flatmap_contains(metadata, 'name', rule)).toBe(null);
    });

    it('属性不存在应返回 null', () => {
      const metadata = {
        propertyMap: new Map()
      } as EntityMetadata;
      const rule = { field: 'unknown', operator: 'contains', value: { test: 'value' } };
      expect(handle_flatmap_contains(metadata, 'unknown', rule)).toBe(null);
    });

    it('值不是对象应返回 null', () => {
      const metadata = {
        propertyMap: new Map([['data', { type: PropertyType.keyValue, columnName: 'data' } as EntityPropertyMetadata]])
      } as EntityMetadata;
      const rule = { field: 'data', operator: 'contains', value: 'string value' };
      expect(handle_flatmap_contains(metadata, 'data', rule)).toBe(null);
    });

    it('值是数组应返回 null', () => {
      const metadata = {
        propertyMap: new Map([['data', { type: PropertyType.keyValue, columnName: 'data' } as EntityPropertyMetadata]])
      } as EntityMetadata;
      const rule = { field: 'data', operator: 'contains', value: ['array', 'value'] };
      expect(handle_flatmap_contains(metadata, 'data', rule)).toBe(null);
    });

    it('值对象为空（所有属性为 null）应返回空字符串', () => {
      const metadata = {
        propertyMap: new Map([['data', { type: PropertyType.keyValue, columnName: 'data' } as EntityPropertyMetadata]])
      } as EntityMetadata;
      const rule = { field: 'data', operator: 'contains', value: { key1: null, key2: null } };
      expect(handle_flatmap_contains(metadata, 'data', rule)).toBe('');
    });

    it('应该为 contains 操作生成 OR 条件', () => {
      const metadata = {
        propertyMap: new Map([['data', { type: PropertyType.keyValue, columnName: 'data' } as EntityPropertyMetadata]])
      } as EntityMetadata;
      const rule = { field: 'data', operator: 'contains', value: { name: 'John', city: 'NYC' } };
      const result = handle_flatmap_contains(metadata, 'data', rule);
      expect(result).toContain("instr(json_extract(_.\"data\", '$.name'), 'John') > 0");
      expect(result).toContain("instr(json_extract(_.\"data\", '$.city'), 'NYC') > 0");
      expect(result).toContain(' OR ');
    });

    it('应该为 notContains 操作生成 AND 条件', () => {
      const metadata = {
        propertyMap: new Map([['data', { type: PropertyType.keyValue, columnName: 'data' } as EntityPropertyMetadata]])
      } as EntityMetadata;
      const rule = { field: 'data', operator: 'notContains', value: { name: 'Bad', status: 'invalid' } };
      const result = handle_flatmap_contains(metadata, 'data', rule);
      expect(result).toContain("instr(json_extract(_.\"data\", '$.name'), 'Bad') = 0");
      expect(result).toContain("instr(json_extract(_.\"data\", '$.status'), 'invalid') = 0");
      expect(result).toContain(' AND ');
    });

    it('应该处理 Date 值', () => {
      const metadata = {
        propertyMap: new Map([['data', { type: PropertyType.keyValue, columnName: 'data' } as EntityPropertyMetadata]])
      } as EntityMetadata;
      const date = new Date('2025-01-01T00:00:00.000Z');
      const rule = { field: 'data', operator: 'contains', value: { createdAt: date } };
      const result = handle_flatmap_contains(metadata, 'data', rule);
      expect(result).toContain("instr(json_extract(_.\"data\", '$.createdAt'), '2025-01-01T00:00:00.000Z') > 0");
    });

    it('应该处理数字值', () => {
      const metadata = {
        propertyMap: new Map([['data', { type: PropertyType.keyValue, columnName: 'data' } as EntityPropertyMetadata]])
      } as EntityMetadata;
      const rule = { field: 'data', operator: 'contains', value: { count: 42 } };
      const result = handle_flatmap_contains(metadata, 'data', rule);
      expect(result).toContain("instr(json_extract(_.\"data\", '$.count'), '42') > 0");
    });

    it('应该过滤掉 null 值', () => {
      const metadata = {
        propertyMap: new Map([['data', { type: PropertyType.keyValue, columnName: 'data' } as EntityPropertyMetadata]])
      } as EntityMetadata;
      const rule = { field: 'data', operator: 'contains', value: { name: 'John', invalid: null, city: 'NYC' } };
      const result = handle_flatmap_contains(metadata, 'data', rule);
      expect(result).toContain('name');
      expect(result).toContain('city');
      expect(result).not.toContain('invalid');
    });

    it('应该转义 keyValue 数据库列名', () => {
      const metadata = {
        propertyMap: new Map([
          ['data', { type: PropertyType.keyValue, columnName: 'order"line' } as EntityPropertyMetadata]
        ])
      } as EntityMetadata;
      const rule = { field: 'data', operator: 'contains', value: { name: 'John' } };

      expect(handle_flatmap_contains(metadata, 'data', rule)).toContain(`json_extract(_."order""line", '$.name')`);
    });
  });

  describe('handle_array_in', () => {
    it('属性不存在应返回 null', () => {
      const metadata = {
        propertyMap: new Map()
      } as EntityMetadata;
      const rule = { field: 'unknown', operator: 'in', value: ['a', 'b'] };
      expect(handle_array_in(metadata, 'unknown', rule)).toBe(null);
    });

    it('非数组属性应返回 null', () => {
      const metadata = {
        propertyMap: new Map([['name', { type: PropertyType.string, columnName: 'name' } as EntityPropertyMetadata]])
      } as EntityMetadata;
      const rule = { field: 'name', operator: 'in', value: ['a', 'b'] };
      expect(handle_array_in(metadata, 'name', rule)).toBe(null);
    });

    it('应该为 stringArray 生成 EXISTS 查询', () => {
      const metadata = {
        propertyMap: new Map([
          ['tags', { type: PropertyType.stringArray, columnName: 'tags' } as EntityPropertyMetadata]
        ])
      } as EntityMetadata;
      const rule = { field: 'tags', operator: 'in', value: ['tag1', 'tag2'] };
      const result = handle_array_in(metadata, 'tags', rule);
      expect(result).toContain('EXISTS');
      expect(result).toContain('json_each(_."tags")');
      expect(result).toContain("IN ('tag1', 'tag2')");
    });

    it('应该为 numberArray 生成 EXISTS 查询', () => {
      const metadata = {
        propertyMap: new Map([
          ['scores', { type: PropertyType.numberArray, columnName: 'scores' } as EntityPropertyMetadata]
        ])
      } as EntityMetadata;
      const rule = { field: 'scores', operator: 'in', value: [1, 2, 3] };
      const result = handle_array_in(metadata, 'scores', rule);
      expect(result).toContain('EXISTS');
      expect(result).toContain('json_each(_."scores")');
      expect(result).toContain('IN (1, 2, 3)');
    });

    it('应该为 notIn 操作符生成带 NULL 守卫的 NOT EXISTS 查询（SQLC-008）', () => {
      const metadata = {
        propertyMap: new Map([
          ['tags', { type: PropertyType.stringArray, columnName: 'tags' } as EntityPropertyMetadata]
        ])
      } as EntityMetadata;
      const rule = { field: 'tags', operator: 'notIn', value: ['bad', 'invalid'] };
      const result = handle_array_in(metadata, 'tags', rule);

      // 列为 NULL 时 json_each 不产生行 → 裸 NOT EXISTS 恒为真 → 行被保留；
      // 而 JS 增量匹配把 notIn 归入 NULL_EXCLUDED_OPERATORS 直接返回 false → 行被排除，
      // 两端对同一行给出相反结论。SQL 侧显式排除 NULL 行，向已文档化的契约收敛。
      expect(result).toBe(
        `(_."tags" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM json_each(_."tags") WHERE json_each.value IN ('bad', 'invalid')))`
      );
    });

    it('notIn 的 NULL 守卫必须自带括号，避免被上层 AND/OR 拆开（SQLC-008）', () => {
      const metadata = {
        propertyMap: new Map([
          ['tags', { type: PropertyType.stringArray, columnName: 'tags' } as EntityPropertyMetadata]
        ])
      } as EntityMetadata;
      const rule = { field: 'tags', operator: 'notIn', value: ['bad'] };

      // buildRuleGroup 对单条规则不补括号（query_sql.ts:120-123），
      // 所以这里生成的两段式条件必须自己闭合，否则 `a OR tags notIn [...]` 会变成
      // `a OR tags IS NOT NULL AND NOT EXISTS(...)`，AND 优先级悄悄改写语义。
      const result = handle_array_in(metadata, 'tags', rule);
      expect(result?.startsWith('(')).toBe(true);
      expect(result?.endsWith(')')).toBe(true);
    });

    it('in 操作符不加 NULL 守卫（EXISTS 对 NULL 列本就为假）', () => {
      const metadata = {
        propertyMap: new Map([
          ['tags', { type: PropertyType.stringArray, columnName: 'tags' } as EntityPropertyMetadata]
        ])
      } as EntityMetadata;
      const rule = { field: 'tags', operator: 'in', value: ['good'] };

      expect(handle_array_in(metadata, 'tags', rule)).not.toContain('IS NOT NULL');
    });

    it('应该转义数组数据库列名', () => {
      const metadata = {
        propertyMap: new Map([
          ['tags', { type: PropertyType.stringArray, columnName: 'order"line' } as EntityPropertyMetadata]
        ])
      } as EntityMetadata;
      const rule = { field: 'tags', operator: 'in', value: ['tag1'] };

      expect(handle_array_in(metadata, 'tags', rule)).toContain(`json_each(_."order""line")`);
    });
  });

  describe('handle_exists', () => {
    it('应该转义关系表和外键列名', () => {
      const mappedRelation = {
        name: 'parent',
        kind: RelationKind.MANY_TO_ONE,
        mappedEntity: 'Parent',
        mappedNamespace: 'public',
        mappedProperty: 'children',
        columnName: 'order"line'
      } as EntityRelationMetadata;
      const relation = {
        name: 'children',
        kind: RelationKind.ONE_TO_MANY,
        mappedEntity: 'Child',
        mappedNamespace: 'public',
        mappedProperty: 'parent'
      } as EntityRelationMetadata;
      const childMetadata = {
        name: 'Child',
        tableName: 'order"line',
        namespace: 'public',
        relations: [mappedRelation]
      } as EntityMetadata;
      const metadata = {
        name: 'Parent',
        namespace: 'public',
        relationMap: new Map([['children', relation]])
      } as EntityMetadata;
      const adapter = {
        rxdb: {
          schemaManager: {
            getEntityMetadata: () => childMetadata
          }
        }
      } as unknown as RxDBAdapterSqliteBase;

      expect(handle_exists({ field: 'children', operator: 'exists' }, metadata, adapter)).toBe(
        `EXISTS (SELECT 1 FROM "public$order""line" "child" WHERE "child"."order""line" = _."id")`
      );
    });
  });

  describe('build_rule', () => {
    const fieldAliasMap = new Map<string, string>();

    it('应该构建基本的等号条件', () => {
      const rule = { field: 'name', operator: '=', value: 'John' };
      expect(build_rule(rule, fieldAliasMap)).toBe(`_."name" = 'John'`);
    });

    it('应该构建不等号条件', () => {
      const rule = { field: 'age', operator: '!=', value: 25 };
      expect(build_rule(rule, fieldAliasMap)).toBe('_."age" != 25');
    });

    it('应该构建大于条件', () => {
      const rule = { field: 'score', operator: '>', value: 100 };
      expect(build_rule(rule, fieldAliasMap)).toBe('_."score" > 100');
    });

    it('应该构建小于等于条件', () => {
      const rule = { field: 'price', operator: '<=', value: 50.99 };
      expect(build_rule(rule, fieldAliasMap)).toBe('_."price" <= 50.99');
    });

    it('应该处理 null 值的等号操作', () => {
      const rule = { field: 'email', operator: '=', value: null };
      expect(build_rule(rule, fieldAliasMap)).toBe('_."email" IS NULL');
    });

    it('应该处理 null 值的不等号操作', () => {
      const rule = { field: 'email', operator: '!=', value: null };
      expect(build_rule(rule, fieldAliasMap)).toBe('_."email" IS NOT NULL');
    });

    it('应该处理 null 操作符（不需要 value）', () => {
      const rule = { field: 'email', operator: 'null' };
      expect(build_rule(rule, fieldAliasMap)).toBe('_."email" IS NULL');
    });

    it('应该处理 notNull 操作符（不需要 value）', () => {
      const rule = { field: 'status', operator: 'notNull' };
      expect(build_rule(rule, fieldAliasMap)).toBe('_."status" IS NOT NULL');
    });

    it('应该处理 null 操作符与字段别名', () => {
      const aliasMap = new Map([['users.email', '"users"."email"']]);
      const rule = { field: 'users.email', operator: 'null' };
      expect(build_rule(rule, aliasMap)).toBe('"users"."email" IS NULL');
    });

    it('应该处理 notNull 操作符与带点号的字段', () => {
      const rule = { field: 'users.name', operator: 'notNull' };
      expect(build_rule(rule, fieldAliasMap)).toBe('"users"."name" IS NOT NULL');
    });

    it('应该使用字段别名', () => {
      const aliasMap = new Map([['table.field', 'alias_field']]);
      const rule = { field: 'table.field', operator: '=', value: 'test' };
      expect(build_rule(rule, aliasMap)).toBe("alias_field = 'test'");
    });

    it('应该处理带点号的字段', () => {
      const rule = { field: 'users.name', operator: '=', value: 'Alice' };
      expect(build_rule(rule, fieldAliasMap)).toBe(`"users"."name" = 'Alice'`);
    });

    it('应该构建 in 条件', () => {
      const rule = { field: 'status', operator: 'in', value: ['active', 'pending'] };
      expect(build_rule(rule, fieldAliasMap)).toBe(`_."status" in ('active', 'pending')`);
    });

    it('应该构建 between 条件', () => {
      const rule = { field: 'age', operator: 'between', value: [18, 65] };
      expect(build_rule(rule, fieldAliasMap)).toBe('_."age" between 18 and 65');
    });

    it('between 操作符空值应返回空字符串', () => {
      const rule = { field: 'age', operator: 'between', value: [] };
      expect(build_rule(rule, fieldAliasMap)).toBe('');
    });

    it('应该构建 contains 条件', () => {
      const rule = { field: 'description', operator: 'contains', value: 'test' };
      expect(build_rule(rule, fieldAliasMap)).toBe(`instr(_."description", 'test') > 0`);
    });

    it('应该构建 startsWith 条件', () => {
      const rule = { field: 'name', operator: 'startsWith', value: 'John' };
      expect(build_rule(rule, fieldAliasMap)).toBe(`instr(_."name", 'John') = 1`);
    });

    it('应该构建 endsWith 条件', () => {
      const rule = { field: 'email', operator: 'endsWith', value: '@example.com' };
      expect(build_rule(rule, fieldAliasMap)).toBe(`substr(_."email", length(_."email") - 12 + 1) = '@example.com'`);
    });

    it('应该移除多余空格', () => {
      const rule = { field: 'name', operator: '=', value: 'test' };
      const result = build_rule(rule, fieldAliasMap);
      expect(result).not.toContain('  '); // 不应有连续空格
    });

    it('应该为 keyValue contains 调用特殊处理', () => {
      const metadata = {
        propertyMap: new Map([['data', { type: PropertyType.keyValue, columnName: 'data' } as EntityPropertyMetadata]])
      } as EntityMetadata;
      const rule = { field: 'data', operator: 'contains', value: { name: 'John' } };
      const result = build_rule(rule, fieldAliasMap, metadata);
      expect(result).toContain('json_extract');
    });

    it('应该为数组字段 in 调用特殊处理', () => {
      const metadata = {
        propertyMap: new Map([
          ['tags', { type: PropertyType.stringArray, columnName: 'tags' } as EntityPropertyMetadata]
        ])
      } as EntityMetadata;
      const rule = { field: 'tags', operator: 'in', value: ['tag1'] };
      const result = build_rule(rule, fieldAliasMap, metadata);
      expect(result).toContain('EXISTS');
    });
  });

  describe('format_table_alias', () => {
    it('主表别名应返回不带引号', () => {
      expect(format_table_alias(MAIN_TABLE_ALIAS)).toBe('_');
    });

    it('其他别名应返回带引号', () => {
      expect(format_table_alias('users')).toBe('"users"');
      expect(format_table_alias('posts')).toBe('"posts"');
    });

    it('其他别名包含双引号时应转义', () => {
      expect(format_table_alias('order"line')).toBe('"order""line"');
    });
  });
});

const columnMetadata = {
  propertyMap: new Map<string, EntityPropertyMetadata>([
    ['title', { name: 'title', type: PropertyType.string, columnName: 'title_col' } as EntityPropertyMetadata],
    ['plain', { name: 'plain', type: PropertyType.string, columnName: 'plain_col' } as EntityPropertyMetadata],
    ['kv', { name: 'kv', type: PropertyType.keyValue, columnName: 'kv_col' } as EntityPropertyMetadata]
  ]),
  foreignKeyNames: ['ownerId'],
  foreignKeyColumnNames: ['owner_id']
} as unknown as EntityMetadata;

describe('resolve_column_name', () => {
  it('没有元数据时应原样返回字段名', () => {
    expect(resolve_column_name('title')).toBe('title');
  });

  it('应将属性名映射为数据库列名', () => {
    expect(resolve_column_name('title', columnMetadata)).toBe('title_col');
  });

  it('未知字段应原样返回', () => {
    expect(resolve_column_name('unknown', columnMetadata)).toBe('unknown');
  });

  it('外键字段应映射为外键列名', () => {
    expect(resolve_column_name('ownerId', columnMetadata)).toBe('owner_id');
  });

  it('缺少 foreignKeyColumnNames 时应回退为外键 JS 名称', () => {
    const metadata = {
      propertyMap: new Map(),
      foreignKeyNames: ['ownerId']
    } as unknown as EntityMetadata;
    expect(resolve_column_name('ownerId', metadata)).toBe('ownerId');
  });

  it('缺少 foreignKeyNames 时应原样返回字段名', () => {
    const metadata = { propertyMap: new Map() } as unknown as EntityMetadata;
    expect(resolve_column_name('ownerId', metadata)).toBe('ownerId');
  });

  it('顶层 keyValue 的嵌套路径应返回 keyValue 列名', () => {
    expect(resolve_column_name('kv.string', columnMetadata)).toBe('kv_col');
    expect(resolve_column_name('kv.nested.deep', columnMetadata)).toBe('kv_col');
  });

  it('嵌套路径顶层属性不存在时应原样返回', () => {
    expect(resolve_column_name('missing.x', columnMetadata)).toBe('missing.x');
  });

  it('中间层为 keyValue 时应返回其列名', () => {
    expect(resolve_column_name('plain.kv.x', columnMetadata)).toBe('kv_col');
  });

  it('中间层属性不存在时应原样返回', () => {
    expect(resolve_column_name('plain.missing.x', columnMetadata)).toBe('plain.missing.x');
  });

  it('最后一层属性存在时应返回其列名', () => {
    expect(resolve_column_name('plain.title', columnMetadata)).toBe('title_col');
  });

  it('最后一层属性不存在时应原样返回', () => {
    expect(resolve_column_name('plain.unknown', columnMetadata)).toBe('plain.unknown');
  });
});

describe('get_field_sql - 元数据列名映射', () => {
  it('主表字段应映射列名', () => {
    expect(get_field_sql('title', undefined, columnMetadata)).toBe('_."title_col"');
  });

  it('带点号字段的最后一段应映射列名', () => {
    expect(get_field_sql('rel.title', undefined, columnMetadata)).toBe('"rel"."title_col"');
  });
});

describe('get_rule_value - 边界值', () => {
  it('in 操作符非数组值应返回 (NULL)', () => {
    expect(get_rule_value({ operator: 'in', value: 'not-array' })).toBe('(NULL)');
  });

  it('between 值包含 null 时应返回空字符串', () => {
    expect(get_rule_value({ operator: 'between', value: [null, 5] })).toBe('');
    expect(get_rule_value({ operator: 'between', value: [1, null] })).toBe('');
  });

  it('between 值不足两个时应返回空字符串', () => {
    expect(get_rule_value({ operator: 'between', value: [1] })).toBe('');
  });

  it('普通操作符的 undefined 值应格式化为 NULL', () => {
    expect(get_rule_value({ operator: '=', value: undefined })).toBe('NULL');
  });
});

describe('build_rule - 补充分支', () => {
  const fieldAliasMap = new Map<string, string>();

  it('空数组 in 应生成恒假条件', () => {
    expect(build_rule({ field: 'status', operator: 'in', value: [] }, fieldAliasMap)).toBe('1 = 0');
  });

  it('空数组 notIn 应生成恒真条件', () => {
    expect(build_rule({ field: 'status', operator: 'notIn', value: [] }, fieldAliasMap)).toBe('1 = 1');
  });

  // SQLC-027：value 为 null 时 operator 与 value 双双被置空，输出退化成裸字段 `_."age"`，
  // SQLite 会按真值判断求值 —— 一条非法的比较被静默变成「age 不为 0 且不为 NULL」。
  // 只有 = / != 能与 null 组合（映射成 IS NULL / IS NOT NULL），其余必须 fail-fast。
  it('null 值配合非等值操作符必须抛错，而不是退化成裸字段真值判断', () => {
    expect(() => build_rule({ field: 'age', operator: '>', value: null }, fieldAliasMap)).toThrow(/null/i);
    expect(() => build_rule({ field: 'age', operator: 'contains', value: null }, fieldAliasMap)).toThrow(/null/i);
  });

  it('null 配合 = / != 仍映射为 IS NULL / IS NOT NULL', () => {
    expect(build_rule({ field: 'age', operator: '=', value: null }, fieldAliasMap)).toBe('_."age" IS NULL');
    expect(build_rule({ field: 'age', operator: '!=', value: null }, fieldAliasMap)).toBe('_."age" IS NOT NULL');
  });

  // SQLC-007：contains/startsWith/endsWith 的语义是「字面量子串/前缀/后缀」，此前被编译成 LIKE：
  // `%` `_` 在 LIKE 里是通配符（`startsWith('a_b')` 连 `axb` 一起命中），而 SQLite 的 LIKE
  // 对 ASCII 又大小写不敏感 —— 与 JS 增量匹配的 String.includes/startsWith/endsWith 结论相反。
  // instr/substr 做二进制比较，两个问题一次消掉，也不需要 ESCAPE 子句。
  it('contains 非 keyValue 字段应走 instr 字面量匹配（SQLC-007）', () => {
    const rule = { field: 'title', operator: 'contains', value: 'x' };
    expect(build_rule(rule, fieldAliasMap, columnMetadata)).toBe(`instr(_."title_col", 'x') > 0`);
  });

  it('notContains 生成 instr = 0（SQLC-007）', () => {
    const rule = { field: 'title', operator: 'notContains', value: 'x' };
    expect(build_rule(rule, fieldAliasMap, columnMetadata)).toBe(`instr(_."title_col", 'x') = 0`);
  });

  it('startsWith 生成 instr = 1（SQLC-007）', () => {
    const rule = { field: 'title', operator: 'startsWith', value: 'x' };
    expect(build_rule(rule, fieldAliasMap, columnMetadata)).toBe(`instr(_."title_col", 'x') = 1`);
  });

  it('notStartsWith 生成 instr <> 1（SQLC-007）', () => {
    const rule = { field: 'title', operator: 'notStartsWith', value: 'x' };
    expect(build_rule(rule, fieldAliasMap, columnMetadata)).toBe(`instr(_."title_col", 'x') <> 1`);
  });

  it('endsWith 按字符长度回退切片比较（SQLC-007）', () => {
    const rule = { field: 'title', operator: 'endsWith', value: 'xy' };
    expect(build_rule(rule, fieldAliasMap, columnMetadata)).toBe(
      `substr(_."title_col", length(_."title_col") - 2 + 1) = 'xy'`
    );
  });

  it('notEndsWith 取反同一切片比较（SQLC-007）', () => {
    const rule = { field: 'title', operator: 'notEndsWith', value: 'xy' };
    expect(build_rule(rule, fieldAliasMap, columnMetadata)).toBe(
      `substr(_."title_col", length(_."title_col") - 2 + 1) <> 'xy'`
    );
  });

  it('值里的 LIKE 通配符按字面量处理，不再需要转义（SQLC-007）', () => {
    const rule = { field: 'title', operator: 'startsWith', value: 'a_b%c' };
    expect(build_rule(rule, fieldAliasMap, columnMetadata)).toBe(`instr(_."title_col", 'a_b%c') = 1`);
  });

  it('endsWith 的长度按码点计算，代理对不会被算成两个字符（SQLC-007）', () => {
    // '𝒳y' 的 UTF-16 length 是 3，码点数是 2；SQLite 的 substr/length 按字符计数，
    // 用 String.length 会把切片起点算错一位。
    const rule = { field: 'title', operator: 'endsWith', value: '𝒳y' };
    expect(build_rule(rule, fieldAliasMap, columnMetadata)).toBe(
      `substr(_."title_col", length(_."title_col") - 2 + 1) = '𝒳y'`
    );
  });

  it('in 非数组类型字段应走普通 IN', () => {
    const rule = { field: 'title', operator: 'in', value: ['a'] };
    expect(build_rule(rule, fieldAliasMap, columnMetadata)).toBe(`_."title_col" in ('a')`);
  });

  it('notIn 数组类型字段应生成带 NULL 守卫的 NOT EXISTS（SQLC-008）', () => {
    const metadata = {
      propertyMap: new Map([['tags', { type: PropertyType.stringArray, columnName: 'tags' } as EntityPropertyMetadata]])
    } as EntityMetadata;
    const result = build_rule({ field: 'tags', operator: 'notIn', value: ['a'] }, fieldAliasMap, metadata);
    expect(result).toMatch(/^\(_\."tags" IS NOT NULL AND NOT EXISTS/);
  });

  it('exists 操作符缺少 adapter 时应抛出不支持操作符错误', () => {
    const metadata = { propertyMap: new Map(), relationMap: new Map() } as unknown as EntityMetadata;
    expect(() => build_rule({ field: 'children', operator: 'exists' }, fieldAliasMap, metadata)).toThrow(
      /Unsupported query operator/
    );
  });
});

// ---------------------------------------------------------------------------
// handle_exists 各关系类型分支
// ---------------------------------------------------------------------------

const createAdapterMock = (options: {
  relationMetadata?: EntityMetadata;
  mappedRelation?: { metadata: EntityMetadata; relation: EntityRelationMetadata };
}): RxDBAdapterSqliteBase =>
  ({
    rxdb: {
      schemaManager: {
        getEntityMetadata: () => options.relationMetadata,
        findMappedRelation: () => options.mappedRelation
      }
    }
  }) as unknown as RxDBAdapterSqliteBase;

describe('handle_exists - 通用分支', () => {
  const relation = {
    name: 'owner',
    kind: RelationKind.MANY_TO_ONE,
    mappedEntity: 'Owner',
    mappedNamespace: 'public',
    mappedProperty: 'orders',
    columnName: 'ownerId'
  } as unknown as EntityRelationMetadata;
  const ownerMetadata = {
    name: 'Owner',
    namespace: 'public',
    tableName: 'owner',
    propertyMap: new Map([
      ['name', { name: 'name', type: PropertyType.string, columnName: 'name' } as EntityPropertyMetadata]
    ]),
    relations: []
  } as unknown as EntityMetadata;
  const orderMetadata = {
    name: 'Order',
    namespace: 'public',
    propertyMap: new Map(),
    relationMap: new Map([['owner', relation]])
  } as unknown as EntityMetadata;

  it('非 exists 操作符应返回 null', () => {
    const adapter = createAdapterMock({ relationMetadata: ownerMetadata });
    expect(handle_exists({ field: 'owner', operator: '=' }, orderMetadata, adapter)).toBe(null);
  });

  it('关系不存在应返回 null', () => {
    const adapter = createAdapterMock({ relationMetadata: ownerMetadata });
    expect(handle_exists({ field: 'ghost', operator: 'exists' }, orderMetadata, adapter)).toBe(null);
  });

  it('关系实体元数据缺失应抛错', () => {
    const adapter = createAdapterMock({});
    expect(() => handle_exists({ field: 'owner', operator: 'exists' }, orderMetadata, adapter)).toThrow(
      /Cannot find metadata for entity/
    );
  });

  it('MANY_TO_ONE 无 where 应生成 IS NOT NULL', () => {
    const adapter = createAdapterMock({ relationMetadata: ownerMetadata });
    expect(handle_exists({ field: 'owner', operator: 'exists' }, orderMetadata, adapter)).toBe(
      '_."ownerId" IS NOT NULL'
    );
  });

  it('MANY_TO_ONE 有 where 应生成 EXISTS 子查询', () => {
    const adapter = createAdapterMock({ relationMetadata: ownerMetadata });
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'name', operator: '=', value: 'Tom' }] };
    const result = handle_exists({ field: 'owner', operator: 'exists', where }, orderMetadata, adapter, () => ({
      where: `"child"."name" = 'Tom'`,
      join: ''
    }));
    expect(result).toBe(
      `EXISTS (SELECT 1 FROM "public$owner" "child" WHERE _."ownerId" = "child"."id" AND "child"."name" = 'Tom')`
    );
  });

  // 子查询 where 里的关系路径需要在子查询内部再挂 JOIN，位置只能在 FROM 之后、WHERE 之前（SQLC-010）
  it('MANY_TO_ONE 的子查询 JOIN 应插在 FROM 之后 WHERE 之前', () => {
    const adapter = createAdapterMock({ relationMetadata: ownerMetadata });
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'group.name', operator: '=', value: 'g1' }] };
    const result = handle_exists({ field: 'owner', operator: 'exists', where }, orderMetadata, adapter, () => ({
      where: `"group"."name" = 'g1'`,
      join: ` LEFT JOIN "public$group" "group" ON "group"."id" = "child"."groupId"`
    }));
    expect(result).toBe(
      `EXISTS (SELECT 1 FROM "public$owner" "child"` +
        ` LEFT JOIN "public$group" "group" ON "group"."id" = "child"."groupId"` +
        ` WHERE _."ownerId" = "child"."id" AND "group"."name" = 'g1')`
    );
  });

  it('notExists 应添加 NOT 前缀', () => {
    const adapter = createAdapterMock({ relationMetadata: ownerMetadata });
    expect(handle_exists({ field: 'owner', operator: 'notExists' }, orderMetadata, adapter)).toBe(
      'NOT _."ownerId" IS NOT NULL'
    );
  });

  it('有 where 但没有 buildWhere 时应按无 where 处理', () => {
    const adapter = createAdapterMock({ relationMetadata: ownerMetadata });
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'name', operator: '=', value: 'Tom' }] };
    expect(handle_exists({ field: 'owner', operator: 'exists', where }, orderMetadata, adapter)).toBe(
      '_."ownerId" IS NOT NULL'
    );
  });
});

describe('handle_exists - ONE_TO_MANY', () => {
  const relation = {
    name: 'children',
    kind: RelationKind.ONE_TO_MANY,
    mappedEntity: 'Child',
    mappedNamespace: 'public',
    mappedProperty: 'parent'
  } as unknown as EntityRelationMetadata;
  const parentMetadata = {
    name: 'Parent',
    namespace: 'public',
    propertyMap: new Map(),
    relationMap: new Map([['children', relation]])
  } as unknown as EntityMetadata;

  it('有 where 时应在 EXISTS 内追加 AND 条件', () => {
    const childMetadata = {
      name: 'Child',
      namespace: 'public',
      tableName: 'child',
      propertyMap: new Map(),
      relations: [
        {
          name: 'parent',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Parent',
          mappedNamespace: 'public',
          mappedProperty: 'children',
          columnName: 'parentId'
        }
      ]
    } as unknown as EntityMetadata;
    const adapter = createAdapterMock({ relationMetadata: childMetadata });
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'title', operator: '=', value: 'a' }] };
    const result = handle_exists({ field: 'children', operator: 'exists', where }, parentMetadata, adapter, () => ({
      where: `"child"."title" = 'a'`,
      join: ''
    }));
    expect(result).toBe(
      `EXISTS (SELECT 1 FROM "public$child" "child" WHERE "child"."parentId" = _."id" AND "child"."title" = 'a')`
    );
  });

  // 子查询 where 里的关系路径需要在子查询内部再挂 JOIN，位置只能在 FROM 之后、WHERE 之前（SQLC-010）
  it('子查询 JOIN 应插在 FROM 之后 WHERE 之前', () => {
    const childMetadata = {
      name: 'Child',
      namespace: 'public',
      tableName: 'child',
      propertyMap: new Map(),
      relations: [{ name: 'parent', mappedEntity: 'Parent', mappedProperty: 'children', columnName: 'parentId' }]
    } as unknown as EntityMetadata;
    const adapter = createAdapterMock({ relationMetadata: childMetadata });
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'group.name', operator: '=', value: 'g1' }] };
    const result = handle_exists({ field: 'children', operator: 'exists', where }, parentMetadata, adapter, () => ({
      where: `"group"."name" = 'g1'`,
      join: ` LEFT JOIN "public$group" "group" ON "group"."id" = "child"."groupId"`
    }));
    expect(result).toBe(
      `EXISTS (SELECT 1 FROM "public$child" "child"` +
        ` LEFT JOIN "public$group" "group" ON "group"."id" = "child"."groupId"` +
        ` WHERE "child"."parentId" = _."id" AND "group"."name" = 'g1')`
    );
  });

  it('mappedProperty 关系缺失时应抛错', () => {
    const childMetadata = {
      name: 'Child',
      namespace: 'public',
      tableName: 'child',
      propertyMap: new Map(),
      relations: []
    } as unknown as EntityMetadata;
    const adapter = createAdapterMock({ relationMetadata: childMetadata });
    expect(() => handle_exists({ field: 'children', operator: 'exists' }, parentMetadata, adapter)).toThrow(
      /Cannot find mappedProperty relation/
    );
  });
});

describe('handle_exists - ONE_TO_ONE', () => {
  const relation = {
    name: 'idCard',
    kind: RelationKind.ONE_TO_ONE,
    mappedEntity: 'Card',
    mappedNamespace: 'public',
    mappedProperty: 'owner',
    columnName: 'idCardId'
  } as unknown as EntityRelationMetadata;
  const cardMetadata = {
    name: 'Card',
    namespace: 'public',
    tableName: 'card',
    propertyMap: new Map(),
    relations: []
  } as unknown as EntityMetadata;
  const userMetadata = {
    name: 'User',
    namespace: 'public',
    propertyMap: new Map(),
    relationMap: new Map([['idCard', relation]])
  } as unknown as EntityMetadata;
  const where: RuleGroup = { combinator: 'and', rules: [{ field: 'code', operator: '=', value: 'c1' }] };

  it('对方持有外键时应用对方外键列生成 EXISTS', () => {
    const adapter = createAdapterMock({
      relationMetadata: cardMetadata,
      mappedRelation: {
        metadata: cardMetadata,
        relation: { name: 'owner', columnName: 'userId' } as unknown as EntityRelationMetadata
      }
    });
    expect(handle_exists({ field: 'idCard', operator: 'exists' }, userMetadata, adapter)).toBe(
      `EXISTS (SELECT 1 FROM "public$card" "child" WHERE "child"."userId" = _."id")`
    );
  });

  it('对方持有外键 + where 时应追加 AND 条件', () => {
    const adapter = createAdapterMock({
      relationMetadata: cardMetadata,
      mappedRelation: {
        metadata: cardMetadata,
        relation: { name: 'owner', columnName: 'userId' } as unknown as EntityRelationMetadata
      }
    });
    const result = handle_exists({ field: 'idCard', operator: 'exists', where }, userMetadata, adapter, () => ({
      where: `"child"."code" = 'c1'`,
      join: ''
    }));
    expect(result).toBe(
      `EXISTS (SELECT 1 FROM "public$card" "child" WHERE "child"."userId" = _."id" AND "child"."code" = 'c1')`
    );
  });

  // 子查询 where 里的关系路径需要在子查询内部再挂 JOIN，位置只能在 FROM 之后、WHERE 之前（SQLC-010）
  it('子查询 JOIN 应插在 FROM 之后 WHERE 之前', () => {
    const adapter = createAdapterMock({
      relationMetadata: cardMetadata,
      mappedRelation: {
        metadata: cardMetadata,
        relation: { name: 'owner', columnName: 'userId' } as unknown as EntityRelationMetadata
      }
    });
    const relationWhere: RuleGroup = {
      combinator: 'and',
      rules: [{ field: 'group.name', operator: '=', value: 'g1' }]
    };
    const result = handle_exists(
      { field: 'idCard', operator: 'exists', where: relationWhere },
      userMetadata,
      adapter,
      () => ({
        where: `"group"."name" = 'g1'`,
        join: ` LEFT JOIN "public$group" "group" ON "group"."id" = "child"."groupId"`
      })
    );
    expect(result).toBe(
      `EXISTS (SELECT 1 FROM "public$card" "child"` +
        ` LEFT JOIN "public$group" "group" ON "group"."id" = "child"."groupId"` +
        ` WHERE "child"."userId" = _."id" AND "group"."name" = 'g1')`
    );
  });

  it('对方外键缺少 columnName 时应抛错', () => {
    const adapter = createAdapterMock({
      relationMetadata: cardMetadata,
      mappedRelation: {
        metadata: cardMetadata,
        relation: { name: 'owner' } as unknown as EntityRelationMetadata
      }
    });
    expect(() => handle_exists({ field: 'idCard', operator: 'exists' }, userMetadata, adapter)).toThrow(
      /has no columnName/
    );
  });

  it('本方持有外键且无 where 应生成 IS NOT NULL', () => {
    const adapter = createAdapterMock({ relationMetadata: cardMetadata });
    expect(handle_exists({ field: 'idCard', operator: 'exists' }, userMetadata, adapter)).toBe(
      '_."idCardId" IS NOT NULL'
    );
  });

  it('本方持有外键 + where 应生成 EXISTS 子查询', () => {
    const adapter = createAdapterMock({ relationMetadata: cardMetadata });
    const result = handle_exists({ field: 'idCard', operator: 'exists', where }, userMetadata, adapter, () => ({
      where: `"child"."code" = 'c1'`,
      join: ''
    }));
    expect(result).toBe(
      `EXISTS (SELECT 1 FROM "public$card" "child" WHERE _."idCardId" = "child"."id" AND "child"."code" = 'c1')`
    );
  });
});

@Entity({
  name: 'QsuPostTag',
  properties: [{ name: 'note', type: PropertyType.string, nullable: true }],
  relations: [
    { name: 'post', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'QsuPost', mappedProperty: 'tags' },
    { name: 'tag', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'QsuTag', mappedProperty: 'posts' }
  ]
})
class QsuPostTag extends EntityBase {}

class QsuPlainJunction {}

describe('handle_exists - MANY_TO_MANY', () => {
  const tagMetadata = {
    name: 'QsuTag',
    namespace: 'public',
    tableName: 'qsu_tag',
    propertyMap: new Map(),
    relations: []
  } as unknown as EntityMetadata;
  const createM2MMetadata = (junctionEntityType?: unknown): EntityMetadata => {
    const relation = {
      name: 'tags',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'QsuTag',
      mappedNamespace: 'public',
      mappedProperty: 'posts',
      junctionEntityType
    } as unknown as EntityRelationMetadata;
    return {
      name: 'QsuPost',
      namespace: 'public',
      propertyMap: new Map(),
      relationMap: new Map([['tags', relation]])
    } as unknown as EntityMetadata;
  };

  it('应生成带中间表 INNER JOIN 的 EXISTS 子查询', () => {
    const adapter = createAdapterMock({ relationMetadata: tagMetadata });
    const result = handle_exists({ field: 'tags', operator: 'exists' }, createM2MMetadata(QsuPostTag), adapter);
    expect(result).toBe(
      `EXISTS (SELECT 1 FROM "public$qsu_tag" "child"` +
        ` INNER JOIN "public$QsuPostTag" "junction" ON "junction"."tagId" = "child"."id"` +
        ` WHERE "junction"."postId" = _."id")`
    );
  });

  it('有 where 时应追加 AND 条件', () => {
    const adapter = createAdapterMock({ relationMetadata: tagMetadata });
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'label', operator: '=', value: 'hot' }] };
    const result = handle_exists(
      { field: 'tags', operator: 'exists', where },
      createM2MMetadata(QsuPostTag),
      adapter,
      () => ({ where: `"child"."label" = 'hot'`, join: '' })
    );
    expect(result).toContain(`AND "child"."label" = 'hot')`);
  });

  // MANY_TO_MANY 的 FROM 后面已经有中间表 INNER JOIN，追加的关系 JOIN 必须排在它之后（SQLC-010）
  it('子查询 JOIN 应插在中间表 INNER JOIN 之后 WHERE 之前', () => {
    const adapter = createAdapterMock({ relationMetadata: tagMetadata });
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'group.name', operator: '=', value: 'g1' }] };
    const result = handle_exists(
      { field: 'tags', operator: 'exists', where },
      createM2MMetadata(QsuPostTag),
      adapter,
      () => ({
        where: `"group"."name" = 'g1'`,
        join: ` LEFT JOIN "public$group" "group" ON "group"."id" = "child"."groupId"`
      })
    );
    expect(result).toBe(
      `EXISTS (SELECT 1 FROM "public$qsu_tag" "child"` +
        ` INNER JOIN "public$QsuPostTag" "junction" ON "junction"."tagId" = "child"."id"` +
        ` LEFT JOIN "public$group" "group" ON "group"."id" = "child"."groupId"` +
        ` WHERE "junction"."postId" = _."id" AND "group"."name" = 'g1')`
    );
  });

  it('缺少 junctionEntityType 应抛错', () => {
    const adapter = createAdapterMock({ relationMetadata: tagMetadata });
    expect(() => handle_exists({ field: 'tags', operator: 'exists' }, createM2MMetadata(undefined), adapter)).toThrow(
      /missing junctionEntityType/
    );
  });

  it('中间实体无元数据应抛错', () => {
    const adapter = createAdapterMock({ relationMetadata: tagMetadata });
    expect(() =>
      handle_exists({ field: 'tags', operator: 'exists' }, createM2MMetadata(QsuPlainJunction), adapter)
    ).toThrow(/Cannot find metadata for junction entity/);
  });

  it('中间实体缺少指向当前实体的关系应抛错', () => {
    const adapter = createAdapterMock({ relationMetadata: tagMetadata });
    const metadata = createM2MMetadata(QsuPostTag);
    (metadata as unknown as { name: string }).name = 'QsuOther';
    expect(() => handle_exists({ field: 'tags', operator: 'exists' }, metadata, adapter)).toThrow(
      /pointing to QsuOther/
    );
  });

  it('中间实体缺少指向关联实体的关系应抛错', () => {
    const strangerMetadata = {
      name: 'QsuStranger',
      namespace: 'public',
      tableName: 'qsu_stranger',
      propertyMap: new Map(),
      relations: []
    } as unknown as EntityMetadata;
    const adapter = createAdapterMock({ relationMetadata: strangerMetadata });
    expect(() => handle_exists({ field: 'tags', operator: 'exists' }, createM2MMetadata(QsuPostTag), adapter)).toThrow(
      /pointing to QsuStranger/
    );
  });
});

describe('build_rule - exists 集成', () => {
  const relation = {
    name: 'owner',
    kind: RelationKind.MANY_TO_ONE,
    mappedEntity: 'Owner',
    mappedNamespace: 'public',
    mappedProperty: 'orders',
    columnName: 'ownerId'
  } as unknown as EntityRelationMetadata;
  const ownerMetadata = {
    name: 'Owner',
    namespace: 'public',
    tableName: 'owner',
    propertyMap: new Map([
      ['name', { name: 'name', type: PropertyType.string, columnName: 'name_col' } as EntityPropertyMetadata]
    ]),
    relations: []
  } as unknown as EntityMetadata;
  const orderMetadata = {
    name: 'Order',
    namespace: 'public',
    propertyMap: new Map(),
    relationMap: new Map([['owner', relation]])
  } as unknown as EntityMetadata;
  const adapter = createAdapterMock({ relationMetadata: ownerMetadata });

  it('应通过 buildRuleGroup 生成带子查询条件的 EXISTS', () => {
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'name', operator: '=', value: 'Tom' }] };
    const result = build_rule(
      { field: 'owner', operator: 'exists', where },
      new Map(),
      orderMetadata,
      adapter,
      buildRuleGroup
    );
    expect(result).toBe(
      `EXISTS (SELECT 1 FROM "public$owner" "child" WHERE _."ownerId" = "child"."id" AND "child"."name_col" = 'Tom')`
    );
  });

  it('exists 字段不是关系时应回落并抛出不支持操作符错误', () => {
    expect(() =>
      build_rule({ field: 'ghost', operator: 'exists' }, new Map(), orderMetadata, adapter, buildRuleGroup)
    ).toThrow(/Unsupported query operator/);
  });
});
