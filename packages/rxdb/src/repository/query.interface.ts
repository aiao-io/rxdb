import type { EntityData } from '../entity/entity.interface.js';
import { RxDBContext } from '../rxdb.interface.js';

/**
 * 字符串类型的键
 */
type StringKey<T> = keyof T & string;

type RuleValueDefault = { readonly value: unique symbol };

type RelationTarget<T> =
  unknown extends T ? EntityData
  : T extends null | undefined ? never
  : T extends readonly (infer U)[] ? NonNullable<U>
  : T;

interface DynamicRule {
  field: string;
  operator: OperatorName;
  value?: unknown;
  where?: DynamicRuleGroup;
}

interface DynamicRuleGroup {
  combinator: 'and' | 'or';
  rules: Array<DynamicRuleGroup | DynamicRule>;
}

type DynamicRuleForKey<K extends string> = string extends K ? DynamicRule : never;

interface RuleEqualNullable<T, K extends StringKey<T>, VT> {
  field: K;
  operator: '=' | '!=';
  value: Exclude<VT, undefined>;
}

interface RuleOperatorNullable<T, K extends StringKey<T>> {
  field: K;
  operator: 'null' | 'notNull';
}

interface RuleStringNonNullable<T, K extends StringKey<T>, VT> {
  field: K;
  operator:
    '<' | '>' | '<=' | '>=' | 'contains' | 'notContains' | 'startsWith' | 'notStartsWith' | 'endsWith' | 'notEndsWith';
  value: Exclude<VT, undefined | null>;
}

interface RuleNumberNonNullable<T, K extends StringKey<T>, VT> {
  field: K;
  operator: '<' | '>' | '<=' | '>=';
  value: Exclude<VT, undefined | null>;
}

interface RuleIn<T, K extends StringKey<T>, VT> {
  field: K;
  operator: 'in' | 'notIn';
  value: Exclude<VT, undefined | null>[];
}

interface RuleBetween<T, K extends StringKey<T>, VT> {
  field: K;
  operator: 'between' | 'notBetween';
  value: [Exclude<VT, undefined | null>, Exclude<VT, undefined | null>];
}

interface RuleJSONSimple<T, K extends StringKey<T>, VT> {
  field: K;
  operator: 'contains' | 'notContains';
  value: Exclude<VT, undefined | null>;
}

interface RuleExists<T, K extends StringKey<T>> {
  field: K;
  operator: 'exists' | 'notExists';
  where?: RuleGroup<RelationTarget<T[K]>>;
}

type RuleValue<T, K extends StringKey<T>, VT> = [VT] extends [RuleValueDefault] ? T[K] : VT;

type TypedRule<T, K extends StringKey<T>, VT> =
  | RuleOperatorNullable<T, K>
  | RuleEqualNullable<T, K, VT>
  | RuleStringNonNullable<T, K, VT>
  | RuleNumberNonNullable<T, K, VT>
  | RuleIn<T, K, VT>
  | RuleBetween<T, K, VT>
  | RuleJSONSimple<T, K, VT>
  | RuleExists<T, K>;

interface GenericRuleExists<T, K extends StringKey<T>> {
  field: K;
  operator: 'exists' | 'notExists';
  where?: never;
}

type GenericRuleValue<T, VT> = object extends T ? VT : never;

type GenericRule<T, K extends StringKey<T>, VT> =
  | RuleOperatorNullable<T, K>
  | RuleEqualNullable<T, K, GenericRuleValue<T, RuleValue<T, K, VT>>>
  | RuleStringNonNullable<T, K, GenericRuleValue<T, RuleValue<T, K, VT>>>
  | RuleNumberNonNullable<T, K, GenericRuleValue<T, RuleValue<T, K, VT>>>
  | RuleIn<T, K, GenericRuleValue<T, RuleValue<T, K, VT>>>
  | RuleBetween<T, K, GenericRuleValue<T, RuleValue<T, K, VT>>>
  | RuleJSONSimple<T, K, GenericRuleValue<T, RuleValue<T, K, VT>>>
  | GenericRuleExists<T, K>;

type DistributedRule<T, K extends StringKey<T>, VT> = {
  [Field in K]: TypedRule<T, Field, RuleValue<T, Field, VT>>;
}[K];

/**
 * 查询规则
 */
export type Rule<T = EntityData, K extends StringKey<T> = StringKey<T>, VT = RuleValueDefault> =
  DistributedRule<T, K, VT> | GenericRule<T, K, VT> | DynamicRuleForKey<K>;

/**
 * 查询规则组（基础）
 * 用于生成的类型文件，可以组合出更多复杂的类型
 */
export interface RuleGroupBase<T, K, RT> {
  combinator: 'and' | 'or';
  rules: Array<RuleGroupBase<T, K, RT> | RT>;
}

/**
 * 查询规则组（自动计算类型）
 */
export type RuleGroup<T = EntityData, K extends StringKey<T> = StringKey<T>, RT = Rule<T, K>> = RuleGroupBase<T, K, RT>;

/**
 * 所有操作符
 */
export type OperatorName =
  | '=' // eq
  | '!=' // neq
  | '<' // lt
  | '>' // gt
  | '<=' // lte
  | '>=' // gte
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'notStartsWith'
  | 'endsWith'
  | 'notEndsWith'
  | 'null'
  | 'notNull'
  | 'in'
  | 'notIn'
  | 'between'
  | 'notBetween'
  | 'exists'
  | 'notExists'
  | (string & Record<never, never>);

/**
 * 查询上下文
 */
export type IQueryContext = RxDBContext;

/**
 * 操作上下文
 */
export interface IMutationContext extends RxDBContext {
  /**
   * 是否返回数据
   */
  returning?: false;

  /**
   * 自定义更新时间
   */
  updatedAt?: Date;

  createdAt?: Date;
}

// ----------------------------------------------------------------------------[ 数据类型 ]

/**
 * UUID
 */
export type UUIDRules<T, K extends StringKey<T> = StringKey<T>, VT = T[K]> =
  RuleOperatorNullable<T, K> | RuleEqualNullable<T, K, VT> | RuleIn<T, K, VT>;

/**
 * 字符串
 */
export type StringRules<T, K extends StringKey<T> = StringKey<T>, VT = T[K]> =
  | RuleOperatorNullable<T, K>
  | RuleEqualNullable<T, K, VT>
  | RuleStringNonNullable<T, K, VT>
  | RuleIn<T, K, VT>
  | RuleBetween<T, K, VT>;

/**
 * 数字
 */
export type NumberRules<T, K extends StringKey<T> = StringKey<T>, VT = T[K]> =
  | RuleOperatorNullable<T, K>
  | RuleEqualNullable<T, K, VT>
  | RuleNumberNonNullable<T, K, VT>
  | RuleIn<T, K, VT>
  | RuleBetween<T, K, VT>;

/**
 * 整数
 */
export type IntegerRules<T, K extends StringKey<T> = StringKey<T>, VT = T[K]> =
  | RuleOperatorNullable<T, K>
  | RuleEqualNullable<T, K, VT>
  | RuleNumberNonNullable<T, K, VT>
  | RuleIn<T, K, VT>
  | RuleBetween<T, K, VT>;

/**
 * bigint
 */
export type BigIntRules<T, K extends StringKey<T> = StringKey<T>, VT = T[K]> =
  | RuleOperatorNullable<T, K>
  | RuleEqualNullable<T, K, VT>
  | RuleNumberNonNullable<T, K, VT>
  | RuleIn<T, K, VT>
  | RuleBetween<T, K, VT>;

/**
 * binary
 */
export type BinaryRules<T, K extends StringKey<T> = StringKey<T>, VT = T[K]> =
  RuleOperatorNullable<T, K> | RuleEqualNullable<T, K, VT> | RuleIn<T, K, VT>;

/**
 * 布尔
 */
export type BooleanRules<T, K extends StringKey<T> = StringKey<T>, VT = T[K]> =
  RuleOperatorNullable<T, K> | RuleEqualNullable<T, K, VT>;

/**
 * 日期
 */
export type DateRules<T, K extends StringKey<T> = StringKey<T>, VT = T[K]> =
  | RuleOperatorNullable<T, K>
  | RuleEqualNullable<T, K, VT>
  | RuleNumberNonNullable<T, K, VT>
  | RuleIn<T, K, VT>
  | RuleBetween<T, K, VT>;

/**
 * 字符串数组
 */
export type StringArrayRules<T, K extends StringKey<T> = StringKey<T>, VT = T[K]> = RuleIn<T, K, VT>;

/**
 * 数字数组
 */
export type NumberArrayRules<T, K extends StringKey<T> = StringKey<T>, VT = T[K]> = RuleIn<T, K, VT>;

/**
 * 枚举
 * 枚举类型查询规则
 * 支持：等于、不等于、为空、不为空、in、notIn
 */
export type EnumRules<T, K extends StringKey<T> = StringKey<T>, VT = T[K]> =
  RuleOperatorNullable<T, K> | RuleEqualNullable<T, K, VT> | RuleIn<T, K, VT>;

/**
 * 键值对
 */
export type KeyValueRules<T, K extends StringKey<T> = StringKey<T>, VT = T[K]> = RuleJSONSimple<T, K, VT>;
