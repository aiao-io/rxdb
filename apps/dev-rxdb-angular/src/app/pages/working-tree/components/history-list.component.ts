import type { CommitLogEntry, CommitLogPage, WorkingTreeQueryState } from '@aiao/rxdb-plugin-working-tree';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideHistory as History, LucideDynamicIcon, LucideRotateCcw as RotateCcw } from '@lucide/angular';

/**
 * 「历史」标签页的提交列表，模仿 GitHub Desktop 的 History 列表。
 *
 * @remarks
 * 行可选中，右栏详情区跟随选中项。行是 `role="button"` 的 div 而不是 `<button>`：
 * 行内嵌着「恢复」这个真按钮，`<button>` 里再放 `<button>` 是非法嵌套，
 * axe 会报 `nested-interactive`。基线提交（`baseline` / `branch_baseline`）
 * 没有恢复按钮——恢复它们的语义是把内容写回工作树，而基线不是用户提交。
 */
@Component({
  selector: 'app-working-tree-history-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LucideDynamicIcon],
  styles: [
    `
      /* 宿主是 aside 的 flex 子项：与变更列表同一组规则（见 changes-list） */
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 1 0%;
        min-height: 0;
      }
    `
  ],
  template: `
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex shrink-0 items-center justify-between px-3 pt-2 pb-1">
        <h2
          class="text-base-content/80 flex items-center gap-1.5 text-xs font-semibold uppercase"
          id="wt-commits-heading"
        >
          <svg [lucideIcon]="History" size="13"></svg>
          历史（{{ activeBranch() }}）
        </h2>
        <button class="btn btn-ghost btn-xs" (click)="readCommits.emit()" data-testid="wt-list-commits" type="button">
          读取提交历史
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-live="polite" data-testid="wt-commits-result">
        @let commits = commitsState();
        <span class="text-base-content/80 px-1 text-xs" data-testid="wt-commits-phase">{{ commits.phase }}</span>
        @if (commits.phase === 'empty') {
          <p class="text-base-content/80 px-1 py-2 text-center text-xs">这条分支还没有提交</p>
        } @else if (commits.phase === 'success') {
          <ol class="space-y-0.5" data-testid="wt-commits-list">
            @for (entry of commits.value.entries; track entry.commitId) {
              <li>
                <div
                  class="focus-visible:ring-primary rounded-lg border px-2.5 py-2 transition-colors focus-visible:ring-2"
                  [attr.aria-selected]="selectedCommitId() === entry.commitId"
                  [attr.data-commit-id]="entry.commitId"
                  [class]="
                    selectedCommitId() === entry.commitId ?
                      'border-primary bg-primary/10'
                    : 'border-base-300 hover:bg-base-200'
                  "
                  (click)="selectEntry.emit(entry)"
                  (keydown.enter)="selectEntry.emit(entry)"
                  data-testid="wt-commit-item"
                  role="button"
                  tabindex="0"
                >
                  <div class="flex items-center gap-2.5">
                    <!-- GitHub Desktop 的作者头像：取 authorId 首字符画一个圆 -->
                    <span
                      class="bg-primary/15 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    >
                      {{ (entry.authorId ?? '?').charAt(0).toUpperCase() }}
                    </span>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center justify-between gap-2">
                        <span class="min-w-0 truncate text-sm">{{ entry.message }}</span>
                        @if (entry.kind !== 'baseline' && entry.kind !== 'branch_baseline') {
                          <button
                            class="btn btn-ghost btn-xs shrink-0 gap-1"
                            (click)="restore.emit(entry); $event.stopPropagation()"
                            data-testid="wt-restore"
                            title="把这份内容写回工作树，再提交或丢弃"
                            type="button"
                          >
                            <svg [lucideIcon]="RotateCcw" size="11"></svg>
                            恢复
                          </button>
                        }
                      </div>
                      <div class="text-base-content/80 mt-0.5 flex items-center gap-2 text-xs">
                        <span>{{ entry.authorId ?? '无作者' }}</span>
                        <span>·</span>
                        <span>{{ entry.createdAt.toLocaleString() }}</span>
                        <span>·</span>
                        <span>{{ entry.changeSetCount }} 个单元</span>
                        @if (entry.kind === 'baseline' || entry.kind === 'branch_baseline') {
                          <span class="badge badge-outline badge-xs">系统基线</span>
                        }
                        @if (entry.parentIds.length > 1) {
                          <span class="badge badge-outline badge-xs">合并节点</span>
                        }
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            }
          </ol>
        }
      </div>
    </div>
  `
})
export class WorkingTreeHistoryListComponent {
  readonly commitsState = input.required<WorkingTreeQueryState<CommitLogPage>>();
  readonly selectedCommitId = input<string | null>(null);
  readonly activeBranch = input('');

  readonly selectEntry = output<CommitLogEntry>();
  readonly restore = output<CommitLogEntry>();
  readonly readCommits = output<void>();

  readonly History = History;
  readonly RotateCcw = RotateCcw;
}
