/**
 * 三端字段描述契约（US-012 AC#36）—— Angular 侧。
 *
 * @remarks
 * 夹具与三张期望表全部来自 `@aiao/rxdb-test` 的
 * `cross-framework-fixtures/entity-fields-descriptor.ts`：三端跑的是**同一份**数据与
 * 同一组断言，任一端行为跑偏都会在这里失败。语义能力一律直接调用 core 的
 * `describeEntityFields()` / `parseEntityFieldsDescriptor()` / `validateFieldValue()`，
 * 本端不新增专属 API —— 类型层面的那一半由 `pnpm audit:api-surface` 对
 * `requirements/api-baseline/rxdb-angular.json` 的空 diff 承担，本文件守运行时导出。
 *
 * 对应文件（同名同结构，三端逐条对齐）：
 * - `packages/rxdb-react/src/__tests__/tri-framework-field-descriptor.spec.ts`
 * - `packages/rxdb-vue/src/__tests__/tri-framework-field-descriptor.spec.ts`
 */
import { parseEntityFieldsDescriptor, validateFieldValue, type EntityFieldDescriptor } from '@aiao/rxdb';
import {
  ENTITY_FIELD_VALUE_CASES,
  ENTITY_FIELDS_EXPECTATIONS,
  ENTITY_FIELDS_PARSE_REJECTIONS,
  makeEntityFieldsDescriptor,
  makeEntityFieldsWire,
  makeEntityFieldsWireDraft
} from '@aiao/rxdb-test';
import { describe, expect, it } from 'vitest';
import * as publicEntry from '../index';

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

/** 返回「本不该存在却存在」的键。 */
const presentAmong = (record: Record<string, unknown>, keys: readonly string[]): string[] =>
  keys.filter(key => key in record);

const RELATION_EXPECTATIONS = ENTITY_FIELDS_EXPECTATIONS.filter(item => item.source === 'relation');

/** core 在 US-012 三个阶段新增的语义 API：三端只许消费，不许重导出或自造同名物。 */
const CORE_SEMANTIC_API = [
  'describeEntityFields',
  'ENTITY_FIELDS_DTO_VERSION',
  'FIELD_FORMAT_CONFIG_KEYS',
  'parseEntityFieldsDescriptor',
  'validateEntityMetadata',
  'validateFieldValue'
];

const SEMANTIC_NAME_PATTERN = /^(EntityField|FieldFormat|FieldValidation|describeEntityFields)/;

describe('三端字段描述契约（US-012 AC#36）', () => {
  it('fields 顺序为 propertyMap → computedPropertyMap → relationMap（INV-6）', () => {
    expect(DESCRIPTOR.fields.map(item => item.field)).toEqual(ENTITY_FIELDS_EXPECTATIONS.map(item => item.field));
  });

  it('线格式经严格解析器往返后与本端直接生成的描述完全一致', () => {
    expect(parseEntityFieldsDescriptor(makeEntityFieldsWire())).toStrictEqual(makeEntityFieldsDescriptor());
  });

  it.each(ENTITY_FIELDS_EXPECTATIONS)('$field 的字段形状与三端共享期望一致', expectation => {
    const record = recordOf(expectation.field);

    expect(record['source']).toBe(expectation.source);
    expect(record['cardinality']).toBe(expectation.cardinality);
    expect(record['valueType']).toBe(expectation.valueType);
    expect(formatKindOf(record)).toBe(expectation.formatKind ?? null);
    expect(record['enum'] ?? null).toEqual(expectation.enumValues ?? null);
    expect(optionKeysOf(record)).toEqual(expectation.optionKeys ?? null);
    expect(keyValueSchemaKeysOf(record)).toEqual(expectation.keyValueSchemaKeys ?? null);
    expect(presentAmong(record, expectation.absentKeys ?? [])).toEqual([]);
  });

  it.each(RELATION_EXPECTATIONS)('$field 的关系块与三端共享期望一致', expectation => {
    const relation = recordOf(expectation.field)['relation'] as Record<string, unknown>;

    expect(relation['kind']).toBe(expectation.relationKind);
    expect(relation['mutation']).toBe(expectation.mutation);
    // 1:1 / m:1 写本表外键列，1:m / m:n 没有可写列（D9 / D9.1）
    expect('writeField' in relation).toBe(expectation.mutation === 'set-remove');
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

  it('公开入口没有本端专属的字段语义 API', () => {
    const exported = Object.keys(publicEntry);

    // 命名空间导入若为空，上面两条过滤会退化成空转
    expect(exported.length).toBeGreaterThan(0);
    expect(exported.filter(name => CORE_SEMANTIC_API.includes(name))).toEqual([]);
    expect(exported.filter(name => SEMANTIC_NAME_PATTERN.test(name))).toEqual([]);
  });
});
