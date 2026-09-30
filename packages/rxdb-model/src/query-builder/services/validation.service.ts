/**
 * @fileoverview 校验服务
 * 提供规则值的即时校验功能
 */

import type { OperatorName } from '@aiao/rxdb';
import type { FieldMetadata, QueryBuilderRule, QueryBuilderRuleGroup, UIRule } from '../models/query-builder-state.js';
import type {
  ValidationContext,
  ValidationError,
  ValidationResult,
  ValidationRule
} from '../models/validation.interface.js';
import { BUILTIN_VALIDATION_RULES } from '../models/validation.interface.js';
import { OperatorRegistry, getDefaultOperatorRegistry } from './operator-registry.service.js';

/**
 * 单条校验规则输入（兼容 QueryBuilderRule 与 UIRule）
 */
type ValidationRuleInput = QueryBuilderRule<Record<string, unknown>> | UIRule;

/**
 * 校验规则组输入（宽松递归结构）
 */
export type ValidationGroupInput = {
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
  rules: Array<ValidationRuleInput | ValidationGroupInput>;
};

type RuleWithWhere = ValidationRuleInput & {
  where?: ValidationGroupInput | null;
};

function hasWhereSubquery(rule: ValidationRuleInput): rule is RuleWithWhere {
  return typeof rule === 'object' && rule !== null && 'where' in rule;
}

function isValidationGroup(item: ValidationRuleInput | ValidationGroupInput): item is ValidationGroupInput {
  return 'combinator' in item && 'rules' in item;
}

function isValidationRule(item: ValidationRuleInput | ValidationGroupInput): item is ValidationRuleInput {
  return 'field' in item && 'operator' in item;
}

/**
 * 校验服务选项
 */
export interface ValidationServiceOptions {
  /**
   * 自定义校验规则
   */
  customRules?: ValidationRule[];

  /**
   * 操作符注册表
   */
  operatorRegistry?: OperatorRegistry;

  /**
   * 是否启用内置校验规则
   * @default true
   */
  useBuiltinRules?: boolean;
}

/**
 * 从规则中提取值（处理不同规则类型）。
 *
 * @template T 规则字段值的类型。
 * @param rule 要从中提取值的规则对象。
 * @returns 规则中的值；如果规则不包含 `value` 属性，则返回 `undefined`。
 */
function extractValueFromRule(rule: ValidationRuleInput): unknown {
  // Rule 类型是联合类型，需要检查是否有 value 属性
  if ('value' in rule) {
    return rule.value;
  }
  return undefined;
}

/**
 * 校验服务
 * 负责验证 QueryBuilder 规则和值
 */
export class ValidationService {
  private readonly rules: Map<string, ValidationRule>;
  private readonly operatorRegistry: OperatorRegistry;

  /** @param options - 校验服务配置（自定义规则等） */
  constructor(options: ValidationServiceOptions = {}) {
    this.rules = new Map();
    this.operatorRegistry = options.operatorRegistry ?? getDefaultOperatorRegistry();

    // 合并内置与自定义规则（后者覆盖同名规则）
    const sources: ValidationRule[][] = [];
    if (options.useBuiltinRules !== false) sources.push(BUILTIN_VALIDATION_RULES as ValidationRule[]);
    if (options.customRules) sources.push(options.customRules);
    for (const group of sources) {
      for (const rule of group) this.rules.set(rule.name, rule);
    }
  }

  /**
   * 校验单条规则
   */
  validateRule(rule: ValidationRuleInput, field: FieldMetadata): ValidationResult {
    const errors: ValidationError[] = [];
    const value = extractValueFromRule(rule);

    // 创建校验上下文
    const context: ValidationContext = {
      fieldType: field.type,
      operator: rule.operator as OperatorName,
      value,
      enum: field.enum,
      pattern: field.pattern
    };

    // 1. 检查操作符是否支持该字段
    if (!this.operatorRegistry.isOperatorSupportedForField(rule.operator as OperatorName, field)) {
      errors.push({
        field: rule.field as string,
        rule: 'operatorTypeMatch',
        message: `操作符 "${rule.operator}" 不支持字段 "${field.name}"`
      });
    }

    // 2. 检查值类型
    const valueType = this.operatorRegistry.getValueType(rule.operator as OperatorName);

    // EXISTS/NOT EXISTS 操作符的特殊处理
    if (valueType === 'subquery') {
      // 对于 EXISTS 操作符，value 字段可以是任何值（包括空字符串、undefined 等）
      // 真正需要验证的是可选的 where 字段
      if (hasWhereSubquery(rule) && rule.where !== undefined && rule.where !== null) {
        const where = rule.where;

        // 如果提供了 where，验证其有效性
        if (typeof where === 'object' && 'combinator' in where && 'rules' in where) {
          // 检查 where 子查询是否为空
          if (!where.rules || where.rules.length === 0) {
            errors.push({
              field: rule.field as string,
              rule: 'valueType',
              message: 'EXISTS 子查询条件不能为空'
            });
          } else {
            // 验证 where 子查询内部规则的基本有效性
            const subqueryErrors = this.validateSubqueryRules(where as QueryBuilderRuleGroup<Record<string, unknown>>);
            if (subqueryErrors.length > 0) {
              errors.push(
                ...subqueryErrors.map(err => ({
                  ...err,
                  field: `${rule.field}.${err.field}` // 添加父字段前缀
                }))
              );
            }
          }
        } else {
          // where 格式无效
          errors.push({
            field: rule.field as string,
            rule: 'valueType',
            message: 'EXISTS 子查询格式无效'
          });
        }
      }
      // 如果没有 where 或 where 为 undefined/null，是有效的简单 EXISTS
    } else {
      // 非子查询类型，正常验证 value
      const valueError = this.validateValueType(value, valueType, rule.field as string, field.displayName);
      if (valueError) {
        errors.push(valueError);
      }
    }

    // 3. 运行类型相关的内置校验规则
    for (const validationRule of this.rules.values()) {
      // 检查规则是否适用于当前字段类型
      if (validationRule.appliesTo && !validationRule.appliesTo.includes(field.type)) {
        continue;
      }

      const isValid = validationRule.validate(context);
      if (!isValid) {
        errors.push({
          field: rule.field as string,
          rule: validationRule.name,
          message: validationRule.message
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 校验整个规则组
   */
  validateGroup(group: ValidationGroupInput, fields: Map<string, FieldMetadata>): ValidationResult {
    const errors: ValidationError[] = [];

    for (const item of group.rules) {
      if (isValidationGroup(item)) {
        const result = this.validateGroup(item, fields);
        if (!result.valid && result.errors) {
          errors.push(...result.errors);
        }
      } else if (isValidationRule(item)) {
        const field = fields.get(item.field as string);
        if (!field) {
          errors.push({
            field: item.field as string,
            rule: 'fieldExists',
            message: `字段 "${item.field}" 不存在`
          });
          continue;
        }

        const result = this.validateRule(item, field);
        if (!result.valid && result.errors) {
          errors.push(...result.errors);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 注册自定义校验规则
   */
  registerRule(rule: ValidationRule): void {
    this.rules.set(rule.name, rule);
  }

  /**
   * 移除校验规则
   */
  unregisterRule(name: string): boolean {
    return this.rules.delete(name);
  }

  /**
   * 获取所有校验规则
   */
  getRules(): ValidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 校验值类型
   */
  private validateValueType(
    value: unknown,
    valueType: 'single' | 'array' | 'range' | 'none' | 'subquery' | undefined,
    fieldName: string,
    displayName?: string
  ): ValidationError | null {
    if (valueType === 'none') {
      // 不需要值（null/notNull）
      return null;
    }

    // 注意：subquery 类型的验证在 validateRule 中处理，不应该调用此方法
    if (valueType === 'subquery') {
      return null;
    }

    if (valueType === 'array') {
      // 需要数组
      if (!Array.isArray(value) || value.length === 0) {
        return {
          field: fieldName,
          rule: 'valueType',
          message: `${displayName || fieldName}需要提供一个或多个值`
        };
      }
      return null;
    }

    if (valueType === 'range') {
      // 需要两个值（between）
      if (!Array.isArray(value) || value.length !== 2) {
        return {
          field: fieldName,
          rule: 'valueType',
          message: `${displayName || fieldName}需要提供两个值（范围）`
        };
      }
      return null;
    }

    // single 或 undefined（默认单值）
    if (value === undefined || value === null || value === '') {
      return {
        field: fieldName,
        rule: 'valueType',
        message: `${displayName || fieldName}需要提供一个值`
      };
    }

    return null;
  }

  /**
   * 验证子查询规则的基本有效性（不依赖字段元数据）
   *
   * @description
   * 子查询可能引用关系实体的字段，我们无法获取其 FieldMetadata。
   * 因此只验证规则的基本结构和值类型，不验证字段是否存在或操作符是否匹配。
   */
  private validateSubqueryRules(group: ValidationGroupInput): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const item of group.rules) {
      if (isValidationGroup(item)) {
        // 递归验证嵌套组
        const nestedErrors = this.validateSubqueryRules(item);
        errors.push(...nestedErrors);
      } else if (isValidationRule(item)) {
        const value = extractValueFromRule(item);
        const valueType = this.operatorRegistry.getValueType(item.operator as OperatorName);

        // 只验证值类型，不验证字段存在性和操作符匹配
        const valueError = this.validateValueType(value, valueType, item.field as string);
        if (valueError) {
          errors.push(valueError);
        }

        // 如果是嵌套的 EXISTS，递归验证其 where
        if (valueType === 'subquery') {
          const ruleWithWhere = item as RuleWithWhere;
          if ('where' in ruleWithWhere && ruleWithWhere.where) {
            const where = ruleWithWhere.where;
            if (typeof where === 'object' && 'combinator' in where && 'rules' in where) {
              if (!where.rules || where.rules.length === 0) {
                errors.push({
                  field: item.field as string,
                  rule: 'valueType',
                  message: 'EXISTS 子查询条件不能为空'
                });
              } else {
                const subErrors = this.validateSubqueryRules(where);
                errors.push(...subErrors);
              }
            } else {
              errors.push({
                field: item.field as string,
                rule: 'valueType',
                message: 'EXISTS 子查询格式无效'
              });
            }
          }
        }
      }
    }

    return errors;
  }
}

/**
 * 创建 ValidationService 实例的工厂函数
 *
 * @param options - 校验服务选项
 * @returns 新的 ValidationService 实例
 */
export function createValidationService(options?: ValidationServiceOptions): ValidationService {
  return new ValidationService(options);
}
