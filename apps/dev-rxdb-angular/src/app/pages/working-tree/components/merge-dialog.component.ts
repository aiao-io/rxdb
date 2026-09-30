import type { MergeStrategy } from '@aiao/rxdb';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAlertCircle as AlertCircle,
  LucideChevronRight as ChevronRight,
  LucideGitMerge as GitMerge,
  LucideDynamicIcon
} from '@lucide/angular';

/** 合并对话框的草稿状态；页面持有，本组件只做展示与转发。 */
export interface MergeDialogState {
  sourceBranchId: string;
  strategy: MergeStrategy;
  deleteSource: boolean;
}

/**
 * 合并对话框（从旧页面整体搬出，行为不变，视觉改为 GitHub Desktop 对话框形态：
 * 白面板圆角描边、标题 15px 半粗、蓝底白字主按钮、白底灰边取消）。
 *
 * @remarks
 * 背板是 `role="button"` + `tabindex="0"` 的 div：点背板或按 Escape 关闭。
 * 不用 `<dialog>` 元素——旧实现的焦点与扫读行为已被 a11y 用例验证过，
 * 换容器形态等于把那条用例的结论作废重验。
 */
@Component({
  selector: 'app-working-tree-merge-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  template: `
    @if (dialog(); as dialog) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        (click)="closeRequested.emit()"
        (keydown.escape)="closeRequested.emit()"
        aria-label="Close dialog"
        role="button"
        tabindex="0"
      >
        <div
          class="w-full max-w-md rounded-md border border-[var(--gd-border)] p-5 shadow-2xl"
          [style.background]="'var(--gd-panel)'"
          (click)="$event.stopPropagation()"
          (keydown)="$event.stopPropagation()"
          aria-modal="true"
          data-testid="wt-merge-dialog"
          role="dialog"
        >
          <div class="mb-4 flex items-center gap-2">
            <svg class="text-[var(--gd-accent)]" [lucideIcon]="GitMerge" size="18"></svg>
            <h2 class="text-[15px] font-semibold">Merge branch</h2>
          </div>

          <div
            class="mb-4 flex items-center gap-2 rounded border border-[var(--gd-border)] px-3 py-2 text-sm"
            [style.background]="'var(--gd-bg)'"
          >
            <span class="min-w-0 truncate font-mono font-medium text-amber-700">{{ dialog.sourceBranchId }}</span>
            <svg class="shrink-0" [lucideIcon]="ChevronRight" [style.color]="'var(--gd-muted)'" size="14"></svg>
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
            <button
              class="gd-btn-secondary"
              (click)="closeRequested.emit()"
              data-testid="wt-merge-cancel"
              type="button"
            >
              Cancel
            </button>
            <button class="gd-btn-primary" (click)="confirm.emit()" data-testid="wt-merge-confirm" type="button">
              <svg [lucideIcon]="GitMerge" size="13"></svg>
              Merge
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class WorkingTreeMergeDialogComponent {
  readonly dialog = input<MergeDialogState | null>(null);
  readonly activeBranch = input('');
  readonly error = input<string | null>(null);

  readonly closeRequested = output<void>();
  readonly strategyChange = output<MergeStrategy>();
  readonly deleteSourceChange = output<boolean>();
  readonly confirm = output<void>();

  readonly GitMerge = GitMerge;
  readonly ChevronRight = ChevronRight;
  readonly AlertCircle = AlertCircle;
}
