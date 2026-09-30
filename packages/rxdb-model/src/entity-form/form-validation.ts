/**
 * 表单校验工具
 * 基于字段配置校验单个字段值与整份表单数据
 * @module entity-form/form-validation
 */
import { validateEntityFieldValue, type FieldValidationError } from '../entity-value.utils.js';
import type { EntityFormData, FormFieldConfig, FormValidationResult } from './interfaces.js';

/**
 * 校验单个表单字段值
 * @param field - 表单字段配置
 * @param value - 待校验的字段值
 * @returns 校验错误；校验通过时返回 null
 */
export function validateField(field: FormFieldConfig, value: unknown): FieldValidationError | null {
  return validateEntityFieldValue(field, value);
}

/**
 * 校验整份表单数据
 * @remarks 只读与隐藏字段不参与校验
 * @param fields - 表单字段配置
 * @param data - 表单数据
 * @returns 校验结果（是否通过及错误列表）
 */
export function validateForm(fields: FormFieldConfig[], data: EntityFormData): FormValidationResult {
  const errors: FieldValidationError[] = [];
  for (const field of fields) {
    if (field.readonly || field.hidden) continue;
    const error = validateEntityFieldValue(field, data[field.field]);
    if (error) errors.push(error);
  }
  return { valid: errors.length === 0, errors };
}
