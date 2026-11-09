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
  parseEntityFieldsDescriptor
} from '../../entity/entity-field.utils.js';
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
