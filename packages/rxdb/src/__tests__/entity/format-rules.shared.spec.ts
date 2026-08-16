/**
 * @fileoverview format 规则表三处消费者的口径一致性。
 *
 * `format` 的同一批规则被三处消费：注册期闸门 `validateEntityMetadata()`、线格式严格解析器
 * `parseEntityFieldsDescriptor()` 与值校验 `validateFieldValue()`。三处各写一份必然漂移——
 * 本文件从**外部行为**上锁死它们同源：同一个畸形 format 必须被注册期和解析器同时拒绝，
 * 同一个浮点边界必须被注册期和值校验同样判定。
 *
 * 这些断言不依赖内部常量的名字或位置，只依赖「三处结果一致」，因此重构共享表不会误伤。
 */

import { describe, expect, it } from 'vitest';
import {
  describeEntityFields,
  parseEntityFieldsDescriptor,
  type EntityFieldDescriptor,
  type EntityMetadataResolver
} from '../../entity/entity-field.utils.js';
import { validateFieldValue } from '../../entity/entity-value.utils.js';
import { PropertyType, type EntityMetadataOptions } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { validateEntityMetadata } from '../../entity/metadata-validate.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';

/** 探针实体没有关系，解析器不会被调用到。 */
const NO_RELATIONS: EntityMetadataResolver = () => undefined;

/** 单属性探针实体：`format` 走 `unknown`，否则窄类型会在编译期就拦掉待测的畸形组合。 */
const probeMetadata = (type: PropertyType, format: unknown): EntityMetadata =>
  transitionMetadata({
    name: 'Probe',
    namespace: 'public',
    properties: [{ name: 'value', type, displayName: '值', format }],
    computedProperties: [],
    relations: [],
    indexes: []
  } as unknown as EntityMetadataOptions);

/** 探针字段的描述符。 */
function probeField(type: PropertyType, format: unknown): EntityFieldDescriptor {
  const found = describeEntityFields(probeMetadata(type, format), NO_RELATIONS).fields.find(
    item => item.field === 'value'
  );
  if (!found) throw new Error('探针字段 value 不存在');
  return found;
}

/** 探针实体的线格式：`describeEntityFields()` 原样透传 format，正好用来喂解析器。 */
const probeWire = (type: PropertyType, format: unknown): unknown =>
  JSON.parse(JSON.stringify(describeEntityFields(probeMetadata(type, format), NO_RELATIONS)));

const rulesOf = (type: PropertyType, format: unknown): readonly string[] =>
  validateEntityMetadata(probeMetadata(type, format)).map(item => item.rule);

/** 缺必填配置键的 format，逐条带上合法载体类型，避免先撞 `formatTypeMismatch` 提前返回。 */
const MISSING_CONFIG_CASES: readonly (readonly [string, PropertyType, unknown])[] = [
  ['richText 缺 contentType', PropertyType.string, { kind: 'richText' }],
  ['currency 缺 currency', PropertyType.number, { kind: 'currency' }],
  ['percentage 缺 scale', PropertyType.number, { kind: 'percentage' }],
  ['duration 缺 unit', PropertyType.number, { kind: 'duration' }],
  ['rating 缺 min/max/step', PropertyType.number, { kind: 'rating' }],
  ['rating 只缺 step', PropertyType.number, { kind: 'rating', min: 1, max: 5 }]
];

describe('format 规则表的跨模块一致性', () => {
  it.each(MISSING_CONFIG_CASES)('%s —— 注册期与解析器都拒绝', (_title, type, format) => {
    expect(rulesOf(type, format)).toContain('missingFormatConfig');
    expect(() => parseEntityFieldsDescriptor(probeWire(type, format))).toThrow(/缺少必填配置/);
  });

  it('必填配置齐全时两处都放行', () => {
    const format = { kind: 'rating', min: 1, max: 5, step: 1 };

    expect(rulesOf(PropertyType.number, format)).toStrictEqual([]);
    expect(() => parseEntityFieldsDescriptor(probeWire(PropertyType.number, format))).not.toThrow();
  });

  it('step 浮点容差同口径：0.3 / 0.1 = 2.9999999999999996 两处都算对齐', () => {
    // 注册期用它判 rating 端点能否被 step 整除，值校验用它判具体值是否落在刻度上。
    // 容差因子只要有一处改动，这两条断言必有一条翻转。
    const format = { kind: 'rating', min: 0, max: 0.3, step: 0.1 };

    expect(rulesOf(PropertyType.number, format)).toStrictEqual([]);
    expect(validateFieldValue(probeField(PropertyType.number, format), 0.3)).toBeNull();
  });

  it('percentage 固有值域同口径：0..1 两处都把 1.5 判为越界', () => {
    const declared = { kind: 'percentage', scale: '0..1', min: -1 };
    const clean = { kind: 'percentage', scale: '0..1' };

    expect(rulesOf(PropertyType.number, declared)).toContain('invalidRange');
    expect(validateFieldValue(probeField(PropertyType.number, clean), 1.5)?.rule).toBe('range');
    expect(validateFieldValue(probeField(PropertyType.number, clean), 0.5)).toBeNull();
  });
});
