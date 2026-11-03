import { useI18n } from '@aiao/rxdb-i18n-angular';
import {
  getInputType,
  type FieldMetadata,
  type OperatorDefinition,
  type QueryBuilderController,
  type QueryBuilderRule
} from '@aiao/rxdb-model/headless';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { defaultRuleValue, operatorLabel, operatorsFor, ruleValueFromText } from './article-model';

/** 一条规则：字段 / 操作符 / 值控件都是本页自己的，更新动作交给查询构建器控制器。 */
@Component({
  selector: 'app-hl-query-rule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="hl-rule" data-testid="qb-rule">
      <select (change)="changeField($event)" aria-label="字段">
        <option [selected]="rule().field === ''" value="">选择字段</option>
        @for (item of fields(); track item.name) {
          <option [selected]="rule().field === item.name" [value]="item.name">{{ item.displayName }}</option>
        }
      </select>
      <select (change)="changeOperator($event)" aria-label="操作符">
        @for (operator of operators(); track operator.key) {
          <option [selected]="rule().operator === operator.key" [value]="operator.key">
            {{ operatorText(operator) }}
          </option>
        }
      </select>
      @if (inputType() === 'enum') {
        <select (change)="changeEnumValue($event)" aria-label="值">
          <option [selected]="valueText() === ''" value="">请选择</option>
          @for (option of field()?.enum ?? []; track option) {
            <option [selected]="valueText() === '' + option" [value]="'' + option">{{ '' + option }}</option>
          }
        </select>
      } @else if (inputType() !== 'none') {
        <input
          [attr.inputmode]="inputType() === 'number' ? 'numeric' : null"
          [value]="valueText()"
          (input)="changeValue($event)"
          aria-label="值"
        />
      }
      <button (click)="controller().remove(rule().id)" aria-label="删除规则" type="button">删除</button>
    </div>
  `
})
export class QueryRuleComponent {
  /** 绑定的 `t` 会读取语言与目录修订，切换语言时模板里的操作符文案随之重新渲染。 */
  readonly #i18n = useI18n();
  protected readonly field = computed(() => this.fields().find(item => item.name === this.rule().field));
  protected readonly operators = computed(() => operatorsFor(this.field()));
  protected readonly inputType = computed(() =>
    getInputType(this.field()?.type ?? 'string', this.rule().operator, this.field()?.enum)
  );
  protected readonly valueText = computed(() => String(this.rule().value ?? ''));

  readonly rule = input.required<QueryBuilderRule>();
  readonly controller = input.required<QueryBuilderController>();
  readonly fields = input.required<readonly FieldMetadata[]>();

  protected operatorText(operator: OperatorDefinition): string {
    return operatorLabel(operator, this.#i18n);
  }

  protected changeField(event: Event): void {
    const name = (event.target as HTMLSelectElement).value;
    const next = this.fields().find(item => item.name === name);
    const operator = operatorsFor(next)[0]?.key ?? '=';
    this.controller().updateRule(this.rule().id, { field: name, operator, value: defaultRuleValue(next, operator) });
  }

  protected changeOperator(event: Event): void {
    const operator = (event.target as HTMLSelectElement).value;
    this.controller().updateRule(this.rule().id, { operator, value: defaultRuleValue(this.field(), operator) });
  }

  protected changeEnumValue(event: Event): void {
    this.controller().updateRule(this.rule().id, { value: (event.target as HTMLSelectElement).value });
  }

  protected changeValue(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.controller().updateRule(this.rule().id, { value: ruleValueFromText(this.inputType(), raw) });
  }
}
