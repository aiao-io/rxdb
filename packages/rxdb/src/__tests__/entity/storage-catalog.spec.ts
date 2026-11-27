import { describe, expect, it } from 'vitest';
import { RxDBError } from '../../RxDBError.js';
import {
  storageExpressionIdentity,
  storageGeneratedExpressions,
  storageIndexExpressions
} from '../../entity/storage-catalog.js';
import { advancedIndexStatements, generatedColumnDefinitions } from '../../entity/storage-ddl.js';
import { storageMetadata } from './storage-test-fixtures.js';

const scalar = `CASE WHEN json_type("ext", '$."a,b"') = 'text' THEN json_extract("ext", '$."a,b"') ELSE NULL END`;

describe('托管存储目录的语义比对', () => {
  it('PG 真实目录新增括号、字面量 text cast 与 NULL 类型不构成漂移，标量转换仍保留', () => {
    const declared = `CASE WHEN jsonb_typeof(("ext")::jsonb->'score') = 'number' THEN (("ext")::jsonb->'score')::numeric ELSE NULL END`;
    const catalog = `CASE WHEN pg_catalog.jsonb_typeof((("ext")::jsonb -> 'score'::text)) = 'number'::text THEN ((("ext")::jsonb -> 'score'::text))::numeric ELSE NULL::numeric END`;
    expect(storageExpressionIdentity(catalog)).toBe(storageExpressionIdentity(declared));
    expect(storageExpressionIdentity(`"ext"::jsonb->'score'`)).not.toBe(
      storageExpressionIdentity(`("ext"::jsonb->'score')::numeric`)
    );
  });

  it('保留运算优先级、区分字符串大小写与字面键，同值的引号转义稳定', () => {
    expect(storageExpressionIdentity(`"ext"::jsonb->'a' = 'yes'`)).not.toBe(
      storageExpressionIdentity(`"ext"::jsonb->('a' = 'yes')`)
    );
    expect(storageExpressionIdentity(`json_extract("ext", '$.A')`)).not.toBe(
      storageExpressionIdentity(`json_extract("ext", '$.a')`)
    );
    expect(storageExpressionIdentity(`json_type("ext", '$.x') IN ('integer', 'real')`)).toContain('in(');
    expect(storageExpressionIdentity(`json_extract("a""b", '$.can''t')`)).toBe(
      storageExpressionIdentity(`((json_extract("a""b", '$.can''t')))`)
    );
  });

  it.each([
    '',
    `lower("ext")`,
    `evil.json_type("ext", '$.x')`,
    `pg_catalog.`,
    `"ext"::integer`,
    `"ext" + 1`,
    `json_type("ext", '$.x'`,
    `CASE WHEN "ext" = 'x' THEN 'y' ELSE NULL`,
    `"ext"; DROP TABLE "item"`
  ])('目录中的未知或残缺表达式拒绝验真：%s', sql => {
    expect(() => storageExpressionIdentity(sql)).toThrow(RxDBError);
  });

  it('索引列清单不被 JSON 字面键中的逗号或嵌套函数拆开', () => {
    const expressions = storageIndexExpressions(`CREATE INDEX "sx_lookup" ON "bom$item" ((${scalar}), "id")`);
    expect(expressions).toHaveLength(2);
    expect(storageExpressionIdentity(expressions[0])).toBe(storageExpressionIdentity(scalar));
    expect(storageExpressionIdentity(expressions[1])).toBe(storageExpressionIdentity('"id"'));
  });

  it('只读取真实生成列，普通 gc_ 列与默认字符串中的伪声明不算托管对象', () => {
    const table = `CREATE TABLE "item" (
      "id" TEXT PRIMARY KEY,
      "note" TEXT DEFAULT 'gc_trap TEXT GENERATED ALWAYS AS (1)',
      "gc_user_column" TEXT,
      "gc_hot" TEXT GENERATED ALWAYS AS (${scalar}) VIRTUAL
    )`;
    const expressions = storageGeneratedExpressions(table);
    expect([...expressions.keys()]).toEqual(['gc_hot']);
    expect(storageExpressionIdentity(expressions.get('gc_hot')!)).toBe(storageExpressionIdentity(scalar));
    expect(storageGeneratedExpressions('CREATE TABLE empty')).toEqual(new Map());
  });

  it.each([
    `CREATE TABLE "item" ("gc_hot" TEXT GENERATED ALWAYS AS (json_extract("ext", '$.x'))`,
    `CREATE TABLE "item" ("gc_hot" TEXT GENERATED ALWAYS AS 'not-expression')`
  ])('不完整的生成列表定义明确拒绝：%s', sql => {
    expect(() => storageGeneratedExpressions(sql)).toThrow(RxDBError);
  });

  it.each(['CREATE INDEX broken', 'CREATE INDEX "sx_x" ON "item" ("id"'])('不完整索引目录明确拒绝：%s', sql => {
    expect(() => storageIndexExpressions(sql)).toThrow(RxDBError);
  });

  it('DDL 使用两端生成模式与托管索引范围，旧普通索引不混入高级索引', () => {
    const metadata = storageMetadata({
      generatedColumns: [
        {
          name: 'rohs_hot',
          expression: {
            kind: 'jsonScalar',
            property: 'ext',
            key: 'rohs_status',
            dataType: 'string',
            jsonText: true
          }
        }
      ],
      indexes: [
        { name: 'title' },
        { name: 'rohs_hot' },
        {
          name: 'expression',
          expression: { kind: 'jsonScalar', property: 'ext', key: 'active', dataType: 'boolean', jsonText: true }
        },
        {
          name: 'ext_gin',
          method: 'gin',
          dialects: ['postgres'],
          expression: { kind: 'jsonDocument', property: 'ext', jsonText: true }
        }
      ]
    });
    expect(generatedColumnDefinitions(metadata, 'sqlite')[0]).toMatch(/GENERATED ALWAYS AS .* VIRTUAL$/);
    expect(generatedColumnDefinitions(metadata, 'postgres')[0]).toMatch(/GENERATED ALWAYS AS .* STORED$/);
    const sqlite = advancedIndexStatements(metadata, 'sqlite', '"bom$item"');
    const postgres = advancedIndexStatements(metadata, 'postgres', '"bom"."item"');
    expect(sqlite).toHaveLength(2);
    expect(postgres).toHaveLength(3);
    expect(sqlite.every(sql => !sql.includes(' USING '))).toBe(true);
    expect(postgres.some(sql => sql.includes(' USING gin ') && sql.includes('jsonb_ops'))).toBe(true);
    expect(postgres.some(sql => sql.includes(' USING btree ') && sql.includes('gc_rohs_hot_'))).toBe(true);
    expect(advancedIndexStatements(storageMetadata(), 'sqlite', '"item"')).toEqual([]);
    expect(generatedColumnDefinitions(storageMetadata(), 'sqlite')).toEqual([]);
  });
});
