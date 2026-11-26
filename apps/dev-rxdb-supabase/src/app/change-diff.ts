import type { RxDBChange } from '@aiao/rxdb';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { describeChange } from './history-describe';
import { fieldDiffOf, formatFieldValue } from './field-diff';

/**
 * 一条变更逐字段的改之前与改之后
 *
 * @remarks
 * 新建只有改之后、删除只有改之前、修改取两侧字段的并集（{@link fieldDiffOf}）。同步中心的待推送清单与操作历史共用。
 */
@Component({
  selector: 'app-change-diff',
  template: `
    <div class="flex flex-col gap-1" data-testid="change-diff">
      <span class="text-xs font-medium">{{ title() }}</span>
      @if (lines().length === 0) {
        <span class="text-base-content/60 text-xs">没有可显示的字段</span>
      } @else {
        <table class="table-xs table">
          <tbody>
            @for (line of lines(); track line.key) {
              <tr data-testid="change-diff-line">
                <td class="text-base-content/70 font-mono">{{ line.key }}</td>
                <td class="text-error font-mono break-all">{{ format(line.before) }}</td>
                <td aria-hidden="true">→</td>
                <td class="text-success font-mono break-all">{{ format(line.after) }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChangeDiff {
  readonly change = input.required<Pick<RxDBChange, 'type' | 'entity' | 'patch' | 'inversePatch'>>();
  readonly title = computed(() => describeChange(this.change()));
  readonly lines = computed(() => fieldDiffOf(this.change()));
  readonly format = formatFieldValue;
}
