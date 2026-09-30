import {
  EntityFieldType,
  type EntityFormData,
  formatEntityFieldValue,
  type FormFieldChangeEvent,
  type FormFieldConfig,
  type FormMode,
  type FormValidationResult,
  parseEntityFieldValueStrict,
  type RelatedEntityItem,
  type RelatedEntityProvider,
  validateForm
} from '@aiao/rxdb-model';
import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';

/**
 * 元数据驱动表单组件：按字段类型渲染对应输入控件，支持 create / edit / view 三模式；
 * 解析、格式化与校验全部委托 @aiao/rxdb-model。
 */
@Component({
  selector: 'rxdb-entity-form',
  imports: [DatePipe, JsonPipe],
  template: `<form class="grid grid-cols-1 gap-4 md:grid-cols-2" (submit)="$event.preventDefault(); onSubmit()">
    @for (field of editableFields(); track field.field) {
      <fieldset class="fieldset" [class.md:col-span-2]="isWideField(field)">
        <legend class="fieldset-legend">{{ field.displayName }}</legend>
        @if (isFieldReadonly(field)) {
          <div class="input input-ghost flex min-h-10 items-center">{{ displayValueMap().get(field.field) ?? '' }}</div>
        } @else {
          @switch (field.type) {
            @case ('boolean') {
              <input
                class="toggle"
                [checked]="!!formData()[field.field]"
                (change)="onFieldChange(field, $any($event.target).checked)"
                type="checkbox"
              />
            }
            @case ('enum') {
              <select
                class="select"
                [value]="formData()[field.field] ?? ''"
                (change)="onFieldChange(field, $any($event.target).value)"
              >
                @if (field.nullable) {
                  <option value="">(空)</option>
                }
                @for (val of field.enumValues ?? []; track val) {
                  <option [disabled]="enumOptionDisabled(field, val)" [value]="val">
                    {{ enumOptionLabel(field, val) }}
                  </option>
                }
              </select>
            }
            @case ('date') {
              <input
                class="input"
                [type]="dateInputType(field)"
                [value]="formData()[field.field] ? ($any(formData()[field.field]) | date: datePipeFormat(field)) : ''"
                (change)="onFieldChange(field, $any($event.target).value)"
              />
            }
            @case ('number') {
              <div class="flex items-center gap-2">
                <input
                  class="input flex-1"
                  [attr.max]="numericBounds(field).max"
                  [attr.min]="numericBounds(field).min"
                  [attr.placeholder]="field.placeholder ?? ''"
                  [attr.step]="numericBounds(field).step ?? 'any'"
                  [value]="formData()[field.field] ?? ''"
                  (change)="onFieldChange(field, $any($event.target).value)"
                  type="number"
                />
                @if (numericUnitLabel(field); as unit) {
                  <span class="label w-10 shrink-0">{{ unit }}</span>
                }
              </div>
            }
            @case ('integer') {
              <div class="flex items-center gap-2">
                <input
                  class="input flex-1"
                  [attr.max]="numericBounds(field).max"
                  [attr.min]="numericBounds(field).min"
                  [attr.placeholder]="field.placeholder ?? ''"
                  [attr.step]="numericBounds(field).step ?? '1'"
                  [value]="formData()[field.field] ?? ''"
                  (change)="onFieldChange(field, $any($event.target).value)"
                  type="number"
                />
                @if (numericUnitLabel(field); as unit) {
                  <span class="label w-10 shrink-0">{{ unit }}</span>
                }
              </div>
            }
            @case ('bigint') {
              <input
                class="input"
                [attr.placeholder]="field.placeholder ?? ''"
                [value]="formData()[field.field] ?? ''"
                (change)="onFieldChange(field, $any($event.target).value)"
                inputmode="numeric"
                type="text"
              />
            }
            @case ('binary') {
              <textarea
                class="textarea min-h-16 font-mono"
                [attr.placeholder]="field.placeholder ?? '十六进制字节序列（如 0a0b）'"
                [value]="binaryToHex(formData()[field.field])"
                (change)="onFieldChange(field, $any($event.target).value)"
              ></textarea>
            }
            @case ('stringArray') {
              @if (field.enumValues && field.enumValues.length > 0) {
                <div class="flex flex-col gap-1">
                  @for (val of field.enumValues; track val) {
                    <label class="flex items-center gap-2">
                      <input
                        class="checkbox"
                        [checked]="multiSelected(field, val)"
                        [disabled]="enumOptionDisabled(field, val)"
                        (change)="onMultiSelectChange(field, val, $any($event.target).checked)"
                        type="checkbox"
                      />
                      @if (field.options?.[val]?.color; as color) {
                        <span class="inline-block h-2 w-2 rounded-full" [style.background]="color"></span>
                      }
                      <span>{{ enumOptionLabel(field, val) }}</span>
                    </label>
                  }
                </div>
              } @else {
                <input
                  class="input"
                  [attr.placeholder]="field.placeholder ?? '逗号分隔'"
                  [value]="$any(formData()[field.field] ?? []).join(', ')"
                  (change)="onFieldChange(field, $any($event.target).value)"
                  type="text"
                />
              }
            }
            @case ('numberArray') {
              <input
                class="input"
                [attr.placeholder]="field.placeholder ?? '逗号分隔数字'"
                [value]="$any(formData()[field.field] ?? []).join(', ')"
                (change)="onFieldChange(field, $any($event.target).value)"
                type="text"
              />
            }
            @case ('json') {
              <textarea
                class="textarea min-h-24"
                [attr.placeholder]="field.placeholder ?? 'JSON'"
                [value]="formData()[field.field] !== null ? (formData()[field.field] | json) : ''"
                (change)="onFieldChange(field, $any($event.target).value)"
              ></textarea>
            }
            @case ('keyValue') {
              <textarea
                class="textarea min-h-24"
                [attr.placeholder]="field.placeholder ?? 'JSON'"
                [value]="formData()[field.field] !== null ? (formData()[field.field] | json) : ''"
                (change)="onFieldChange(field, $any($event.target).value)"
              ></textarea>
            }
            @case ('oneToOne') {
              <select
                class="select"
                [value]="formData()[field.field] ?? ''"
                (change)="onFieldChange(field, $any($event.target).value)"
              >
                <option value="">(空)</option>
                @for (item of relatedItemsMap().get(field.field) ?? []; track item.id) {
                  <option [value]="item.id">{{ item.displayName }}</option>
                }
              </select>
            }
            @case ('manyToOne') {
              <select
                class="select"
                [value]="formData()[field.field] ?? ''"
                (change)="onFieldChange(field, $any($event.target).value)"
              >
                <option value="">(空)</option>
                @for (item of relatedItemsMap().get(field.field) ?? []; track item.id) {
                  <option [value]="item.id">{{ item.displayName }}</option>
                }
              </select>
            }
            @default {
              @if (field.format?.kind === 'color') {
                <div class="flex items-center gap-2">
                  <input
                    class="h-9 w-12 cursor-pointer border-0 bg-transparent"
                    [value]="colorValue(field)"
                    (change)="onFieldChange(field, $any($event.target).value)"
                    type="color"
                  />
                  <input
                    class="input flex-1"
                    [attr.placeholder]="field.placeholder ?? '#rrggbb'"
                    [value]="formData()[field.field] ?? ''"
                    (change)="onFieldChange(field, $any($event.target).value)"
                    type="text"
                  />
                </div>
              } @else if (isTextareaFormat(field)) {
                <textarea
                  class="textarea min-h-16"
                  [attr.placeholder]="field.placeholder ?? ''"
                  [value]="formData()[field.field] ?? ''"
                  (change)="onFieldChange(field, $any($event.target).value)"
                ></textarea>
              } @else {
                <input
                  class="input"
                  [attr.placeholder]="field.placeholder ?? ''"
                  [type]="textInputType(field)"
                  [value]="formData()[field.field] ?? ''"
                  (change)="onFieldChange(field, $any($event.target).value)"
                />
              }
            }
          }
        }
        @if (field.helpText) {
          <p class="label">{{ field.helpText }}</p>
        }
      </fieldset>
    }
    @if (!isReadonly() && showActions()) {
      <div class="flex justify-end gap-2 pt-2 md:col-span-2">
        <button class="btn" (click)="onCancel()" type="button">取消</button>
        <button class="btn btn-primary" type="submit">保存</button>
      </div>
    }
  </form>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntityFormComponent {
  readonly fields = input.required<FormFieldConfig[]>();
  readonly data = input.required<EntityFormData>();
  readonly mode = input<FormMode>('view');
  readonly relatedEntityProvider = input<RelatedEntityProvider>();
  readonly showActions = input(true);

  readonly fieldChanged = output<FormFieldChangeEvent>();
  readonly formSubmitted = output<EntityFormData>();
  readonly formCancelled = output<void>();
  readonly validationErrors = output<FormValidationResult>();

  readonly initialData = linkedSignal(() => ({ ...this.data() }));
  readonly formData = linkedSignal(() => ({ ...this.initialData() }));

  readonly editableFields = computed(() => {
    return this.fields().filter(f => !f.hidden);
  });

  readonly isReadonly = computed(() => this.mode() === 'view');

  readonly relatedItemsMap = computed(() => {
    const provider = this.relatedEntityProvider();
    const fields = this.editableFields();
    const map = new Map<string, RelatedEntityItem[]>();
    if (!provider) return map;
    for (const field of fields) {
      if (field.relatedEntityName) {
        map.set(field.field, provider(field.relatedEntityName, field.relatedNamespace));
      }
    }
    return map;
  });

  readonly displayValueMap = computed(() => {
    const data = this.formData();
    const fields = this.editableFields();
    const itemsMap = this.relatedItemsMap();
    const map = new Map<string, string>();
    for (const field of fields) {
      if (!this.isReadonly() && field.readonly !== true) continue;
      const value = data[field.field];
      if ((field.type === 'oneToOne' || field.type === 'manyToOne') && field.relatedEntityName) {
        const items = itemsMap.get(field.field) ?? [];
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
  });

  onFieldChange(field: FormFieldConfig, rawValue: unknown): void {
    const current = this.formData();
    const previousValue = current[field.field];
    const result = parseEntityFieldValueStrict(field.type, rawValue);
    if (!result.ok) {
      this.validationErrors.emit({
        valid: false,
        errors: [{ field: field.field, message: `${field.displayName} ${result.message}` }]
      });
      return;
    }
    const parsed = result.value;
    this.formData.set({ ...current, [field.field]: parsed });
    this.fieldChanged.emit({ field: field.field, type: field.type as EntityFieldType, value: parsed, previousValue });
  }

  onSubmit(): void {
    const currentFields = this.fields();
    const currentData = this.formData();
    const result = validateForm(currentFields, currentData);
    if (!result.valid) {
      this.validationErrors.emit(result);
      return;
    }
    this.formSubmitted.emit(currentData);
  }

  onCancel(): void {
    this.formData.set({ ...this.initialData() });
    this.formCancelled.emit();
  }

  isFieldReadonly(field: FormFieldConfig): boolean {
    return this.isReadonly() || field.readonly === true;
  }

  /** 占据两列栅格的字段：json / keyValue / binary / 多行文本类 format / 显式 span */
  isWideField(field: FormFieldConfig): boolean {
    return (
      field.span === 2 ||
      field.type === 'json' ||
      field.type === 'keyValue' ||
      field.type === 'binary' ||
      this.isTextareaFormat(field)
    );
  }

  /** 多行文本类 format：渲染 textarea */
  isTextareaFormat(field: FormFieldConfig): boolean {
    const kind = field.format?.kind;
    return kind === 'multilineText' || kind === 'richText' || kind === 'code';
  }

  /** dateTime format 的显示模式映射到原生输入类型 */
  dateInputType(field: FormFieldConfig): 'date' | 'datetime-local' | 'time' {
    const format = field.format;
    if (format?.kind === 'dateTime') {
      if (format.display === 'date') return 'date';
      if (format.display === 'time') return 'time';
    }
    return 'datetime-local';
  }

  /** dateTime format 的显示模式映射到 DatePipe 格式 */
  datePipeFormat(field: FormFieldConfig): string {
    const format = field.format;
    if (format?.kind === 'dateTime') {
      if (format.display === 'date') return 'yyyy-MM-dd';
      if (format.display === 'time') return 'HH:mm';
    }
    return 'yyyy-MM-ddTHH:mm';
  }

  /** 数字类 format 的值域约束（min / max / step） */
  numericBounds(field: FormFieldConfig): { min?: number; max?: number; step?: number } {
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

  /** 数字类 format 的单位标注（currency 代码 / 百分号 / 时长单位） */
  numericUnitLabel(field: FormFieldConfig): string {
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

  /** enum / 多选值的展示 label（无 options 时退回原值） */
  enumOptionLabel(field: FormFieldConfig, value: string): string {
    return field.options?.[value]?.label ?? value;
  }

  /** options 中声明 disabled 的值不可选 */
  enumOptionDisabled(field: FormFieldConfig, value: string): boolean {
    return field.options?.[value]?.disabled === true;
  }

  /** 字符串 format 映射到原生输入类型 */
  textInputType(field: FormFieldConfig): string {
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

  /** 取色器回显值：非法或空值退回黑色 */
  colorValue(field: FormFieldConfig): string {
    const value = this.formData()[field.field];
    return (
      typeof value === 'string' && /^#?[0-9a-fA-F]{6}$/.test(value) ?
        value.startsWith('#') ?
          value
        : `#${value}`
      : '#000000'
    );
  }

  /** 字节序列回显为 hex 字符串 */
  binaryToHex(value: unknown): string {
    return value instanceof Uint8Array ? Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('') : '';
  }

  /** 复选组的当前选中状态（支持数组与逗号字符串两种存储形态） */
  multiSelected(field: FormFieldConfig, value: string): boolean {
    const current = this.formData()[field.field];
    if (Array.isArray(current)) return current.includes(value);
    if (typeof current === 'string')
      return current
        .split(',')
        .map(s => s.trim())
        .includes(value);
    return false;
  }

  /** 复选组切换：合并出新数组后走统一解析链路 */
  onMultiSelectChange(field: FormFieldConfig, value: string, checked: boolean): void {
    const current = this.formData()[field.field];
    const list =
      Array.isArray(current) ? [...(current as string[])]
      : typeof current === 'string' ?
        current
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];
    const next = checked ? [...list, value] : list.filter(v => v !== value);
    this.onFieldChange(field, next);
  }
}
