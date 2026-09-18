import type { CommitResult, WorkingTreeCommandState } from '@aiao/rxdb-plugin-working-tree';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideGitCommitHorizontal as GitCommitHorizontal,
  LucideDynamicIcon,
  LucideRotateCcw as RotateCcw
} from '@lucide/angular';

/**
 * 侧栏底部的提交框，模仿 GitHub Desktop 的 Summary / Description /「Commit to <branch>」。
 *
 * @remarks
 * 后端只收一个 `message`（见 `CommitOptions` 的 TSDoc），摘要与描述在这里合成
 * `summary + '\n\n' + description`——合成发生在页面提交时而不是本组件里，组件只负责
 * 两个草稿框。不做「摘要必填」的前置校验：空信息交给后端的 `empty_commit` 拒绝，
 * 让那条错误路径保持在 UI 上可见（e2e 就锁着这条）。
 */
@Component({
  selector: 'app-working-tree-commit-box',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  template: `
    <div class="border-base-300 shrink-0 space-y-2 border-t p-3" data-testid="wt-commit-box">
      @if (notice(); as notice) {
        <div class="alert alert-warning alert-soft py-2 text-sm" data-testid="wt-notice" role="alert">
          <span>{{ notice }}</span>
        </div>
      }
      <div class="space-y-1.5">
        <input
          class="input input-bordered input-sm w-full"
          [(ngModel)]="summary"
          aria-label="提交摘要（必填）"
          data-testid="wt-commit-message"
          placeholder="摘要（必填，无暂存区：提交全部未提交改动，相当于 git commit -am）"
          type="text"
        />
        <textarea
          class="textarea textarea-bordered textarea-sm w-full"
          [(ngModel)]="description"
          aria-label="提交描述（可选）"
          data-testid="wt-commit-description"
          placeholder="描述（可选）"
          rows="2"
        ></textarea>
      </div>
      <div class="flex gap-2">
        <button
          class="btn btn-primary btn-sm flex-1 gap-1"
          (click)="commit.emit()"
          data-testid="wt-commit"
          type="button"
        >
          <svg [lucideIcon]="GitCommitHorizontal" size="14"></svg>
          提交到 {{ activeBranch() || '…' }}
        </button>
        <button
          class="btn btn-sm gap-1"
          (click)="discard.emit()"
          data-testid="wt-discard"
          title="把工作树整体退回 HEAD"
          type="button"
        >
          <svg [lucideIcon]="RotateCcw" size="13"></svg>
          丢弃全部
        </button>
      </div>
      <div aria-live="polite" data-testid="wt-commit-result" role="status">
        <!-- 别名不能叫 commit：会遮蔽同名 output，让按钮的 commit.emit() 解析到状态对象上 -->
        @let commitResult = commitState();
        <span data-testid="wt-commit-phase">{{ commitResult.phase }}</span>
        @if (commitResult.phase === 'success') {
          <span data-testid="wt-commit-outcome">
            {{ commitResult.value.ok ? ' · 已提交' : ' · 并发冲突，可重试' }}
          </span>
        } @else if (commitResult.phase === 'error') {
          <span data-testid="wt-commit-error">· {{ commitResult.error.message }}</span>
        }
      </div>
    </div>
  `
})
export class WorkingTreeCommitBoxComponent {
  /** 提交摘要（message 的第一行）。 */
  readonly summary = model('');
  /** 可选描述（并入 message 第二段）。 */
  readonly description = model('');
  /** 目标分支名：按钮文案「提交到 <branch>」。 */
  readonly activeBranch = input('');
  readonly notice = input<string | null>(null);
  readonly commitState = input.required<WorkingTreeCommandState<CommitResult>>();

  readonly commit = output<void>();
  readonly discard = output<void>();

  readonly GitCommitHorizontal = GitCommitHorizontal;
  readonly RotateCcw = RotateCcw;
}
