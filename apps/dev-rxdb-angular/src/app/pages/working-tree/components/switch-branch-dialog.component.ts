import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideGitBranch as GitBranch, LucideDynamicIcon } from '@lucide/angular';
import { WorkingTreeDialogShellComponent } from './dialog-shell.component';

/** 「Switch branch」对话框的状态；页面持有，本组件只做展示与转发。 */
export interface SwitchBranchDialogState {
  /** 要切去的分支 */
  readonly targetBranchId: string;
}

/**
 * 带着未提交改动切分支时的确认（GitHub Desktop 的「Switch branch」对话框，`stash-and-switch-branch-dialog.tsx`）。
 *
 * @remarks
 * GitHub Desktop 给两个去处：留在当前分支（stash）或带去新分支。这里只有前一个：未提交改动本来就按分支保存，
 * 切走再切回原样还在，正是「Leave my changes」的语义；「Bring my changes」库里没有，不给。
 * 外壳见 {@link WorkingTreeDialogShellComponent}。
 */
@Component({
  selector: 'app-working-tree-switch-branch-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, WorkingTreeDialogShellComponent],
  template: `
    @if (dialog(); as dialog) {
      <app-working-tree-dialog-shell
        (closeRequested)="closeRequested.emit()"
        labelledBy="wt-switch-title"
        testId="wt-switch-dialog"
      >
        <div class="mb-4 flex items-center gap-2">
          <svg class="text-[var(--gd-accent)]" [lucideIcon]="GitBranch" aria-hidden="true" size="18"></svg>
          <h2 class="text-[15px] font-semibold" id="wt-switch-title">Switch branch</h2>
        </div>

        <fieldset class="mb-4">
          <legend class="mb-1.5 text-sm">You have changes on this branch. What would you like to do with them?</legend>
          <label
            class="flex cursor-pointer items-start gap-3 rounded border px-3 py-2"
            [style.background]="'var(--gd-selected)'"
            [style.border-color]="'var(--gd-accent)'"
            data-testid="wt-switch-leave-option"
          >
            <input
              class="radio radio-sm mt-0.5"
              checked
              data-testid="wt-switch-leave"
              name="wt-switch-action"
              type="radio"
            />
            <span>
              <span class="block text-sm font-medium">Leave my changes on {{ activeBranch() }}</span>
              <!-- 换行写在文本里：元素之间的纯空白会被模板编译删掉，两行会在可读名里粘成一个词 -->
              <span class="mt-0.5 block text-xs" [style.color]="'var(--gd-muted)'">
                Your in-progress work will stay on this branch for you to return to later
              </span>
            </span>
          </label>
        </fieldset>

        <div class="flex justify-end gap-2">
          <button class="gd-btn-secondary" (click)="closeRequested.emit()" data-testid="wt-switch-cancel" type="button">
            Cancel
          </button>
          <button
            class="gd-btn-primary"
            [disabled]="switching()"
            (click)="confirmRequested.emit()"
            data-testid="wt-switch-confirm"
            type="button"
          >
            {{ switching() ? 'Switching…' : 'Switch branch' }}
          </button>
        </div>
      </app-working-tree-dialog-shell>
    }
  `
})
export class WorkingTreeSwitchBranchDialogComponent {
  readonly dialog = input<SwitchBranchDialogState | null>(null);
  /** 当前分支：改动留在它上面 */
  readonly activeBranch = input.required<string>();
  /** 切换进行中：确认按钮置灰 */
  readonly switching = input(false);

  /** 确认：把改动留在当前分支，切过去 */
  readonly confirmRequested = output<void>();
  readonly closeRequested = output<void>();

  readonly GitBranch = GitBranch;
}
