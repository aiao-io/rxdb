import type { WorkingTreeDiffEntry } from '@aiao/rxdb-plugin-working-tree';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideFileDiff as FileDiff, LucideDynamicIcon } from '@lucide/angular';
import { buildDiffRows, formatFieldValue } from '../working-tree.diff-format';

/**
 * 右栏的 diff 查看器，模仿 GitHub Desktop 的文件 diff 视图。
 *
 * @remarks
 * 没有选中项时显示空态提示而不是空白：右栏是页面的主视觉区，空白会让
 * 「点左侧文件看右侧 diff」这个轴显得没接上。字段级 - / + 行用 `buildDiffRows`
 * 摊开（旧值先画成 `-`，新值后画成 `+`），布局对齐 GitHub Desktop：左侧一条
 * 窄的符号槽，行本身带红 / 绿底色。我们 diff 的最小单位是**字段**而不是行，
 * 符号槽里放 - / + 而不是行号。
 */
@Component({
  selector: 'app-working-tree-diff-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LucideDynamicIcon],
  template: `
    @if (entry(); as entry) {
      <div class="flex h-full min-h-0 flex-col" data-testid="wt-diff-viewer">
        <div class="border-base-300 flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
          <span
            class="badge badge-sm badge-outline"
            [class.badge-error]="entry.operation === 'delete'"
            [class.badge-success]="entry.operation === 'insert'"
            [class.badge-warning]="entry.operation === 'update'"
            [class.text-amber-700]="entry.operation === 'update'"
            [class.text-green-700]="entry.operation === 'insert'"
            [class.text-red-700]="entry.operation === 'delete'"
          >
            {{ entry.operation.toUpperCase() }}
          </span>
          <span class="text-sm font-semibold">{{ entry.entity }}#{{ entry.entityId }}</span>
          @if (entry.origin === 'remote_sync') {
            <span class="badge badge-outline badge-xs">远端同步</span>
          }
          @if (entry.transactionId) {
            <span class="text-base-content/80 ml-auto truncate font-mono text-[10px]" [title]="entry.transactionId">
              事务 {{ entry.transactionId }}
            </span>
          }
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <div class="border-base-300 overflow-hidden rounded-lg border font-mono text-xs">
            @for (row of rows(); track row.key + row.sign + formatFieldValue(row.value)) {
              <div
                class="border-base-300/50 flex"
                [class.bg-error/10]="row.sign === '-'"
                [class.bg-success/10]="row.sign === '+'"
                [class.border-b]="!$last"
              >
                <span
                  class="text-base-content/50 border-base-300/50 w-8 shrink-0 border-r py-1 text-center select-none"
                  [class.bg-error/20]="row.sign === '-'"
                  [class.bg-success/20]="row.sign === '+'"
                >
                  {{ row.sign }}
                </span>
                <span class="text-base-content/80 shrink-0 px-3 py-1">{{ row.key }}:</span>
                <span
                  class="min-w-0 flex-1 py-1 pr-3 break-all"
                  [class.text-green-700]="row.sign === '+'"
                  [class.text-red-700]="row.sign === '-'"
                >
                  {{ formatFieldValue(row.value) }}
                </span>
              </div>
            } @empty {
              <p class="text-base-content/80 px-3 py-2">该改动没有字段级补丁可展示</p>
            }
          </div>
        </div>
      </div>
    } @else {
      <div class="text-base-content/60 flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <svg class="text-base-content/40" [lucideIcon]="FileDiff" size="40"></svg>
        <p class="text-sm">从左侧选择一条改动，这里展示它的字段级差异</p>
      </div>
    }
  `
})
export class WorkingTreeDiffViewerComponent {
  readonly entry = input<WorkingTreeDiffEntry | null>(null);

  readonly rows = computed(() => {
    const entry = this.entry();
    return entry === null ? [] : buildDiffRows(entry);
  });

  readonly FileDiff = FileDiff;
  readonly formatFieldValue = formatFieldValue;
}
