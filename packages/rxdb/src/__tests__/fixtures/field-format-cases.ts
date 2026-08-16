/**
 * @fileoverview US-012 AC#12 — 结构 fixture 与值语义 fixture 的唯一数据源。
 *
 * `STRUCTURAL_CASES` 由类型级测试与运行时测试共同读取，用于证明单向不变式：
 * 类型拒绝则运行时拒绝，运行时接受则类型合法。
 * `VALUE_SEMANTIC_CASES` 单独维护，它们只能由运行时拒绝——TypeScript 无法证明
 * 数值大小、字符串内容和数组重复性。
 */

import { PropertyType } from '../../entity/metadata-options.interface.js';
import type { MetadataValidationRule } from '../../entity/metadata-validate.js';

/** 结构 fixture：合法性完全由声明形状决定。 */
export const STRUCTURAL_CASES = [
  {
    label: 'plainText on string',
    type: PropertyType.string,
    extra: { format: { kind: 'plainText' } },
    typeRejects: false,
    expected: null
  },
  {
    label: 'url on string',
    type: PropertyType.string,
    extra: { format: { kind: 'url', schemes: ['https'] } },
    typeRejects: false,
    expected: null
  },
  {
    label: 'richText on string with contentType',
    type: PropertyType.string,
    extra: { format: { kind: 'richText', contentType: 'text/markdown' } },
    typeRejects: false,
    expected: null
  },
  {
    label: 'dateTime on date',
    type: PropertyType.date,
    extra: { format: { kind: 'dateTime', display: 'date' } },
    typeRejects: false,
    expected: null
  },
  {
    label: 'singleSelect on enum',
    type: PropertyType.enum,
    extra: { enum: ['open', 'closed'], format: { kind: 'singleSelect' } },
    typeRejects: false,
    expected: null
  },
  {
    label: 'multiSelect on stringArray with enum',
    type: PropertyType.stringArray,
    extra: { enum: ['red', 'green'], format: { kind: 'multiSelect' } },
    typeRejects: false,
    expected: null
  },
  {
    label: 'rating on integer with full config',
    type: PropertyType.integer,
    extra: { format: { kind: 'rating', min: 1, max: 5, step: 1 } },
    typeRejects: false,
    expected: null
  },
  {
    label: 'unknown kind',
    type: PropertyType.string,
    extra: { format: { kind: 'bogus' } },
    typeRejects: true,
    expected: 'unknownFormat'
  },
  {
    label: 'currency on string',
    type: PropertyType.string,
    extra: { format: { kind: 'currency', currency: 'USD' } },
    typeRejects: true,
    expected: 'formatTypeMismatch'
  },
  {
    label: 'dateTime on string',
    type: PropertyType.string,
    extra: { format: { kind: 'dateTime' } },
    typeRejects: true,
    expected: 'formatTypeMismatch'
  },
  {
    label: 'currency on integer',
    type: PropertyType.integer,
    extra: { format: { kind: 'currency', currency: 'USD' } },
    typeRejects: true,
    expected: 'formatTypeMismatch'
  },
  {
    label: 'multiSelect on enum',
    type: PropertyType.enum,
    extra: { enum: ['a'], format: { kind: 'multiSelect' } },
    typeRejects: true,
    expected: 'cardinalityConflict'
  },
  {
    label: 'singleSelect on stringArray',
    type: PropertyType.stringArray,
    extra: { enum: ['a'], format: { kind: 'singleSelect' } },
    typeRejects: true,
    expected: 'cardinalityConflict'
  },
  {
    label: 'richText without contentType',
    type: PropertyType.string,
    extra: { format: { kind: 'richText' } },
    typeRejects: true,
    expected: 'missingFormatConfig'
  },
  {
    label: 'duration without unit',
    type: PropertyType.number,
    extra: { format: { kind: 'duration' } },
    typeRejects: true,
    expected: 'missingFormatConfig'
  },
  {
    label: 'url carrying currency config key',
    type: PropertyType.string,
    extra: { format: { kind: 'url', currency: 'USD' } },
    typeRejects: true,
    expected: 'invalidFormatConfig'
  },
  {
    label: 'number carrying scale config key',
    type: PropertyType.number,
    extra: { format: { kind: 'number', scale: '0..1' } },
    typeRejects: true,
    expected: 'invalidFormatConfig'
  }
] as const satisfies readonly {
  label: string;
  type: PropertyType;
  extra: Record<string, unknown>;
  typeRejects: boolean;
  expected: MetadataValidationRule | null;
}[];

/** 值语义 fixture：类型层接受，只能由运行时判定。 */
export const VALUE_SEMANTIC_CASES = [
  {
    label: 'currency 代码合法',
    type: PropertyType.number,
    extra: { format: { kind: 'currency', currency: 'CNY' } },
    expected: null
  },
  {
    label: 'currency 代码小写',
    type: PropertyType.number,
    extra: { format: { kind: 'currency', currency: 'usd' } },
    expected: 'invalidFormatConfig'
  },
  {
    label: 'currency 代码长度错误',
    type: PropertyType.number,
    extra: { format: { kind: 'currency', currency: 'US' } },
    expected: 'invalidFormatConfig'
  },
  {
    label: 'scheme 语法合法',
    type: PropertyType.string,
    extra: { format: { kind: 'url', schemes: ['https', 'x-app+v1'] } },
    expected: null
  },
  {
    label: 'scheme 带冒号',
    type: PropertyType.string,
    extra: { format: { kind: 'url', schemes: ['https:'] } },
    expected: 'invalidFormatConfig'
  },
  {
    label: 'scheme 以数字开头',
    type: PropertyType.string,
    extra: { format: { kind: 'url', schemes: ['1http'] } },
    expected: 'invalidFormatConfig'
  },
  {
    label: 'language 非空',
    type: PropertyType.string,
    extra: { format: { kind: 'code', language: 'ts' } },
    expected: null
  },
  {
    label: 'language 空串',
    type: PropertyType.string,
    extra: { format: { kind: 'code', language: '' } },
    expected: 'invalidFormatConfig'
  },
  {
    label: 'timezone 空串',
    type: PropertyType.date,
    extra: { format: { kind: 'dateTime', timezone: '' } },
    expected: 'invalidFormatConfig'
  },
  {
    label: 'colorSpace 非法字面量',
    type: PropertyType.string,
    extra: { format: { kind: 'color', colorSpace: 'cmyk' } },
    expected: 'invalidFormatConfig'
  },
  {
    label: 'contentType 非法字面量',
    type: PropertyType.string,
    extra: { format: { kind: 'richText', contentType: 'application/json' } },
    expected: 'invalidFormatConfig'
  },
  {
    label: 'number min > max',
    type: PropertyType.number,
    extra: { format: { kind: 'number', min: 5, max: 1 } },
    expected: 'invalidRange'
  },
  {
    label: 'percentage 越出固有值域',
    type: PropertyType.number,
    extra: { format: { kind: 'percentage', scale: '0..1', min: -0.5 } },
    expected: 'invalidRange'
  },
  {
    label: 'enum 重复值',
    type: PropertyType.enum,
    extra: { enum: ['a', 'a'] },
    expected: 'duplicateEnum'
  },
  {
    label: 'enum 无重复',
    type: PropertyType.enum,
    extra: { enum: ['a', 'b'] },
    expected: null
  }
] as const satisfies readonly {
  label: string;
  type: PropertyType;
  extra: Record<string, unknown>;
  expected: MetadataValidationRule | null;
}[];
