import type { EntityFormFieldSnapshot } from '@aiao/rxdb-model/headless';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { fieldId, type FieldInputs } from './field-inputs';

/** 数值字段用文本框承载，才能保留无法解析的原始输入并展示解析错误。 */
const NUMERIC_TYPES = new Set(['integer', 'number']);

/** 一个字段的标签 + 自有控件 + 错误提示；标签、错误关联与只读状态由本页自己连接。 */
@Component({
  selector: 'app-hl-field-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="hl-field">
      <label [attr.for]="id()">{{ config().displayName }}</label>
      @switch (config().type) {
        @case ('boolean') {
          <input
            [attr.aria-describedby]="showError() ? errorId() : null"
            [attr.aria-invalid]="showError() ? 'true' : null"
            [attr.aria-required]="config().required ? 'true' : null"
            [attr.name]="config().field"
            [checked]="state().value === true"
            [disabled]="state().readonly"
            [id]="id()"
            (change)="onCheck($event)"
            type="checkbox"
          />
        }
        @case ('enum') {
          <select
            [attr.aria-describedby]="showError() ? errorId() : null"
            [attr.aria-invalid]="showError() ? 'true' : null"
            [attr.aria-required]="config().required ? 'true' : null"
            [attr.name]="config().field"
            [disabled]="state().readonly"
            [id]="id()"
            (change)="onSelect($event)"
          >
            <option [selected]="selected() === ''" value="">请选择</option>
            @for (value of config().enumValues ?? []; track value) {
              <option [selected]="selected() === value" [value]="value">
                {{ config().options?.[value]?.label ?? value }}
              </option>
            }
          </select>
        }
        @default {
          <input
            [attr.aria-describedby]="showError() ? errorId() : null"
            [attr.aria-invalid]="showError() ? 'true' : null"
            [attr.aria-required]="config().required ? 'true' : null"
            [attr.inputmode]="numeric() ? 'numeric' : null"
            [attr.name]="config().field"
            [disabled]="state().readonly"
            [id]="id()"
            [value]="textValue()"
            (input)="onText($event)"
            type="text"
          />
        }
      }
      @if (showError()) {
        <p class="hl-error" [attr.data-testid]="'error-' + config().field" [id]="errorId()" role="alert">
          {{ state().error?.message }}
        </p>
      }
    </div>
  `
})
export class FieldRowComponent {
  protected readonly config = computed(() => this.state().config);
  protected readonly id = computed(() => fieldId(this.idPrefix(), this.config().field));
  protected readonly errorId = computed(() => `${this.id()}-error`);
  protected readonly showError = computed(
    () =>
      this.state().error !== undefined &&
      (this.inputs().attempted() || this.inputs().touched().has(this.config().field))
  );
  protected readonly textValue = computed(() => this.inputs().raw()[this.config().field] ?? this.state().displayValue);
  protected readonly selected = computed(() => String(this.state().value ?? ''));
  protected readonly numeric = computed(() => NUMERIC_TYPES.has(this.config().type));

  readonly idPrefix = input.required<string>();
  readonly state = input.required<EntityFormFieldSnapshot>();
  readonly inputs = input.required<FieldInputs>();

  protected onCheck(event: Event): void {
    this.inputs().input(this.config().field, (event.target as HTMLInputElement).checked);
  }

  protected onSelect(event: Event): void {
    this.inputs().input(this.config().field, (event.target as HTMLSelectElement).value);
  }

  protected onText(event: Event): void {
    this.inputs().input(this.config().field, (event.target as HTMLInputElement).value);
  }
}
