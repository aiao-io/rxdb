import { RxDB, RxDBBranch } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { OverlayModule } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  model,
  signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideGitBranch as GitBranch, LucideDynamicIcon, LucidePlus as Plus } from '@lucide/angular';

@Component({
  selector: 'app-branch-manager',
  imports: [FormsModule, OverlayModule, LucideDynamicIcon],
  template: `
    <div class="flex items-center gap-1.5 p-1">
      <div class="join">
        <div>
          <span class="btn btn-xs join-item flex items-center px-2 text-xs">
            <svg [lucideIcon]="GitBranch" size="16"></svg>
          </span>
        </div>
        <select class="select select-xs join-item" [disabled]="$switching()" (change)="switchBranch($event)">
          @for (branch of branches.value(); track $index) {
            <option [selected]="branch.id === activeBranch()" [value]="branch.id">
              {{ branch.id }}
            </option>
          }
        </select>
      </div>

      @if ($switching()) {
        <span class="loading loading-spinner loading-xs pointer-events-none absolute right-6"></span>
      }

      <!-- 创建分支按钮 -->
      <button
        class="btn btn-xs btn-ghost btn-circle"
        #trigger="cdkOverlayOrigin"
        [disabled]="$switching()"
        (click)="togglePopover()"
        cdkOverlayOrigin
        title="创建分支"
      >
        <svg [lucideIcon]="Plus" size="16"></svg>
      </button>

      <!-- Popover 弹出框 (CDK Overlay) -->
      <ng-template
        [cdkConnectedOverlayBackdropClass]="'cdk-overlay-transparent-backdrop'"
        [cdkConnectedOverlayHasBackdrop]="true"
        [cdkConnectedOverlayOpen]="$showPopover()"
        [cdkConnectedOverlayOrigin]="trigger"
        [cdkConnectedOverlayPositions]="overlayPositions"
        (backdropClick)="closePopover()"
        cdkConnectedOverlay
      >
        <div class="bg-base-100 border-base-300 rounded-lg border p-3 shadow-xl">
          <div class="flex flex-col gap-2">
            <div class="text-xs font-medium">创建新分支</div>
            <input
              class="input input-sm input-bordered w-48"
              #popoverInput
              [(ngModel)]="$branchName"
              (keydown.enter)="createBranch($branchName())"
              (keydown.escape)="closePopover()"
              placeholder="输入分支名称"
              type="text"
            />
            <div class="flex justify-end gap-2">
              <button class="btn btn-ghost btn-sm" (click)="closePopover()">取消</button>
              <button
                class="btn btn-primary btn-sm"
                [disabled]="!$branchName().trim()"
                (click)="createBranch($branchName())"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      </ng-template>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BranchManager {
  #rxdb = inject(RxDB);

  $switching = model<boolean>(false);
  $branchName = model<string>('');
  $showPopover = signal(false);

  popoverInput = viewChild<ElementRef<HTMLInputElement>>('popoverInput');
  GitBranch = GitBranch;
  Plus = Plus;
  activeBranch = computed(() => this.branches.value().find(b => b.activated)?.id || '');

  branches = useFindAll(RxDBBranch, {
    where: {
      combinator: 'and',
      rules: []
    }
  });

  // CDK Overlay 定位策略：优先上方，其次下方
  overlayPositions = [
    {
      originX: 'start' as const,
      originY: 'top' as const,
      overlayX: 'start' as const,
      overlayY: 'bottom' as const,
      offsetY: -8
    },
    {
      originX: 'start' as const,
      originY: 'bottom' as const,
      overlayX: 'start' as const,
      overlayY: 'top' as const,
      offsetY: 8
    },
    {
      originX: 'end' as const,
      originY: 'top' as const,
      overlayX: 'end' as const,
      overlayY: 'bottom' as const,
      offsetY: -8
    },
    {
      originX: 'end' as const,
      originY: 'bottom' as const,
      overlayX: 'end' as const,
      overlayY: 'top' as const,
      offsetY: 8
    }
  ];

  constructor() {
    // 打开时聚焦输入框
    effect(() => {
      if (this.$showPopover()) {
        setTimeout(() => {
          this.popoverInput()?.nativeElement.focus();
        }, 0);
      }
    });
  }

  togglePopover() {
    this.$showPopover.update(v => !v);
  }

  closePopover() {
    this.$showPopover.set(false);
  }

  async createBranch(branchName: string) {
    if (!branchName.trim()) return;
    try {
      await this.#rxdb.versionManager.createBranch(branchName.trim());
      this.$branchName.set('');
      this.closePopover();
    } catch (error) {
      console.error(error);
    }
  }

  async switchBranch(event: Event) {
    const branch = (event.target as HTMLSelectElement).value;
    this.$switching.set(true);
    try {
      await this.#rxdb.versionManager.switchBranch(branch);
    } catch (error) {
      console.error(error);
    } finally {
      this.$switching.set(false);
    }
  }
}
