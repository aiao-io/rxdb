/**
 * 无展示依赖的实体表单状态机。
 *
 * 组件只负责把 DOM / 控件输入交给本类，再根据快照自行渲染。
 * 这里不触碰 document、window 或任何 CSS 框架。
 * @module entity-form/headless
 */
import { formatEntityFieldValue, parseEntityFieldValueStrict } from '../entity-value.utils.js';
import type { ModelI18n } from '../i18n.js';
import { structuralEqual } from '../structural-equal.js';
import { createDefaultFormData, entityToFormData, formDataToEntityChanges } from './form-data.js';
import { validateForm } from './form-validation.js';
import type {
  EntityFormData,
  FormFieldChangeEvent,
  FormFieldConfig,
  FormFieldValidationError,
  FormMode,
  FormValidationResult
} from './interfaces.js';

export type { FormFieldConfig } from './interfaces.js';

/** 表单状态快照，消费方可以直接映射到自己的控件。 */
export interface EntityFormSnapshot {
  /** 当前模式。 */
  readonly mode: FormMode;
  /** 完整字段配置。 */
  readonly fields: readonly FormFieldConfig[];
  /** 每个字段当前值、错误、只读状态和默认展示文本。 */
  readonly fieldStates: readonly EntityFormFieldSnapshot[];
  /** 当前表单值。 */
  readonly data: EntityFormData;
  /** 最近一次输入数据，用于取消。 */
  readonly initialData: EntityFormData;
  /** 当前字段错误。 */
  readonly errors: readonly FormFieldValidationError[];
  /** 当前数据是否通过校验。 */
  readonly valid: boolean;
  /** 数据是否相对最近一次输入发生变化。 */
  readonly dirty: boolean;
  /** view 模式或字段只读时为 true。 */
  readonly readonly: boolean;
}

export interface EntityFormFieldSnapshot {
  readonly config: FormFieldConfig;
  readonly value: unknown;
  readonly error?: FormFieldValidationError;
  readonly readonly: boolean;
  readonly displayValue: string;
}

/** 表单状态变化原因。 */
export type EntityFormEvent =
  | { readonly type: 'fieldChanged'; readonly event: FormFieldChangeEvent }
  | { readonly type: 'validationErrors'; readonly result: FormValidationResult }
  | { readonly type: 'reset'; readonly data: EntityFormData }
  | { readonly type: 'submitted'; readonly data: EntityFormData }
  | { readonly type: 'cancelled'; readonly data: EntityFormData };

/** 表单提交结果。 */
export type EntityFormSubmitResult =
  | { readonly valid: true; readonly data: EntityFormData; readonly changes: Record<string, unknown> }
  | { readonly valid: false; readonly result: FormValidationResult };

/** 创建 headless 表单所需的输入。 */
export interface EntityFormControllerOptions {
  readonly fields: readonly FormFieldConfig[];
  readonly data?: EntityFormData;
  readonly entity?: Record<string, unknown>;
  readonly mode?: FormMode;
  readonly i18n?: ModelI18n;
}

type Listener = (snapshot: EntityFormSnapshot, event: EntityFormEvent) => void;

const cloneData = (data: EntityFormData): EntityFormData => ({ ...data });

const equalData = (left: EntityFormData, right: EntityFormData): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(key => structuralEqual(left[key], right[key]));
};

/**
 * 表单的共享状态和动作。
 * @remarks 实例可在任意框架和 Node 环境中使用；调用 `dispose` 后不会再通知消费方。
 */
export class EntityFormController {
  #fields: FormFieldConfig[];
  readonly #i18n?: ModelI18n;
  readonly #listeners = new Set<Listener>();
  #mode: FormMode;
  #data: EntityFormData;
  #initialData: EntityFormData;
  #errors: FormFieldValidationError[] = [];
  #snapshot: EntityFormSnapshot;
  #disposed = false;

  constructor(options: EntityFormControllerOptions) {
    this.#fields = options.fields.map(field => ({ ...field }));
    this.#i18n = options.i18n;
    this.#mode = options.mode ?? 'edit';
    const source =
      options.data ??
      (options.entity ? entityToFormData(options.entity, this.#fields) : createDefaultFormData(this.#fields));
    this.#data = cloneData(source);
    this.#initialData = cloneData(source);
    this.#snapshot = this.#buildSnapshot();
  }

  /** 当前不可变快照；每次读取都会返回新的数据对象。 */
  get snapshot(): EntityFormSnapshot {
    return this.#snapshot;
  }

  #buildSnapshot(): EntityFormSnapshot {
    const data = cloneData(this.#data);
    const initialData = cloneData(this.#initialData);
    const errors = new Map(this.#errors.map(error => [error.field, error]));
    return {
      mode: this.#mode,
      fields: this.#fields,
      fieldStates: this.#fields.map(config => ({
        config,
        value: data[config.field],
        error: errors.get(config.field),
        readonly: this.#mode === 'view' || config.readonly === true,
        displayValue: formatEntityFieldValue(config.type, data[config.field], config.format)
      })),
      data,
      initialData,
      errors: [...this.#errors],
      valid: this.#errors.length === 0,
      dirty: !equalData(data, initialData),
      readonly: this.#mode === 'view'
    };
  }

  /** 读取单个字段的渲染状态。 */
  getFieldState(fieldName: string): EntityFormFieldSnapshot | undefined {
    return this.#snapshot.fieldStates.find(field => field.config.field === fieldName);
  }

  /** 订阅状态和动作事件，返回可安全重复调用的清理函数。 */
  subscribe(listener: Listener): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** 替换宿主数据，并清除旧的输入与错误。 */
  setData(data: EntityFormData): void {
    this.#assertActive();
    this.#data = cloneData(data);
    this.#initialData = cloneData(data);
    this.#errors = [];
    this.#snapshot = this.#buildSnapshot();
    this.#emit({ type: 'reset', data: cloneData(data) });
  }

  /** 将实体转换为表单数据后替换宿主数据。 */
  setEntity(entity: Record<string, unknown>): void {
    this.setData(entityToFormData(entity, this.#fields));
  }

  /** 更新字段元数据并清理无法映射到新字段的错误。 */
  setFields(fields: readonly FormFieldConfig[]): void {
    this.#assertActive();
    if (structuralEqual(this.#fields, fields)) return;
    this.#fields = fields.map(field => ({ ...field }));
    this.#errors = [];
    this.#snapshot = this.#buildSnapshot();
    this.#emit({ type: 'reset', data: cloneData(this.#data) });
  }

  /** 切换模式；view 模式会阻止所有字段写入和提交。 */
  setMode(mode: FormMode): void {
    this.#assertActive();
    this.#mode = mode;
    if (mode === 'view') this.#errors = [];
    this.#snapshot = this.#buildSnapshot();
    this.#emit({ type: 'reset', data: cloneData(this.#data) });
  }

  /**
   * 解析并写入字段。
   * @returns 成功时返回规范化值，失败时保留最近一次合法值。
   */
  setField(
    fieldName: string,
    rawValue: unknown
  ):
    | { readonly ok: true; readonly event: FormFieldChangeEvent }
    | { readonly ok: false; readonly result: FormValidationResult } {
    this.#assertActive();
    const field = this.#fields.find(item => item.field === fieldName);
    if (!field) throw new Error(`Unknown form field: ${fieldName}`);
    if (this.#mode === 'view' || field.readonly)
      return {
        ok: true,
        event: {
          field: field.field,
          type: field.type,
          value: this.#data[field.field],
          previousValue: this.#data[field.field]
        }
      };
    const parsed = parseEntityFieldValueStrict(field.type, rawValue, this.#i18n);
    if (!parsed.ok) {
      const result = {
        valid: false,
        errors: [{ field: field.field, message: `${field.displayName} ${parsed.message}` }]
      };
      this.#errors = result.errors;
      this.#snapshot = this.#buildSnapshot();
      this.#emit({ type: 'validationErrors', result });
      return { ok: false, result };
    }
    const previousValue = this.#data[field.field];
    const event: FormFieldChangeEvent = { field: field.field, type: field.type, value: parsed.value, previousValue };
    this.#data = { ...this.#data, [field.field]: parsed.value };
    this.#errors = this.#errors.filter(error => error.field !== field.field);
    this.#snapshot = this.#buildSnapshot();
    this.#emit({ type: 'fieldChanged', event });
    return { ok: true, event };
  }

  /** 只校验当前数据，不产生提交副作用。 */
  validate(): FormValidationResult {
    this.#assertActive();
    const result = validateForm(this.#fields, this.#data, this.#i18n);
    this.#errors = [...result.errors];
    this.#snapshot = this.#buildSnapshot();
    if (!result.valid) this.#emit({ type: 'validationErrors', result });
    return result;
  }

  /** 校验并返回数据及相对初始实体的变更集。 */
  submit(): EntityFormSubmitResult {
    this.#assertActive();
    if (this.#mode === 'view') {
      const result: FormValidationResult = { valid: false, errors: [] };
      return { valid: false, result };
    }
    const result = this.validate();
    if (!result.valid) return { valid: false, result };
    const data = cloneData(this.#data);
    const changes = formDataToEntityChanges(this.#initialData, data, this.#fields);
    this.#emit({ type: 'submitted', data });
    return { valid: true, data, changes };
  }

  /** 恢复到最近一次 setData / setEntity 的输入并发出取消事件。 */
  cancel(): EntityFormData {
    this.#assertActive();
    this.#data = cloneData(this.#initialData);
    this.#errors = [];
    this.#snapshot = this.#buildSnapshot();
    const data = cloneData(this.#data);
    this.#emit({ type: 'cancelled', data });
    return data;
  }

  /** 解除订阅并阻止后续动作通知。 */
  dispose(): void {
    this.#disposed = true;
    this.#listeners.clear();
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('EntityFormController has been disposed');
  }

  #emit(event: EntityFormEvent): void {
    if (this.#disposed) return;
    const snapshot = this.snapshot;
    for (const listener of this.#listeners) listener(snapshot, event);
  }
}

/** 创建表单状态机的工厂入口。 */
export function createEntityFormController(options: EntityFormControllerOptions): EntityFormController {
  return new EntityFormController(options);
}

/** 与其他框架绑定对齐的工厂别名。 */
export const createEntityFormHeadless = createEntityFormController;
