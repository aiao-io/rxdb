import type { CommitResult, WorkingTreeCommandState } from '@aiao/rxdb-plugin-working-tree';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon, LucideRefreshCw as RefreshCw } from '@lucide/angular';
import { gdAvatarColor, gdAvatarInitial } from '../working-tree.gd';

/**
 * 侧栏底部的提交框，模仿 GitHub Desktop 的 Summary / Description /「Commit to <branch>」。
 *
 * @remarks
 * 布局与交互逐条对照过 desktop/desktop 的 `commit-message.tsx`：
 * - 第一行头像 + 单行摘要（GitHub Desktop 的 Summary 是 `AutocompletingInput`，不是会
 *   自增高的 textarea）；描述整宽压下来，**左缘与头像左缘对齐**（description 容器
 *   是 summary 行的兄弟而不是嵌套，GitHub Desktop 同款）；描述 `min-height: 100px`、
 *   禁拖拽（`.description-focus-container`）。
 * - 提交按钮**通栏**（`.commit-button` 继承 GitHub Desktop 按钮的 100% 宽），**没有图标**：
 *   只有「提交到 <branch>」文字，提交中才亮 spinner（GitHub Desktop 的 `<Loading />`），
 *   摘要为空时**禁用**（`isSummaryBlank`，tooltip 原文 "A commit summary is required to
 *   commit"），两个输入框提交中只读。
 * - 没有可见的「已提交 / idle」状态行：GitHub Desktop 的成功反馈是 **sr-only** 的
 *   `aria-live` 播报（"Committed Just now - …"），本组件同样只留一条读屏播报；
 *   失败由页面层弹 toast（GitHub Desktop 的提交失败是对话框，demo 的对应物是 toast）。
 * 后端只收一个 `message`（见 `CommitOptions` 的 TSDoc），摘要与描述在这里合成
 * `summary + '\n\n' + description`——合成发生在页面提交时而不是本组件里，组件只负责
 * 两个草稿框。
 */
@Component({
  selector: 'app-working-tree-commit-box',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  styles: [
    `
      /* 宿主是 aside 的 flex 子项：shrink-0 必须挂在宿主上才拦得住列表的挤压 */
      :host {
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
      }
    `
  ],
  template: `
    <div
      class="shrink-0 space-y-2 border-t p-3"
      [style.background]="'var(--gd-bg)'"
      [style.border-color]="'var(--gd-border)'"
      data-testid="wt-commit-box"
    >
      @if (notice(); as notice) {
        <div class="gd-warn-strip rounded" data-testid="wt-notice" role="alert">
          <span>{{ notice }}</span>
        </div>
      }
      @let commitResult = commitState();
      @let isCommitting = commitResult.phase === 'loading';
      @let summaryBlank = summary().trim() === '';
      <!-- 第一行：头像 + 单行摘要；描述整宽压下来，左缘与头像左缘对齐（GitHub Desktop 同款）。 -->
      <div class="flex gap-2">
        <span
          class="gd-avatar text-[11px]"
          [style.background]="gdAvatarColor(authorId())"
          [style.height.px]="25"
          [style.width.px]="25"
          [title]="authorId()"
        >
          {{ gdAvatarInitial(authorId()) }}
        </span>
        <input
          class="gd-input min-w-0 flex-1"
          [(ngModel)]="summary"
          [readOnly]="isCommitting"
          aria-label="提交摘要（必填）"
          data-testid="wt-commit-message"
          placeholder="摘要（必填）"
          type="text"
        />
      </div>
      <textarea
        class="gd-input min-h-[100px]"
        [(ngModel)]="description"
        [readOnly]="isCommitting"
        aria-label="提交描述（可选）"
        data-testid="wt-commit-description"
        placeholder="描述"
      ></textarea>
      <button
        class="gd-btn-primary w-full"
        [disabled]="summaryBlank || isCommitting"
        [title]="
          isCommitting ? '提交中…'
          : summaryBlank ? '填写摘要后才能提交'
          : '无暂存区：提交全部未提交改动，相当于 git commit -am'
        "
        (click)="commit.emit()"
        data-testid="wt-commit"
        type="button"
      >
        <!-- GitHub Desktop 的提交按钮没有图标：只有文字，提交中才亮 spinner（<Loading />）。 -->
        @if (isCommitting) {
          <svg class="animate-spin" [lucideIcon]="RefreshCw" size="13"></svg>
        }
        提交到 {{ activeBranch() || '…' }}
      </button>
      <!-- GitHub Desktop 的提交成功对眼睛不可见：同款 sr-only 播报，读屏专用。 -->
      <span class="sr-only" aria-atomic="true" aria-live="polite" data-testid="wt-commit-live" role="status">
        @if (commitResult.phase === 'success' && commitResult.value.ok) {
          已提交
        }
      </span>
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
  /** 头像圆的作者名；demo 的写者固定是 `demo-author`。 */
  readonly authorId = input('demo-author');
  readonly notice = input<string | null>(null);
  readonly commitState = input.required<WorkingTreeCommandState<CommitResult>>();

  readonly commit = output<void>();

  readonly RefreshCw = RefreshCw;
  readonly gdAvatarColor = gdAvatarColor;
  readonly gdAvatarInitial = gdAvatarInitial;
}
