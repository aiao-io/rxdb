/**
 * @fileoverview 操作符注册表服务
 * 管理操作符的注册、查询和类型过滤
 */

import type { OperatorName } from '@aiao/rxdb';
import { DEFAULT_OPERATORS, type OperatorDefinition } from '../models/operator.interface.js';
import type { FieldMetadata, PropertyType } from '../models/query-builder-state.js';

/**
 * 操作符注册表选项
 */
export interface OperatorRegistryOptions {
  /**
   * 初始操作符集合
   * @default DEFAULT_OPERATORS
   */
  operators?: OperatorDefinition[];

  /**
   * 是否使用默认操作符作为基础
   * @default true
   */
  useDefaultOperators?: boolean;
}

/**
 * 操作符注册表服务
 * 管理可用操作符及其元数据
 */
export class OperatorRegistry {
  private readonly operators: Map<OperatorName, OperatorDefinition>;

  /**
   * 获取操作符数量
   */
  get size(): number {
    return this.operators.size;
  }

  /** @param options - 初始注册的操作符集合 */
  constructor(options: OperatorRegistryOptions = {}) {
    this.operators = new Map();

    // 初始化默认操作符
    if (options.useDefaultOperators !== false) {
      for (const op of DEFAULT_OPERATORS) {
        this.operators.set(op.key, op);
      }
    }

    // 添加自定义操作符
    if (options.operators) {
      for (const op of options.operators) {
        this.operators.set(op.key, op);
      }
    }
  }

  /**
   * 注册新操作符
   *
   * @param operator - 操作符定义
   *
   * @example
   * ```typescript
   * registry.register({
   *   key: 'contains',
   *   label: '包含',
   *   applicableTypes: ['string'],
   *   valueType: 'single'
   * });
   * ```
   */
  register(operator: OperatorDefinition): void {
    this.operators.set(operator.key, operator);
  }

  /**
   * 批量注册操作符
   *
   * @param operators - 操作符定义数组
   */
  registerMany(operators: OperatorDefinition[]): void {
    for (const op of operators) {
      this.register(op);
    }
  }

  /**
   * 移除操作符
   *
   * @param key - 操作符键值
   * @returns 是否成功移除
   */
  unregister(key: OperatorName): boolean {
    return this.operators.delete(key);
  }

  /**
   * 获取操作符定义
   *
   * @param key - 操作符键值
   * @returns 操作符定义或 undefined
   */
  get(key: OperatorName): OperatorDefinition | undefined {
    return this.operators.get(key);
  }

  /**
   * 获取所有操作符
   *
   * @returns 所有操作符定义数组
   */
  getAll(): OperatorDefinition[] {
    return Array.from(this.operators.values());
  }

  /**
   * 根据字段类型获取适用的操作符
   *
   * @param fieldType - 字段类型
   * @returns 适用的操作符数组
   *
   * @example
   * ```typescript
   * const stringOperators = registry.getForType('string');
   * // [{ key: '=', ... }, { key: 'contains', ... }, ...]
   * ```
   */
  getForType(fieldType: PropertyType): OperatorDefinition[] {
    return Array.from(this.operators.values()).filter(op => op.applicableTypes.includes(fieldType));
  }

  /**
   * 根据字段元数据获取适用的操作符
   *
   * @param field - 字段元数据
   * @returns 适用的操作符数组
   */
  getForField(field: FieldMetadata): OperatorDefinition[] {
    const operators = this.getForType(field.type);

    // 如果字段可空，添加 null/notNull 操作符
    if (field.nullable) {
      const hasNull = operators.some(op => op.key === 'null');
      const hasNotNull = operators.some(op => op.key === 'notNull');

      const nullOp = this.operators.get('null');
      const notNullOp = this.operators.get('notNull');

      const result = [...operators];
      if (!hasNull && nullOp) {
        result.push(nullOp);
      }
      if (!hasNotNull && notNullOp) {
        result.push(notNullOp);
      }

      return result;
    }

    return operators;
  }

  /**
   * 检查操作符是否支持指定类型
   *
   * @param operatorKey - 操作符键值
   * @param fieldType - 字段类型
   * @returns 是否支持
   */
  isOperatorSupportedForType(operatorKey: OperatorName, fieldType: PropertyType): boolean {
    const operator = this.operators.get(operatorKey);
    return operator ? operator.applicableTypes.includes(fieldType) : false;
  }

  /**
   * 检查操作符是否支持指定字段
   *
   * @param operatorKey - 操作符键值
   * @param field - 字段元数据
   * @returns 是否支持
   */
  isOperatorSupportedForField(operatorKey: OperatorName, field: FieldMetadata): boolean {
    return this.getForField(field).some(op => op.key === operatorKey);
  }

  /**
   * 获取操作符的值类型
   *
   * @param operatorKey - 操作符键值
   * @returns 值类型
   */
  getValueType(operatorKey: OperatorName): OperatorDefinition['valueType'] | undefined {
    const operator = this.operators.get(operatorKey);
    return operator?.valueType;
  }

  /**
   * 清空所有操作符
   */
  clear(): void {
    this.operators.clear();
  }

  /**
   * 重置为默认操作符
   */
  reset(): void {
    this.clear();
    for (const op of DEFAULT_OPERATORS) {
      this.operators.set(op.key, op);
    }
  }
}

/**
 * 创建 OperatorRegistry 实例的工厂函数
 *
 * @param options - 操作符注册表选项
 * @returns 新的 OperatorRegistry 实例
 */
export function createOperatorRegistry(options?: OperatorRegistryOptions): OperatorRegistry {
  return new OperatorRegistry(options);
}

/**
 * 默认操作符注册表单例
 */
let defaultRegistry: OperatorRegistry | null = null;

/**
 * 获取默认操作符注册表
 *
 * @returns 全局共享的默认 OperatorRegistry 实例（懒初始化）
 */
export function getDefaultOperatorRegistry(): OperatorRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new OperatorRegistry();
  }
  return defaultRegistry;
}
