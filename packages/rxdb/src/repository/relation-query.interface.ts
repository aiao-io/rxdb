import { SetNonNullable } from 'type-fest';

/**
 * 判断相等
 */
interface RuleEqualNullable<K, VT> {
  field: K;
  operator: '=' | '!=';
  value: VT;
}

/**
 * 字符串比较
 */
interface RuleStringNonNullable<K, VT> {
  field: K;
  operator:
    '<' | '>' | '<=' | '>=' | 'contains' | 'notContains' | 'startsWith' | 'notStartsWith' | 'endsWith' | 'notEndsWith';
  value: SetNonNullable<VT>;
}

/**
 * 数值比较
 */
interface RuleNumberNonNullable<K, VT> {
  field: K;
  operator: '<' | '>' | '<=' | '>=';
  value: SetNonNullable<VT>;
}

/**
 * in
 */
interface RuleIn<K, VT> {
  field: K;
  operator: 'in' | 'notIn';
  value: SetNonNullable<VT>[];
}

/**
 * 区间
 */
interface RuleBetween<K, VT> {
  field: K;
  operator: 'between' | 'notBetween';
  value: [SetNonNullable<VT>, SetNonNullable<VT>];
}

/**
 * UUID
 */
export type RelationUUIDRules<K, VT> = RuleEqualNullable<K, VT> | RuleIn<K, VT>;

/**
 * 字符串
 */
export type RelationStringRules<K, VT> =
  RuleEqualNullable<K, VT> | RuleStringNonNullable<K, VT> | RuleIn<K, VT> | RuleBetween<K, VT>;

/**
 * 数字
 */
export type RelationNumberRules<K, VT> =
  RuleEqualNullable<K, VT> | RuleNumberNonNullable<K, VT> | RuleIn<K, VT> | RuleBetween<K, VT>;

/**
 * bigint
 */
export type RelationBigIntRules<K, VT> =
  RuleEqualNullable<K, VT> | RuleNumberNonNullable<K, VT> | RuleIn<K, VT> | RuleBetween<K, VT>;

/**
 * 布尔
 */
export type RelationBooleanRules<K, VT> = RuleEqualNullable<K, VT>;

/**
 * 日期
 */
export type RelationDateRules<K, VT> =
  RuleEqualNullable<K, VT> | RuleNumberNonNullable<K, VT> | RuleIn<K, VT> | RuleBetween<K, VT>;

/**
 * EXISTS / NOT EXISTS（存在 / 不存在）
 * 用于查询关系字段是否存在满足条件的关联实体
 * @example
 * // 查询有子菜单的菜单
 * { field: 'children', operator: 'exists' }
 * // 查询有激活状态子菜单的菜单
 * { field: 'children', operator: 'exists', where: { rules: [{ field: 'active', operator: '=', value: true }] } }
 */
interface RuleExists<K extends string, SubRG> {
  field: K;
  operator: 'exists' | 'notExists';
  where?: SubRG; // 可选的子查询条件
}

/**
 * Relation EXISTS 规则
 * SubRG 类型参数应为关联实体的 RuleGroup 类型
 */
export type RelationExistsRules<K extends string, SubRG> = RuleExists<K, SubRG>;
