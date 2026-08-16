/**
 * @fileoverview US-012 阶段 A — 类型层断言（AC#4、AC#10、AC#12 的类型侧）。
 *
 * 这些断言由 `pnpm nx typecheck rxdb` 强制执行：`tsconfig.json` 同时引用
 * `tsconfig.lib.json` 与 `tsconfig.spec.json`，`@ts-expect-error` 未生效时 tsc 直接报错。
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  BigIntProperty,
  BinaryProperty,
  BooleanProperty,
  DateProperty,
  EntityRelationManyToManyMetadata,
  EntityRelationManyToOneMetadata,
  EntityRelationOneToManyMetadata,
  EntityRelationOneToOneMetadata,
  EnumProperty,
  IntegerProperty,
  JSONProperty,
  KeyValueProperty,
  NumberArrayProperty,
  NumberProperty,
  StringArrayProperty,
  StringProperty,
  UUIDProperty
} from '../../entity/metadata-options.interface.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import { FIELD_FORMAT_CARRIERS } from '../../entity/metadata-validate.js';
import { STRUCTURAL_CASES } from '../fixtures/field-format-cases.js';

/** 分配式取出 format 联合的全部 `kind`。 */
type KindOf<F> = F extends { kind: infer K } ? K : never;
type FormatKindOf<P extends { format?: unknown }> = KindOf<NonNullable<P['format']>>;

/** 从运行时载体表反查某个 PropertyType 允许的 kind 集合。 */
type CarrierKinds<T extends PropertyType> = {
  [K in keyof typeof FIELD_FORMAT_CARRIERS]: T extends (typeof FIELD_FORMAT_CARRIERS)[K][number] ? K : never;
}[keyof typeof FIELD_FORMAT_CARRIERS];

/**
 * 结构 fixture 的类型侧镜像。
 *
 * 类型层的「拒绝」依赖对象字面量的多余属性检查（freshness），条件类型的 `extends`
 * 判定复现不了这个规则，所以镜像只能逐条手写。这里把每条镜像与 fixture 的 `label`
 * 绑定，并在下方断言两侧标签集合完全一致——fixture 新增用例却漏写镜像会立刻失败。
 */
const MIRRORED_REJECTIONS: readonly string[] = [
  'unknown kind',
  'currency on string',
  'dateTime on string',
  'currency on integer',
  'multiSelect on enum',
  'singleSelect on stringArray',
  'richText without contentType',
  'duration without unit',
  'url carrying currency config key',
  'number carrying scale config key'
];

const MIRRORED_ACCEPTANCES: readonly string[] = [
  'plainText on string',
  'url on string',
  'richText on string with contentType',
  'dateTime on date',
  'singleSelect on enum',
  'multiSelect on stringArray with enum',
  'rating on integer with full config'
];

describe('AC#12 — 结构 fixture 的单向不变式（类型侧）', () => {
  it('typeRejects 的 fixture 逐条不可编译', () => {
    // @ts-expect-error unknown kind
    const unknownKind = (): StringProperty['format'] => ({ kind: 'bogus' });
    // @ts-expect-error currency on string
    const currencyOnString = (): StringProperty['format'] => ({ kind: 'currency', currency: 'USD' });
    // @ts-expect-error dateTime on string
    const dateTimeOnString = (): StringProperty['format'] => ({ kind: 'dateTime' });
    // @ts-expect-error currency on integer
    const currencyOnInteger = (): IntegerProperty['format'] => ({ kind: 'currency', currency: 'USD' });
    // @ts-expect-error multiSelect on enum
    const multiSelectOnEnum = (): EnumProperty['format'] => ({ kind: 'multiSelect' });
    // @ts-expect-error singleSelect on stringArray
    const singleSelectOnArray = (): StringArrayProperty['format'] => ({ kind: 'singleSelect' });
    // @ts-expect-error richText without contentType
    const richTextBare = (): StringProperty['format'] => ({ kind: 'richText' });
    // @ts-expect-error duration without unit
    const durationBare = (): NumberProperty['format'] => ({ kind: 'duration' });
    // @ts-expect-error url carrying currency config key
    const urlWithCurrency = (): StringProperty['format'] => ({ kind: 'url', currency: 'USD' });
    // @ts-expect-error number carrying scale config key
    const numberWithScale = (): NumberProperty['format'] => ({ kind: 'number', scale: '0..1' });

    expectTypeOf(unknownKind).returns.toEqualTypeOf<StringProperty['format']>();
    expectTypeOf(currencyOnString).returns.toEqualTypeOf<StringProperty['format']>();
    expectTypeOf(dateTimeOnString).returns.toEqualTypeOf<StringProperty['format']>();
    expectTypeOf(currencyOnInteger).returns.toEqualTypeOf<IntegerProperty['format']>();
    expectTypeOf(multiSelectOnEnum).returns.toEqualTypeOf<EnumProperty['format']>();
    expectTypeOf(singleSelectOnArray).returns.toEqualTypeOf<StringArrayProperty['format']>();
    expectTypeOf(richTextBare).returns.toEqualTypeOf<StringProperty['format']>();
    expectTypeOf(durationBare).returns.toEqualTypeOf<NumberProperty['format']>();
    expectTypeOf(urlWithCurrency).returns.toEqualTypeOf<StringProperty['format']>();
    expectTypeOf(numberWithScale).returns.toEqualTypeOf<NumberProperty['format']>();
  });

  it('运行时接受的 fixture 逐条可编译', () => {
    const plainText = (): StringProperty['format'] => ({ kind: 'plainText' });
    const url = (): StringProperty['format'] => ({ kind: 'url', schemes: ['https'] });
    const richText = (): StringProperty['format'] => ({ kind: 'richText', contentType: 'text/markdown' });
    const dateTime = (): DateProperty['format'] => ({ kind: 'dateTime', display: 'date' });
    const singleSelect = (): EnumProperty['format'] => ({ kind: 'singleSelect' });
    const multiSelect = (): StringArrayProperty['format'] => ({ kind: 'multiSelect' });
    const rating = (): IntegerProperty['format'] => ({ kind: 'rating', min: 1, max: 5, step: 1 });

    expectTypeOf(plainText).returns.toEqualTypeOf<StringProperty['format']>();
    expectTypeOf(url).returns.toEqualTypeOf<StringProperty['format']>();
    expectTypeOf(richText).returns.toEqualTypeOf<StringProperty['format']>();
    expectTypeOf(dateTime).returns.toEqualTypeOf<DateProperty['format']>();
    expectTypeOf(singleSelect).returns.toEqualTypeOf<EnumProperty['format']>();
    expectTypeOf(multiSelect).returns.toEqualTypeOf<StringArrayProperty['format']>();
    expectTypeOf(rating).returns.toEqualTypeOf<IntegerProperty['format']>();
  });

  it('镜像标签与结构 fixture 一一对应，没有漏写的用例', () => {
    const rejected = STRUCTURAL_CASES.filter(item => item.typeRejects).map(item => item.label);
    const accepted = STRUCTURAL_CASES.filter(item => !item.typeRejects).map(item => item.label);
    expect([...MIRRORED_REJECTIONS].sort()).toEqual([...rejected].sort());
    expect([...MIRRORED_ACCEPTANCES].sort()).toEqual([...accepted].sort());
  });
});

describe('AC#12 — 类型层与运行时载体表同源', () => {
  it('每个可标注属性的 format 联合等于载体表的反查结果', () => {
    expectTypeOf<FormatKindOf<StringProperty>>().toEqualTypeOf<CarrierKinds<PropertyType.string>>();
    expectTypeOf<FormatKindOf<NumberProperty>>().toEqualTypeOf<CarrierKinds<PropertyType.number>>();
    expectTypeOf<FormatKindOf<IntegerProperty>>().toEqualTypeOf<CarrierKinds<PropertyType.integer>>();
    expectTypeOf<FormatKindOf<DateProperty>>().toEqualTypeOf<CarrierKinds<PropertyType.date>>();
    expectTypeOf<FormatKindOf<EnumProperty>>().toEqualTypeOf<CarrierKinds<PropertyType.enum>>();
    expectTypeOf<FormatKindOf<StringArrayProperty>>().toEqualTypeOf<CarrierKinds<PropertyType.stringArray>>();
  });

  it('载体表未覆盖的 PropertyType 在类型层没有 format 键', () => {
    expectTypeOf<UUIDProperty>().not.toHaveProperty('format');
    expectTypeOf<BooleanProperty>().not.toHaveProperty('format');
    expectTypeOf<BigIntProperty>().not.toHaveProperty('format');
    expectTypeOf<BinaryProperty>().not.toHaveProperty('format');
    expectTypeOf<NumberArrayProperty>().not.toHaveProperty('format');
    expectTypeOf<KeyValueProperty>().not.toHaveProperty('format');
    expectTypeOf<JSONProperty>().not.toHaveProperty('format');
  });
});

/**
 * 断言统一写成「带返回类型标注的箭头函数」而不是 `const x: T = ...`：
 * 显式标注的 `const` 会被控制流分析收窄成初始化值的类型，`toEqualTypeOf` 读到的
 * 是收窄结果而非声明类型；返回类型标注不参与收窄，断言才落在真正想比对的类型上。
 */
describe('AC#4 — 缺必填配置的 format 不可编译', () => {
  it('richText 必须声明 contentType', () => {
    // @ts-expect-error richText 缺少 contentType
    const missing = (): StringProperty['format'] => ({ kind: 'richText' });
    const present = (): StringProperty['format'] => ({ kind: 'richText', contentType: 'text/html' });
    expectTypeOf(missing).returns.toEqualTypeOf<StringProperty['format']>();
    expectTypeOf(present).returns.toEqualTypeOf<StringProperty['format']>();
  });

  it('rating 必须同时声明 min/max/step', () => {
    // @ts-expect-error rating 缺少 step
    const missing = (): NumberProperty['format'] => ({ kind: 'rating', min: 0, max: 5 });
    expectTypeOf(missing).returns.toEqualTypeOf<NumberProperty['format']>();
  });

  it('currency / percentage / duration 各自的必填键不可省略', () => {
    // @ts-expect-error currency 缺少 currency
    const noCurrency = (): NumberProperty['format'] => ({ kind: 'currency' });
    // @ts-expect-error percentage 缺少 scale
    const noScale = (): NumberProperty['format'] => ({ kind: 'percentage' });
    // @ts-expect-error duration 缺少 unit
    const noUnit = (): NumberProperty['format'] => ({ kind: 'duration' });
    expectTypeOf(noCurrency).returns.toEqualTypeOf<NumberProperty['format']>();
    expectTypeOf(noScale).returns.toEqualTypeOf<NumberProperty['format']>();
    expectTypeOf(noUnit).returns.toEqualTypeOf<NumberProperty['format']>();
  });

  it('配置键不得跨 format 复用', () => {
    // @ts-expect-error url 不接受 currency
    const crossed = (): StringProperty['format'] => ({ kind: 'url', currency: 'USD' });
    // @ts-expect-error number 不接受 scale
    const scaled = (): NumberProperty['format'] => ({ kind: 'number', scale: '0..1' });
    expectTypeOf(crossed).returns.toEqualTypeOf<StringProperty['format']>();
    expectTypeOf(scaled).returns.toEqualTypeOf<NumberProperty['format']>();
  });

  it('未知 kind 与不匹配载体在类型层即被拒绝', () => {
    // @ts-expect-error bogus 不在 FieldFormat 内
    const unknownKind = (): StringProperty['format'] => ({ kind: 'bogus' });
    // @ts-expect-error dateTime 的载体是 date
    const mismatch = (): StringProperty['format'] => ({ kind: 'dateTime' });
    // @ts-expect-error multiSelect 的载体是 stringArray
    const cardinality = (): EnumProperty['format'] => ({ kind: 'multiSelect' });
    // @ts-expect-error singleSelect 的载体是 enum
    const cardinality2 = (): StringArrayProperty['format'] => ({ kind: 'singleSelect' });
    expectTypeOf(unknownKind).returns.toEqualTypeOf<StringProperty['format']>();
    expectTypeOf(mismatch).returns.toEqualTypeOf<StringProperty['format']>();
    expectTypeOf(cardinality).returns.toEqualTypeOf<EnumProperty['format']>();
    expectTypeOf(cardinality2).returns.toEqualTypeOf<StringArrayProperty['format']>();
  });
});

describe('AC#10 — 关系不接受 format / readonly', () => {
  it('四种 kind 的 format 都被类型层拒绝', () => {
    // @ts-expect-error 1:1 关系不接受 format
    const oneToOne = (): EntityRelationOneToOneMetadata['format'] => ({ kind: 'plainText' });
    // @ts-expect-error m:1 关系不接受 format
    const manyToOne = (): EntityRelationManyToOneMetadata['format'] => ({ kind: 'plainText' });
    // @ts-expect-error 1:m 关系不接受 format
    const oneToMany = (): EntityRelationOneToManyMetadata['format'] => ({ kind: 'plainText' });
    // @ts-expect-error m:n 关系不接受 format
    const manyToMany = (): EntityRelationManyToManyMetadata['format'] => ({ kind: 'plainText' });
    expectTypeOf(oneToOne).returns.toEqualTypeOf<undefined>();
    expectTypeOf(manyToOne).returns.toEqualTypeOf<undefined>();
    expectTypeOf(oneToMany).returns.toEqualTypeOf<undefined>();
    expectTypeOf(manyToMany).returns.toEqualTypeOf<undefined>();
  });

  it('四种 kind 的 readonly 被收窄成 never，恒为常量 true 不接受声明', () => {
    // @ts-expect-error 1:1 关系不接受 readonly
    const oneToOne = (): EntityRelationOneToOneMetadata['readonly'] => true;
    // @ts-expect-error m:1 关系不接受 readonly
    const manyToOne = (): EntityRelationManyToOneMetadata['readonly'] => true;
    // @ts-expect-error 1:m 关系不接受 readonly
    const oneToMany = (): EntityRelationOneToManyMetadata['readonly'] => false;
    // @ts-expect-error m:n 关系不接受 readonly
    const manyToMany = (): EntityRelationManyToManyMetadata['readonly'] => false;
    expectTypeOf(oneToOne).returns.toEqualTypeOf<undefined>();
    expectTypeOf(manyToOne).returns.toEqualTypeOf<undefined>();
    expectTypeOf(oneToMany).returns.toEqualTypeOf<undefined>();
    expectTypeOf(manyToMany).returns.toEqualTypeOf<undefined>();
  });
});
