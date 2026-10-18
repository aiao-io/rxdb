import { describe, expect, it } from 'vitest';
import type { StorageIndexMethod } from '../../entity/advanced-index.js';
import type { EntityMetadataOptions } from '../../entity/entity-options.interface.js';
import { generatedColumnsOf, type EntityGeneratedColumnMetadataOptions } from '../../entity/generated-column.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import {
  formatMetadataViolations,
  validateEntityMetadata,
  validateEntityMetadataSet
} from '../../entity/metadata-validate.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import type { EntityIndexMetadataOptions } from '../../entity/property-types.interface.js';
import type { JsonScalarStorageExpression, StorageExpression } from '../../entity/storage-expression.js';
import { storageMetadata } from './storage-test-fixtures.js';

const column = (name: string, key = name): EntityGeneratedColumnMetadataOptions => ({
  name,
  expression: { kind: 'jsonScalar', property: 'ext', key, dataType: 'string', jsonText: true }
});

const inherited = column('parent_only');
const shared = column('shared', 'parent_value');
const childOnly = column('child_only');

describe('存储声明规范化的只读生成列 Map', () => {
  it('没有生成列的旧实体也有必备空 Map，可写字段和旧索引不变', () => {
    const indexes: EntityIndexMetadataOptions[] = [{ name: 'title' }];
    const metadata = storageMetadata({ indexes });
    expect(metadata.generatedColumnMap).toBeInstanceOf(Map);
    expect(metadata.generatedColumnMap.size).toBe(0);
    expect(generatedColumnsOf(metadata)).toEqual([]);
    expect([...metadata.indexMap.values()]).toEqual(indexes);
    expect(metadata.propertyMap.has('title')).toBe(true);
  });

  it('父未覆盖项继承，子同名覆盖，自己声明的数组仍只含子项', () => {
    const parent = storageMetadata({ generatedColumns: [inherited, shared] });
    const override = column('shared', 'child_value');
    const child = transitionMetadata(
      {
        name: 'ChildStorage',
        namespace: 'bom',
        generatedColumns: [override, childOnly]
      },
      [parent]
    );
    expect([...child.generatedColumnMap.keys()]).toEqual(['parent_only', 'shared', 'child_only']);
    expect(generatedColumnsOf(child)).toEqual([inherited, override, childOnly]);
    expect(child.generatedColumns).toEqual([override, childOnly]);
    expect(generatedColumnsOf(parent)).toEqual([inherited, shared]);
    expect(child.propertyMap.has('parent_only')).toBe(false);
    expect(child.computedPropertyMap.has('parent_only')).toBe(false);
    expect(child.columnNameToPropertyName.has('parent_only')).toBe(false);
  });

  it('子类不声明生成列时仍继承父 Map，不能以空的本类数组丢掉父项', () => {
    const parent = storageMetadata({ generatedColumns: [inherited] });
    const child = transitionMetadata({ name: 'InheritedStorage', namespace: 'bom' }, [parent]);
    expect(generatedColumnsOf(child)).toEqual([inherited]);
    expect(child.generatedColumnMap.get(inherited.name)).toEqual(inherited);
  });

  it('生成列读取必须依赖运行态 Map，缺少规范化不能回退本类数组', () => {
    const metadata = storageMetadata({ generatedColumns: [inherited] });
    const broken: EntityMetadata = { ...metadata };
    Reflect.deleteProperty(broken, 'generatedColumnMap');
    expect(() => generatedColumnsOf(broken)).toThrow(/generatedColumnMap|规范化/);
  });

  it('两个子类的声明快照相互独立，不会通过嵌套表达式污染父类', () => {
    const parent = storageMetadata({ generatedColumns: [inherited] });
    const first = transitionMetadata({ name: 'FirstChild', namespace: 'bom' }, [parent]);
    const second = transitionMetadata({ name: 'SecondChild', namespace: 'bom' }, [parent]);
    first.generatedColumnMap.get(inherited.name)!.expression.key = 'only_first_child';
    expect(second.generatedColumnMap.get(inherited.name)?.expression.key).toBe(inherited.expression.key);
    expect(parent.generatedColumnMap.get(inherited.name)?.expression.key).toBe(inherited.expression.key);
    expect(inherited.expression.key).toBe('parent_only');
  });
});

describe('存储声明注册期聚合校验', () => {
  it('合法生成列、表达式索引、PG GIN/GiST 声明通过结构校验，不预判未选择的后端能力', () => {
    const metadata = storageMetadata({
      generatedColumns: [column('rohs_hot')],
      indexes: [
        { name: 'rohs_lookup', properties: ['rohs_hot'] },
        { name: 'ext_gin', method: 'gin', expression: { kind: 'jsonDocument', property: 'ext', jsonText: true } },
        { name: 'score_gist', method: 'gist', properties: ['score'], dialects: ['postgres'] }
      ]
    });
    expect(validateEntityMetadata(metadata)).toEqual([]);
  });

  it('多条非法生成列与高级索引一次返回，名称和规则都可定位', () => {
    const badScalar = { kind: 'sql', sql: 'SELECT secret' } as unknown as JsonScalarStorageExpression;
    const metadata = storageMetadata({
      generatedColumns: [
        { name: 'raw_hot', expression: badScalar },
        { name: 'source_hot', expression: { ...column('source_hot').expression, property: 'missing' } },
        column('title')
      ],
      indexes: [
        { name: 'bad_gin', expression: column('unused').expression, method: 'gin' },
        { name: 'bad_method', properties: ['score'], method: 'hash' as StorageIndexMethod }
      ]
    });
    const errors = validateEntityMetadata(metadata);
    expect(errors.map(error => [error.field, error.rule])).toEqual([
      ['bad_gin', 'invalidAdvancedIndex'],
      ['bad_method', 'invalidAdvancedIndex'],
      ['raw_hot', 'invalidGeneratedColumn'],
      ['source_hot', 'invalidGeneratedColumn'],
      ['title', 'invalidGeneratedColumn']
    ]);
    const message = formatMetadataViolations(errors);
    expect(message).toContain('bom.StorageItem.raw_hot');
    expect(message).toContain('invalidGeneratedColumn');
    expect(message).toContain('bad_gin');
  });

  it('畸形生成列条目不在 normalize 中崩溃，也不阻止其他非法项被聚合', () => {
    const generatedColumns = [
      null,
      5,
      { name: 'missing_expression' }
    ] as unknown as EntityGeneratedColumnMetadataOptions[];
    const metadata = storageMetadata({ generatedColumns });
    const errors = validateEntityMetadata(metadata);
    expect(errors).toHaveLength(3);
    expect(errors.every(error => error.rule === 'invalidGeneratedColumn')).toBe(true);
    expect(errors.some(error => error.field.startsWith('generatedColumns'))).toBe(true);
    expect(errors.some(error => error.field === 'missing_expression')).toBe(true);
  });

  it('非数组 generatedColumns 保留为可报告违规，不静默当作没有声明', () => {
    const generatedColumns = { rohs: true } as unknown as EntityGeneratedColumnMetadataOptions[];
    const metadata = storageMetadata({ generatedColumns });
    const errors = validateEntityMetadata(metadata);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'generatedColumns', rule: 'invalidGeneratedColumn' });
    expect(errors[0].message).toMatch(/数组/);
  });

  it('高级表达式中的 SQL 字符串、日期类型和空方言范围都作为注册期违规', () => {
    const metadata = storageMetadata({
      indexes: [
        { name: 'raw', expression: 'ext::jsonb' as unknown as StorageExpression },
        {
          name: 'date_hot',
          expression: { ...column('date').expression, dataType: 'date' } as unknown as JsonScalarStorageExpression
        },
        { name: 'empty_dialects', expression: column('empty').expression, dialects: [] }
      ]
    });
    const errors = validateEntityMetadata(metadata);
    expect(errors.map(error => [error.field, error.rule])).toEqual([
      ['date_hot', 'invalidAdvancedIndex'],
      ['empty_dialects', 'invalidAdvancedIndex'],
      ['raw', 'invalidAdvancedIndex']
    ]);
  });

  it('旧 normalized 唯一与条件唯一仍走原校验，不新增高级索引违规', () => {
    const metadata = storageMetadata({
      indexes: [
        { name: 'title_unique', properties: ['title'], unique: true, normalized: true },
        {
          name: 'positive_score',
          properties: ['score'],
          unique: true,
          where: { combinator: 'and', rules: [{ field: 'score', operator: '>', value: 0 }] }
        }
      ]
    });
    expect(validateEntityMetadata(metadata)).toEqual([]);
  });

  it('跨实体生成列违规按实体排序后完整返回，校验不改写原声明', () => {
    const declaration = column('broken');
    declaration.expression.property = 'missing';
    const before = JSON.stringify(declaration);
    const options: Partial<EntityMetadataOptions> = { generatedColumns: [declaration] };
    const errors = validateEntityMetadataSet([
      storageMetadata({ ...options, name: 'Zulu' }),
      storageMetadata({ ...options, name: 'Alpha' })
    ]);
    expect(errors.map(error => [error.entity, error.field, error.rule])).toEqual([
      ['Alpha', 'broken', 'invalidGeneratedColumn'],
      ['Zulu', 'broken', 'invalidGeneratedColumn']
    ]);
    expect(JSON.stringify(declaration)).toBe(before);
  });
});
