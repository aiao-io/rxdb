/**
 * 表单字段构建工具
 * 根据实体元数据与表单模式生成、排序与过滤表单字段
 * @module entity-form/form-fields
 */
import type { EntityMetadata } from '@aiao/rxdb';
import { extractEntityFields, extractSystemFields } from '../entity-field.utils.js';
import type { FormFieldConfig, FormMode } from './interfaces.js';

/**
 * 根据实体元数据和表单模式构建表单字段列表
 * @remarks 创建模式排除计算字段且不含系统字段；编辑模式追加只读的系统字段；查看模式全部字段设为只读
 * @param metadata - 实体元数据
 * @param mode - 表单模式
 * @returns 表单字段配置列表
 */
export function buildFormFields(metadata: EntityMetadata, mode: FormMode): FormFieldConfig[] {
  const entityFields = extractEntityFields(metadata).map(f => f as FormFieldConfig);
  const systemFields = extractSystemFields(metadata).map(f => ({ ...f, readonly: true }) as FormFieldConfig);

  switch (mode) {
    case 'create':
      return entityFields.filter(f => f.type !== 'computed');
    case 'edit':
      return [...entityFields, ...systemFields];
    case 'view':
      return [...entityFields, ...systemFields].map(f => ({ ...f, readonly: true }));
  }
}

/**
 * 按字段的 order 升序排序
 * @remarks 未设置 order 的字段按 0 处理，返回新数组而不修改原数组
 * @param fields - 表单字段配置
 * @returns 排序后的字段列表
 */
export function sortFormFields(fields: FormFieldConfig[]): FormFieldConfig[] {
  return [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * 过滤掉标记为隐藏的字段
 * @param fields - 表单字段配置
 * @returns 可见字段列表
 */
export function filterVisibleFields(fields: FormFieldConfig[]): FormFieldConfig[] {
  return fields.filter(f => !f.hidden);
}
