/**
 * 无展示依赖的实体表单状态机。
 *
 * 组件只负责把 DOM / 控件输入交给本类，再根据快照自行渲染。
 * 这里不触碰 document、window 或任何 CSS 框架。
 * @module entity-form/headless
 */
import type { Unsubscribable } from 'rxjs';
import { formatEntityFieldValue, parseEntityFieldValueStrict } from '../entity-value.utils.js';
import { onModelI18nChange } from '../i18n-watch.js';
import type { ModelI18n } from '../i18n.js';
import { cloneStructured, structuralEqual } from '../structural-equal.js';
import { createDefaultFormData, entityToFormData, formDataToEntityChanges } from './form-data.js';
import { validateForm } from './form-validation.js';
import type {
  EntityFormData,
  FormFieldChangeEvent,
  FormFieldConfig,
  FormFieldValidationError,
  FormMode,
  FormValidationResult,
  RelatedEntityProvider
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

/** 单个字段的配置、当前值、错误与展示状态。 */
export interface EntityFormFieldSnapshot {
  readonly config: FormFieldConfig;
  readonly value: unknown;
  readonly error?: FormFieldValidationError;
  readonly readonly: boolean;
  readonly displayValue: string;
}

/**
 * 表单状态变化原因。
 * @remarks `validationErrors` 只描述本次 `setField` 输入的解析失败，与默认表单的 `validationErrors` 输出一致，
 * 不含其他字段的既有错误；全量错误读快照 `errors`，`validate()` 发布的 `validationChanged` 也是全量结果。
 */
export type EntityFormEvent =
  | { readonly type: 'fieldChanged'; readonly event: FormFieldChangeEvent }
  | { readonly type: 'validationErrors'; readonly result: FormValidationResult }
  | { readonly type: 'reset'; readonly data: EntityFormData }
  | { readonly type: 'submitted'; readonly data: EntityFormData }
  | { readonly type: 'cancelled'; readonly data: EntityFormData };

/**
 * 校验完成（包括校验通过）的事件。
 * @remarks 应用语言或目录变化后，已有校验错误会按新语言重建并以本事件发布，数据与输入不变。
 */
export type EntityFormValidationEvent = { readonly type: 'validationChanged'; readonly result: FormValidationResult };

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
  readonly relatedEntityProvider?: RelatedEntityProvider;
}

type Listener = (snapshot: EntityFormSnapshot, event: EntityFormEvent | EntityFormValidationEvent) => void;

const cloneData = (data: EntityFormData): EntityFormData => cloneStructured(data);

/** 解析失败的字段错误：字段显示名 + 解析器给出的原因。 */
const parseFailureError = (field: FormFieldConfig, message: string): FormFieldValidationError => ({
  field: field.field,
  message: `${field.displayName} ${message}`
});

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
  #relatedEntityProvider?: RelatedEntityProvider;
  readonly #listeners = new Set<Listener>();
  #mode: FormMode;
  #data: EntityFormData;
  #initialData: EntityFormData;
  /** 尚未修正的解析失败：字段名 → 原始输入。文案在建快照时按当前语言生成，所以这里存输入而不是文案。 */
  readonly #parseFailures = new Map<string, unknown>();
  readonly #language: Unsubscribable;
  #snapshot: EntityFormSnapshot;
  #disposed = false;

  /** 当前不可变快照；每次读取都会返回新的数据对象。 */
  get snapshot(): EntityFormSnapshot {
    return cloneStructured(this.#snapshot);
  }

  constructor(options: EntityFormControllerOptions) {
    this.#fields = cloneStructured([...options.fields]);
    this.#i18n = options.i18n;
    this.#relatedEntityProvider = options.relatedEntityProvider;
    this.#mode = options.mode ?? 'edit';
    const source =
      options.data ??
      (options.entity ? entityToFormData(options.entity, this.#fields) : createDefaultFormData(this.#fields));
    this.#data = cloneData(source);
    this.#initialData = cloneData(source);
    this.#snapshot = this.#buildSnapshot();
    // 回调只用参数、不捕获 this（见 onModelI18nChange）；没有已显示的错误时无文案可刷新
    this.#language = onModelI18nChange(options.i18n, this, form => {
      if (form.#snapshot.errors.length > 0) form.#publishValidation();
    });
  }

  /** 读取单个字段的渲染状态。 */
  getFieldState(fieldName: string): EntityFormFieldSnapshot | undefined {
    return cloneStructured(this.#snapshot.fieldStates.find(field => field.config.field === fieldName));
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
    if (structuralEqual(this.#initialData, data)) return;
    this.#data = cloneData(data);
    this.#initialData = cloneData(data);
    this.#parseFailures.clear();
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
    const previousTypes = new Map(this.#fields.map(field => [field.field, field.type]));
    this.#fields = cloneStructured([...fields]);
    for (const fieldName of this.#parseFailures.keys()) {
      const kept = this.#fields.some(field => field.field === fieldName && field.type === previousTypes.get(fieldName));
      if (!kept) this.#parseFailures.delete(fieldName);
    }
    this.#snapshot = this.#buildSnapshot();
    this.#emit({ type: 'reset', data: cloneData(this.#data) });
  }

  /** 更新关系候选提供者并刷新只读展示值。 */
  setRelatedEntityProvider(provider: RelatedEntityProvider | undefined): void {
    this.#assertActive();
    if (this.#relatedEntityProvider === provider) return;
    this.#relatedEntityProvider = provider;
    this.#snapshot = this.#buildSnapshot();
    this.#emit({ type: 'reset', data: cloneData(this.#data) });
  }

  /** 切换模式；view 模式会阻止所有字段写入和提交。 */
  setMode(mode: FormMode): void {
    this.#assertActive();
    if (this.#mode === mode) return;
    this.#mode = mode;
    if (mode === 'view') this.#parseFailures.clear();
    this.#snapshot = this.#buildSnapshot();
    this.#emit({ type: 'reset', data: cloneData(this.#data) });
  }

  /**
   * 解析并写入字段。
   * @returns 成功时返回规范化值，失败时保留最近一次合法值；失败的 `result` 与随之发布的 `validationErrors` 一样只含本次输入的解析错误，
   * 全量错误读 `snapshot.errors`。
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
      const result = { valid: false, errors: [parseFailureError(field, parsed.message)] };
      this.#parseFailures.set(field.field, cloneStructured(rawValue));
      this.#snapshot = this.#buildSnapshot();
      this.#emit({ type: 'validationErrors', result });
      return { ok: false, result };
    }
    const previousValue = this.#data[field.field];
    const event: FormFieldChangeEvent = { field: field.field, type: field.type, value: parsed.value, previousValue };
    this.#data = { ...this.#data, [field.field]: cloneStructured(parsed.value) };
    this.#parseFailures.delete(field.field);
    this.#snapshot = this.#buildSnapshot();
    this.#emit({ type: 'fieldChanged', event });
    return { ok: true, event };
  }

  /**
   * 校验当前数据，不产生提交副作用。
   * @remarks 尚未修正的解析错误一并计入：它们只在同字段输入合法值、`discardInput`、取消或宿主重置时清除，
   * 重新校验最近合法值不能证明输入已修正。
   */
  validate(): FormValidationResult {
    this.#assertActive();
    return this.#publishValidation();
  }

  /**
   * 丢弃字段尚未通过解析的输入，保留最近一次合法值。
   * @remarks 控件在解析失败后回显最近合法值时调用（如受控输入绑定 `snapshot.data`）；
   * 保留原始输入的控件不要调用，解析错误会一直阻止提交，直到输入被修正。
   */
  discardInput(fieldName: string): void {
    this.#assertActive();
    if (!this.#parseFailures.delete(fieldName)) return;
    this.#publishValidation();
  }

  /** 校验并返回数据及相对初始实体的变更集；尚未修正的解析错误同样使提交失败。 */
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
    this.#parseFailures.clear();
    this.#snapshot = this.#buildSnapshot();
    const data = cloneData(this.#data);
    this.#emit({ type: 'cancelled', data });
    return data;
  }

  /** 解除订阅并阻止后续动作通知。 */
  dispose(): void {
    this.#disposed = true;
    this.#language.unsubscribe();
    this.#listeners.clear();
  }

  #buildSnapshot(): EntityFormSnapshot {
    const data = cloneData(this.#data);
    const initialData = cloneData(this.#initialData);
    const errors = new Map(
      [...validateForm(this.#fields, this.#data, this.#i18n).errors, ...this.#parseErrors()].map(error => [
        error.field,
        error
      ])
    );
    return {
      mode: this.#mode,
      fields: cloneStructured(this.#fields),
      fieldStates: this.#fields.map(config => ({
        config: cloneStructured(config),
        value: cloneStructured(data[config.field]),
        error: errors.get(config.field),
        readonly: this.#mode === 'view' || config.readonly === true,
        displayValue: this.#displayValue(config, data[config.field])
      })),
      data,
      initialData,
      errors: [...errors.values()],
      valid: errors.size === 0,
      dirty: !equalData(data, initialData),
      readonly: this.#mode === 'view'
    };
  }

  /** 把尚未修正的解析失败按当前语言与字段配置还原成错误。 */
  #parseErrors(): FormFieldValidationError[] {
    const errors: FormFieldValidationError[] = [];
    for (const field of this.#fields) {
      if (!this.#parseFailures.has(field.field)) continue;
      const parsed = parseEntityFieldValueStrict(field.type, this.#parseFailures.get(field.field), this.#i18n);
      if (!parsed.ok) errors.push(parseFailureError(field, parsed.message));
    }
    return errors;
  }

  /** 重算快照（校验文案与关系展示值随之刷新），再发布合并了解析错误的校验结果。 */
  #publishValidation(): FormValidationResult {
    this.#snapshot = this.#buildSnapshot();
    const result = cloneStructured({ valid: this.#snapshot.valid, errors: [...this.#snapshot.errors] });
    this.#emit({ type: 'validationChanged', result });
    return result;
  }

  #displayValue(field: FormFieldConfig, value: unknown): string {
    if ((field.type === 'oneToOne' || field.type === 'manyToOne') && field.relatedEntityName) {
      const item = this.#relatedEntityProvider?.(field.relatedEntityName, field.relatedNamespace).find(
        entry => entry.id === value
      );
      if (item) return item.displayName;
    }
    if (field.type === 'enum' && field.options)
      return field.options[String(value)]?.label ?? formatEntityFieldValue(field.type, value, field.format);
    if (field.type === 'stringArray' && field.options) {
      const items =
        Array.isArray(value) ? value
        : typeof value === 'string' ? value.split(',')
        : [];
      return items.map(item => field.options![String(item).trim()]?.label ?? String(item).trim()).join(', ');
    }
    return formatEntityFieldValue(field.type, value, field.format);
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('EntityFormController has been disposed');
  }

  #emit(event: EntityFormEvent | EntityFormValidationEvent): void {
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
