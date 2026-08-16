/**
 * @fileoverview US-012 阶段 C — AC#33 旧 `validateEntityFieldValue()` 的冻结表。
 *
 * D5 冻结的是**行为**，不是实现：D11 要求新函数复用「提取出来的共享内部函数」，
 * 提取过程会真正改写这个文件里的代码路径。旧函数返回 `null` 或错误对象，分支比结构更重要，
 * 因此不走快照，改用参数化输入/输出对表逐项锁定（含全部返回 `null` 的分支）。
 *
 * 本表是实施前落库的口径，**不得**随实现调整；改动即视为破坏冻结。
 */

import { describe, expect, it } from 'vitest';
import type { EntityFieldConfig } from '../../entity/entity-field.utils.js';
import { validateEntityFieldValue, type FieldValidationError } from '../../entity/entity-value.utils.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';

const UUID = '01234567-89ab-cdef-0123-456789abcdef';

const config = (overrides: Partial<EntityFieldConfig> & { type: EntityFieldConfig['type'] }): EntityFieldConfig => ({
  field: 'test',
  displayName: 'Test',
  ...overrides
});

interface FrozenCase {
  readonly title: string;
  readonly field: EntityFieldConfig;
  readonly value: unknown;
  readonly expected: FieldValidationError | null;
}

const REQUIRED_ERROR: FieldValidationError = { field: 'test', message: 'Test 是必填项' };
const error = (message: string): FieldValidationError => ({ field: 'test', message });

const FROZEN_CASES: readonly FrozenCase[] = [
  // ------------------------------------------------------[ required ]
  {
    title: 'required + null',
    field: config({ type: PropertyType.string, required: true }),
    value: null,
    expected: REQUIRED_ERROR
  },
  {
    title: 'required + undefined',
    field: config({ type: PropertyType.string, required: true }),
    value: undefined,
    expected: REQUIRED_ERROR
  },
  {
    title: 'required + 空串',
    field: config({ type: PropertyType.string, required: true }),
    value: '',
    expected: REQUIRED_ERROR
  },
  {
    title: 'required + 空数组',
    field: config({ type: PropertyType.stringArray, required: true }),
    value: [],
    expected: REQUIRED_ERROR
  },
  {
    title: 'required + 非空数组',
    field: config({ type: PropertyType.stringArray, required: true }),
    value: ['a'],
    expected: null
  },
  {
    title: 'required + 0 不算缺失',
    field: config({ type: PropertyType.number, required: true }),
    value: 0,
    expected: null
  },
  {
    title: 'required + false 不算缺失',
    field: config({ type: PropertyType.boolean, required: true }),
    value: false,
    expected: null
  },
  { title: '非 required + null 直接放行', field: config({ type: PropertyType.uuid }), value: null, expected: null },
  { title: '非 required + 空串直接放行', field: config({ type: PropertyType.uuid }), value: '', expected: null },

  // ------------------------------------------------------[ uuid ]
  { title: 'uuid 合法', field: config({ type: PropertyType.uuid }), value: UUID, expected: null },
  { title: 'uuid 大写合法', field: config({ type: PropertyType.uuid }), value: UUID.toUpperCase(), expected: null },
  {
    title: 'uuid 非法',
    field: config({ type: PropertyType.uuid }),
    value: '12345',
    expected: error('Test 格式不正确')
  },

  // ------------------------------------------------------[ number / integer ]
  { title: 'number 小数合法', field: config({ type: PropertyType.number }), value: 3.14, expected: null },
  { title: 'number 数字串合法', field: config({ type: PropertyType.number }), value: '3.14', expected: null },
  {
    title: 'number 非数字',
    field: config({ type: PropertyType.number }),
    value: 'abc',
    expected: error('Test 必须是数字')
  },
  { title: 'integer 合法', field: config({ type: PropertyType.integer }), value: 42, expected: null },
  {
    title: 'integer 小数',
    field: config({ type: PropertyType.integer }),
    value: 3.14,
    expected: error('Test 必须是整数')
  },
  {
    title: 'integer 非数字',
    field: config({ type: PropertyType.integer }),
    value: 'abc',
    expected: error('Test 必须是数字')
  },

  // ------------------------------------------------------[ date ]
  { title: 'date 字符串合法', field: config({ type: PropertyType.date }), value: '2026-01-01', expected: null },
  { title: 'date 实例合法', field: config({ type: PropertyType.date }), value: new Date('2026-01-01'), expected: null },
  {
    title: 'date 非法',
    field: config({ type: PropertyType.date }),
    value: 'invalid',
    expected: error('Test 日期格式不正确')
  },

  // ------------------------------------------------------[ enum ]
  {
    title: 'enum 命中',
    field: config({ type: PropertyType.enum, enumValues: ['a', 'b'] }),
    value: 'a',
    expected: null
  },
  {
    title: 'enum 未命中',
    field: config({ type: PropertyType.enum, enumValues: ['a', 'b'] }),
    value: 'c',
    expected: error('Test 值不在允许范围内')
  },
  { title: 'enum 未声明 enumValues 时放行', field: config({ type: PropertyType.enum }), value: 'c', expected: null },

  // ------------------------------------------------------[ json ]
  { title: 'json 字符串可解析', field: config({ type: PropertyType.json }), value: '{"a":1}', expected: null },
  { title: 'json 对象直接放行', field: config({ type: PropertyType.json }), value: { a: 1 }, expected: null },
  {
    title: 'json 字符串不可解析',
    field: config({ type: PropertyType.json }),
    value: 'invalid',
    expected: error('Test JSON 格式不正确')
  },

  // ------------------------------------------------------[ 无分支的类型 ]
  { title: 'string 不做形状校验', field: config({ type: PropertyType.string }), value: 42, expected: null },
  { title: 'boolean 不做形状校验', field: config({ type: PropertyType.boolean }), value: 'true', expected: null },
  { title: 'bigint 不做形状校验', field: config({ type: PropertyType.bigint }), value: 'x', expected: null },
  { title: 'binary 不做形状校验', field: config({ type: PropertyType.binary }), value: 'x', expected: null },
  {
    title: 'stringArray 不做成员校验',
    field: config({ type: PropertyType.stringArray }),
    value: [1, 2],
    expected: null
  },
  {
    title: 'numberArray 不做成员校验',
    field: config({ type: PropertyType.numberArray }),
    value: ['a'],
    expected: null
  },
  { title: 'keyValue 不做形状校验', field: config({ type: PropertyType.keyValue }), value: 'x', expected: null },
  { title: 'oneToOne 不做形状校验', field: config({ type: 'oneToOne' }), value: 'x', expected: null },
  { title: 'manyToOne 不做形状校验', field: config({ type: 'manyToOne' }), value: 'x', expected: null },
  { title: 'computed 不做形状校验', field: config({ type: 'computed' }), value: 'x', expected: null }
];

describe('AC#33 — validateEntityFieldValue 冻结表', () => {
  it('用例表覆盖 37 组输入/输出对', () => {
    expect(FROZEN_CASES).toHaveLength(37);
  });

  it.each(FROZEN_CASES.map(item => [item.title, item] as const))('%s', (_title, item) => {
    expect(validateEntityFieldValue(item.field, item.value)).toStrictEqual(item.expected);
  });

  it('错误对象只有 field 与 message 两个键，不新增 rule / value', () => {
    const failures = FROZEN_CASES.filter(item => item.expected !== null);
    expect(failures.length).toBeGreaterThan(0);
    failures.forEach(item => {
      const result = validateEntityFieldValue(item.field, item.value);
      expect([item.title, Object.keys(result ?? {}).sort()]).toStrictEqual([item.title, ['field', 'message']]);
    });
  });
});
