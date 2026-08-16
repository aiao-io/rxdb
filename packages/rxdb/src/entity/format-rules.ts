/**
 * @fileoverview `format` 值规则的内部唯一真相源。
 *
 * @remarks
 * 同一批 format 规则有三个消费者：注册期闸门 `validateEntityMetadata()`、线格式严格解析器
 * `parseEntityFieldsDescriptor()` 与值校验 `validateFieldValue()`。三处各写一份必然漂移——
 * `rating` 少一个 `step` 在注册期报错、在解析器放行，就是两份表的直接后果。
 *
 * 与 `json-safe.ts` 一样刻意**不**从包入口导出：这是内部实现细节，不是公开协议。
 * 面向消费方的键名字典是 `metadata-validate.ts` 里公开的 `FIELD_FORMAT_CONFIG_KEYS`。
 *
 * 表之外还共享**操作**（{@link missingFormatConfigKeys}、{@link isOnStep}）：只共享数据、
 * 各自再写一遍判定逻辑，容差因子和缺键判据照样会分叉。
 */

import type { FieldFormat, PercentageFormat } from './metadata-options.interface.js';

/**
 * 各 kind 的必填配置键。
 *
 * @remarks
 * 未列出的 kind 没有必填配置。这些键缺失时 format 的类型承诺就不成立——
 * `RichTextFormat.contentType` 是必选属性，产出一个没有它的对象等于制造类型谎言。
 */
export const REQUIRED_FORMAT_CONFIG_KEYS: Readonly<Partial<Record<FieldFormat['kind'], readonly string[]>>> = {
  currency: ['currency'],
  duration: ['unit'],
  percentage: ['scale'],
  rating: ['min', 'max', 'step'],
  richText: ['contentType']
};

/**
 * 列出 `format` 缺失的必填配置键；`kind` 未知或无必填项时返回空数组。
 *
 * @remarks
 * 必须走 `Object.hasOwn`：`kind` 是未受信字符串，`REQUIRED_FORMAT_CONFIG_KEYS['toString']`
 * 会取到 `Object.prototype.toString`，`?? []` 拦不住它，随后的 `.filter` 直接抛 TypeError。
 */
export const missingFormatConfigKeys = (kind: string, format: Record<string, unknown>): readonly string[] =>
  (Object.hasOwn(REQUIRED_FORMAT_CONFIG_KEYS, kind) ?
    (REQUIRED_FORMAT_CONFIG_KEYS[kind as FieldFormat['kind']] ?? [])
  : []
  ).filter(key => !(key in format));

/**
 * 枚举型配置键的合法字面量。
 *
 * @remarks
 * 注册期闸门判「这个值不在联合里」，线格式解析器判「这个值不能进 `FieldFormat`」——
 * 两边判据必须同源，否则解析器会放行一个注册期拒绝的值，造出 `as FieldFormat` 的类型谎言。
 */
export const FORMAT_CONFIG_LITERALS: Readonly<Record<string, readonly string[]>> = {
  contentType: ['text/markdown', 'text/html'],
  scale: ['0..1', '0..100'],
  unit: ['ms', 's', 'min', 'h', 'd'],
  colorSpace: ['hex', 'rgb', 'hsl', 'hsv', 'lab', 'lch'],
  display: ['date', 'time', 'datetime']
};

/** 按配置键取合法字面量；该键不是枚举型时返回 `undefined`。 */
export const formatConfigLiteralsOf = (key: string): readonly string[] | undefined =>
  Object.hasOwn(FORMAT_CONFIG_LITERALS, key) ? FORMAT_CONFIG_LITERALS[key] : undefined;

/** `percentage` 各刻度的固有值域。 */
export const PERCENTAGE_DOMAIN = {
  '0..1': [0, 1],
  '0..100': [0, 100]
} as const satisfies Record<PercentageFormat['scale'], readonly [number, number]>;

/** 按未收窄的 `scale` 文本查固有值域；不是合法刻度时返回 `undefined`。 */
export const percentageDomainOf = (scale: string): readonly [number, number] | undefined =>
  Object.hasOwn(PERCENTAGE_DOMAIN, scale) ? PERCENTAGE_DOMAIN[scale as PercentageFormat['scale']] : undefined;

/**
 * step 对齐容差因子。
 *
 * @remarks
 * 浮点除法必然带误差（`0.3 / 0.1 === 2.9999999999999996`），按商的量级放大 `EPSILON`，
 * 而不是拿固定阈值硬卡。这个因子改一次，注册期的端点对齐判定与值校验的刻度判定必须一起改，
 * 所以它只能有一份。
 */
const STEP_EPSILON_FACTOR = 8;

/** 商是否可视为整数。 */
export const isStepAligned = (quotient: number): boolean =>
  Math.abs(quotient - Math.round(quotient)) <= Number.EPSILON * Math.max(1, Math.abs(quotient)) * STEP_EPSILON_FACTOR;

/** 值是否落在「以 `base` 为起点、`step` 为步长」的刻度上。 */
export const isOnStep = (value: number, base: number, step: number): boolean => isStepAligned((value - base) / step);
