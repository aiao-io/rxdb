import type { CommitLogEntry } from '@aiao/rxdb-plugin-working-tree';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideGitCommitHorizontal as GitCommitHorizontal,
  LucideDynamicIcon,
  LucideRotateCcw as RotateCcw
} from '@lucide/angular';

/**
 * 右栏的提交详情，对应 GitHub Desktop 历史里选中提交后的右侧视图。
 *
 * @remarks
 * 核心侧没有「提交的 diff」这条 API（`diff()` 的唯一轴是 `HEAD ↔ 工作树`，见插件包
 * diff.ts 头注），所以这里只展示提交的元信息与恢复入口——恢复是 v1 里唯一能把
 * 历史内容带回来的操作（写回工作树，不是 checkout）。恢复按钮的 testid 是
 * `wt-restore-detail` 而不是 `wt-restore`：列表行里的按钮也叫「恢复」，同名会让
 * e2e 的「最后一个恢复按钮 = 最早的用户提交」语义错位。
 */
@Component({
  selector: 'app-working-tree-commit-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LucideDynamicIcon],
  styles: [
    `
      /* 宿主是右栏 main 的 flex 子项：与 diff-viewer 同一组规则 */
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 1 0%;
        min-height: 0;
      }
    `
  ],
  template: `
    @if (commit(); as commit) {
      <div class="flex h-full min-h-0 flex-col" data-testid="wt-commit-detail">
        <div class="border-base-300 flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
          <svg class="text-primary" [lucideIcon]="GitCommitHorizontal" size="18"></svg>
          <span class="min-w-0 flex-1 truncate text-sm font-semibold" [title]="commit.message">{{
            commit.message
          }}</span>
          @if (commit.kind === 'baseline' || commit.kind === 'branch_baseline') {
            <span class="badge badge-outline badge-xs">系统基线</span>
          } @else {
            <span class="badge badge-outline badge-xs">提交</span>
          }
          @if (commit.parentIds.length > 1) {
            <span class="badge badge-outline badge-xs">合并节点</span>
          }
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <dl class="space-y-2 text-sm">
            <div class="flex gap-3">
              <dt class="text-base-content/80 w-20 shrink-0">作者</dt>
              <dd>{{ commit.authorId ?? '无作者' }}</dd>
            </div>
            <div class="flex gap-3">
              <dt class="text-base-content/80 w-20 shrink-0">时间</dt>
              <dd>{{ commit.createdAt.toLocaleString() }}</dd>
            </div>
            <div class="flex gap-3">
              <dt class="text-base-content/80 w-20 shrink-0">变更规模</dt>
              <dd>{{ commit.changeSetCount }} 个单元</dd>
            </div>
            <div class="flex gap-3">
              <dt class="text-base-content/80 w-20 shrink-0">提交 id</dt>
              <dd class="min-w-0 truncate font-mono text-xs" [title]="commit.commitId">{{ commit.commitId }}</dd>
            </div>
            <div class="flex gap-3">
              <dt class="text-base-content/80 w-20 shrink-0">父提交</dt>
              <dd class="min-w-0">
                @for (parentId of commit.parentIds; track parentId) {
                  <span class="bg-base-200 mr-1 inline-block rounded px-1 font-mono text-xs">{{ parentId }}</span>
                } @empty {
                  <span class="text-base-content/80">无（分支根）</span>
                }
              </dd>
            </div>
          </dl>
          <div class="border-base-300 mt-4 border-t pt-3">
            <p class="text-base-content/80 text-xs">
              恢复 = 把这个提交的内容写回工作树（不是 checkout），之后再提交或丢弃。
            </p>
            @if (commit.kind !== 'baseline' && commit.kind !== 'branch_baseline') {
              <button
                class="btn btn-sm btn-outline btn-primary mt-2 gap-1"
                (click)="restore.emit(commit)"
                data-testid="wt-restore-detail"
                type="button"
              >
                <svg [lucideIcon]="RotateCcw" size="13"></svg>
                恢复这个版本到工作树
              </button>
            }
          </div>
        </div>
      </div>
    } @else {
      <div class="text-base-content/60 flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <svg class="text-base-content/40" [lucideIcon]="GitCommitHorizontal" size="40"></svg>
        <p class="text-sm">从左侧选择一条提交，这里展示它的详情</p>
      </div>
    }
  `
})
export class WorkingTreeCommitDetailComponent {
  readonly commit = input<CommitLogEntry | null>(null);

  readonly restore = output<CommitLogEntry>();

  readonly GitCommitHorizontal = GitCommitHorizontal;
  readonly RotateCcw = RotateCcw;
}
