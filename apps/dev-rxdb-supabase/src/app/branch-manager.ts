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
  signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideGitBranch as GitBranch, LucideDynamicIcon, LucidePlus as Plus } from '@lucide/angular';
import { getErrorMessage } from './error-message';

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
        <select
          class="select select-xs join-item"
          [disabled]="$switching()"
          [ngModel]="activeBranch()"
          (ngModelChange)="switchBranch($event)"
        >
          @for (branch of branches.value(); track branch.id) {
            <option [value]="branch.id">
              {{ branch.id }}
            </option>
          }
        </select>
      </div>

      @if ($switching()) {
        <span class="loading loading-spinner loading-xs pointer-events-none absolute right-6"></span>
      }

      @if ($branchError()) {
        <span class="text-error max-w-48 truncate text-xs" role="alert">{{ $branchError() }}</span>
      }

      <!-- 创建分支按钮 -->
      <button
        class="btn btn-xs btn-ghost btn-circle"
        #trigger="cdkOverlayOrigin"
        [disabled]="$switching() || $creating()"
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
                [disabled]="!$branchName().trim() || $creating()"
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
  readonly #rxdb = inject(RxDB);

  // P2-4：这两个原先是 `model()`。`model()` 表示"这是一个可被父组件双向绑定的输入"，
  // 会在组件公共 API 上多出 `$switching` / `$switchingChange` 两个契约。
  // 但宿主 `app-sidebar.ts:36` 写的是 `<app-branch-manager></app-branch-manager>` —— 零绑定，
  // 根本没有外部写入需求。对纯内部状态用 `model()` 是在对外承诺一个不存在的接口。
  readonly $switching = signal(false);
  readonly $creating = signal(false);
  readonly $branchName = signal('');
  readonly $showPopover = signal(false);
  readonly $branchError = signal<string | null>(null);

  readonly popoverInput = viewChild<ElementRef<HTMLInputElement>>('popoverInput');
  readonly GitBranch = GitBranch;
  readonly Plus = Plus;
  // P2-4：原先是 `?.id || ''`。空串把"没有激活分支"和"分支 id 恰好是空串"压成同一个值，
  // 模板无法区分两者。用 `null` 显式表达"没有"，撞上仓库"无 fallback 兜底"的铁律。
  readonly activeBranch = computed(() => this.branches.value().find(b => b.activated)?.id ?? null);

  readonly branches = useFindAll(RxDBBranch, {
    where: {
      combinator: 'and',
      rules: []
    }
  });

  // CDK Overlay 定位策略：优先上方，其次下方
  readonly overlayPositions = [
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
    // 打开时聚焦输入框。
    // P2-4：`effect` 会随注入上下文销毁，但**它排出去的 setTimeout 不会** ——
    // 组件销毁后那个 0ms 回调照样跑。用 onCleanup 在 effect 重跑/销毁时取消。
    effect(onCleanup => {
      if (!this.$showPopover()) return;
      const timer = window.setTimeout(() => {
        this.popoverInput()?.nativeElement.focus();
      }, 0);
      onCleanup(() => clearTimeout(timer));
    });
  }

  togglePopover() {
    this.$showPopover.update(v => !v);
  }

  closePopover() {
    this.$showPopover.set(false);
  }

  async createBranch(branchName: string) {
    const normalizedName = branchName.trim();
    if (!normalizedName || this.$creating()) return;
    this.$creating.set(true);
    this.$branchError.set(null);
    try {
      await this.#rxdb.versionManager.createBranch(normalizedName);
      this.$branchName.set('');
      this.closePopover();
    } catch (error) {
      this.$branchError.set(`创建分支失败：${getErrorMessage(error, '未知错误')}`);
    } finally {
      this.$creating.set(false);
    }
  }

  async switchBranch(branch: string) {
    if (!branch || branch === this.activeBranch() || this.$switching()) return;
    this.$switching.set(true);
    this.$branchError.set(null);
    try {
      await this.#rxdb.versionManager.switchBranch(branch);
    } catch (error) {
      this.$branchError.set(`切换分支失败：${getErrorMessage(error, '未知错误')}`);
    } finally {
      this.$switching.set(false);
    }
  }
}
