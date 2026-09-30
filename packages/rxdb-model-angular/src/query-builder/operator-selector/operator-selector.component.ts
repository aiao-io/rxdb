import { getDefaultOperatorRegistry, type FieldMetadata, type PropertyType } from '@aiao/rxdb-model';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PopoverSelectComponent } from '../popover-select/popover-select.component';

/**
 * 操作符选择器组件
 *
 * @description
 * 基于 {@link PopoverSelectComponent} 提供操作符选择功能，
 * 自动根据字段类型或元数据筛选可用操作符。
 * 支持搜索过滤和键盘导航。
 *
 * 支持两种使用方式：
 * 1. 直接模板使用：监听 `(operatorChange)` output 事件
 * 2. 通过 NgComponentOutlet 注入：传入 `operatorChangeFn` 回调 input
 */
@Component({
  selector: 'rxdb-operator-selector',
  standalone: true,
  imports: [PopoverSelectComponent],
  template: `
    <rxdb-popover-select
      [options]="operatorOptions()"
      [selected]="selectedOperator()"
      (selectChange)="onOperatorChange($event)"
      minWidth="8rem"
      placeholder="选择操作符"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OperatorSelectorComponent {
  private readonly registry = getDefaultOperatorRegistry();

  readonly operatorOptions = computed(() => {
    const metadata = this.fieldMetadata();
    const operators =
      metadata ? this.registry.getForField(metadata) : this.registry.getForType(this.fieldType() as PropertyType);
    return operators.map(op => ({ value: op.key, label: op.label }));
  });

  readonly fieldMetadata = input<FieldMetadata | undefined>(undefined);
  readonly fieldType = input<string>('string');
  readonly selectedOperator = input<string>('=');

  /** 通过 NgComponentOutlet 注入时使用的回调 input */
  readonly operatorChangeFn = input<((op: string) => void) | undefined>(undefined);

  /** 直接模板使用时的 output 事件 */
  readonly operatorChange = output<string>();

  onOperatorChange(op: string): void {
    this.operatorChange.emit(op);
    this.operatorChangeFn()?.(op);
  }
}
