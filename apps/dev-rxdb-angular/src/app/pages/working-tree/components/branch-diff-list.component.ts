import type { BranchDiffEntry, MergePreviewEntry } from '@aiao/rxdb-plugin-history';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideAlertTriangle as AlertTriangle, LucideDynamicIcon } from '@lucide/angular';
import { branchDiffRow } from '../working-tree.branch-diff';
import { gdOpColor, gdOpIcon, gdOpLabel, gdPathColor } from '../working-tree.gd';

/**
 * 分支对比与合并预览共用的差异列表。
 *
 * @remarks
 * 一行一个实体：状态图标（装饰；读屏读旁边 sr-only 的状态名）+ 路径，下面逐字段「旧值 → 新值」；
 * 预览条目撞上目标分支的改动时再加一行覆盖说明。条目多时只能滚动查看，滚动区本身要能被键盘聚焦
 * （axe `scrollable-region-focusable`）。
 */
@Component({
  selector: 'app-working-tree-branch-diff-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon],
  template: `
    @if (rows().length === 0) {
      <p class="py-3 text-center text-xs" [style.color]="'var(--gd-muted)'" data-testid="wt-branch-diff-empty">
        {{ emptyText() }}
      </p>
    } @else {
      <div
        class="max-h-64 overflow-y-auto rounded border border-[var(--gd-border)] focus-visible:outline-2 focus-visible:outline-[var(--gd-accent)]"
        [attr.aria-label]="label()"
        role="region"
        tabindex="0"
      >
        <ul data-testid="wt-branch-diff-list">
          @for (row of rows(); track row.key) {
            <li class="border-b border-[var(--gd-border)] px-3 py-2 last:border-b-0" data-testid="wt-branch-diff-item">
              <div class="flex min-w-0 items-center gap-2">
                <svg
                  class="shrink-0"
                  [lucideIcon]="opIcon(row.operation)"
                  [style.color]="opColor(row.operation)"
                  aria-hidden="true"
                  size="14"
                ></svg>
                <span class="sr-only">{{ opLabel(row.operation) }}</span>
                <span
                  class="min-w-0 truncate font-mono text-xs"
                  [style.color]="pathColor(row.operation)"
                  [title]="row.path"
                >
                  {{ row.path }}
                </span>
              </div>
              @if (row.fields.length > 0) {
                <ul class="mt-1 space-y-0.5 pl-6 font-mono text-xs">
                  @for (field of row.fields; track field.key) {
                    <li class="break-all">
                      <span [style.color]="'var(--gd-muted)'">{{ field.key }}:</span>
                      {{ field.before }}<span aria-hidden="true"> → </span><span class="sr-only"> to </span
                      >{{ field.after }}
                    </li>
                  }
                </ul>
              }
              @if (row.conflict !== null) {
                <p
                  class="mt-1 flex items-start gap-1.5 pl-6 text-xs"
                  [style.color]="'var(--gd-warn-fg)'"
                  data-testid="wt-branch-diff-conflict"
                >
                  <svg class="mt-px shrink-0" [lucideIcon]="AlertTriangle" aria-hidden="true" size="12"></svg>
                  {{ row.conflict }}
                </p>
              }
            </li>
          }
        </ul>
      </div>
    }
  `
})
export class WorkingTreeBranchDiffListComponent {
  /** `compareBranches()` 或 `previewMerge()` 的条目 */
  readonly entries = input.required<readonly (BranchDiffEntry | MergePreviewEntry)[]>();
  /** 合并的目标分支（当前分支）：覆盖说明里点名 */
  readonly target = input.required<string>();
  /** 滚动区的可读名 */
  readonly label = input.required<string>();
  /** 没有条目时的说明 */
  readonly emptyText = input('');

  readonly rows = computed(() => this.entries().map(entry => branchDiffRow(entry, this.target())));

  readonly opIcon = gdOpIcon;
  readonly opColor = gdOpColor;
  readonly opLabel = gdOpLabel;
  readonly pathColor = gdPathColor;
  readonly AlertTriangle = AlertTriangle;
}
