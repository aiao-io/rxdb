import type { ModelI18n } from '../i18n.js';
/**
 * 表单校验工具
 * 基于字段配置校验单个字段值与整份表单数据
 * @module entity-form/form-validation
 */
import {
  parseEntityFieldValueStrict,
  validateEntityFieldValue,
  type FieldValidationError
} from '../entity-value.utils.js';
import { cloneStructured } from '../structural-equal.js';
import type { EntityFormData, FormFieldConfig, FormFieldValidationError, FormValidationResult } from './interfaces.js';

/**
 * 校验单个表单字段值
 * @param field - 表单字段配置
 * @param value - 待校验的字段值
 * @returns 校验错误；校验通过时返回 null
 */
export function validateField(field: FormFieldConfig, value: unknown, i18n?: ModelI18n): FieldValidationError | null {
  return validateEntityFieldValue(field, value, i18n);
}

/**
 * 校验整份表单数据
 * @remarks 只读与隐藏字段不参与校验
 * @param fields - 表单字段配置
 * @param data - 表单数据
 * @returns 校验结果（是否通过及错误列表）
 */
export function validateForm(fields: FormFieldConfig[], data: EntityFormData, i18n?: ModelI18n): FormValidationResult {
  const errors: FormFieldValidationError[] = [];
  for (const field of fields) {
    if (field.readonly || field.hidden) continue;
    const error = validateEntityFieldValue(field, data[field.field], i18n);
    if (error) errors.push({ ...error, reason: { kind: 'validation', value: cloneStructured(data[field.field]) } });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 按当前字段标签和语言重放已显示的校验错误，保留解析失败时的原输入。
 * @param result - 最近一次已显示的校验结果。
 * @param fields - 当前显示字段。
 * @param i18n - 当前组件运行时。
 * @returns 文案已刷新的结果；未知的外部错误保持原文。
 */
export function refreshFormValidationResult(
  result: FormValidationResult,
  fields: FormFieldConfig[],
  i18n?: ModelI18n
): FormValidationResult {
  const errors = result.errors.map(error => {
    const field = fields.find(candidate => candidate.field === error.field);
    if (!field || !error.reason) return error;
    if (error.reason?.kind === 'parse') {
      const parsed = parseEntityFieldValueStrict(field.type, error.reason.value, i18n);
      return parsed.ok ? error : { ...error, message: `${field.displayName} ${parsed.message}` };
    }
    const refreshed = validateEntityFieldValue(field, error.reason.value, i18n);
    return refreshed ? { ...error, message: refreshed.message } : error;
  });
  return { ...result, errors };
}
