import {
  EntityFieldType,
  type EntityFormData,
  formatEntityFieldValue,
  type FormFieldChangeEvent,
  type FormFieldConfig,
  type FormMode,
  type FormValidationResult,
  parseEntityFieldValue,
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
      <fieldset
        class="fieldset"
        [class.md:col-span-2]="field.span === 2 || field.type === 'json' || field.type === 'keyValue'"
      >
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
                  <option [value]="val">{{ val }}</option>
                }
              </select>
            }
            @case ('date') {
              <input
                class="input"
                [value]="formData()[field.field] ? ($any(formData()[field.field]) | date: 'yyyy-MM-ddTHH:mm') : ''"
                (change)="onFieldChange(field, $any($event.target).value)"
                type="datetime-local"
              />
            }
            @case ('number') {
              <input
                class="input"
                [attr.placeholder]="field.placeholder ?? ''"
                [value]="formData()[field.field] ?? ''"
                (change)="onFieldChange(field, $any($event.target).value)"
                step="any"
                type="number"
              />
            }
            @case ('integer') {
              <input
                class="input"
                [attr.placeholder]="field.placeholder ?? ''"
                [value]="formData()[field.field] ?? ''"
                (change)="onFieldChange(field, $any($event.target).value)"
                step="1"
                type="number"
              />
            }
            @case ('stringArray') {
              <input
                class="input"
                [attr.placeholder]="field.placeholder ?? '逗号分隔'"
                [value]="$any(formData()[field.field] ?? []).join(', ')"
                (change)="onFieldChange(field, $any($event.target).value)"
                type="text"
              />
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
              <input
                class="input"
                [attr.placeholder]="field.placeholder ?? ''"
                [value]="formData()[field.field] ?? ''"
                (change)="onFieldChange(field, $any($event.target).value)"
                type="text"
              />
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
        map.set(field.field, item?.displayName ?? formatEntityFieldValue(field.type, value));
      } else {
        map.set(field.field, formatEntityFieldValue(field.type, value));
      }
    }
    return map;
  });

  onFieldChange(field: FormFieldConfig, rawValue: unknown): void {
    const current = this.formData();
    const previousValue = current[field.field];
    let parsed: unknown;
    try {
      parsed = parseEntityFieldValue(field.type, rawValue);
    } catch (error) {
      this.validationErrors.emit({
        valid: false,
        errors: [{ field: field.field, message: error instanceof Error ? error.message : String(error) }]
      });
      return;
    }
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
}
