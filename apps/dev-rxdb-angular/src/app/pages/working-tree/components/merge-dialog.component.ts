import type { MergeStrategy } from '@aiao/rxdb';
import type { MergePreview } from '@aiao/rxdb-plugin-history';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAlertCircle as AlertCircle,
  LucideChevronRight as ChevronRight,
  LucideGitMerge as GitMerge,
  LucideDynamicIcon
} from '@lucide/angular';
import { mergePreviewSummary, type BranchDiffLoad } from '../working-tree.branch-diff';
import { WorkingTreeBranchDiffListComponent } from './branch-diff-list.component';
import { WorkingTreeDialogShellComponent } from './dialog-shell.component';

/** 合并对话框的草稿状态；页面持有，本组件只做展示与转发。 */
export interface MergeDialogState {
  sourceBranchId: string;
  strategy: MergeStrategy;
  deleteSource: boolean;
}

/**
 * 合并对话框（视觉为 GitHub Desktop 对话框形态：白面板圆角描边、标题 15px 半粗、蓝底白字主按钮、白底灰边取消）。
 *
 * @remarks
 * 打开即显示预览（`previewMerge()`）：一句摘要（落多少条，跟着策略变）+ 将落的增删改，撞上当前分支分叉以来
 * 改动的条目带覆盖说明。预览是只读的参考，读失败只显示错误，合并照常可点。外壳见 {@link WorkingTreeDialogShellComponent}。
 */
@Component({
  selector: 'app-working-tree-merge-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    LucideDynamicIcon,
    WorkingTreeBranchDiffListComponent,
    WorkingTreeDialogShellComponent
  ],
  template: `
    @if (dialog(); as dialog) {
      <app-working-tree-dialog-shell
        (closeRequested)="closeRequested.emit()"
        labelledBy="wt-merge-title"
        testId="wt-merge-dialog"
      >
        <div class="mb-4 flex items-center gap-2">
          <svg class="text-[var(--gd-accent)]" [lucideIcon]="GitMerge" aria-hidden="true" size="18"></svg>
          <h2 class="text-[15px] font-semibold" id="wt-merge-title">Merge branch</h2>
        </div>

        <div
          class="mb-4 flex items-center gap-2 rounded border border-[var(--gd-border)] px-3 py-2 text-sm"
          [style.background]="'var(--gd-bg)'"
        >
          <span class="min-w-0 truncate font-mono font-medium text-amber-700">{{ dialog.sourceBranchId }}</span>
          <svg
            class="shrink-0"
            [lucideIcon]="ChevronRight"
            [style.color]="'var(--gd-muted)'"
            aria-hidden="true"
            size="14"
          ></svg>
          <span class="min-w-0 truncate font-mono font-medium text-green-700">{{ activeBranch() }}</span>
        </div>

        <div class="mb-4">
          <span class="mb-1.5 block text-sm font-medium">Merge strategy</span>
          <div class="flex gap-2">
            <button
              class="flex-1 rounded border px-3 py-2 text-left text-sm transition-colors"
              [style.background]="dialog.strategy === 'squash' ? 'var(--gd-selected)' : 'var(--gd-panel)'"
              [style.border-color]="dialog.strategy === 'squash' ? 'var(--gd-accent)' : 'var(--gd-border)'"
              (click)="strategyChange.emit('squash')"
              data-testid="wt-merge-strategy-squash"
              type="button"
            >
              <div class="font-medium">Squash</div>
              <div class="mt-0.5 text-xs" [style.color]="'var(--gd-muted)'">
                Squash into a minimal change set, filtering ghost operations
              </div>
            </button>
            <button
              class="flex-1 rounded border px-3 py-2 text-left text-sm transition-colors"
              [style.background]="dialog.strategy === 'normal' ? 'var(--gd-selected)' : 'var(--gd-panel)'"
              [style.border-color]="dialog.strategy === 'normal' ? 'var(--gd-accent)' : 'var(--gd-border)'"
              (click)="strategyChange.emit('normal')"
              data-testid="wt-merge-strategy-normal"
              type="button"
            >
              <div class="font-medium">Normal</div>
              <div class="mt-0.5 text-xs" [style.color]="'var(--gd-muted)'">
                Apply each change separately, keeping individual change records
              </div>
            </button>
          </div>
        </div>

        <section class="mb-4" aria-labelledby="wt-merge-preview-title" data-testid="wt-merge-preview">
          <h3 class="mb-1.5 text-sm font-medium" id="wt-merge-preview-title">Preview</h3>
          @let previewState = preview();
          <div class="mb-2 text-xs" aria-live="polite">
            @if (previewState.phase === 'loading') {
              <p [style.color]="'var(--gd-muted)'" data-testid="wt-merge-preview-loading">Loading preview…</p>
            } @else if (previewState.phase === 'error') {
              <p
                class="flex items-center gap-2"
                [style.color]="'var(--gd-del-fg)'"
                data-testid="wt-merge-preview-error"
              >
                <svg class="shrink-0" [lucideIcon]="AlertCircle" aria-hidden="true" size="13"></svg>
                Preview unavailable: {{ previewState.message }}
              </p>
            } @else {
              <p data-testid="wt-merge-preview-summary">{{ summary(previewState.value) }}</p>
            }
          </div>
          @if (previewState.phase === 'success' && previewState.value.merged > 0) {
            <app-working-tree-branch-diff-list
              [emptyText]="'These changes cancel out; nothing on ' + activeBranch() + ' changes.'"
              [entries]="previewState.value.entries"
              [target]="activeBranch()"
              label="Merge preview"
            />
          }
        </section>

        <label class="mb-2 flex cursor-pointer items-center gap-3">
          <input
            class="checkbox checkbox-sm"
            [ngModel]="dialog.deleteSource"
            (ngModelChange)="deleteSourceChange.emit($event)"
            data-testid="wt-merge-delete-source"
            type="checkbox"
          />
          <span class="text-sm">
            Delete source branch after merging
            <code class="text-xs opacity-70">{{ dialog.sourceBranchId }}</code>
          </span>
        </label>

        <p class="mb-4 text-xs" [style.color]="'var(--gd-muted)'">
          The result lands in the
          <strong>working tree</strong>
          of
          {{ activeBranch() }}
          (like
          <code>git merge --no-commit</code>
          ) and enters history only after a commit.
        </p>

        @if (error()) {
          <div
            class="mb-4 flex items-center gap-2 rounded border border-red-300 p-2 text-sm text-red-700"
            data-testid="wt-merge-error"
          >
            <svg class="shrink-0" [lucideIcon]="AlertCircle" size="15"></svg>
            {{ error() }}
          </div>
        }

        <div class="flex justify-end gap-2">
          <button class="gd-btn-secondary" (click)="closeRequested.emit()" data-testid="wt-merge-cancel" type="button">
            Cancel
          </button>
          <button class="gd-btn-primary" (click)="confirm.emit()" data-testid="wt-merge-confirm" type="button">
            <svg [lucideIcon]="GitMerge" size="13"></svg>
            Merge
          </button>
        </div>
      </app-working-tree-dialog-shell>
    }
  `
})
export class WorkingTreeMergeDialogComponent {
  readonly dialog = input<MergeDialogState | null>(null);
  readonly activeBranch = input('');
  /** 按当前策略读的合并预览；读失败不挡合并 */
  readonly preview = input<BranchDiffLoad<MergePreview>>({ phase: 'loading' });
  readonly error = input<string | null>(null);

  readonly closeRequested = output<void>();
  readonly strategyChange = output<MergeStrategy>();
  readonly deleteSourceChange = output<boolean>();
  readonly confirm = output<void>();

  readonly summary = mergePreviewSummary;
  readonly GitMerge = GitMerge;
  readonly ChevronRight = ChevronRight;
  readonly AlertCircle = AlertCircle;
}
