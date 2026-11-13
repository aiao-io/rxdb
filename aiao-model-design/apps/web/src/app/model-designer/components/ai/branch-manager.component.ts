import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitMerge,
  LucideAngularModule,
  X
} from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { BranchDiff } from '../../services/ai-branch.service';
import { BranchDiffViewComponent } from './branch-diff-view.component';

export interface BranchItem {
  id: string;
  parentId: string | null;
}

/**
 * 分支管理组件
 *
 * 显示合并方向（from → to）、变更详情（默认展开可折叠）、
 * 其他分支列表（切换/对比），以及确认合并/继续编辑/丢弃操作按钮。
 */
@Component({
  selector: 'lib-branch-manager',
  imports: [LucideAngularModule, BranchDiffViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (branchDiff()) {
      <div class="border-base-300 flex h-full w-full flex-col overflow-hidden rounded-lg border">
        <div class="item-center flex flex-row px-2 py-1">
          <button class="btn btn-xs btn-ghost items-center" (click)="toggleDiff()">
            <lucide-icon [img]="diffExpanded() ? ChevronDownIcon : ChevronRightIcon" size="12" />
          </button>
          <div class="flex flex-1 items-center gap-2 text-xs">
            <lucide-icon class="text-primary shrink-0" [img]="GitBranchIcon" size="16" />
            <span class="truncate font-mono font-medium">{{ currentBranchId() }}</span>
            @if (currentBranchId() !== 'main') {
              <lucide-icon class="text-base-content/40 shrink-0" [img]="ArrowRightIcon" size="14" />
              <span class="font-medium">{{ mergeTarget() }}</span>
            }
          </div>
          @if (currentBranchId() !== 'main') {
            <span class="ml-auto flex shrink-0 items-center gap-1" (mousedown)="$event.stopPropagation()">
              <button
                class="btn btn-primary btn-ghost btn-xs btn-square"
                [title]="t().ai.confirmMerge"
                (click)="confirmMerge.emit()"
              >
                <lucide-icon [img]="CheckIcon" size="14" />
              </button>
              <button
                class="btn btn-ghost btn-xs btn-square text-error"
                [title]="t().ai.discard"
                (click)="discardChanges.emit()"
              >
                <lucide-icon [img]="DiscardIcon" size="14" />
              </button>
            </span>
          }
        </div>
        @if (diffExpanded()) {
          <lib-branch-diff-view class="border-base-300 flex max-h-48 overflow-y-auto border-t" [diff]="branchDiff()" />
        }
      </div>
    }
  `
})
export class BranchManagerComponent {
  readonly #diffExpanded = signal(true);

  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly GitBranchIcon = GitBranch;
  protected readonly ArrowRightIcon = ArrowRight;
  protected readonly CompareIcon = ArrowLeftRight;
  protected readonly GitMergeIcon = GitMerge;
  protected readonly CheckIcon = Check;
  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly ChevronRightIcon = ChevronRight;
  protected readonly DiscardIcon = X;

  protected readonly diffExpanded = this.#diffExpanded.asReadonly();

  protected readonly mergeTarget = computed(() => {
    const current = this.branches().find(b => b.id === this.currentBranchId());
    return current?.parentId ?? 'main';
  });

  protected readonly otherBranches = computed(() => this.branches().filter(b => b.id !== this.currentBranchId()));

  protected readonly diffCount = computed(() => {
    const d = this.branchDiff();
    return d ? d.added.length + d.modified.length + d.deleted.length : 0;
  });

  protected readonly addedCount = computed(() => this.branchDiff()?.added.length ?? 0);
  protected readonly modifiedCount = computed(() => this.branchDiff()?.modified.length ?? 0);
  protected readonly deletedCount = computed(() => this.branchDiff()?.deleted.length ?? 0);

  readonly branches = input<BranchItem[]>([]);
  readonly currentBranchId = input('main');
  readonly branchDiff = input<BranchDiff | undefined>(undefined);

  readonly switchBranch = output<string>();
  readonly confirmMerge = output<void>();
  readonly discardChanges = output<void>();
  readonly compareBranch = output<string>();

  protected toggleDiff() {
    this.#diffExpanded.update(v => !v);
  }
}
