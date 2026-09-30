import type { CommitLogEntry, CommitLogPage, WorkingTreeQueryState } from '@aiao/rxdb-plugin-working-tree';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideHistory as History, LucideDynamicIcon } from '@lucide/angular';
import { gdAvatarColor, gdAvatarInitial, gdRelativeTime } from '../working-tree.gd';
import type { WorkingTreeContextMenuRequest } from './changes-list.component';

/**
 * 「历史记录」标签页的提交列表，模仿 GitHub Desktop 的 History 列表。
 *
 * @remarks
 * 第一行是提交标题，第二行是作者头像、作者与时间；选择后右侧显示文件与补丁。
 * 行可选中，右栏详情区跟随选中项，选中行是 3px 蓝左边条 + 浅蓝底（`.gd-row`）。
 * GitHub Desktop 的历史行上没有「恢复」按钮（右栏详情区也没有），恢复入口只在
 * 行的右键菜单里——行因此回到与变更列表同一种形态：`role="button"` 的 div + Enter。
 * 基线提交（`baseline` / `branch_baseline`）不可恢复——恢复它们的语义是把内容
 * 写回工作树，而基线不是用户提交。
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
      <div class="min-h-0 flex-1 overflow-y-auto" aria-live="polite" data-testid="wt-commits-result">
        @let commits = commitsState();
        <!-- 相位是给 e2e / 读屏的读数，不是给眼睛的 UI：sr-only -->
        <span class="sr-only" data-testid="wt-commits-phase">{{ commits.phase }}</span>
        @if (commits.phase === 'empty') {
          <div class="gd-empty py-10 text-xs">
            <svg class="text-[var(--gd-line-num)]" [lucideIcon]="History" size="28"></svg>
            <p>No commits on this branch yet</p>
          </div>
        } @else if (commits.phase === 'success') {
          <ol data-testid="wt-commits-list">
            @for (entry of commits.value.entries; track entry.commitId) {
              <li>
                <div
                  class="gd-row gd-history-row"
                  [attr.aria-current]="selectedCommitId() === entry.commitId ? 'true' : null"
                  [attr.data-commit-id]="entry.commitId"
                  [class.gd-row-selected]="selectedCommitId() === entry.commitId"
                  (click)="selectEntry.emit(entry)"
                  (contextmenu)="menuRequest.emit({ target: entry, event: $event })"
                  (keydown.enter)="selectEntry.emit(entry)"
                  data-testid="wt-commit-item"
                  role="button"
                  tabindex="0"
                >
                  <div class="min-w-0 flex-1">
                    <div class="min-w-0 truncate text-[13px] font-semibold" [title]="entry.message">
                      {{
                        entry.message.split(
                          '
',
                          1
                        )[0]
                      }}
                    </div>
                    <div class="mt-1 flex items-center gap-1.5 text-[11px]" [style.color]="'var(--gd-muted)'">
                      <span
                        class="gd-avatar text-[9px]"
                        [style.background]="gdAvatarColor(entry.authorId ?? '?')"
                        [style.height.px]="14"
                        [style.width.px]="14"
                      >
                        {{ gdAvatarInitial(entry.authorId ?? '?') }}
                      </span>
                      <span class="min-w-0 truncate">{{ entry.authorId ?? 'No author' }}</span>
                      <span>·</span>
                      <!-- GitHub Desktop 的 TimeAgo：相对时间展示，完整时间戳留在悬停 title -->
                      <span class="min-w-0 truncate" [title]="entry.createdAt.toLocaleString()">{{
                        gdRelativeTime(entry.createdAt)
                      }}</span>
                      @if (entry.kind === 'baseline' || entry.kind === 'branch_baseline') {
                        <span class="shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]"
                          >Baseline</span
                        >
                      }
                      @if (entry.parentIds.length > 1) {
                        <span class="shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]"
                          >Merge</span
                        >
                      }
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

  readonly selectEntry = output<CommitLogEntry>();
  /** 行上右键；页面按条目拼菜单（复制 / 恢复）。 */
  readonly menuRequest = output<WorkingTreeContextMenuRequest<CommitLogEntry>>();

  readonly History = History;
  readonly gdAvatarColor = gdAvatarColor;
  readonly gdAvatarInitial = gdAvatarInitial;
  readonly gdRelativeTime = gdRelativeTime;
}
