import type { BranchComparison } from '@aiao/rxdb-plugin-history';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideAlertCircle as AlertCircle,
  LucideChevronRight as ChevronRight,
  LucideGitCompare as GitCompare,
  LucideDynamicIcon
} from '@lucide/angular';
import { comparisonSummary, type BranchDiffLoad } from '../working-tree.branch-diff';
import { WorkingTreeBranchDiffListComponent } from './branch-diff-list.component';
import { WorkingTreeDialogShellComponent } from './dialog-shell.component';

/** 对比对话框的状态；页面持有，本组件只做展示。 */
export interface CompareDialogState {
  /** 拿来和当前分支对比的那条分支 */
  readonly branchId: string;
  readonly comparison: BranchDiffLoad<BranchComparison>;
}

/**
 * 分支对比对话框：不切换就看另一条分支与当前分支差在哪（`compareBranches(当前分支, 那条分支)`）。
 *
 * @remarks
 * 每个字段读作「当前分支上的值 → 那条分支上的值」；新增是只在那条分支上有的实体，删除是只在当前分支上有的。
 */
@Component({
  selector: 'app-working-tree-compare-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, WorkingTreeBranchDiffListComponent, WorkingTreeDialogShellComponent],
  template: `
    @if (dialog(); as dialog) {
      <app-working-tree-dialog-shell
        (closeRequested)="closeRequested.emit()"
        labelledBy="wt-compare-title"
        testId="wt-compare-dialog"
      >
        <div class="mb-4 flex items-center gap-2">
          <svg class="text-[var(--gd-accent)]" [lucideIcon]="GitCompare" aria-hidden="true" size="18"></svg>
          <h2 class="text-[15px] font-semibold" id="wt-compare-title">Compare branches</h2>
        </div>

        <div
          class="mb-4 flex items-center gap-2 rounded border border-[var(--gd-border)] px-3 py-2 text-sm"
          [style.background]="'var(--gd-bg)'"
        >
          <span class="min-w-0 truncate font-mono font-medium text-green-700">{{ activeBranch() }}</span>
          <svg
            class="shrink-0"
            [lucideIcon]="ChevronRight"
            [style.color]="'var(--gd-muted)'"
            aria-hidden="true"
            size="14"
          ></svg>
          <span class="min-w-0 truncate font-mono font-medium text-amber-700">{{ dialog.branchId }}</span>
        </div>

        @let comparison = dialog.comparison;
        <div class="mb-2 text-xs" aria-live="polite">
          @if (comparison.phase === 'loading') {
            <p [style.color]="'var(--gd-muted)'" data-testid="wt-compare-loading">Comparing…</p>
          } @else if (comparison.phase === 'error') {
            <p class="flex items-center gap-2" [style.color]="'var(--gd-del-fg)'" data-testid="wt-compare-error">
              <svg class="shrink-0" [lucideIcon]="AlertCircle" aria-hidden="true" size="13"></svg>
              {{ comparison.message }}
            </p>
          } @else {
            <p data-testid="wt-compare-summary">{{ summary(comparison.value) }}</p>
          }
        </div>

        @if (comparison.phase === 'success' && comparison.value.entries.length > 0) {
          <app-working-tree-branch-diff-list
            [entries]="comparison.value.entries"
            [label]="'Differences between ' + activeBranch() + ' and ' + dialog.branchId"
            [target]="activeBranch()"
          />
          <p class="mt-2 text-xs" [style.color]="'var(--gd-muted)'">
            Each field reads {{ activeBranch() }} → {{ dialog.branchId }}.
          </p>
        }

        <div class="mt-4 flex justify-end">
          <button class="gd-btn-secondary" (click)="closeRequested.emit()" data-testid="wt-compare-close" type="button">
            Close
          </button>
        </div>
      </app-working-tree-dialog-shell>
    }
  `
})
export class WorkingTreeCompareDialogComponent {
  readonly dialog = input<CompareDialogState | null>(null);
  readonly activeBranch = input.required<string>();

  readonly closeRequested = output<void>();

  readonly summary = comparisonSummary;
  readonly GitCompare = GitCompare;
  readonly ChevronRight = ChevronRight;
  readonly AlertCircle = AlertCircle;
}
