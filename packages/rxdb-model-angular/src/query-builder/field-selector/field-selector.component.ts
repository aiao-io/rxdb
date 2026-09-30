import { buildFieldTree, type FieldMetadata } from '@aiao/rxdb-model';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TreeSelectComponent } from '../tree-select/tree-select.component';

/**
 * 字段选择器组件
 *
 * @description
 * 使用 Popover API 展示树形字段结构，支持过滤和嵌套关系字段的展开/折叠。
 * 基于 CDK `ActiveDescendantKeyManager` 提供完整键盘导航和无障碍支持。
 * 不依赖任何第三方 UI 库。
 *
 * 支持两种使用方式：
 * 1. 直接模板使用：监听 `(fieldChange)` output 事件
 * 2. 通过 NgComponentOutlet 注入：传入 `fieldChangeFn` 回调 input
 */
@Component({
  selector: 'rxdb-field-selector',
  standalone: true,
  imports: [TreeSelectComponent],
  template: `
    <rxdb-tree-select
      [nodes]="fieldTree()"
      [placeholder]="placeholder()"
      [selected]="selectedField()"
      (selectChange)="onSelect($event)"
      minWidth="14rem"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FieldSelectorComponent {
  readonly fields = input.required<FieldMetadata[]>();
  readonly selectedField = input<string>('');
  readonly placeholder = input<string>('选择字段');

  /** 通过 NgComponentOutlet 注入时使用的回调 input */
  readonly fieldChangeFn = input<((field: string) => void) | undefined>(undefined);

  /** 直接模板使用时的 output 事件 */
  readonly fieldChange = output<string>();

  readonly fieldTree = computed(() => buildFieldTree(this.fields()));

  onSelect(field: string): void {
    this.fieldChange.emit(field);
    this.fieldChangeFn()?.(field);
  }
}
