import type { OperatorName } from '@aiao/rxdb';
import type { PropertyType } from './query-builder-state.js';

/**
 * 验证规则
 */
export interface ValidationRule {
  /**
   * 规则名称
   */
  name: string;

  /**
   * 适用的字段类型（可选，undefined 表示适用于所有类型）
   */
  appliesTo?: PropertyType[];

  /**
   * 错误消息
   */
  message: string;

  /**
   * 验证函数
   * @returns true 表示通过，false 表示失败
   */
  validate: (context: ValidationContext) => boolean;
}

/**
 * 验证上下文
 */
export interface ValidationContext {
  /**
   * 字段类型
   */
  fieldType: PropertyType;

  /**
   * 操作符
   */
  operator: OperatorName;

  /**
   * 当前值
   */
  value: unknown;

  /**
   * 是否必填
   */
  required?: boolean;

  /**
   * 枚举值
   */
  enum?: unknown[];

  /**
   * 正则验证
   */
  pattern?: string;
}

/**
 * 验证错误项
 */
export interface ValidationError {
  /**
   * 字段名
   */
  field: string;

  /**
   * 规则名
   */
  rule: string;

  /**
   * 错误消息
   */
  message: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /**
   * 是否有效
   */
  valid: boolean;

  /**
   * 错误列表
   */
  errors?: ValidationError[];
}

/**
 * 跳过 nil 和数组值的前置检查。
 * 内置验证规则共用：值为 null/undefined 时不验证，数组由 valueType 规则处理。
 *
 * @returns `true` 表示应跳过后续验证（值为 nil 或数组）
 */
function shouldSkipValidation(value: unknown): boolean {
  return value === undefined || value === null || Array.isArray(value);
}

/**
 * 内置验证规则
 */
export const BUILTIN_VALIDATION_RULES: ValidationRule[] = [
  {
    name: 'stringType',
    appliesTo: ['string'],
    message: '值必须是字符串类型',
    validate: context => {
      if (shouldSkipValidation(context.value)) return true;
      return typeof context.value === 'string';
    }
  },
  {
    name: 'numberType',
    appliesTo: ['number'],
    message: '值必须是数字类型',
    validate: context => {
      if (shouldSkipValidation(context.value)) return true;
      return typeof context.value === 'number' && !isNaN(context.value);
    }
  },
  {
    name: 'booleanType',
    appliesTo: ['boolean'],
    message: '值必须是布尔类型',
    validate: context => {
      if (shouldSkipValidation(context.value)) return true;
      return typeof context.value === 'boolean';
    }
  },
  {
    name: 'dateType',
    appliesTo: ['date'],
    message: '值必须是有效日期',
    validate: context => {
      if (shouldSkipValidation(context.value)) return true;
      if (context.value instanceof Date) {
        return !isNaN(context.value.getTime());
      }
      if (typeof context.value === 'string') {
        const date = new Date(context.value);
        return !isNaN(date.getTime());
      }
      return false;
    }
  },
  {
    name: 'enumType',
    appliesTo: ['enum'],
    message: '值必须是枚举中的有效选项',
    validate: context => {
      if (context.value === undefined || context.value === null) return true;
      if (!context.enum || context.enum.length === 0) return true;
      if (Array.isArray(context.value)) {
        return (context.value as unknown[]).every(v => (context.enum as unknown[]).includes(v));
      }
      return context.enum.includes(context.value);
    }
  },
  {
    name: 'patternType',
    appliesTo: ['string'],
    message: '值不符合要求的格式',
    validate: context => {
      if (shouldSkipValidation(context.value)) return true;
      if (!context.pattern || typeof context.value !== 'string') return true;
      try {
        return new RegExp(context.pattern).test(context.value);
      } catch {
        return true;
      }
    }
  }
];
