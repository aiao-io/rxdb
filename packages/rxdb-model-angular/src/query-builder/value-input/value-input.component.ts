import {
  getDefaultValueForType as coreGetDefaultValue,
  getInputType as coreGetInputType,
  parseCommaSeparatedInput,
  UUID_RE,
  type FieldMetadata,
  type QueryBuilderRuleGroup
} from '@aiao/rxdb-model';
import { CommonModule } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  computed,
  effect,
  inject,
  Injector,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  ViewChild,
  ViewContainerRef
} from '@angular/core';
import { Subscription } from 'rxjs';
import { PopoverSelectComponent } from '../popover-select/popover-select.component';

/**
 * 值输入组件
 *
 * @description
 * 根据字段类型和操作符显示合适的输入控件：
 * - string: 文本输入框
 * - number: 数字输入框
 * - boolean: 切换开关
 * - date: 日期选择器
 * - enum: 下拉选择器
 * - array: 逗号分隔的文本输入
 * - range: 范围输入（双输入框或范围选择器）
 * - null/notNull 操作符: 无输入
 * - exists/notExists 操作符: 子查询构建器
 */
@Component({
  selector: 'rxdb-value-input',
  standalone: true,
  imports: [CommonModule, PopoverSelectComponent],
  template: `
    @switch (inputType()) {
      @case ('none') {
        <span class="text-base-content/50 px-2 text-sm italic">无需输入值</span>
      }
      @case ('uuid') {
        <div
          [attr.data-tip]="uuidError() || errorMessage() || null"
          [class.tooltip-top]="!!uuidError() || hasError()"
          [class.tooltip]="!!uuidError() || hasError()"
        >
          <input
            class="input input-sm font-mono"
            [class.input-error]="hasError() || !!uuidError()"
            [value]="currentValue()"
            (input)="onUuidChange($any($event.target).value)"
            placeholder="输入 UUID"
            style="min-width: 16rem"
            type="text"
          />
        </div>
      }
      @case ('subquery') {
        <div class="subquery-container w-full">
          @if (!relationFields() || relationFields().length === 0) {
            <span class="text-base-content/50 px-2 text-sm italic">存在/不存在（无子条件）</span>
          } @else {
            <div #subqueryContainer></div>
          }
        </div>
      }
      @case ('boolean') {
        <input
          class="toggle toggle-sm"
          [checked]="!!currentValue()"
          (change)="onValueChange($any($event.target).checked)"
          type="checkbox"
        />
      }
      @case ('enum') {
        <rxdb-popover-select
          [options]="enumSelectOptions()"
          [selected]="currentValue()?.toString() ?? ''"
          (selectChange)="onEnumSelect($event)"
          minWidth="12rem"
          placeholder="选择值"
        />
      }
      @case ('enum-array') {
        <div [attr.data-tip]="errorMessage() || null" [class.tooltip-top]="hasError()" [class.tooltip]="hasError()">
          <select
            class="select select-sm"
            [class.select-error]="hasError()"
            (change)="onEnumArrayChange($event)"
            multiple
            style="min-width: 12rem; min-height: 6rem"
          >
            @for (opt of enumOptions(); track opt) {
              <option [selected]="isEnumSelected(opt)" [value]="opt">{{ opt }}</option>
            }
          </select>
        </div>
      }
      @case ('range') {
        @if (fieldType() === 'date') {
          <div
            class="flex items-center gap-2"
            [attr.data-tip]="errorMessage() || null"
            [class.tooltip-top]="hasError()"
            [class.tooltip]="hasError()"
          >
            <input
              class="input input-sm"
              [class.input-error]="hasError()"
              [value]="dateRangeStart()"
              (change)="onDateRangeStartChange($any($event.target).value)"
              style="width: 9rem"
              type="date"
            />
            <span class="text-base-content/50">至</span>
            <input
              class="input input-sm"
              [class.input-error]="hasError()"
              [value]="dateRangeEnd()"
              (change)="onDateRangeEndChange($any($event.target).value)"
              style="width: 9rem"
              type="date"
            />
          </div>
        } @else {
          <div
            class="flex items-center gap-2"
            [attr.data-tip]="errorMessage() || null"
            [class.tooltip-top]="hasError()"
            [class.tooltip]="hasError()"
          >
            <input
              class="input input-sm"
              [class.input-error]="hasError()"
              [value]="rangeMin() ?? ''"
              (input)="onRangeMinChange($any($event.target).value)"
              placeholder="最小值"
              style="width: 7rem"
              type="number"
            />
            <span class="text-base-content/50">至</span>
            <input
              class="input input-sm"
              [class.input-error]="hasError()"
              [value]="rangeMax() ?? ''"
              (input)="onRangeMaxChange($any($event.target).value)"
              placeholder="最大值"
              style="width: 7rem"
              type="number"
            />
          </div>
        }
      }
      @case ('number') {
        <div [attr.data-tip]="errorMessage() || null" [class.tooltip-top]="hasError()" [class.tooltip]="hasError()">
          <input
            class="input input-sm"
            [class.input-error]="hasError()"
            [value]="currentValue() ?? ''"
            (input)="onNumberInputChange($any($event.target).value)"
            placeholder="输入数值"
            type="number"
          />
        </div>
      }
      @case ('date') {
        <div [attr.data-tip]="errorMessage() || null" [class.tooltip-top]="hasError()" [class.tooltip]="hasError()">
          <input
            class="input input-sm"
            [class.input-error]="hasError()"
            [value]="currentDateStr()"
            (change)="onNativeDateChange($any($event.target).value)"
            style="width: 10rem"
            type="date"
          />
        </div>
      }
      @case ('array') {
        <div [attr.data-tip]="errorMessage() || null" [class.tooltip-top]="hasError()" [class.tooltip]="hasError()">
          <input
            class="input input-sm"
            [class.input-error]="hasError()"
            [value]="arrayInputValue()"
            (input)="onArrayInputChange($any($event.target).value)"
            placeholder="输入多个值，用逗号分隔"
            style="width: 100%; min-width: 12rem"
            type="text"
          />
        </div>
      }
      @default {
        <div [attr.data-tip]="errorMessage() || null" [class.tooltip-top]="hasError()" [class.tooltip]="hasError()">
          <input
            class="input input-sm"
            [class.input-error]="hasError()"
            [value]="currentValue() ?? ''"
            (input)="onValueChange($any($event.target).value)"
            placeholder="输入值"
            style="width: 100%; min-width: 12rem"
            type="text"
          />
        </div>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ValueInputComponent implements OnInit, OnDestroy {
  private previousInputType: string | null = null;
  private subqueryComponentRef?: ComponentRef<any>;
  private subquerySubscription?: Subscription;
  private subqueryLoading = false;
  private readonly injector = inject(Injector);

  /** UUID 格式校验错误（基于 currentValue 派生，inputType 不是 uuid 时自动为空） */
  readonly uuidError = computed(() => {
    if (this.inputType() !== 'uuid') return '';
    const val = String(this.currentValue() ?? '').trim();
    return val && !UUID_RE.test(val) ? '请输入合法的 UUID 格式' : '';
  });

  @ViewChild('subqueryContainer', { read: ViewContainerRef })
  subqueryContainer?: ViewContainerRef;

  readonly fieldType = input<string>('string');
  readonly operator = input<string>('=');
  readonly value = input<unknown>('');
  readonly enumOptions = input<unknown[]>([]);
  readonly relationFields = input<FieldMetadata[]>([]);
  readonly where = input<QueryBuilderRuleGroup<Record<string, unknown>>>();

  readonly valueChange = output<unknown>();
  readonly whereChange = output<QueryBuilderRuleGroup<Record<string, unknown>> | undefined>();

  readonly errorMessage = input<string>('');
  readonly hasError = computed(() => !!this.errorMessage());

  readonly valueChangeFn = input<((value: unknown) => void) | undefined>(undefined);
  readonly whereChangeFn = input<
    ((where: QueryBuilderRuleGroup<Record<string, unknown>> | undefined) => void) | undefined
  >(undefined);

  /** 信号状态 —— 替代原先的可变类属性 */
  readonly currentValue = signal<any>('');
  readonly rangeMin = signal<any>(null);
  readonly rangeMax = signal<any>(null);
  readonly arrayInputValue = signal('');
  readonly currentDateStr = signal('');
  readonly dateRangeStart = signal('');
  readonly dateRangeEnd = signal('');

  readonly inputType = computed(() => coreGetInputType(this.fieldType(), this.operator(), this.enumOptions()));
  readonly enumSelectOptions = computed(() =>
    this.enumOptions().map(opt => ({ value: String(opt), label: String(opt) }))
  );

  constructor() {
    effect(() => {
      const currentType = this.inputType();
      if (this.previousInputType !== null && this.previousInputType !== currentType) {
        const defaultVal = coreGetDefaultValue(currentType);
        this.currentValue.set(defaultVal);
        this.valueChange.emit(defaultVal);
        this.valueChangeFn()?.(defaultVal);
      }
      this.previousInputType = currentType;
    });

    afterNextRender(
      () => {
        effect(
          () => {
            const isSubquery = this.inputType() === 'subquery';
            const hasRelationFields = this.relationFields().length > 0;
            if (isSubquery && hasRelationFields) {
              this.loadSubqueryComponent();
            } else {
              this.destroySubqueryComponent();
            }
          },
          { injector: this.injector }
        );
      },
      { injector: this.injector }
    );
  }

  ngOnDestroy(): void {
    this.destroySubqueryComponent();
  }

  ngOnInit(): void {
    const value = this.value();
    if (this.inputType() === 'range' && Array.isArray(value)) {
      if (this.fieldType() === 'date') {
        this.dateRangeStart.set(String(value[0] ?? ''));
        this.dateRangeEnd.set(String(value[1] ?? ''));
      } else {
        this.rangeMin.set(value[0]);
        this.rangeMax.set(value[1]);
      }
    } else if (this.inputType() === 'array' && Array.isArray(value)) {
      this.arrayInputValue.set(value.join(', '));
    } else if (this.inputType() === 'enum-array') {
      this.currentValue.set(Array.isArray(value) ? value : []);
    } else if (this.inputType() === 'date') {
      this.currentDateStr.set(typeof value === 'string' ? value : '');
    } else if (this.inputType() === 'uuid') {
      this.currentValue.set(typeof value === 'string' ? value : '');
    } else {
      this.currentValue.set(this.fieldType() === 'number' && value === '' ? null : value);
    }
  }

  /** 通用值变更（string / boolean…） */
  onValueChange(value: unknown): void {
    this.currentValue.set(value);
    this.valueChange.emit(value);
    this.valueChangeFn()?.(value);
  }

  /** UUID 值变更（带格式校验） */
  onUuidChange(value: string): void {
    this.currentValue.set(value);
    const trimmed = value.trim();
    this.valueChange.emit(trimmed.toLowerCase() || '');
    this.valueChangeFn()?.(trimmed.toLowerCase() || '');
  }

  /** 数字输入变更 */
  onNumberInputChange(value: string): void {
    const num = value === '' ? null : Number(value);
    this.currentValue.set(num);
    this.valueChange.emit(num);
    this.valueChangeFn()?.(num);
  }

  /** 枚举多选变更 */
  onEnumArrayChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const selected = Array.from(select.selectedOptions).map(o => o.value);
    this.currentValue.set(selected);
    this.valueChange.emit(selected);
    this.valueChangeFn()?.(selected);
  }

  /** 枚举选项是否选中 */
  isEnumSelected(opt: unknown): boolean {
    const val = this.currentValue();
    return Array.isArray(val) && val.includes(opt);
  }

  /** 枚举值选中（来自 PopoverSelectComponent） */
  onEnumSelect(value: string): void {
    this.currentValue.set(value);
    this.valueChange.emit(value);
    this.valueChangeFn()?.(value);
  }

  /** 原生日期输入变更 */
  onNativeDateChange(value: string): void {
    this.currentDateStr.set(value);
    this.valueChange.emit(value || '');
    this.valueChangeFn()?.(value || '');
  }

  /** 日期范围起始变更 */
  onDateRangeStartChange(value: string): void {
    this.dateRangeStart.set(value);
    this.onDateRangePartChange();
  }

  /** 日期范围结束变更 */
  onDateRangeEndChange(value: string): void {
    this.dateRangeEnd.set(value);
    this.onDateRangePartChange();
  }

  onDateRangePartChange(): void {
    const start = this.dateRangeStart();
    const end = this.dateRangeEnd();
    if (start && end) {
      this.valueChange.emit([start, end]);
      this.valueChangeFn()?.([start, end]);
    } else {
      this.valueChange.emit([]);
      this.valueChangeFn()?.([]);
    }
  }

  /** 范围最小值变更 */
  onRangeMinChange(value: string): void {
    this.rangeMin.set(value === '' ? null : Number(value));
    this.onRangeChange();
  }

  /** 范围最大值变更 */
  onRangeMaxChange(value: string): void {
    this.rangeMax.set(value === '' ? null : Number(value));
    this.onRangeChange();
  }

  onRangeChange(): void {
    const min = this.rangeMin();
    const max = this.rangeMax();
    if (min != null && max != null) {
      this.valueChange.emit([min, max]);
      this.valueChangeFn()?.([min, max]);
    } else {
      this.valueChange.emit([]);
      this.valueChangeFn()?.([]);
    }
  }

  /** 数组输入值变更（逗号分隔字符串） */
  onArrayInputChange(value: string): void {
    this.arrayInputValue.set(value);
    const result = parseCommaSeparatedInput(value, this.fieldType());
    this.valueChange.emit(result);
    this.valueChangeFn()?.(result);
  }

  handleWhereChange(where: { combinator: 'and' | 'or'; rules: unknown[] } | undefined): void {
    const typedWhere = where as QueryBuilderRuleGroup<Record<string, unknown>> | undefined;
    this.whereChange.emit(typedWhere);
    this.whereChangeFn()?.(typedWhere);
  }

  private async loadSubqueryComponent(): Promise<void> {
    if (!this.subqueryContainer || this.subqueryComponentRef || this.subqueryLoading) return;
    this.subqueryLoading = true;
    try {
      const { SubqueryBuilderComponent } = await import('../subquery-builder/subquery-builder.component');
      this.subqueryComponentRef = this.subqueryContainer.createComponent(SubqueryBuilderComponent);
      this.subqueryComponentRef.setInput('fields', this.relationFields());
      this.subqueryComponentRef.setInput('initialQuery', this.where());
      this.subquerySubscription = this.subqueryComponentRef.instance.queryChange.subscribe(
        (query: { combinator: 'and' | 'or'; rules: unknown[] } | undefined) => {
          this.handleWhereChange(query);
        }
      );
    } catch (error) {
      console.error('[ValueInput] Failed to load SubqueryBuilderComponent:', error);
    } finally {
      this.subqueryLoading = false;
    }
  }

  private destroySubqueryComponent(): void {
    this.subquerySubscription?.unsubscribe();
    this.subquerySubscription = undefined;
    if (this.subqueryComponentRef) {
      this.subqueryComponentRef.destroy();
      this.subqueryComponentRef = undefined;
    }
  }
}
