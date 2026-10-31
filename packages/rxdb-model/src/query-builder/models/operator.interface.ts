import type { OperatorName } from '@aiao/rxdb';
import { modelText } from '../../i18n.js';
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

  /** 内置标签目录键；自定义 label 保持优先。 */
  labelKey?: string;

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
    label: modelText('text.4bc69a0562'),
    labelKey: 'text.4bc69a0562',
    valueType: 'single',
    applicableTypes: ['uuid', 'string', 'number', 'boolean', 'date', 'enum']
  },
  {
    key: '!=',
    label: modelText('text.9678e3a7cb'),
    labelKey: 'text.9678e3a7cb',
    valueType: 'single',
    applicableTypes: ['uuid', 'string', 'number', 'boolean', 'date', 'enum']
  },

  // 比较操作符
  {
    key: '<',
    label: modelText('text.a39accd359'),
    labelKey: 'text.a39accd359',
    valueType: 'single',
    applicableTypes: ['number', 'date', 'string']
  },
  {
    key: '>',
    label: modelText('text.b4614ab230'),
    labelKey: 'text.b4614ab230',
    valueType: 'single',
    applicableTypes: ['number', 'date', 'string']
  },
  {
    key: '<=',
    label: modelText('text.035d78382d'),
    labelKey: 'text.035d78382d',
    valueType: 'single',
    applicableTypes: ['number', 'date', 'string']
  },
  {
    key: '>=',
    label: modelText('text.e1feef07d1'),
    labelKey: 'text.e1feef07d1',
    valueType: 'single',
    applicableTypes: ['number', 'date', 'string']
  },

  // 字符串操作符
  {
    key: 'contains',
    label: modelText('text.107319b8b3'),
    labelKey: 'text.107319b8b3',
    valueType: 'single',
    applicableTypes: ['string', 'array']
  },
  {
    key: 'notContains',
    label: modelText('text.5f60ffcf60'),
    labelKey: 'text.5f60ffcf60',
    valueType: 'single',
    applicableTypes: ['string', 'array']
  },
  {
    key: 'startsWith',
    label: modelText('text.f35b23dcbb'),
    labelKey: 'text.f35b23dcbb',
    valueType: 'single',
    applicableTypes: ['string']
  },
  {
    key: 'notStartsWith',
    label: modelText('text.1a5ca15290'),
    labelKey: 'text.1a5ca15290',
    valueType: 'single',
    applicableTypes: ['string']
  },
  {
    key: 'endsWith',
    label: modelText('text.e3131c7560'),
    labelKey: 'text.e3131c7560',
    valueType: 'single',
    applicableTypes: ['string']
  },
  {
    key: 'notEndsWith',
    label: modelText('text.82e3d0a39b'),
    labelKey: 'text.82e3d0a39b',
    valueType: 'single',
    applicableTypes: ['string']
  },

  // 空值操作符（仅在 nullable 字段时通过 getForField() 动态添加）
  {
    key: 'null',
    label: modelText('text.6f0db35f5c'),
    labelKey: 'text.6f0db35f5c',
    valueType: 'none',
    applicableTypes: []
  },
  {
    key: 'notNull',
    label: modelText('text.1a160efcb3'),
    labelKey: 'text.1a160efcb3',
    valueType: 'none',
    applicableTypes: []
  },

  // 集合操作符
  {
    key: 'in',
    label: modelText('text.8c4c2b3124'),
    labelKey: 'text.8c4c2b3124',
    valueType: 'array',
    applicableTypes: ['string', 'number', 'enum']
  },
  {
    key: 'notIn',
    label: modelText('text.220fa9b54a'),
    labelKey: 'text.220fa9b54a',
    valueType: 'array',
    applicableTypes: ['string', 'number', 'enum']
  },

  // 范围操作符
  {
    key: 'between',
    label: modelText('text.b696b2e453'),
    labelKey: 'text.b696b2e453',
    valueType: 'range',
    applicableTypes: ['number', 'date']
  },
  {
    key: 'notBetween',
    label: modelText('text.789ca1313e'),
    labelKey: 'text.789ca1313e',
    valueType: 'range',
    applicableTypes: ['number', 'date']
  },

  // 关系操作符
  {
    key: 'exists',
    label: modelText('text.4a558371f9'),
    labelKey: 'text.4a558371f9',
    valueType: 'subquery',
    applicableTypes: ['relation']
  },
  {
    key: 'notExists',
    label: modelText('text.4e51b67dd3'),
    labelKey: 'text.4e51b67dd3',
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
