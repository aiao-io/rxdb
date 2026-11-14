import { describe, expect, it } from 'vitest';
import { RxDBError } from '../../RxDBError.js';
import {
  compileStorageExpression,
  type JsonScalarStorageExpression,
  type StorageDialect,
  type StorageExpression
} from '../../entity/storage-expression.js';
import { storageMetadata } from './storage-test-fixtures.js';

const scalar: JsonScalarStorageExpression = {
  kind: 'jsonScalar',
  property: 'ext',
  key: 'rohs_status',
  dataType: 'string',
  jsonText: true
};

describe('声明式 JSON 存储表达式', () => {
  it('SQLite 字符串标量使用物理源列和 JSON 类型守卫，缺键/null 不转为空字符串', () => {
    const result = compileStorageExpression(storageMetadata(), scalar, 'sqlite');
    expect(result).toMatchObject({
      kind: 'jsonScalar',
      dataType: 'string',
      sourceProperty: 'ext',
      sourceColumn: 'ext_json'
    });
    expect(result.sql).toContain('json_extract("ext_json",');
    expect(result.sql).toContain('json_type("ext_json",');
    expect(result.sql).toContain("'text'");
    expect(result.sql).toContain('ELSE NULL');
    expect(result.sql).not.toContain('COALESCE');
  });

  it('PG 对现有 JSON 文本转 jsonb 后取字面键，保留类型守卫', () => {
    const result = compileStorageExpression(storageMetadata(), scalar, 'postgres');
    expect(result.sourceColumn).toBe('ext_json');
    expect(result.sql).toContain('"ext_json"');
    expect(result.sql).toContain('::jsonb');
    expect(result.sql).toContain('jsonb_typeof');
    expect(result.sql).toContain("'string'");
    expect(result.sql).toContain("'rohs_status'");
    expect(result.sql).toContain('ELSE NULL');
  });

  it.each(['number', 'boolean'] as const)('%s 标量不能用文本比较或把异类 JSON 隐式转成目标值', dataType => {
    const sqlite = compileStorageExpression(storageMetadata(), { ...scalar, dataType }, 'sqlite');
    const postgres = compileStorageExpression(storageMetadata(), { ...scalar, dataType }, 'postgres');
    expect(sqlite.dataType).toBe(dataType);
    expect(postgres.dataType).toBe(dataType);
    expect(sqlite.sql).toContain('json_type');
    expect(postgres.sql).toContain('jsonb_typeof');
    expect(postgres.sql).toContain(dataType === 'number' ? '::numeric' : '::boolean');
    expect(sqlite.sql).toContain('ELSE NULL');
    expect(postgres.sql).toContain('ELSE NULL');
  });

  it('原生 JSON/键值列不要求 JSON 文本标记，整文档表达式保持 json 类型', () => {
    for (const property of ['native', 'dictionary']) {
      const result = compileStorageExpression(storageMetadata(), { kind: 'jsonDocument', property }, 'postgres');
      expect(result).toMatchObject({ kind: 'jsonDocument', dataType: 'json', sourceProperty: property });
      expect(result.sql).toContain(`"${property}"`);
    }
  });

  it('字符串列只有明确声明 jsonText:true 才能作为 JSON 来源', () => {
    for (const dialect of ['sqlite', 'postgres'] as const) {
      expect(() =>
        compileStorageExpression(
          storageMetadata(),
          {
            kind: 'jsonDocument',
            property: 'ext'
          },
          dialect
        )
      ).toThrow(/JSON.*文本|jsonText/);
    }
  });

  it('点、引号、反斜线是字面键，不生成关系路径或注入 SQL', () => {
    const key = `rohs.status'\\quoted`;
    const result = compileStorageExpression(storageMetadata(), { ...scalar, key }, 'postgres');
    expect(result.sql).toContain("rohs.status''");
    expect(result.sql).not.toContain('JOIN');
    const sqlite = compileStorageExpression(storageMetadata(), { ...scalar, key }, 'sqlite');
    expect(sqlite.sql).toContain('$."rohs.status');
    expect(sqlite.definition).toContain(JSON.stringify(key));
  });

  it.each([
    ['不存在的源', { ...scalar, property: 'missing' }],
    ['关系路径', { ...scalar, property: 'owner.ext' }],
    ['非 JSON 数值源', { ...scalar, property: 'score' }],
    ['加密源', { ...scalar, property: 'secret' }],
    ['日期提升', { ...scalar, dataType: 'date' }],
    ['对象提升', { ...scalar, dataType: 'object' }],
    ['原始 SQL', 'json_extract(ext, "$.rohs_status")'],
    ['SQL 表达式对象', { kind: 'sql', sql: 'DROP TABLE item' }],
    ['回调表达式', () => 'SELECT 1']
  ] as const)('%s 在编译期明确拒绝', (_label, expression) => {
    for (const dialect of ['sqlite', 'postgres'] as const) {
      expect(() =>
        compileStorageExpression(storageMetadata(), expression as unknown as StorageExpression, dialect)
      ).toThrow(RxDBError);
    }
  });

  it('同一声明的稳定定义不依赖对象键顺序，值类型和源列变化进入定义', () => {
    const a = compileStorageExpression(storageMetadata(), scalar, 'sqlite');
    const b = compileStorageExpression(
      storageMetadata(),
      {
        jsonText: true,
        dataType: 'string',
        key: 'rohs_status',
        property: 'ext',
        kind: 'jsonScalar'
      },
      'sqlite'
    );
    expect(a.definition).toBe(b.definition);
    const numeric = compileStorageExpression(storageMetadata(), { ...scalar, dataType: 'number' }, 'sqlite');
    expect(numeric.definition).not.toBe(a.definition);
  });

  it('未知方言明确拒绝，不能按其中一种后端编译', () => {
    expect(() => compileStorageExpression(storageMetadata(), scalar, 'unknown' as StorageDialect)).toThrow(RxDBError);
  });
});
