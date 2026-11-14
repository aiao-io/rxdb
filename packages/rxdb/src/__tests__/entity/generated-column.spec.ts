import { describe, expect, it } from 'vitest';
import { RxDBError } from '../../RxDBError.js';
import type { EntityMetadataOptions } from '../../entity/entity-options.interface.js';
import {
  compileGeneratedColumn,
  generatedColumnsOf,
  type EntityGeneratedColumnMetadataOptions
} from '../../entity/generated-column.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import type { JsonScalarStorageExpression } from '../../entity/storage-expression.js';
import { storageMetadata } from './storage-test-fixtures.js';

const column: EntityGeneratedColumnMetadataOptions = {
  name: 'rohs_hot',
  expression: { kind: 'jsonScalar', property: 'ext', key: 'rohs_status', dataType: 'string', jsonText: true }
};

describe('声明式只读生成列', () => {
  it('SQLite VIRTUAL 与 PG STORED 使用同一个来源与标量语义，物理列名含定义哈希', () => {
    const metadata = storageMetadata({ generatedColumns: [column] });
    const sqlite = compileGeneratedColumn(metadata, column, 'sqlite');
    const postgres = compileGeneratedColumn(metadata, column, 'postgres');
    expect(sqlite).toMatchObject({
      name: 'rohs_hot',
      sourceProperty: 'ext',
      sourceColumn: 'ext_json',
      dataType: 'string',
      nullable: true,
      storage: 'virtual'
    });
    expect(postgres).toMatchObject({ name: 'rohs_hot', dataType: 'string', nullable: true, storage: 'stored' });
    expect(sqlite.columnName).toMatch(/^gc_rohs_hot_[0-9a-f]{8}$/);
    expect(postgres.columnName).toMatch(/^gc_rohs_hot_[0-9a-f]{8}$/);
    expect(sqlite.expression).toContain('json_extract');
    expect(postgres.expression).toContain('::jsonb');
  });

  it('生成列不进入可写属性、默认值、计算属性或物理列反向映射', () => {
    const metadata = storageMetadata({ generatedColumns: [column] });
    const compiled = compileGeneratedColumn(metadata, column, 'sqlite');
    expect(generatedColumnsOf(metadata)).toEqual([column]);
    expect(metadata.propertyMap.has(column.name)).toBe(false);
    expect(metadata.computedPropertyMap.has(column.name)).toBe(false);
    expect(metadata.defaultValueProperties.some(value => value.name === column.name)).toBe(false);
    expect(metadata.columnNameToPropertyName.has(compiled.columnName)).toBe(false);
  });

  it('继承按 name 子覆盖父、异名全部保留且不修改父声明', () => {
    const parent: EntityMetadataOptions = { name: 'Parent', generatedColumns: [column] };
    const childColumn = { ...column, expression: { ...column.expression, key: 'child_status' } };
    const extra = { ...column, name: 'other_hot' };
    const child = transitionMetadata({ name: 'Child', generatedColumns: [childColumn, extra] }, [
      parent,
      storageMetadata()
    ]);
    expect(generatedColumnsOf(child)).toEqual([childColumn, extra]);
    expect(parent.generatedColumns).toEqual([column]);
  });

  it('没有生成列的旧元数据返回空集合', () => {
    expect(generatedColumnsOf(storageMetadata())).toEqual([]);
  });

  it('同声明命名确定，键、类型与 namespace 变化必须改变物理定义身份', () => {
    const metadata = storageMetadata();
    const baseline = compileGeneratedColumn(metadata, column, 'sqlite');
    expect(compileGeneratedColumn(metadata, column, 'sqlite')).toEqual(baseline);
    const changed = [
      compileGeneratedColumn(metadata, { ...column, expression: { ...column.expression, key: 'other' } }, 'sqlite'),
      compileGeneratedColumn(
        metadata,
        { ...column, expression: { ...column.expression, dataType: 'number' } },
        'sqlite'
      ),
      compileGeneratedColumn(storageMetadata({ namespace: 'other' }), column, 'sqlite')
    ];
    for (const result of changed) expect(result.columnName).not.toBe(baseline.columnName);
  });

  it.each(['BAD', 'bad-name', 'a'.repeat(80)])('非法或过长名字 %s 在元数据期拒绝', name => {
    expect(() => compileGeneratedColumn(storageMetadata(), { ...column, name }, 'sqlite')).toThrow(RxDBError);
  });

  it('不能与可写列重名，也不能借生成列作为下一条生成来源', () => {
    expect(() => compileGeneratedColumn(storageMetadata(), { ...column, name: 'title' }, 'sqlite')).toThrow(
      /冲突|重名|可写/
    );
    const metadata = storageMetadata({ generatedColumns: [column] });
    expect(() =>
      compileGeneratedColumn(
        metadata,
        {
          name: 'chain',
          expression: { ...column.expression, property: column.name }
        },
        'sqlite'
      )
    ).toThrow(/来源|生成列|字段/);
  });

  it('生成列不能声明为日期或整份 JSON 文档', () => {
    const date = { ...column.expression, dataType: 'date' } as unknown as JsonScalarStorageExpression;
    expect(() => compileGeneratedColumn(storageMetadata(), { ...column, expression: date }, 'postgres')).toThrow(
      RxDBError
    );
    const document = {
      kind: 'jsonDocument',
      property: 'ext',
      jsonText: true
    } as unknown as JsonScalarStorageExpression;
    expect(() => compileGeneratedColumn(storageMetadata(), { ...column, expression: document }, 'sqlite')).toThrow(
      RxDBError
    );
  });
});
