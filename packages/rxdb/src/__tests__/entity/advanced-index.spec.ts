import { describe, expect, it } from 'vitest';
import { RxDBError } from '../../RxDBError.js';
import {
  advancedIndexesOf,
  compileAdvancedIndex,
  isAdvancedIndex,
  type StorageIndexMethod
} from '../../entity/advanced-index.js';
import { compileGeneratedColumn, type EntityGeneratedColumnMetadataOptions } from '../../entity/generated-column.js';
import type { EntityIndexMetadataOptions } from '../../entity/property-types.interface.js';
import type { StorageDialect, StorageExpression } from '../../entity/storage-expression.js';
import { storageMetadata } from './storage-test-fixtures.js';

const generated: EntityGeneratedColumnMetadataOptions = {
  name: 'rohs_hot',
  expression: { kind: 'jsonScalar', property: 'ext', key: 'rohs_status', dataType: 'string', jsonText: true }
};
const scalarIndex: EntityIndexMetadataOptions = { name: 'rohs_expression', expression: generated.expression };
const gin: EntityIndexMetadataOptions = {
  name: 'ext_gin',
  expression: { kind: 'jsonDocument', property: 'ext', jsonText: true },
  method: 'gin',
  dialects: ['postgres']
};

describe('声明式表达式与索引方法', () => {
  it('两端 B-tree 表达式索引采用托管哈希名与同一类型化表达式', () => {
    for (const dialect of ['sqlite', 'postgres'] as const) {
      const result = compileAdvancedIndex(storageMetadata(), scalarIndex, dialect);
      expect(result).toMatchObject({ method: 'btree', unique: false, columns: [], requiredExtensions: [] });
      expect(result?.name).toMatch(/^sx_item_rohs_expression_[0-9a-f]{8}$/);
      expect(result?.expression).toContain(dialect === 'sqlite' ? 'json_extract' : '::jsonb');
    }
  });

  it('引用生成列时使用带哈希的物理列，不把逻辑名误当普通列', () => {
    const index: EntityIndexMetadataOptions = { name: 'rohs_lookup', properties: ['rohs_hot'] };
    const metadata = storageMetadata({ generatedColumns: [generated], indexes: [index] });
    const column = compileGeneratedColumn(metadata, generated, 'sqlite');
    expect(isAdvancedIndex(metadata, index)).toBe(true);
    expect(compileAdvancedIndex(metadata, index, 'sqlite')?.columns).toEqual([column.columnName]);
  });

  it('生成列索引沿用省略 properties 时按 name 引用字段的简写，不能误走普通索引路径', () => {
    const index: EntityIndexMetadataOptions = { name: 'rohs_hot' };
    const metadata = storageMetadata({ generatedColumns: [generated], indexes: [index] });
    expect(advancedIndexesOf(metadata)).toEqual([index]);
    expect(compileAdvancedIndex(metadata, index, 'sqlite')?.columns).toEqual([
      compileGeneratedColumn(metadata, generated, 'sqlite').columnName
    ]);
  });

  it('PG GIN 采用 JSON 文档及 jsonb_ops，不需要 btree_gist', () => {
    const result = compileAdvancedIndex(storageMetadata(), gin, 'postgres');
    expect(result).toMatchObject({ method: 'gin', columns: [], operatorClass: 'jsonb_ops', requiredExtensions: [] });
    expect(result?.expression).toContain('"ext_json"');
    expect(result?.expression).toContain('::jsonb');
  });

  it('明确限定 PG 的声明在 SQLite 上不生效；未限定的 GIN/GiST 则明确拒绝', () => {
    expect(compileAdvancedIndex(storageMetadata(), gin, 'sqlite')).toBeNull();
    expect(() => compileAdvancedIndex(storageMetadata(), { ...gin, dialects: undefined }, 'sqlite')).toThrow(/gin|GIN/);
    expect(() =>
      compileAdvancedIndex(
        storageMetadata(),
        {
          name: 'score_gist',
          properties: ['score'],
          method: 'gist'
        },
        'sqlite'
      )
    ).toThrow(/gist|GiST|GIST/);
  });

  it('PG 标量 GiST 显式要求 btree_gist 扩展，不能把 JSON 文档交给 GiST', () => {
    const result = compileAdvancedIndex(
      storageMetadata(),
      { name: 'score_gist', properties: ['score'], method: 'gist' },
      'postgres'
    );
    expect(result).toMatchObject({ method: 'gist', columns: ['score'], requiredExtensions: ['btree_gist'] });
    expect(() => compileAdvancedIndex(storageMetadata(), { ...gin, method: 'gist' }, 'postgres')).toThrow(RxDBError);
  });

  it('原普通、normalized 唯一、条件唯一保持旧路径，只挑选新声明', () => {
    const old: EntityIndexMetadataOptions[] = [
      { name: 'title' },
      { name: 'unique_title', properties: ['title'], unique: true, normalized: true },
      {
        name: 'partial_title',
        properties: ['title'],
        unique: true,
        where: { combinator: 'and', rules: [{ field: 'title', operator: 'notNull' }] }
      }
    ];
    const metadata = storageMetadata({ indexes: [...old, scalarIndex, gin] });
    for (const index of old) expect(isAdvancedIndex(metadata, index)).toBe(false);
    expect(advancedIndexesOf(metadata)).toEqual([scalarIndex, gin]);
  });

  it('属性与表达式互斥，GIN 不接受标量或唯一声明，normalized/where 不能混入新表达式', () => {
    const invalid: EntityIndexMetadataOptions[] = [
      { ...scalarIndex, properties: ['title'] },
      { ...scalarIndex, method: 'gin' },
      { ...gin, unique: true },
      { ...scalarIndex, normalized: true, unique: true },
      { ...scalarIndex, where: { combinator: 'and', rules: [{ field: 'title', operator: 'notNull' }] }, unique: true }
    ];
    for (const index of invalid)
      expect(() => compileAdvancedIndex(storageMetadata(), index, 'postgres')).toThrow(RxDBError);
  });

  it('列引用不存在或被加密时拒绝，不拼出错误 SQL', () => {
    for (const property of ['missing', 'secret']) {
      expect(() =>
        compileAdvancedIndex(
          storageMetadata(),
          {
            name: 'bad_source',
            properties: [property],
            method: 'btree'
          },
          'postgres'
        )
      ).toThrow(RxDBError);
    }
  });

  it('表达式、方法、namespace 与方言范围进入稳定定义，不改变对象键序身份', () => {
    const metadata = storageMetadata();
    const baseline = compileAdvancedIndex(metadata, gin, 'postgres');
    const equivalent = compileAdvancedIndex(
      metadata,
      {
        dialects: ['postgres'],
        method: 'gin',
        expression: { jsonText: true, property: 'ext', kind: 'jsonDocument' },
        name: 'ext_gin'
      },
      'postgres'
    );
    expect(equivalent).toEqual(baseline);
    expect(compileAdvancedIndex(storageMetadata({ namespace: 'other' }), gin, 'postgres')?.name).not.toBe(
      baseline?.name
    );
    expect(compileAdvancedIndex(metadata, { ...gin, dialects: undefined }, 'postgres')?.name).not.toBe(baseline?.name);
  });

  it('原始 SQL 与未知方法/方言范围不能穿透类型层进入 DDL', () => {
    const invalid: EntityIndexMetadataOptions[] = [
      { name: 'raw', expression: 'ext::jsonb' as unknown as StorageExpression },
      { ...scalarIndex, method: 'hash' as StorageIndexMethod },
      { ...scalarIndex, dialects: [] },
      { ...scalarIndex, dialects: ['unknown' as StorageDialect] }
    ];
    for (const index of invalid)
      expect(() => compileAdvancedIndex(storageMetadata(), index, 'sqlite')).toThrow(RxDBError);
  });
});
