/**
 * `cross-framework-fixtures/entity-fields-descriptor.ts` 的自洽性用例。
 *
 * @remarks
 * 该夹具是**发布出去**的跨端契约数据：Angular / React / Vue 的
 * `tri-framework-field-descriptor.spec.ts` 三端共读同一份表。夹具自身跑偏时，
 * 三端会同时变红，而红点落在三个下游包里，看不出根因在上游这一份数据 ——
 * 本文件把「夹具是否说了实话」这一层留在本包自己的用例里先失败。
 *
 * 与三端 spec 的分工：三端断言的是**各自框架包**没有偏离 core 的语义；
 * 这里断言的是**三张期望表与夹具实体彼此对得上**。另外补了一条三端没有的基线 ——
 * 未改写的草稿必须解析通过，否则九条「解析拒绝」用例会在夹具本身就非法时集体空转变成假绿。
 */
import { parseEntityFieldsDescriptor, validateFieldValue, type EntityFieldDescriptor } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import {
  ENTITY_FIELD_VALUE_CASES,
  ENTITY_FIELDS_EXPECTATIONS,
  ENTITY_FIELDS_FIXTURE_METADATA,
  ENTITY_FIELDS_FIXTURE_RESOLVER,
  ENTITY_FIELDS_PARSE_REJECTIONS,
  entityFieldsWireField,
  makeEntityFieldsDescriptor,
  makeEntityFieldsWire,
  makeEntityFieldsWireDraft
} from '../../cross-framework-fixtures/entity-fields-descriptor.js';

const DESCRIPTOR = makeEntityFieldsDescriptor();

const fieldOf = (name: string): EntityFieldDescriptor => {
  const found = DESCRIPTOR.fields.find(item => item.field === name);
  if (!found) throw new Error(`夹具字段 ${name} 不存在`);
  return found;
};

/** 判别联合不允许按键取值，而形状断言要的正是「键在不在、值是什么」，故降级成记录视图。 */
const recordOf = (name: string): Record<string, unknown> => fieldOf(name) as unknown as Record<string, unknown>;

const formatKindOf = (record: Record<string, unknown>): string | null =>
  'format' in record ? String((record['format'] as { kind: unknown }).kind) : null;

const optionKeysOf = (record: Record<string, unknown>): string[] | null =>
  'options' in record ? Object.keys(record['options'] as object) : null;

const keyValueSchemaKeysOf = (record: Record<string, unknown>): string[] | null =>
  'keyValueSchema' in record ? Object.keys(record['keyValueSchema'] as object) : null;

describe('entity fields descriptor fixture', () => {
  it('期望表与夹具实体逐条同序对齐（INV-6）', () => {
    expect(DESCRIPTOR.fields.map(item => item.field)).toEqual(ENTITY_FIELDS_EXPECTATIONS.map(item => item.field));
  });

  it('每次调用返回全新对象，用例之间不会互相污染', () => {
    const first = makeEntityFieldsDescriptor();
    const second = makeEntityFieldsDescriptor();

    expect(first).toStrictEqual(second);
    expect(first).not.toBe(second);
    expect(first.fields[0]).not.toBe(second.fields[0]);
  });

  it('线格式是纯 JSON 值，且经严格解析器往返后与直接生成的描述一致', () => {
    const wire = makeEntityFieldsWire();

    expect(wire).not.toBe(DESCRIPTOR);
    expect(parseEntityFieldsDescriptor(wire)).toStrictEqual(makeEntityFieldsDescriptor());
  });

  it('未改写的草稿本身必须解析通过，否则拒绝用例全是空转', () => {
    expect(() => parseEntityFieldsDescriptor(makeEntityFieldsWireDraft())).not.toThrow();
  });

  it.each(ENTITY_FIELDS_EXPECTATIONS)('$field 的字段形状与期望表一致', expectation => {
    const record = recordOf(expectation.field);

    expect(record['source']).toBe(expectation.source);
    expect(record['cardinality']).toBe(expectation.cardinality);
    expect(record['valueType']).toBe(expectation.valueType);
    expect(formatKindOf(record)).toBe(expectation.formatKind ?? null);
    expect(record['enum'] ?? null).toEqual(expectation.enumValues ?? null);
    expect(optionKeysOf(record)).toEqual(expectation.optionKeys ?? null);
    expect(keyValueSchemaKeysOf(record)).toEqual(expectation.keyValueSchemaKeys ?? null);
    expect(expectation.absentKeys?.filter(key => key in record) ?? []).toEqual([]);
  });

  it.each(ENTITY_FIELDS_PARSE_REJECTIONS)('严格解析器拒绝：$title', ({ apply }) => {
    const draft = makeEntityFieldsWireDraft();
    apply(draft);

    expect(() => parseEntityFieldsDescriptor(draft)).toThrow(/实体字段描述解析失败/);
  });

  it.each(ENTITY_FIELD_VALUE_CASES)('值校验：$title', ({ field, value, rule, omitsValue }) => {
    const error = validateFieldValue(fieldOf(field), value);

    if (rule === null) {
      expect(error).toBeNull();
      return;
    }
    if (error === null) throw new Error(`${field} 本应命中 ${rule} 规则`);
    expect(error.rule).toBe(rule);
    expect(error.field).toBe(field);
    // D12：加密字段永不回显触发值
    expect('value' in error).toBe(omitsValue !== true);
  });

  it('取不到的草稿字段直接抛错，不让断言退化成空跑', () => {
    expect(() => entityFieldsWireField(makeEntityFieldsWireDraft(), 'ghost')).toThrow(/夹具字段 ghost 不存在/);
  });

  it('解析器覆盖夹具的全部关系目标，未知实体返回 undefined', () => {
    const targets = ENTITY_FIELDS_FIXTURE_METADATA.relations.map(relation => relation.mappedEntity);

    expect(targets).toEqual(['Revision', 'Author', 'Comment', 'Tag']);
    for (const target of targets) {
      expect(ENTITY_FIELDS_FIXTURE_RESOLVER(target, 'public')?.name).toBe(target);
    }
    expect(ENTITY_FIELDS_FIXTURE_RESOLVER('Author', 'other')).toBeUndefined();
    expect(ENTITY_FIELDS_FIXTURE_RESOLVER('Ghost', 'public')).toBeUndefined();
  });
});
