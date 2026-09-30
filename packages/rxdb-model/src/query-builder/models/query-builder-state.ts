import { OperatorName, Rule, RuleGroup } from '@aiao/rxdb';

/**
 * UI 规则（宽松类型，用于查询构建器组件内部）
 *
 * @description
 * 由于 Rule<T> 是联合类型，在 UI 组件中难以处理部分更新。
 * 此类型提供宽松的字段类型，方便 UI 组件操作。
 */
export interface UIRule {
  /**
   * 规则唯一标识符
   */
  id: string;

  /**
   * 字段名
   */
  field: string;

  /**
   * 操作符
   */
  operator: string;

  /**
   * 规则值（可选）
   */
  value?: unknown;
  /**
   * EXISTS/NOT EXISTS 操作符的子查询条件
   */
  where?: QueryBuilderRuleGroup<Record<string, unknown>>;
}

/**
 * 查询规则（复用 RxDB Rule 类型 + UI 元数据）
 *
 * @template T - 实体类型
 * @template K - 字段键类型（自动推断）
 *
 * @example
 * ```typescript
 * interface User {
 *   name: string;
 *   age: number;
 *   active: boolean;
 * }
 *
 * const rule: QueryBuilderRule<User> = {
 *   id: 'rule-1',
 *   field: 'name',      // ✅ 类型安全：只能是 'name' | 'age' | 'active'
 *   operator: 'contains',
 *   value: 'John'       // ✅ 类型推断为 string
 * };
 * ```
 */
export type QueryBuilderRule<T = Record<string, unknown>> = UIRule & {
  /**
   * 规则唯一标识符
   * 用于 React key, Angular trackBy, Vue :key
   */
  id: string;

  /**
   * 字段名（类型安全的实体字段键或字符串）
   */
  field: string | (keyof T & string);

  /**
   * 操作符（RxDB OperatorName 或自定义字符串）
   */
  operator: OperatorName | string;
};

/**
 * 规则组（复用 RxDB RuleGroup 类型 + UI 元数据）
 *
 * @template T - 实体类型
 */
export interface QueryBuilderRuleGroup<T = Record<string, unknown>> {
  /**
   * 规则组唯一标识符
   */
  id: string;

  /**
   * 逻辑组合符
   */
  combinator: 'and' | 'or';

  /**
   * 子规则列表（支持嵌套）
   */
  rules: Array<QueryBuilderRule<T> | QueryBuilderRuleGroup<T>>;
}

/**
 * 查询构建器状态（简化版本，只包含必要字段）
 */
export interface QueryBuilderState<T = Record<string, unknown>> {
  /**
   * 根规则组
   */
  rootGroup: QueryBuilderRuleGroup<T>;
}

/**
 * Schema 信息
 */
export interface SchemaInfo {
  /**
   * 实体名称
   */
  entityName: string;

  /**
   * 字段列表
   */
  fields: FieldMetadata[];
}

/**
 * 字段元数据
 */
export interface FieldMetadata {
  /**
   * 字段名称
   */
  name: string;

  /**
   * 显示名称
   */
  displayName: string;

  /**
   * 字段类型
   */
  type: PropertyType;

  /**
   * 字段描述
   */
  description?: string;

  /**
   * 是否必填
   */
  required?: boolean;

  /**
   * 是否可空
   */
  nullable?: boolean;

  /**
   * 枚举值（如果适用）
   */
  enum?: unknown[];

  /**
   * 正则验证（字符串类型）
   */
  pattern?: string;

  /**
   * 是否是关系字段
   */
  isRelation?: boolean;

  /**
   * 关系目标实体名称
   */
  relationTarget?: string;

  /**
   * 关系类型（1:1, 1:m, m:1, m:n）
   */
  relationKind?: '1:1' | '1:m' | 'm:1' | 'm:n';

  /**
   * 关系目标实体的字段列表（用于 EXISTS 子查询）
   */
  relationFields?: FieldMetadata[];

  /**
   * keyValue 子属性字段列表（用于嵌套属性查询）
   */
  keyValueFields?: FieldMetadata[];
}

/**
 * 属性类型
 */
export type PropertyType =
  'uuid' | 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'relation' | 'enum' | 'keyValue';

/**
 * 类型守卫：判断是否为规则组
 *
 * @param item - 待判断的规则或规则组
 * @returns 若为规则组则返回 true，否则返回 false
 */
export function isRuleGroup<T>(item: QueryBuilderRule<T> | QueryBuilderRuleGroup<T>): item is QueryBuilderRuleGroup<T> {
  return 'combinator' in item && 'rules' in item;
}

/**
 * 类型守卫：判断是否为规则
 *
 * @param item - 待判断的规则或规则组
 * @returns 若为规则则返回 true，否则返回 false
 */
export function isRule<T>(item: QueryBuilderRule<T> | QueryBuilderRuleGroup<T>): item is QueryBuilderRule<T> {
  return 'field' in item && 'operator' in item;
}

/**
 * 类型重导出：操作符名及 RxDB 原生规则、规则组类型
 */
export type { OperatorName, Rule, RuleGroup };
