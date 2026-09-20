import type { OperatorName } from '@aiao/rxdb';
import type { PropertyType } from './query-builder-state.js';

/**
 * 操作符定义
 * 包含操作符的元数据和约束
 */
export interface OperatorDefinition {
  /**
   * 操作符键值（使用 RxDB 的 OperatorName）
   */
  key: OperatorName;

  /**
   * 显示标签（支持国际化）
   */
  label: string;

  /**
   * 值类型
   * - single: 单个值 (例如 "=")
   * - array: 值数组 (例如 "in")
   * - range: 范围值 [min, max] (例如 "between")
   * - none: 无需值 (例如 "null")
   * - subquery: 子查询条件 (例如 "exists" - 可选的嵌套规则组)
   */
  valueType: 'single' | 'array' | 'range' | 'none' | 'subquery';

  /**
   * 适用的字段类型
   */
  applicableTypes: PropertyType[];
}

/**
 * 操作符类型（直接复用 RxDB 定义）
 */
export type QueryBuilderOperator = OperatorName;

/**
 * 默认操作符定义列表
 */
export const DEFAULT_OPERATORS: OperatorDefinition[] = [
  // 相等操作符
  {
    key: '=',
    label: '等于',
    valueType: 'single',
    applicableTypes: ['uuid', 'string', 'number', 'boolean', 'date', 'enum']
  },
  {
    key: '!=',
    label: '不等于',
    valueType: 'single',
    applicableTypes: ['uuid', 'string', 'number', 'boolean', 'date', 'enum']
  },

  // 比较操作符
  {
    key: '<',
    label: '小于',
    valueType: 'single',
    applicableTypes: ['number', 'date', 'string']
  },
  {
    key: '>',
    label: '大于',
    valueType: 'single',
    applicableTypes: ['number', 'date', 'string']
  },
  {
    key: '<=',
    label: '小于等于',
    valueType: 'single',
    applicableTypes: ['number', 'date', 'string']
  },
  {
    key: '>=',
    label: '大于等于',
    valueType: 'single',
    applicableTypes: ['number', 'date', 'string']
  },

  // 字符串操作符
  {
    key: 'contains',
    label: '包含',
    valueType: 'single',
    applicableTypes: ['string', 'array']
  },
  {
    key: 'notContains',
    label: '不包含',
    valueType: 'single',
    applicableTypes: ['string', 'array']
  },
  {
    key: 'startsWith',
    label: '开头是',
    valueType: 'single',
    applicableTypes: ['string']
  },
  {
    key: 'notStartsWith',
    label: '开头不是',
    valueType: 'single',
    applicableTypes: ['string']
  },
  {
    key: 'endsWith',
    label: '结尾是',
    valueType: 'single',
    applicableTypes: ['string']
  },
  {
    key: 'notEndsWith',
    label: '结尾不是',
    valueType: 'single',
    applicableTypes: ['string']
  },

  // 空值操作符（仅在 nullable 字段时通过 getForField() 动态添加）
  {
    key: 'null',
    label: '为空',
    valueType: 'none',
    applicableTypes: []
  },
  {
    key: 'notNull',
    label: '不为空',
    valueType: 'none',
    applicableTypes: []
  },

  // 集合操作符
  {
    key: 'in',
    label: '在列表中',
    valueType: 'array',
    applicableTypes: ['string', 'number', 'enum']
  },
  {
    key: 'notIn',
    label: '不在列表中',
    valueType: 'array',
    applicableTypes: ['string', 'number', 'enum']
  },

  // 范围操作符
  {
    key: 'between',
    label: '在范围内',
    valueType: 'range',
    applicableTypes: ['number', 'date']
  },
  {
    key: 'notBetween',
    label: '不在范围内',
    valueType: 'range',
    applicableTypes: ['number', 'date']
  },

  // 关系操作符
  {
    key: 'exists',
    label: '存在',
    valueType: 'subquery',
    applicableTypes: ['relation']
  },
  {
    key: 'notExists',
    label: '不存在',
    valueType: 'subquery',
    applicableTypes: ['relation']
  }
];

/**
 * 根据字段类型获取适用的操作符
 *
 * @param type - 字段类型
 * @param operators - 操作符定义列表（默认使用内置操作符 DEFAULT_OPERATORS）
 * @returns 适用于该字段类型的操作符数组
 */
export function getOperatorsForType(
  type: PropertyType,
  operators: OperatorDefinition[] = DEFAULT_OPERATORS
): OperatorDefinition[] {
  return operators.filter(op => op.applicableTypes.includes(type));
}
