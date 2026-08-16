/**
 * @fileoverview US-012 阶段 C — AC#27～32 `validateFieldValue()` 值校验契约。
 *
 * 入参是阶段 B 的 {@link EntityFieldDescriptor}，用字面量构造而不是跑
 * `describeEntityFields()`：被测对象是纯函数，喂描述符比先造一整套元数据更贴近契约。
 * 旧 `validateEntityFieldValue()` 的冻结由 `entity-value.utils.frozen.spec.ts` 单独把关。
 */

import { describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import type {
  EntityFieldDescriptor,
  EntityPropertyFieldDescriptor,
  EntityToManyRelationFieldDescriptor,
  EntityToOneRelationFieldDescriptor,
  RelationValueType
} from '../../entity/entity-field.utils.js';
import {
  validateFieldValue,
  type FieldValidationError,
  type FieldValidationRule
} from '../../entity/entity-value.utils.js';
import { PropertyType, type FieldFormat } from '../../entity/metadata-options.interface.js';
import { RepositoryBase } from '../../repository/RepositoryBase.js';

const UUID = '01234567-89ab-cdef-0123-456789abcdef';
const MULTI_VALUE_TYPES: ReadonlySet<string> = new Set([PropertyType.numberArray, PropertyType.stringArray]);

/** 构造属性描述符；`cardinality` 按 INV-1 从 `valueType` 推导，不让用例写出分歧组合。 */
function propertyField(
  overrides: Omit<Partial<EntityPropertyFieldDescriptor>, 'valueType'> & { valueType: `${PropertyType}` }
): EntityPropertyFieldDescriptor {
  return {
    field: 'value',
    displayName: '值',
    source: 'property',
    cardinality: MULTI_VALUE_TYPES.has(overrides.valueType) ? 'multiple' : 'single',
    readonly: false,
    nullable: true,
    required: false,
    unique: false,
    encrypted: false,
    ...overrides
  };
}

function toOneField(
  valueType: RelationValueType = 'uuid',
  kind: '1:1' | 'm:1' = 'm:1'
): EntityToOneRelationFieldDescriptor {
  return {
    field: 'author',
    displayName: '作者',
    source: 'relation',
    cardinality: 'single',
    valueType,
    readonly: true,
    sortable: false,
    nullable: true,
    required: false,
    unique: false,
    encrypted: false,
    relation: { kind, entity: 'Author', namespace: 'public', mutation: 'set-remove', writeField: 'authorId' }
  };
}

function toManyField(
  valueType: RelationValueType = 'uuid',
  kind: '1:m' | 'm:n' = '1:m'
): EntityToManyRelationFieldDescriptor {
  return {
    field: 'comments',
    displayName: '评论',
    source: 'relation',
    cardinality: 'multiple',
    valueType,
    readonly: true,
    sortable: false,
    relation: { kind, entity: 'Comment', namespace: 'public', mutation: 'add-remove' }
  };
}

/** 取错误对象；返回 `null` 时直接失败，避免可选链把断言变成空跑。 */
function errorOf(descriptor: EntityFieldDescriptor, value: unknown): FieldValidationError {
  const error = validateFieldValue(descriptor, value);
  if (!error) throw new Error(`期望 ${descriptor.field} 校验失败，实际通过`);
  return error;
}

describe('validateFieldValue', () => {
  // ------------------------------------------------------[ AC#27 url ]

  describe('AC#27 — url 与 schemes', () => {
    const field = propertyField({ valueType: 'string', format: { kind: 'url', schemes: ['HTTPS'] } });

    it('scheme 不在白名单里返回 urlScheme', () => {
      expect(errorOf(field, 'http://example.com/a')).toStrictEqual({
        field: 'value',
        message: '值 的协议不在允许范围内：http',
        rule: 'urlScheme',
        value: 'http://example.com/a'
      });
    });

    it('scheme 大小写无关地通过', () => {
      expect(validateFieldValue(field, 'https://example.com/a')).toBeNull();
      expect(validateFieldValue(field, 'HTTPS://example.com/a')).toBeNull();
    });

    it('非 URL 文本返回 url', () => {
      expect(errorOf(field, '不是链接')).toStrictEqual({
        field: 'value',
        message: '值 不是合法的 URL',
        rule: 'url',
        value: '不是链接'
      });
    });

    it('未声明 schemes 时任何合法 URL 都通过', () => {
      const anyScheme = propertyField({ valueType: 'string', format: { kind: 'url' } });
      expect(validateFieldValue(anyScheme, 'ftp://example.com')).toBeNull();
    });

    it('错误 value 是 JSON-safe 字符串', () => {
      const error = errorOf(field, 'http://example.com/a');
      expect(JSON.parse(JSON.stringify(error))).toStrictEqual(error);
      expect(typeof error.value).toBe('string');
    });
  });

  // ------------------------------------------------------[ AC#28 enum ]

  describe('AC#28 — enum 成员校验与 format 无关（D2）', () => {
    const multiSelect = propertyField({
      valueType: 'stringArray',
      enum: ['draft', 'review'],
      format: { kind: 'multiSelect' }
    });
    const plainArray = propertyField({ valueType: 'stringArray', enum: ['draft', 'review'] });
    const singleSelect = propertyField({
      valueType: 'enum',
      enum: ['draft', 'review'],
      format: { kind: 'singleSelect' },
      options: { draft: { label: '草稿' }, review: { label: '待审', disabled: true } }
    });

    it('三份 fixture 都返回 rule enum 与非法值', () => {
      expect(errorOf(multiSelect, ['draft', 'bogus']).rule).toBe('enum');
      expect(errorOf(plainArray, ['draft', 'bogus']).rule).toBe('enum');
      expect(errorOf(singleSelect, 'bogus').rule).toBe('enum');
      expect(errorOf(singleSelect, 'bogus').value).toBe('bogus');
    });

    it('数组字段列出全部非法项而不是只报第一个', () => {
      const error = errorOf(plainArray, ['bogus', 'draft', 'ghost']);
      expect(error.message).toBe('值 存在不在允许范围内的取值：bogus、ghost');
      expect(error.value).toStrictEqual(['bogus', 'draft', 'ghost']);
    });

    it('options.disabled 的选项仍算合法值', () => {
      expect(validateFieldValue(singleSelect, 'review')).toBeNull();
    });

    it('合法输入一律返回 null', () => {
      expect(validateFieldValue(multiSelect, ['draft', 'review'])).toBeNull();
      expect(validateFieldValue(plainArray, [])).toBeNull();
      expect(validateFieldValue(singleSelect, 'draft')).toBeNull();
    });
  });

  // ------------------------------------------------------[ AC#29 规则全集 ]

  describe('AC#29 — 15 条规则逐条走通过与失败', () => {
    interface RuleCase {
      descriptor: EntityFieldDescriptor;
      pass: unknown;
      fail: unknown;
    }

    // 类型是 Record<FieldValidationRule, RuleCase>：联合新增成员时这里直接编译失败，
    // 不靠运行时数字兜底。
    const RULE_CASES: Record<FieldValidationRule, RuleCase> = {
      required: { descriptor: propertyField({ valueType: 'string', required: true }), pass: 'x', fail: null },
      type: { descriptor: propertyField({ valueType: 'boolean' }), pass: true, fail: 'true' },
      uuid: { descriptor: propertyField({ valueType: 'uuid' }), pass: UUID, fail: 'not-a-uuid' },
      number: { descriptor: propertyField({ valueType: 'number' }), pass: 3.14, fail: '3.14' },
      integer: { descriptor: propertyField({ valueType: 'integer' }), pass: 42, fail: 3.14 },
      date: { descriptor: propertyField({ valueType: 'date' }), pass: new Date('2026-01-01'), fail: 'not-a-date' },
      enum: { descriptor: propertyField({ valueType: 'enum', enum: ['a', 'b'] }), pass: 'a', fail: 'c' },
      json: { descriptor: propertyField({ valueType: 'json' }), pass: { a: 1 }, fail: '{' },
      stringArray: { descriptor: propertyField({ valueType: 'stringArray' }), pass: ['a'], fail: ['a', 1] },
      numberArray: { descriptor: propertyField({ valueType: 'numberArray' }), pass: [1], fail: [1, 'b'] },
      url: {
        descriptor: propertyField({ valueType: 'string', format: { kind: 'url' } }),
        pass: 'https://example.com',
        fail: '不是链接'
      },
      urlScheme: {
        descriptor: propertyField({ valueType: 'string', format: { kind: 'url', schemes: ['https'] } }),
        pass: 'https://example.com',
        fail: 'http://example.com'
      },
      email: {
        descriptor: propertyField({ valueType: 'string', format: { kind: 'email' } }),
        pass: 'a@b.com',
        fail: 'a@b'
      },
      phone: {
        descriptor: propertyField({ valueType: 'string', format: { kind: 'phone' } }),
        pass: '+86 138-0000-0000',
        fail: '12'
      },
      range: {
        descriptor: propertyField({ valueType: 'number', format: { kind: 'number', min: 0, max: 10 } }),
        pass: 5,
        fail: 11
      }
    };

    it('email 三种非法形态都归到 email 规则', () => {
      const field = RULE_CASES.email.descriptor;
      ['a b@c.com', 'ab.com', 'a@b@c.com', '@b.com'].forEach(text => {
        expect([text, errorOf(field, text).rule]).toStrictEqual([text, 'email']);
      });
    });

    const RULE_NAMES: readonly FieldValidationRule[] = [
      'date',
      'email',
      'enum',
      'integer',
      'json',
      'number',
      'numberArray',
      'phone',
      'range',
      'required',
      'stringArray',
      'type',
      'url',
      'urlScheme',
      'uuid'
    ];

    it('用例表与 FieldValidationRule 联合成员一一对应', () => {
      expect([...Object.keys(RULE_CASES)].sort()).toStrictEqual([...RULE_NAMES].sort());
      expect(Object.keys(RULE_CASES)).toHaveLength(15);
    });

    it.each(RULE_NAMES)('%s 同时有通过与失败用例', rule => {
      const item = RULE_CASES[rule];
      expect([rule, validateFieldValue(item.descriptor, item.pass)]).toStrictEqual([rule, null]);
      expect([rule, errorOf(item.descriptor, item.fail).rule]).toStrictEqual([rule, rule]);
    });
  });

  describe('AC#29 — range 的浮点容差、step 与 percentage 值域', () => {
    it('0.3 落在 step 0.1 上（容差内命中）', () => {
      const field = propertyField({ valueType: 'number', format: { kind: 'number', min: 0, step: 0.1 } });
      expect(validateFieldValue(field, 0.3)).toBeNull();
      expect(errorOf(field, 0.35).rule).toBe('range');
    });

    it('step 基准取 min 而不是恒定 0', () => {
      const field = propertyField({ valueType: 'number', format: { kind: 'number', min: 1, step: 2 } });
      expect(validateFieldValue(field, 5)).toBeNull();
      expect(errorOf(field, 4).rule).toBe('range');
    });

    it('percentage 的 0..1 与 0..100 各有固有值域', () => {
      const unit = propertyField({ valueType: 'number', format: { kind: 'percentage', scale: '0..1' } });
      const hundred = propertyField({ valueType: 'number', format: { kind: 'percentage', scale: '0..100' } });
      expect(validateFieldValue(unit, 0.5)).toBeNull();
      expect(errorOf(unit, 1.5).rule).toBe('range');
      expect(validateFieldValue(hundred, 50)).toBeNull();
      expect(errorOf(hundred, 150).rule).toBe('range');
    });

    it('percentage 声明的 min/max 与固有值域取交集', () => {
      const field = propertyField({ valueType: 'number', format: { kind: 'percentage', scale: '0..100', min: 20 } });
      expect(errorOf(field, 10).rule).toBe('range');
      expect(errorOf(field, 120).rule).toBe('range');
      expect(validateFieldValue(field, 20)).toBeNull();
    });

    it('rating 两个端点都可选', () => {
      const field = propertyField({ valueType: 'integer', format: { kind: 'rating', min: 1, max: 5, step: 1 } });
      expect(validateFieldValue(field, 1)).toBeNull();
      expect(validateFieldValue(field, 5)).toBeNull();
      expect(errorOf(field, 6).rule).toBe('range');
    });

    it('currency 与 duration 只按 min/max/step 校验值', () => {
      const currency = propertyField({
        valueType: 'number',
        format: { kind: 'currency', currency: 'CNY', min: 0 }
      });
      const duration = propertyField({ valueType: 'integer', format: { kind: 'duration', unit: 'ms', max: 1000 } });
      expect(validateFieldValue(currency, 12.5)).toBeNull();
      expect(errorOf(currency, -1).rule).toBe('range');
      expect(validateFieldValue(duration, 1000)).toBeNull();
      expect(errorOf(duration, 1001).rule).toBe('range');
    });

    it('未声明 min 时 step 基准回落到 0', () => {
      const field = propertyField({ valueType: 'number', format: { kind: 'number', step: 5 } });
      expect(validateFieldValue(field, 10)).toBeNull();
      expect(validateFieldValue(field, -5)).toBeNull();
      expect(errorOf(field, 12).rule).toBe('range');
    });

    it('percentage 声明的 max 超出固有值域时被收窄', () => {
      const hundred = propertyField({ valueType: 'number', format: { kind: 'percentage', scale: '0..100', max: 200 } });
      const unit = propertyField({ valueType: 'number', format: { kind: 'percentage', scale: '0..1', max: 0.5 } });
      expect(validateFieldValue(hundred, 100)).toBeNull();
      expect(errorOf(hundred, 150).rule).toBe('range');
      expect(validateFieldValue(unit, 0.4)).toBeNull();
      expect(errorOf(unit, 0.6).rule).toBe('range');
    });

    it('无值语义的 format 不产出任何规则', () => {
      const inert: EntityFieldDescriptor[] = [
        propertyField({ valueType: 'string', format: { kind: 'plainText' } }),
        propertyField({ valueType: 'string', format: { kind: 'multilineText' } }),
        propertyField({ valueType: 'string', format: { kind: 'richText', contentType: 'text/markdown' } }),
        propertyField({ valueType: 'string', format: { kind: 'code', language: 'ts' } }),
        propertyField({ valueType: 'string', format: { kind: 'color', colorSpace: 'hex' } }),
        propertyField({ valueType: 'date', format: { kind: 'dateTime', display: 'datetime' } })
      ];
      inert.forEach(descriptor => {
        const probe = descriptor.valueType === 'date' ? new Date('2026-01-01') : '随便什么内容';
        expect([descriptor.format?.kind, validateFieldValue(descriptor, probe)]).toStrictEqual([
          descriptor.format?.kind,
          null
        ]);
      });
    });
  });

  describe('AC#29 — valueType 覆盖矩阵', () => {
    interface ValueTypeCase {
      descriptor: EntityFieldDescriptor;
      pass: unknown;
      fail: unknown;
      failRule: FieldValidationRule;
    }

    // Record<`${PropertyType}`, ...>：PropertyType 新增成员时编译失败。
    const VALUE_TYPE_CASES: Record<`${PropertyType}`, ValueTypeCase> = {
      uuid: { descriptor: propertyField({ valueType: 'uuid' }), pass: UUID, fail: 'x', failRule: 'uuid' },
      string: { descriptor: propertyField({ valueType: 'string' }), pass: 'x', fail: 1, failRule: 'type' },
      enum: {
        descriptor: propertyField({ valueType: 'enum', enum: ['a'] }),
        pass: 'a',
        fail: 'b',
        failRule: 'enum'
      },
      number: { descriptor: propertyField({ valueType: 'number' }), pass: 1.5, fail: 'x', failRule: 'number' },
      integer: { descriptor: propertyField({ valueType: 'integer' }), pass: 1, fail: 1.5, failRule: 'integer' },
      bigint: { descriptor: propertyField({ valueType: 'bigint' }), pass: 1n, fail: '1', failRule: 'type' },
      binary: {
        descriptor: propertyField({ valueType: 'binary' }),
        pass: new Uint8Array([1]),
        fail: '01',
        failRule: 'type'
      },
      boolean: { descriptor: propertyField({ valueType: 'boolean' }), pass: false, fail: 'false', failRule: 'type' },
      date: {
        descriptor: propertyField({ valueType: 'date' }),
        pass: new Date('2026-01-01'),
        fail: 'x',
        failRule: 'date'
      },
      stringArray: {
        descriptor: propertyField({ valueType: 'stringArray' }),
        pass: ['a'],
        fail: 'a',
        failRule: 'stringArray'
      },
      numberArray: {
        descriptor: propertyField({ valueType: 'numberArray' }),
        pass: [1],
        fail: 1,
        failRule: 'numberArray'
      },
      keyValue: {
        descriptor: propertyField({ valueType: 'keyValue' }),
        pass: { a: 1 },
        fail: [1],
        failRule: 'type'
      },
      json: { descriptor: propertyField({ valueType: 'json' }), pass: { a: 1 }, fail: new Map(), failRule: 'json' }
    };

    const VALUE_TYPES = Object.keys(VALUE_TYPE_CASES) as `${PropertyType}`[];

    it('非 required 字段遇到空值直接放行，不进类型分支', () => {
      VALUE_TYPES.forEach(valueType => {
        const descriptor = propertyField({ valueType });
        expect([valueType, validateFieldValue(descriptor, null)]).toStrictEqual([valueType, null]);
        expect([valueType, validateFieldValue(descriptor, undefined)]).toStrictEqual([valueType, null]);
        expect([valueType, validateFieldValue(descriptor, '')]).toStrictEqual([valueType, null]);
      });
    });

    it('integer 拿到非数字时报 number 而不是 integer', () => {
      expect(errorOf(propertyField({ valueType: 'integer' }), 'x').rule).toBe('number');
    });

    it('json 字段接受可解析的 JSON 文本', () => {
      const json = propertyField({ valueType: 'json' });
      expect(validateFieldValue(json, '{"a":1}')).toBeNull();
      expect(validateFieldValue(json, '[]')).toBeNull();
    });

    it('矩阵覆盖 PropertyType 全部成员', () => {
      expect([...VALUE_TYPES].sort()).toStrictEqual([...Object.values(PropertyType)].sort());
    });

    it.each(VALUE_TYPES)('%s 各有一组通过与失败用例', valueType => {
      const item = VALUE_TYPE_CASES[valueType];
      expect([valueType, validateFieldValue(item.descriptor, item.pass)]).toStrictEqual([valueType, null]);
      expect([valueType, errorOf(item.descriptor, item.fail).rule]).toStrictEqual([valueType, item.failRule]);
    });

    // 五类不进入子结构校验：只可能触发 required 与 type / json（Out of Scope 的口径）
    const INERT: Record<'bigint' | 'binary' | 'boolean' | 'json' | 'keyValue', readonly FieldValidationRule[]> = {
      bigint: ['required', 'type'],
      binary: ['required', 'type'],
      boolean: ['required', 'type'],
      keyValue: ['required', 'type'],
      json: ['required', 'json']
    };

    const PROBES: readonly unknown[] = [
      null,
      '',
      'text',
      42,
      true,
      1n,
      new Uint8Array([1, 2]),
      [1, 'a'],
      { a: 1, b: { c: [1] } },
      new Date('2026-01-01'),
      new Map([['a', 1]]),
      () => 1
    ];

    it.each(Object.keys(INERT) as (keyof typeof INERT)[])('%s 只触发 required 与 type/json', valueType => {
      const descriptor = propertyField({ valueType, required: true });
      const produced = new Set<FieldValidationRule>();
      PROBES.forEach(probe => {
        const error = validateFieldValue(descriptor, probe);
        if (error?.rule) produced.add(error.rule);
      });
      expect([valueType, [...produced].sort()]).toStrictEqual([valueType, [...INERT[valueType]].sort()]);
    });
  });

  // ------------------------------------------------------[ AC#30 值规范化 ]

  describe('AC#30 — 错误 value 的 JSON-safe 规范化（D12）', () => {
    const text = propertyField({ valueType: 'string' });

    it('Date 转 ISO 8601 字符串', () => {
      expect(errorOf(text, new Date('2026-01-02T03:04:05.000Z')).value).toBe('2026-01-02T03:04:05.000Z');
    });

    it('bigint 转十进制字符串', () => {
      expect(errorOf(text, -9007199254740993n).value).toBe('-9007199254740993');
    });

    it('Uint8Array 转小写 hex 字符串', () => {
      expect(errorOf(text, new Uint8Array([0x0a, 0xff, 0x00])).value).toBe('0aff00');
    });

    it('嵌套结构逐层规范化', () => {
      const array = propertyField({ valueType: 'stringArray' });
      expect(errorOf(array, [1, new Date('2026-01-02T03:04:05.000Z')]).value).toStrictEqual([
        1,
        '2026-01-02T03:04:05.000Z'
      ]);
    });

    it('函数、Map、实体实例、非法 Date 省略 value', () => {
      class Article extends EntityBase {}
      const unsafe: readonly unknown[] = [
        () => 1,
        new Map([['a', 1]]),
        new Article(),
        Symbol('s'),
        NaN,
        new Date('不是日期')
      ];
      unsafe.forEach(value => {
        const error = errorOf(text, value);
        expect([String(typeof value), 'value' in error]).toStrictEqual([String(typeof value), false]);
      });
    });

    it('嵌套里出现不可安全转换的值时整体省略 value', () => {
      const json = propertyField({ valueType: 'json' });
      const error = errorOf(json, { nested: [new Map()] });
      expect('value' in error).toBe(false);
    });

    it('JSON.stringify(error) 不抛且往返无损', () => {
      const errors = [errorOf(text, new Date('2026-01-02T03:04:05.000Z')), errorOf(text, 42n), errorOf(text, () => 1)];
      errors.forEach(error => {
        expect(JSON.parse(JSON.stringify(error))).toStrictEqual(error);
      });
    });
  });

  // ------------------------------------------------------[ AC#31 加密字段 ]

  describe('AC#31 — encrypted 字段始终省略 value（D12）', () => {
    const secret = propertyField({ field: 'secret', displayName: '密钥', valueType: 'string', encrypted: true });

    it('JSON-safe 的值同样不回显', () => {
      const error = errorOf(secret, 42);
      expect(error).toStrictEqual({ field: 'secret', message: '密钥 必须是字符串', rule: 'type' });
      expect('value' in error).toBe(false);
    });

    it('required 分支也不回显', () => {
      const required = propertyField({
        field: 'secret',
        displayName: '密钥',
        valueType: 'string',
        encrypted: true,
        required: true
      });
      const error = errorOf(required, '');
      expect('value' in error).toBe(false);
      expect(error.rule).toBe('required');
    });

    it('未加密的同形字段照常回显', () => {
      const plain = propertyField({ field: 'secret', displayName: '密钥', valueType: 'string' });
      expect(errorOf(plain, 42).value).toBe(42);
    });
  });

  // ------------------------------------------------------[ AC#32 关系 ]

  describe('AC#32 — 关系字段只校验 ID 形状', () => {
    it('单值关系接受单个 ID、拒绝数组', () => {
      ['1:1', 'm:1'].forEach(kind => {
        const field = toOneField('uuid', kind as '1:1' | 'm:1');
        expect([kind, validateFieldValue(field, UUID)]).toStrictEqual([kind, null]);
        expect([kind, errorOf(field, [UUID]).rule]).toStrictEqual([kind, 'uuid']);
        expect([kind, errorOf(field, 'not-a-uuid').rule]).toStrictEqual([kind, 'uuid']);
      });
    });

    it('多值关系要求数组、逐项校验 ID', () => {
      ['1:m', 'm:n'].forEach(kind => {
        const field = toManyField('uuid', kind as '1:m' | 'm:n');
        expect([kind, validateFieldValue(field, [UUID])]).toStrictEqual([kind, null]);
        expect([kind, validateFieldValue(field, [])]).toStrictEqual([kind, null]);
        expect([kind, errorOf(field, UUID).rule]).toStrictEqual([kind, 'type']);
        expect([kind, errorOf(field, [UUID, 'bogus']).rule]).toStrictEqual([kind, 'uuid']);
      });
    });

    it('关系 valueType 不是 uuid 时按该类型校验', () => {
      expect(validateFieldValue(toOneField('string'), 'external-key')).toBeNull();
      expect(errorOf(toOneField('string'), 42).rule).toBe('type');
      expect(validateFieldValue(toOneField('integer'), 7)).toBeNull();
      expect(errorOf(toOneField('integer'), 7.5).rule).toBe('integer');
      expect(validateFieldValue(toManyField('bigint'), [1n])).toBeNull();
      expect(errorOf(toManyField('bigint'), ['1']).rule).toBe('type');
    });

    it('不发起任何 repository 调用', () => {
      // 用描述符取值而不是 Reflect.get：后者会触发 getter，把「探测」变成「调用」。
      const prototype = RepositoryBase.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
      const methods = Object.getOwnPropertyNames(RepositoryBase.prototype).filter(name => {
        if (name === 'constructor') return false;
        const descriptor = Object.getOwnPropertyDescriptor(RepositoryBase.prototype, name);
        return typeof descriptor?.value === 'function';
      });
      expect(methods.length).toBeGreaterThan(0);
      const spies = methods.map(name => vi.spyOn(prototype, name));
      try {
        validateFieldValue(toOneField(), UUID);
        validateFieldValue(toManyField(), [UUID, 'bogus']);
        spies.forEach((spy, index) => {
          expect([methods[index], spy.mock.calls.length]).toStrictEqual([methods[index], 0]);
        });
      } finally {
        spies.forEach(spy => spy.mockRestore());
      }
    });

    it('多值关系没有 required 键时空数组不报错', () => {
      expect(validateFieldValue(toManyField(), [])).toBeNull();
    });

    it('单值关系声明 required 时 null 报 required', () => {
      const field: EntityToOneRelationFieldDescriptor = { ...toOneField(), required: true };
      expect(errorOf(field, null).rule).toBe('required');
    });
  });

  // ------------------------------------------------------[ 计算属性与系统字段 ]

  describe('计算属性与系统字段走同一条属性分支', () => {
    it('computed 描述符按 valueType 校验', () => {
      const computed: EntityFieldDescriptor = {
        field: 'wordCount',
        displayName: '字数',
        source: 'computed',
        cardinality: 'single',
        valueType: 'integer',
        readonly: true,
        nullable: true,
        required: false,
        unique: false,
        encrypted: false
      };
      expect(validateFieldValue(computed, 12)).toBeNull();
      expect(errorOf(computed, 1.5).rule).toBe('integer');
    });

    it('system 描述符按 valueType 校验', () => {
      const system = propertyField({
        field: 'createdAt',
        displayName: '创建时间',
        valueType: 'date',
        source: 'system'
      });
      expect(validateFieldValue(system, new Date('2026-01-01'))).toBeNull();
      expect(errorOf(system, 'x').rule).toBe('date');
    });
  });

  describe('封闭集合之外的输入直接抛错，不静默放行', () => {
    it('未知 valueType 抛 TypeError', () => {
      const bogus = propertyField({ valueType: 'bogus' as `${PropertyType}` });
      expect(() => validateFieldValue(bogus, 'x')).toThrow(TypeError);
    });

    it('未知 format kind 抛 TypeError', () => {
      const bogus = propertyField({ valueType: 'string', format: { kind: 'bogus' } as unknown as FieldFormat });
      expect(() => validateFieldValue(bogus, 'x')).toThrow(TypeError);
    });
  });
});
