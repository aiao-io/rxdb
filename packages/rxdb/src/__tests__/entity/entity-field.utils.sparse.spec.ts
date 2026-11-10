/**
 * 字段描述解析器拒绝稀疏数组。
 *
 * 空位不是 JSON 值：`forEach` / `map` 跳过它，解析器就会交出一个「每个下标都是字段描述」却读出
 * `undefined` 的数组；`JSON.stringify` 又把空位写成 `null`，同一个解析器随后拒绝自己的序列化结果。
 */
import { describe, expect, it } from 'vitest';
import {
  describeEntityFields,
  ENTITY_FIELDS_DTO_VERSION,
  parseEntityFieldsDescriptor,
  type EntityPropertyFieldDescriptor
} from '../../entity/entity-field.utils.js';
import { validateFieldValue } from '../../entity/entity-value.utils.js';
import { EntityMetadataOptions, PropertyType } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { validateEntityMetadata } from '../../entity/metadata-validate.js';
import { RxDBError } from '../../RxDBError.js';
import { ARTICLE_METADATA, FIELD_RESOLVER } from '../fixtures/field-descriptor-entities.js';

interface LooseDto {
  [key: string]: unknown;
  fields: Record<string, unknown>[];
}

const wireOf = (): LooseDto =>
  JSON.parse(JSON.stringify(describeEntityFields(ARTICLE_METADATA, FIELD_RESOLVER))) as LooseDto;

/** 在 `index` 处留一个空位，其余元素顺延。 */
const withHoleAt = <T>(items: readonly T[], index: number): T[] => {
  const sparse = new Array<T>(items.length + 1);
  items.forEach((item, position) => {
    sparse[position < index ? position : position + 1] = item;
  });
  return sparse;
};

describe('parseEntityFieldsDescriptor：稀疏数组', () => {
  it('fields 只有空位时显式失败，点名空位下标', () => {
    const input = { dtoVersion: ENTITY_FIELDS_DTO_VERSION, entity: 'Test', namespace: 'public', fields: new Array(1) };

    expect(() => parseEntityFieldsDescriptor(input)).toThrow(RxDBError);
    expect(() => parseEntityFieldsDescriptor(input)).toThrow('$.fields[0]');
  });

  it('合法字段之间的空位同样失败', () => {
    const input = wireOf();
    input.fields = withHoleAt(input.fields, 1);

    expect(() => parseEntityFieldsDescriptor(input)).toThrow('$.fields[1]');
  });

  it('嵌套数组（enum）里的空位同样失败', () => {
    const input = wireOf();
    const index = input.fields.findIndex(field => Array.isArray(field['enum']));
    expect(index).toBeGreaterThanOrEqual(0);
    const values = input.fields[index]['enum'] as string[];
    input.fields[index]['enum'] = withHoleAt(values, values.length);

    expect(() => parseEntityFieldsDescriptor(input)).toThrow(`$.fields[${index}].enum[${values.length}]`);
  });

  it('显式 null / undefined 元素照旧失败，合法空数组与完整描述照旧通过', () => {
    const base = { dtoVersion: ENTITY_FIELDS_DTO_VERSION, entity: 'Test', namespace: 'public' };

    expect(() => parseEntityFieldsDescriptor({ ...base, fields: [null] })).toThrow(RxDBError);
    expect(() => parseEntityFieldsDescriptor({ ...base, fields: [undefined] })).toThrow(RxDBError);
    expect(parseEntityFieldsDescriptor({ ...base, fields: [] }).fields).toEqual([]);

    const parsed = parseEntityFieldsDescriptor(wireOf());
    expect(parseEntityFieldsDescriptor(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});

/** 构造必填属性描述符；`cardinality` 按 valueType 推导。 */
const requiredField = (valueType: 'stringArray' | 'numberArray' | 'json'): EntityPropertyFieldDescriptor => ({
  field: 'value',
  displayName: '值',
  source: 'property',
  cardinality: valueType === 'json' ? 'single' : 'multiple',
  valueType,
  readonly: false,
  nullable: false,
  required: true,
  unique: false,
  encrypted: false
});

describe('validateFieldValue：稀疏数组不是合法的数组值', () => {
  it.each([
    ['stringArray', 'stringArray'],
    ['numberArray', 'numberArray'],
    ['json', 'json']
  ] as const)('必填 %s 传只有空位的数组时报 %s 违规', (valueType, rule) => {
    expect(validateFieldValue(requiredField(valueType), new Array(1))?.rule).toBe(rule);
  });

  it('合法元素之间的空位同样拒绝，稠密数组照常通过', () => {
    expect(validateFieldValue(requiredField('stringArray'), withHoleAt(['a', 'b'], 1))?.rule).toBe('stringArray');
    expect(validateFieldValue(requiredField('numberArray'), withHoleAt([1, 2], 1))?.rule).toBe('numberArray');
    expect(validateFieldValue(requiredField('json'), { items: withHoleAt([1], 0) })?.rule).toBe('json');
    expect(validateFieldValue(requiredField('stringArray'), ['a', 'b'])).toBeNull();
    expect(validateFieldValue(requiredField('numberArray'), [1, 2])).toBeNull();
    expect(validateFieldValue(requiredField('json'), { items: [1, null] })).toBeNull();
  });
});

describe('manualOrder.groupBy：空位只产出聚合违规，不抛 TypeError', () => {
  const metadataWith = (groupBy: unknown[]) =>
    transitionMetadata({
      name: 'SparseGroup' as Capitalize<string>,
      namespace: 'public',
      manualOrder: { groupBy },
      properties: [
        { name: 'id', type: PropertyType.string, primary: true },
        { name: 'listId', type: PropertyType.string },
        { name: 'sortOrder', type: PropertyType.string }
      ],
      computedProperties: [],
      relations: [],
      indexes: []
    } as unknown as EntityMetadataOptions);

  it.each([
    ['只有空位', new Array(1)],
    ['合法字段后跟空位', withHoleAt(['listId'], 1)],
    ['显式 undefined', [undefined]]
  ])('%s', (_label, groupBy) => {
    const violations = validateEntityMetadata(metadataWith(groupBy)).filter(v => v.rule === 'invalidManualOrder');

    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('groupBy 必须是字段名字符串数组');
  });

  it('稠密的合法 groupBy 照常通过', () => {
    expect(validateEntityMetadata(metadataWith(['listId'])).filter(v => v.rule === 'invalidManualOrder')).toEqual([]);
  });
});

describe('注册期 enum / format.schemes 声明：空位按非法数组拒绝', () => {
  const rulesOf = (property: Record<string, unknown>) =>
    validateEntityMetadata(
      transitionMetadata({
        name: 'SparseDeclaration' as Capitalize<string>,
        namespace: 'public',
        properties: [{ name: 'id', type: PropertyType.string, primary: true }, property],
        computedProperties: [],
        relations: [],
        indexes: []
      } as unknown as EntityMetadataOptions)
    ).map(v => v.rule);

  it('enum 里的空位（如 `[a, , b]` 笔误）报 invalidEnumConfig', () => {
    expect(rulesOf({ name: 'state', type: PropertyType.enum, enum: withHoleAt(['draft', 'published'], 1) })).toEqual([
      'invalidEnumConfig'
    ]);
    expect(rulesOf({ name: 'state', type: PropertyType.enum, enum: ['draft', 'published'] })).toEqual([]);
  });

  it('format.schemes 里的空位报 invalidFormatConfig', () => {
    const homepage = (schemes: string[]) => ({
      name: 'homepage',
      type: PropertyType.string,
      format: { kind: 'url', schemes }
    });
    expect(rulesOf(homepage(withHoleAt(['https'], 1)))).toEqual(['invalidFormatConfig']);
    expect(rulesOf(homepage(['https']))).toEqual([]);
  });
});
