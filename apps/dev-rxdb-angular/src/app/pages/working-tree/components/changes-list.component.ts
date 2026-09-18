import type { WorkingTreeDiff, WorkingTreeDiffEntry, WorkingTreeQueryState } from '@aiao/rxdb-plugin-working-tree';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideCircleDot as CircleDot,
  LucideFileDiff as FileDiff,
  LucideDynamicIcon,
  LucideMinusCircle as MinusCircle,
  LucidePlusCircle as PlusCircle
} from '@lucide/angular';
import { diffEntryKey, formatPatchSummary } from '../working-tree.diff-format';

/**
 * 「变更」标签页的文件列表，模仿 GitHub Desktop 的 Changes 列表。
 *
 * @remarks
 * 一条实体记录在这里就是**一个文件**：文件名 = `实体#主键`，图标与 GitHub Desktop
 * 同语义（＋ 新增 / • 修改 / － 删除），灰色的第二行是字段级补丁摘要——对应
 * GitHub Desktop 里文件名下方那条灰色路径。数据本身在别的页面（如 /todo）产生，
 * 本页只负责「看」。
 *
 * 行是**可选中**的（选中键 = `diffEntryKey`），右栏的详情区跟随选中项——
 * 这正是 GitHub Desktop「左边点文件、右边看 diff」的轴。行用 `role="button"` 的
 * div 而不是 `<button>`：模板里没有嵌套按钮，但保持与历史列表同一种键盘形态
 * （Enter 选中），让两个列表的 a11y 行为一致。
 *
 * 没有暂存区（v1 硬裁决），所以行上没有 GitHub Desktop 的勾选框——列表只做「看」，
 * 「提交哪些」由提交框那句「提交全部未提交改动」说清。
 */
@Component({
  selector: 'app-working-tree-changes-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LucideDynamicIcon],
  styles: [
    `
      /* 宿主是 aside 的 flex 子项：默认 display:inline 会让根 div 的 flex-1/min-h-0
         失效，列表一多就把底部提交框挤下去而不是内部滚动 */
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
          id="wt-changes-heading"
        >
          <svg [lucideIcon]="FileDiff" size="13"></svg>
          未提交改动
        </h2>
        <button class="btn btn-ghost btn-xs" (click)="readDiff.emit()" data-testid="wt-diff" type="button">读取</button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-live="polite" data-testid="wt-diff-result">
        @let diff = diffState();
        <span class="text-base-content/80 px-1 text-xs" data-testid="wt-diff-phase">{{ diff.phase }}</span>
        @if (diff.phase === 'empty') {
          <p class="text-base-content/80 px-1 py-2 text-center text-xs">没有未提交的改动</p>
        } @else if (diff.phase === 'success') {
          <ul class="space-y-0.5" data-testid="wt-diff-list">
            @for (entry of diff.value.entries; track diffEntryKey(entry)) {
              <li>
                <div
                  class="focus-visible:ring-primary rounded-lg border px-2.5 py-1.5 transition-colors focus-visible:ring-2"
                  [attr.aria-current]="selectedKey() === diffEntryKey(entry) ? 'true' : null"
                  [attr.data-diff-key]="diffEntryKey(entry)"
                  [class]="
                    selectedKey() === diffEntryKey(entry) ?
                      'border-primary bg-primary/10'
                    : 'border-base-300 hover:bg-base-200'
                  "
                  (click)="selectEntry.emit(entry)"
                  (keydown.enter)="selectEntry.emit(entry)"
                  data-testid="wt-diff-item"
                  role="button"
                  tabindex="0"
                >
                  <div class="flex items-center gap-2">
                    <svg
                      class="shrink-0"
                      [class.text-amber-700]="entry.operation === 'update'"
                      [class.text-green-700]="entry.operation === 'insert'"
                      [class.text-red-700]="entry.operation === 'delete'"
                      [lucideIcon]="opIcon(entry.operation)"
                      size="14"
                    ></svg>
                    <span class="min-w-0 flex-1 truncate text-sm font-medium"
                      >{{ entry.entity }}#{{ entry.entityId }}</span
                    >
                    @if (entry.origin === 'remote_sync') {
                      <span class="badge badge-outline badge-xs shrink-0">远端同步</span>
                    }
                  </div>
                  <div class="text-base-content/80 truncate pl-[22px] font-mono text-xs">
                    {{ formatPatchSummary(entry) }}
                  </div>
                </div>
              </li>
            }
          </ul>
        }
      </div>
    </div>
  `
})
export class WorkingTreeChangesListComponent {
  readonly diffState = input.required<WorkingTreeQueryState<WorkingTreeDiff>>();
  readonly selectedKey = input<string | null>(null);

  readonly selectEntry = output<WorkingTreeDiffEntry>();
  readonly readDiff = output<void>();

  readonly FileDiff = FileDiff;
  readonly diffEntryKey = diffEntryKey;
  readonly formatPatchSummary = formatPatchSummary;

  /** GitHub Desktop 的文件状态图标：新增 ＋ / 修改 • / 删除 －。 */
  opIcon(operation: WorkingTreeDiffEntry['operation']) {
    return (
      operation === 'insert' ? PlusCircle
      : operation === 'delete' ? MinusCircle
      : CircleDot
    );
  }
}
