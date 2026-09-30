/**
 * Entity Form 类型定义
 * @module entity-form/interfaces
 */
import type { FieldFormat, FieldOptions } from '@aiao/rxdb';
import type { EntityFieldType, KeyValueSchemaEntry } from '../entity-field.utils.js';

/**
 * 表单模式
 */
export type FormMode = 'view' | 'edit' | 'create';

/**
 * 表单字段配置
 */
export interface FormFieldConfig {
  /** 字段名 */
  field: string;
  /** 显示名称 */
  displayName: string;
  /** 字段类型 */
  type: EntityFieldType;
  /** 是否只读 */
  readonly?: boolean;
  /** 是否可为空 */
  nullable?: boolean;
  /** 是否必填 */
  required?: boolean;
  /** 是否唯一 */
  unique?: boolean;
  /** 枚举类型的可选值 */
  enumValues?: readonly string[];
  /** 键值类型字段的 Schema */
  keyValueSchema?: Record<string, KeyValueSchemaEntry>;
  /** 关系字段关联的实体名 */
  relatedEntityName?: string;
  /** 关系字段关联实体的命名空间 */
  relatedNamespace?: string;
  /** 字段语义标注（只影响展示与控件选择，不改变运行时值类型） */
  format?: FieldFormat;
  /** 枚举/多选值的展示元数据（label / color / disabled） */
  options?: FieldOptions;
  /** 是否为加密列 */
  encrypted?: boolean;
  /** 是否隐藏 */
  hidden?: boolean;
  /** 排序权重 */
  order?: number;
  /** 占位提示 */
  placeholder?: string;
  /** 帮助文本 */
  helpText?: string;
  /** 占据的栅格列数（1 或 2） */
  span?: 1 | 2;
}

/**
 * 表单字段值变更事件
 */
export interface FormFieldChangeEvent {
  /** 字段名 */
  field: string;
  /** 字段类型 */
  type: EntityFieldType;
  /** 变更后的值 */
  value: unknown;
  /** 变更前的值 */
  previousValue: unknown;
}

/**
 * 表单数据（字段名到字段值的映射）
 */
export interface EntityFormData {
  /** 字段值（字段名 → 值） */
  [field: string]: unknown;
}

/**
 * 表单校验结果
 */
export interface FormValidationResult {
  /** 是否通过校验 */
  valid: boolean;
  /** 错误列表 */
  errors: FormFieldValidationError[];
}

/**
 * 表单字段校验错误
 */
export interface FormFieldValidationError {
  /** 出错字段名 */
  field: string;
  /** 错误提示信息 */
  message: string;
}

/**
 * 关联实体数据提供者
 * @remarks 根据实体名（与可选命名空间）返回可选的关联实体列表
 */
export interface RelatedEntityProvider {
  /** 按实体名（与可选命名空间）取得可关联实体条目 */
  (entityName: string, namespace?: string): RelatedEntityItem[];
}

/**
 * 关联实体条目
 */
export interface RelatedEntityItem {
  /** 实体 ID */
  id: string;
  /** 显示名称 */
  displayName: string;
}
