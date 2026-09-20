/**
 * @fileoverview 元数据驱动表单组件（Angular `EntityFormComponent` 的 React 移植）。
 *
 * 语义与 Angular 侧一致：按字段类型渲染对应输入控件，支持 create / edit / view 三模式；
 * 解析、格式化与校验全部委托 `@aiao/rxdb-model`
 * （`parseEntityFieldValueStrict` / `validateForm` / `formatEntityFieldValue`）。
 * `data` 输入变化时重置本地表单（Angular 侧 `linkedSignal` 同语义）。
 *
 * @module entity-form
 */
import {
  EntityFieldType,
  formatEntityFieldValue,
  parseEntityFieldValueStrict,
  validateForm,
  type EntityFormData,
  type FormFieldChangeEvent,
  type FormFieldConfig,
  type FormMode,
  type FormValidationResult,
  type RelatedEntityItem,
  type RelatedEntityProvider
} from '@aiao/rxdb-model';
import { useMemo, useState, type JSX } from 'react';

/** {@link EntityForm} 的 props。 */
export interface EntityFormProps {
  /** 表单字段配置。 */
  fields: FormFieldConfig[];
  /** 表单数据（字段名 → 值）。 */
  data: EntityFormData;
  /** 表单模式（view / edit / create），缺省 `view`。 */
  mode?: FormMode;
  /** 关联实体候选提供者（关系字段下拉数据源）。 */
  relatedEntityProvider?: RelatedEntityProvider;
  /** 是否渲染保存 / 取消按钮，缺省 `true`。 */
  showActions?: boolean;
  /** 字段值变更。 */
  onFieldChanged?: (event: FormFieldChangeEvent) => void;
  /** 校验通过后的提交。 */
  onFormSubmitted?: (data: EntityFormData) => void;
  /** 取消（本地数据重置为最近一次输入）。 */
  onFormCancelled?: () => void;
  /** 校验失败（解析失败或提交校验失败）。 */
  onValidationErrors?: (result: FormValidationResult) => void;
}

/**
 * 把日期类值格式化为原生日期/时间输入框的回显值（本地时区，等价 Angular DatePipe 默认时区）。
 */
function dateToInputValue(value: unknown, pattern: 'yyyy-MM-dd' | 'HH:mm' | 'yyyy-MM-ddTHH:mm'): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (pattern === 'yyyy-MM-dd') return ymd;
  if (pattern === 'HH:mm') return hm;
  return `${ymd}T${hm}`;
}

/** dateTime format 的显示模式映射到原生输入类型（Angular 侧 `dateInputType`）。 */
function dateInputType(field: FormFieldConfig): 'date' | 'datetime-local' | 'time' {
  const format = field.format;
  if (format?.kind === 'dateTime') {
    if (format.display === 'date') return 'date';
    if (format.display === 'time') return 'time';
  }
  return 'datetime-local';
}

/** dateTime format 的显示模式映射到回显格式（Angular 侧 `datePipeFormat`）。 */
function datePipeFormat(field: FormFieldConfig): 'yyyy-MM-dd' | 'HH:mm' | 'yyyy-MM-ddTHH:mm' {
  const format = field.format;
  if (format?.kind === 'dateTime') {
    if (format.display === 'date') return 'yyyy-MM-dd';
    if (format.display === 'time') return 'HH:mm';
  }
  return 'yyyy-MM-ddTHH:mm';
}

/** 数字类 format 的值域约束（min / max / step）。 */
function numericBounds(field: FormFieldConfig): { min?: number; max?: number; step?: number } {
  const format = field.format;
  if (
    format &&
    (format.kind === 'number' ||
      format.kind === 'currency' ||
      format.kind === 'percentage' ||
      format.kind === 'duration' ||
      format.kind === 'rating')
  ) {
    return {
      ...(format.min === undefined ? {} : { min: format.min }),
      ...(format.max === undefined ? {} : { max: format.max }),
      ...(format.step === undefined ? {} : { step: format.step })
    };
  }
  return {};
}

/** 数字类 format 的单位标注（currency 代码 / 百分号 / 时长单位）。 */
function numericUnitLabel(field: FormFieldConfig): string {
  switch (field.format?.kind) {
    case 'currency':
      return field.format.currency;
    case 'percentage':
      return '%';
    case 'duration':
      return field.format.unit;
    default:
      return '';
  }
}

/** 字符串 format 映射到原生输入类型。 */
function textInputType(field: FormFieldConfig): string {
  switch (field.format?.kind) {
    case 'url':
      return 'url';
    case 'email':
      return 'email';
    case 'phone':
      return 'tel';
    default:
      return 'text';
  }
}

/** 多行文本类 format：渲染 textarea。 */
function isTextareaFormat(field: FormFieldConfig): boolean {
  const kind = field.format?.kind;
  return kind === 'multilineText' || kind === 'richText' || kind === 'code';
}

/** 取色器回显值：非法或空值退回黑色。 */
function colorValue(value: unknown): string {
  return (
    typeof value === 'string' && /^#?[0-9a-fA-F]{6}$/.test(value) ?
      value.startsWith('#') ?
        value
      : `#${value}`
    : '#000000'
  );
}

/** 字节序列回显为 hex 字符串。 */
function binaryToHex(value: unknown): string {
  return value instanceof Uint8Array ? Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('') : '';
}

/**
 * 元数据驱动表单组件：按字段类型渲染对应输入控件，支持 create / edit / view 三模式。
 */
export function EntityForm({
  fields,
  data,
  mode = 'view',
  relatedEntityProvider,
  showActions = true,
  onFieldChanged,
  onFormSubmitted,
  onFormCancelled,
  onValidationErrors
}: EntityFormProps): JSX.Element {
  const [initialData, setInitialData] = useState<EntityFormData>(() => ({ ...data }));
  const [formData, setFormData] = useState<EntityFormData>(() => ({ ...data }));

  // data 输入变化 → 重置本地表单（Angular 侧 linkedSignal 同语义；渲染期调整状态）
  const [prevData, setPrevData] = useState(data);
  if (prevData !== data) {
    setPrevData(data);
    setInitialData({ ...data });
    setFormData({ ...data });
  }

  const editableFields = useMemo(() => fields.filter(field => !field.hidden), [fields]);
  const isReadonly = mode === 'view';

  const relatedItemsMap = useMemo(() => {
    const map = new Map<string, RelatedEntityItem[]>();
    if (!relatedEntityProvider) return map;
    for (const field of editableFields) {
      if (field.relatedEntityName) {
        map.set(field.field, relatedEntityProvider(field.relatedEntityName, field.relatedNamespace));
      }
    }
    return map;
  }, [relatedEntityProvider, editableFields]);

  const displayValueMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const field of editableFields) {
      if (!isReadonly && field.readonly !== true) continue;
      const value = formData[field.field];
      if ((field.type === 'oneToOne' || field.type === 'manyToOne') && field.relatedEntityName) {
        const items = relatedItemsMap.get(field.field) ?? [];
        const item = items.find(i => i.id === value);
        map.set(field.field, item?.displayName ?? formatEntityFieldValue(field.type, value, field.format));
      } else if (field.type === 'enum' && field.options) {
        const label = field.options[String(value)]?.label;
        map.set(field.field, label ?? formatEntityFieldValue(field.type, value, field.format));
      } else if (field.type === 'stringArray' && field.options) {
        const items =
          Array.isArray(value) ? value
          : typeof value === 'string' ? value.split(',')
          : [];
        map.set(field.field, items.map(v => field.options![String(v).trim()]?.label ?? String(v).trim()).join(', '));
      } else {
        map.set(field.field, formatEntityFieldValue(field.type, value, field.format));
      }
    }
    return map;
  }, [editableFields, formData, isReadonly, relatedItemsMap]);

  /** 字段变更：严格解析失败输出 validationErrors 且不更新本地数据（Angular 侧同语义）。 */
  const onFieldChange = (field: FormFieldConfig, rawValue: unknown): void => {
    const previousValue = formData[field.field];
    const result = parseEntityFieldValueStrict(field.type, rawValue);
    if (!result.ok) {
      onValidationErrors?.({
        valid: false,
        errors: [{ field: field.field, message: `${field.displayName} ${result.message}` }]
      });
      return;
    }
    const parsed = result.value;
    setFormData(current => ({ ...current, [field.field]: parsed }));
    onFieldChanged?.({ field: field.field, type: field.type as EntityFieldType, value: parsed, previousValue });
  };

  const onSubmit = (): void => {
    const result = validateForm(fields, formData);
    if (!result.valid) {
      onValidationErrors?.(result);
      return;
    }
    onFormSubmitted?.(formData);
  };

  const onCancel = (): void => {
    setFormData({ ...initialData });
    onFormCancelled?.();
  };

  /** 复选组的当前选中状态（支持数组与逗号字符串两种存储形态）。 */
  const multiSelected = (field: FormFieldConfig, value: string): boolean => {
    const current = formData[field.field];
    if (Array.isArray(current)) return current.includes(value);
    if (typeof current === 'string')
      return current
        .split(',')
        .map(s => s.trim())
        .includes(value);
    return false;
  };

  /** 复选组切换：合并出新数组后走统一解析链路。 */
  const onMultiSelectChange = (field: FormFieldConfig, value: string, checked: boolean): void => {
    const current = formData[field.field];
    const list =
      Array.isArray(current) ? [...(current as string[])]
      : typeof current === 'string' ?
        current
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];
    const next = checked ? [...list, value] : list.filter(v => v !== value);
    onFieldChange(field, next);
  };

  /** 渲染单个字段的编辑控件。 */
  const renderFieldInput = (field: FormFieldConfig): JSX.Element => {
    if (isReadonly || field.readonly === true) {
      return (
        <div className='input input-ghost flex min-h-10 items-center'>{displayValueMap.get(field.field) ?? ''}</div>
      );
    }
    switch (field.type) {
      case 'boolean':
        return (
          <input
            className='toggle'
            checked={!!formData[field.field]}
            onChange={event => onFieldChange(field, event.target.checked)}
            type='checkbox'
          />
        );
      case 'enum':
        return (
          <select
            className='select'
            value={(formData[field.field] as string) ?? ''}
            onChange={event => onFieldChange(field, event.target.value)}
          >
            {field.nullable && <option value=''>(空)</option>}
            {(field.enumValues ?? []).map(value => (
              <option key={value} value={value} disabled={field.options?.[value]?.disabled === true}>
                {field.options?.[value]?.label ?? value}
              </option>
            ))}
          </select>
        );
      case 'date':
        return (
          <input
            className='input'
            type={dateInputType(field)}
            value={formData[field.field] ? dateToInputValue(formData[field.field], datePipeFormat(field)) : ''}
            onChange={event => onFieldChange(field, event.target.value)}
          />
        );
      case 'number':
      case 'integer': {
        const bounds = numericBounds(field);
        return (
          <div className='flex items-center gap-2'>
            <input
              className='input flex-1'
              {...(bounds.max === undefined ? {} : { max: bounds.max })}
              {...(bounds.min === undefined ? {} : { min: bounds.min })}
              placeholder={field.placeholder ?? ''}
              step={bounds.step ?? (field.type === 'integer' ? '1' : 'any')}
              value={(formData[field.field] as string | number) ?? ''}
              onChange={event => onFieldChange(field, event.target.value)}
              type='number'
            />
            {numericUnitLabel(field) && <span className='label w-10 shrink-0'>{numericUnitLabel(field)}</span>}
          </div>
        );
      }
      case 'bigint':
        return (
          <input
            className='input'
            placeholder={field.placeholder ?? ''}
            value={String(formData[field.field] ?? '')}
            onChange={event => onFieldChange(field, event.target.value)}
            inputMode='numeric'
            type='text'
          />
        );
      case 'binary':
        return (
          <textarea
            className='textarea min-h-16 font-mono'
            placeholder={field.placeholder ?? '十六进制字节序列（如 0a0b）'}
            value={binaryToHex(formData[field.field])}
            onChange={event => onFieldChange(field, event.target.value)}
          />
        );
      case 'stringArray':
        if (field.enumValues && field.enumValues.length > 0) {
          return (
            <div className='flex flex-col gap-1'>
              {field.enumValues.map(value => (
                <label className='flex items-center gap-2' key={value}>
                  <input
                    className='checkbox'
                    checked={multiSelected(field, value)}
                    disabled={field.options?.[value]?.disabled === true}
                    onChange={event => onMultiSelectChange(field, value, event.target.checked)}
                    type='checkbox'
                  />
                  {field.options?.[value]?.color && (
                    <span
                      className='inline-block h-2 w-2 rounded-full'
                      style={{ background: field.options[value]!.color }}
                    />
                  )}
                  <span>{field.options?.[value]?.label ?? value}</span>
                </label>
              ))}
            </div>
          );
        }
        return (
          <input
            className='input'
            placeholder={field.placeholder ?? '逗号分隔'}
            value={((formData[field.field] as string[] | undefined) ?? []).join(', ')}
            onChange={event => onFieldChange(field, event.target.value)}
            type='text'
          />
        );
      case 'numberArray':
        return (
          <input
            className='input'
            placeholder={field.placeholder ?? '逗号分隔数字'}
            value={((formData[field.field] as number[] | undefined) ?? []).join(', ')}
            onChange={event => onFieldChange(field, event.target.value)}
            type='text'
          />
        );
      case 'json':
      case 'keyValue': {
        const raw = formData[field.field];
        return (
          <textarea
            className='textarea min-h-24'
            placeholder={field.placeholder ?? 'JSON'}
            value={raw !== null && raw !== undefined ? JSON.stringify(raw) : ''}
            onChange={event => onFieldChange(field, event.target.value)}
          />
        );
      }
      case 'oneToOne':
      case 'manyToOne':
        return (
          <select
            className='select'
            value={(formData[field.field] as string) ?? ''}
            onChange={event => onFieldChange(field, event.target.value)}
          >
            <option value=''>(空)</option>
            {(relatedItemsMap.get(field.field) ?? []).map(item => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </select>
        );
      default:
        if (field.format?.kind === 'color') {
          return (
            <div className='flex items-center gap-2'>
              <input
                className='h-9 w-12 cursor-pointer border-0 bg-transparent'
                value={colorValue(formData[field.field])}
                onChange={event => onFieldChange(field, event.target.value)}
                type='color'
              />
              <input
                className='input flex-1'
                placeholder={field.placeholder ?? '#rrggbb'}
                value={(formData[field.field] as string) ?? ''}
                onChange={event => onFieldChange(field, event.target.value)}
                type='text'
              />
            </div>
          );
        }
        if (isTextareaFormat(field)) {
          return (
            <textarea
              className='textarea min-h-16'
              placeholder={field.placeholder ?? ''}
              value={(formData[field.field] as string) ?? ''}
              onChange={event => onFieldChange(field, event.target.value)}
            />
          );
        }
        return (
          <input
            className='input'
            placeholder={field.placeholder ?? ''}
            type={textInputType(field)}
            value={(formData[field.field] as string | number) ?? ''}
            onChange={event => onFieldChange(field, event.target.value)}
          />
        );
    }
  };

  /** 占据两列栅格的字段：json / keyValue / binary / 多行文本类 format / 显式 span。 */
  const isWideField = (field: FormFieldConfig): boolean =>
    field.span === 2 ||
    field.type === 'json' ||
    field.type === 'keyValue' ||
    field.type === 'binary' ||
    isTextareaFormat(field);

  return (
    <form
      className='grid grid-cols-1 gap-4 md:grid-cols-2'
      onSubmit={event => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {editableFields.map(field => (
        <fieldset
          className={`fieldset${isWideField(field) ? 'md:col-span-2' : ''}`}
          data-field={field.field}
          key={field.field}
        >
          <legend className='fieldset-legend'>{field.displayName}</legend>
          {renderFieldInput(field)}
          {field.helpText && <p className='label'>{field.helpText}</p>}
        </fieldset>
      ))}
      {!isReadonly && showActions && (
        <div className='flex justify-end gap-2 pt-2 md:col-span-2'>
          <button className='btn' onClick={onCancel} type='button'>
            取消
          </button>
          <button className='btn btn-primary' type='submit'>
            保存
          </button>
        </div>
      )}
    </form>
  );
}
