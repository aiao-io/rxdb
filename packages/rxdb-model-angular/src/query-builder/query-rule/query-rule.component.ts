import type { FieldMetadata, QueryBuilderRuleGroup, UIRule, ValidationError } from '@aiao/rxdb-model';
import { CommonModule, NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked
} from '@angular/core';
import { DEFAULT_QUERY_BUILDER_THEME } from '../theme/default-query-builder-theme';
import { QUERY_BUILDER_THEME } from '../theme/query-builder-theme.token';

/**
 * 带 where 子查询的规则类型
 */
type UIRuleWithWhere = UIRule & {
  where?: QueryBuilderRuleGroup<Record<string, unknown>>;
};

/**
 * 单条查询规则组件
 *
 * @description
 * 显示一条查询规则的编辑界面：
 * - 字段选择器
 * - 操作符选择器
 * - 值输入框
 * - 删除按钮
 */
@Component({
  selector: 'rxdb-query-rule',
  standalone: true,
  imports: [CommonModule, NgComponentOutlet],
  template: `
    <div class="rxdb-query-rule group flex flex-col rounded p-1">
      <div class="flex flex-wrap items-center gap-2">
        <ng-container [ngComponentOutlet]="theme.fieldSelector" [ngComponentOutletInputs]="fieldSelectorInputs()" />
        <ng-container
          [ngComponentOutlet]="theme.operatorSelector"
          [ngComponentOutletInputs]="operatorSelectorInputs()"
        />
        @if (isExistsOperator()) {
          @if (!subqueryVisible()) {
            <button class="btn btn-ghost btn-xs" (click)="onAddSubcondition()" title="添加子条件" type="button">
              + 子条件（可选）
            </button>
          }
        } @else if (!isNoValueOperator()) {
          <ng-container [ngComponentOutlet]="theme.valueInput" [ngComponentOutletInputs]="valueInputInputs()" />
        }
        <button
          class="btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-error ml-auto"
          (click)="onRemove()"
          title="删除条件"
          type="button"
        >
          ✕
        </button>
      </div>
      @if (isExistsOperator() && subqueryVisible()) {
        <ng-container [ngComponentOutlet]="theme.valueInput" [ngComponentOutletInputs]="valueInputInputs()" />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QueryRuleComponent {
  private readonly existsOperators = new Set(['exists', 'notExists']);
  private readonly noValueOperators = new Set(['null', 'notNull']);

  /** 注入的主题（回退到默认主题） */
  protected readonly theme = inject(QUERY_BUILDER_THEME, { optional: true }) ?? DEFAULT_QUERY_BUILDER_THEME;

  readonly rule = input.required<UIRuleWithWhere>();
  readonly fields = input.required<FieldMetadata[]>();
  readonly errors = input<ValidationError[]>([]);

  readonly update = output<{ id: string; updates: Partial<UIRuleWithWhere> }>();
  readonly remove = output<void>();

  readonly fieldAsString = computed(() => this.rule().field);
  readonly ruleErrors = computed(() => {
    const seen = new Set<string>();
    return this.errors().filter(e => {
      if (e.field !== this.rule().field) return false;
      if (seen.has(e.message)) return false;
      seen.add(e.message);
      return true;
    });
  });
  readonly errorTooltip = computed(() =>
    this.ruleErrors()
      .map(e => e.message)
      .join(' | ')
  );
  readonly isExistsOperator = computed(() => this.existsOperators.has(this.rule().operator));
  readonly isNoValueOperator = computed(() => this.noValueOperators.has(this.rule().operator));

  /** 子查询面板是否展开（已有 where 规则时自动展开） */
  readonly showSubquery = signal(false);

  /**
   * 当规则的 where 已有内容时自动展开。
   * 使用 computed 包装监听 rule().where，在显示按钮前检查。
   */
  readonly subqueryVisible = computed(() => {
    const where = this.rule().where;
    if (where && where.rules && where.rules.length > 0) {
      return true;
    }
    return this.showSubquery();
  });

  readonly currentField = computed(() => {
    const fieldName = this.rule().field;
    return this.fields().find(f => f.name === fieldName);
  });

  readonly currentFieldType = computed(() => this.currentField()?.type ?? 'string');
  readonly currentEnumOptions = computed(() => this.currentField()?.enum ?? []);

  /** 当前字段的关系目标实体字段列表 */
  readonly currentRelationFields = computed(() => {
    return this.currentField()?.relationFields ?? [];
  });

  /** 规则的 where 子查询 */
  readonly ruleWhere = computed(() => this.rule().where);

  /** NgComponentOutlet inputs：字段选择器（fieldChangeCb 是 lazy 引用，声明顺序不影响运行时）*/
  readonly fieldSelectorInputs = computed(() => ({
    fields: this.fields(),
    selectedField: this.fieldAsString(),
    fieldChangeFn: this.fieldChangeCb
  }));

  /** NgComponentOutlet inputs：操作符选择器 */
  readonly operatorSelectorInputs = computed(() => ({
    fieldMetadata: this.currentField(),
    fieldType: this.currentFieldType(),
    selectedOperator: this.rule().operator,
    operatorChangeFn: this.operatorChangeCb
  }));

  /** NgComponentOutlet inputs：值输入 */
  readonly valueInputInputs = computed(() => ({
    fieldType: this.currentFieldType(),
    operator: this.rule().operator,
    value: this.rule().value,
    enumOptions: this.currentEnumOptions(),
    relationFields: this.currentRelationFields(),
    where: this.ruleWhere(),
    errorMessage: this.errorTooltip(),
    valueChangeFn: this.valueChangeCb,
    whereChangeFn: this.whereChangeCb
  }));

  /** 子条件清空/全部删除时自动收起面板并恢复 +子条件 按钮 */
  constructor() {
    effect(() => {
      const where = this.rule().where;
      const hasRules = where && where.rules && where.rules.length > 0;
      if (!hasRules) {
        untracked(() => this.showSubquery.set(false));
      }
    });
  }

  // === 公有方法 ===
  /** 字段变更 */
  onFieldChange(fieldName: string): void {
    const field = this.fields().find(f => f.name === fieldName);
    this.update.emit({
      id: this.rule().id,
      updates: {
        field: fieldName,
        operator:
          field?.isRelation ? 'exists'
          : field?.type === 'keyValue' ? 'null'
          : '=',
        value: field?.type === 'boolean' ? false : '',
        where: undefined // 重置子查询
      }
    });
  }

  /** 添加子条件：展开面板并创建一条默认子规则 */
  onAddSubcondition(): void {
    this.showSubquery.set(true);
    const relationFields = this.currentRelationFields();
    const firstField = relationFields[0];
    if (firstField) {
      const where: QueryBuilderRuleGroup<Record<string, unknown>> = {
        id: '',
        combinator: 'and',
        rules: [
          {
            id: '',
            field: firstField.name,
            operator:
              firstField.isRelation ? 'exists'
              : firstField.type === 'keyValue' ? 'null'
              : '=',
            value: firstField.type === 'boolean' ? false : ''
          }
        ]
      };
      this.update.emit({ id: this.rule().id, updates: { where } });
    }
  }

  /** 操作符变更 */
  onOperatorChange(operator: string): void {
    const updates: Partial<UIRuleWithWhere> = { operator };
    if (this.existsOperators.has(operator) || this.noValueOperators.has(operator)) {
      updates.value = null;
    }
    if (!this.existsOperators.has(operator)) {
      updates.where = undefined;
      this.showSubquery.set(false);
    }
    this.update.emit({ id: this.rule().id, updates });
  }

  /** 值变更 */
  onValueChange(value: unknown): void {
    this.update.emit({
      id: this.rule().id,
      updates: { value }
    });
  }

  /** 子查询条件变更 */
  onWhereChange(where: QueryBuilderRuleGroup<Record<string, unknown>> | undefined): void {
    this.update.emit({
      id: this.rule().id,
      updates: { where }
    });
  }

  /** 删除规则 */
  onRemove(): void {
    this.remove.emit();
  }

  // === 私有 callback 字段（computed signal 是懒求值的，this.onXxx 在调用时已初始化）===
  private readonly fieldChangeCb = (field: string) => this.onFieldChange(field);
  private readonly operatorChangeCb = (op: string) => this.onOperatorChange(op);
  private readonly valueChangeCb = (value: unknown) => this.onValueChange(value);
  private readonly whereChangeCb = (where: QueryBuilderRuleGroup<Record<string, unknown>> | undefined) =>
    this.onWhereChange(where);
}
