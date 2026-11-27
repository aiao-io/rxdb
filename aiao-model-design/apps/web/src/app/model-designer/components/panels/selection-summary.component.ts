import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';

/**
 * 多选摘要面板
 *
 * 当画布上选中多个实体时显示，提供批量删除和清空选择操作。
 */
@Component({
  selector: 'lib-selection-summary',
  template: `
    <div class="bg-base-100 border-base-300 flex h-full w-80 flex-col border-l">
      <div class="border-base-300 flex items-center justify-between border-b px-3 py-2">
        <span class="text-sm font-semibold">
          {{ t().selectionSummary.selectedCount.replace('{count}', '' + count()) }}
        </span>
        <button class="btn btn-ghost btn-xs" (click)="clearSelection.emit()">✕</button>
      </div>
      <div class="flex flex-col gap-2 p-3">
        <button class="btn btn-error btn-sm w-full" (click)="deleteSelected.emit()">
          {{ t().selectionSummary.deleteSelected }}
        </button>
        <button class="btn btn-ghost btn-sm w-full" (click)="clearSelection.emit()">
          {{ t().selectionSummary.clearSelection }}
        </button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SelectionSummaryComponent {
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  readonly count = input.required<number>();
  readonly deleteSelected = output<void>();
  readonly clearSelection = output<void>();
}
