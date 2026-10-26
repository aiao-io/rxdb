import type { BranchComparison } from '@aiao/rxdb-plugin-history';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideAlertCircle as AlertCircle,
  LucideGitCompare as GitCompare,
  LucideGitMerge as GitMerge,
  LucideDynamicIcon,
  LucideX as X
} from '@lucide/angular';
import { comparisonSummary, type BranchDiffLoad } from '../working-tree.branch-diff';
import { WorkingTreeBranchDiffListComponent } from './branch-diff-list.component';

/** History 顶部对比栏的状态；页面持有，本组件只做展示与转发。 */
export interface HistoryCompareState {
  /** 拿来和当前分支对比的那条分支 */
  readonly branchId: string;
  readonly comparison: BranchDiffLoad<BranchComparison>;
}

/**
 * History 顶部的分支对比（GitHub Desktop 的「Select branch to compare…」，`history/compare.tsx`）。
 *
 * @remarks
 * 选一条分支，不切换就看它与当前分支差在哪（`compareBranches(当前分支, 那条分支)`）：每个字段读作
 * 「当前分支上的值 → 那条分支上的值」，新增是只在那条分支上有的实体，删除是只在当前分支上有的。
 * GitHub Desktop 在这里列 Behind / Ahead 的提交；这里的对比按实体给差异，所以列差异，底部同样给
 * 「Merge into 当前分支」。对比进行时页面收起提交列表，清除即回到历史。
 *
 * 选分支用原生 `<select>`：键盘、读屏与触屏都由浏览器给，不必自绘一个组合框。
 */
@Component({
  selector: 'app-working-tree-history-compare',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, WorkingTreeBranchDiffListComponent],
  styles: [
    `
      /* 对比栏与结果区直接当 aside 的 flex 子项：结果区的 flex-1 / min-h-0 / overflow 才在侧栏里生效。
         不用 history-list 那套 flex: 1——没在对比时它会和提交列表平分侧栏高度 */
      :host {
        display: contents;
      }
    `
  ],
  template: `
    <div class="flex shrink-0 items-center gap-2 border-b px-3 py-2" [style.border-color]="'var(--gd-border)'">
      <svg
        class="shrink-0"
        [lucideIcon]="GitCompare"
        [style.color]="'var(--gd-muted)'"
        aria-hidden="true"
        size="14"
      ></svg>
      <select
        class="gd-input min-w-0 flex-1"
        [disabled]="branches().length === 0"
        (change)="onSelect($event)"
        aria-label="Select branch to compare"
        data-testid="wt-compare-select"
      >
        <option [selected]="compare() === null" value="">
          {{ branches().length === 0 ? 'No branches to compare' : 'Select branch to compare…' }}
        </option>
        @for (branchId of branches(); track branchId) {
          <option [selected]="compare()?.branchId === branchId" [value]="branchId">{{ branchId }}</option>
        }
      </select>
      @if (compare()) {
        <button
          class="gd-icon-btn shrink-0"
          (click)="clearRequested.emit()"
          aria-label="Clear branch comparison"
          data-testid="wt-compare-clear"
          title="Back to history"
          type="button"
        >
          <svg [lucideIcon]="X" size="14"></svg>
        </button>
      }
    </div>

    @if (compare(); as compare) {
      @let comparison = compare.comparison;
      <!-- 可读名不能与里面差异列表的滚动区同名：两个同名地标是 axe landmark-unique -->
      <section
        class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
        [attr.aria-label]="'Compare ' + activeBranch() + ' with ' + compare.branchId"
        data-testid="wt-compare-view"
      >
        <div class="text-xs" aria-live="polite">
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
            [label]="'Differences between ' + activeBranch() + ' and ' + compare.branchId"
            [target]="activeBranch()"
          />
          <p class="text-xs" [style.color]="'var(--gd-muted)'">
            Each field reads {{ activeBranch() }} → {{ compare.branchId }}.
          </p>
        }

        <button
          class="gd-btn-primary mt-1 self-start"
          (click)="mergeRequest.emit(compare.branchId)"
          data-testid="wt-compare-merge"
          type="button"
        >
          <svg [lucideIcon]="GitMerge" size="13"></svg>
          Merge into <strong>{{ activeBranch() }}</strong>
        </button>
      </section>
    }
  `
})
export class WorkingTreeHistoryCompareComponent {
  /** 当前分支 */
  readonly activeBranch = input.required<string>();
  /** 能拿来对比的分支（当前分支以外的） */
  readonly branches = input.required<readonly string[]>();
  /** 正在对比的那条与对比结果；没在对比时是 `null` */
  readonly compare = input<HistoryCompareState | null>(null);

  /** 选了一条分支：页面读对比 */
  readonly selectBranch = output<string>();
  /** 清除对比：回到历史 */
  readonly clearRequested = output<void>();
  /** 把这条分支合并进当前分支：页面打开合并对话框 */
  readonly mergeRequest = output<string>();

  readonly summary = comparisonSummary;
  readonly AlertCircle = AlertCircle;
  readonly GitCompare = GitCompare;
  readonly GitMerge = GitMerge;
  readonly X = X;

  onSelect(event: Event): void {
    const branchId = (event.target as HTMLSelectElement).value;
    if (branchId === '') this.clearRequested.emit();
    else this.selectBranch.emit(branchId);
  }
}
