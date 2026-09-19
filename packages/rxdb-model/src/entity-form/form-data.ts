/**
 * 实体表单数据转换工具
 * 提供实体对象与表单数据之间的转换及默认表单数据创建
 * @module entity-form/form-data
 */
import { parseEntityFieldValue } from '../entity-value.utils.js';
import { structuralEqual } from '../structural-equal.js';
import type { EntityFormData, FormFieldConfig } from './interfaces.js';

/**
 * 将实体对象转换为表单数据
 * @remarks 实体上不存在的字段以 null 填充
 * @param entity - 源实体对象
 * @param fields - 表单字段配置
 * @returns 仅包含字段配置中声明字段的表单数据
 */
export function entityToFormData(entity: Record<string, unknown>, fields: FormFieldConfig[]): EntityFormData {
  const data: EntityFormData = {};
  for (const field of fields) {
    data[field.field] = entity[field.field] ?? null;
  }
  return data;
}

/**
 * 计算表单数据相对原实体对象的变更集
 * @remarks 只读字段跳过；值相同（引用相等或结构化相等）的字段不进入变更集
 * @param original - 原实体对象
 * @param formData - 表单数据
 * @param fields - 表单字段配置
 * @returns 发生变化的字段及其解析后的新值
 */
export function formDataToEntityChanges(
  original: Record<string, unknown>,
  formData: EntityFormData,
  fields: FormFieldConfig[]
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.readonly) continue;
    const parsed = parseEntityFieldValue(field.type, formData[field.field]);
    const orig = original[field.field] ?? null;
    // 快速路径：引用相等或同为原始类型时跳过深比较
    if (parsed === orig) continue;
    if (parsed === null || orig === null || (typeof parsed !== 'object' && typeof orig !== 'object')) {
      changes[field.field] = parsed;
      continue;
    }
    if (!structuralEqual(parsed, orig)) {
      changes[field.field] = parsed;
    }
  }
  return changes;
}

/**
 * 根据字段配置创建默认表单数据
 * @remarks 只读字段不参与；布尔字段默认为 false，字符串 / 数字数组默认为空数组，其余字段默认为 null
 * @param fields - 表单字段配置
 * @returns 默认表单数据
 */
export function createDefaultFormData(fields: FormFieldConfig[]): EntityFormData {
  const data: EntityFormData = {};
  for (const field of fields) {
    if (field.readonly) continue;
    switch (field.type) {
      case 'boolean':
        data[field.field] = false;
        break;
      case 'stringArray':
      case 'numberArray':
        data[field.field] = [];
        break;
      case 'keyValue':
      case 'json':
        data[field.field] = null;
        break;
      default:
        data[field.field] = null;
    }
  }
  return data;
}
