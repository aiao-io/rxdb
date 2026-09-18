import { RxDBBranch } from '@aiao/rxdb';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  HostListener,
  input,
  model,
  output,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideChevronDown as ChevronDown,
  LucideChevronRight as ChevronRight,
  LucideCircleDot as CircleDot,
  LucideGitBranch as GitBranch,
  LucideGitMerge as GitMerge,
  LucideDynamicIcon,
  LucidePlus as Plus,
  LucideTrash2 as Trash2
} from '@lucide/angular';

/**
 * 顶部分支栏里的分支选择器，模仿 GitHub Desktop 的分支下拉。
 *
 * @remarks
 * 下拉与创建弹层都是**内联**渲染（absolute 定位在按钮下方）而不是 CDK overlay：
 * overlay 会把节点追加到 `<body>` 末尾，Tab 顺序上排在整页面板之后——键盘用户
 * 从触发按钮按 Tab 会直接跳进侧栏，永远走不进下拉。内联渲染让「按钮 → 新建 →
 * 分支行 → 操作按钮」落在自然 DOM 顺序里，a11y 用例的纯 Tab 走查才走得通。
 *
 * 与 GitHub Desktop 的一个刻意差异：点行是**选中**而不是立即切换。选中后行下方
 * 出现「切换 / 合并 / 删除」，切换仍走 `requireClean` 的被拒路径——demo 要演的就是
 * 「脏工作树被拒」这一步，立即切换会把拒绝的 toast 变成行点击的副作用。
 *
 * **下拉必须左对齐（`left-0`）而不是右对齐。** 应用壳的侧栏展开后占 240px，
 * `#layout-container` 是 `overflow: auto` 的滚动容器；右对齐会让 w-72 的下拉
 * 向左伸进侧栏区域，被滚动容器裁剪——裁掉的那块恰好是「切换 / 合并 / 删除」
 * 操作按钮的位置，点击会被 fixed 背板吃掉（2026-09-18 实测复现，见 e2e）。
 */
@Component({
  selector: 'app-working-tree-branch-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  template: `
    <div class="flex items-center gap-2">
      <div class="relative">
        <button
          class="btn btn-outline btn-sm gap-1.5"
          [attr.aria-expanded]="menuOpen()"
          [attr.aria-haspopup]="true"
          (click)="toggleMenu()"
          data-testid="wt-branch-menu"
          type="button"
        >
          <svg class="text-base-content/80" [lucideIcon]="GitBranch" size="14"></svg>
          <span class="max-w-40 truncate">{{ activeBranch() || '…' }}</span>
          <svg
            class="text-base-content/80 transition-transform"
            [class.rotate-180]="menuOpen()"
            [lucideIcon]="ChevronDown"
            size="12"
          ></svg>
        </button>

        @if (menuOpen() || createOpen()) {
          <!-- 点外面关闭的透明背板；与合并对话框同一种形态（role=button + tabindex=0，
               让 Escape / 点击关闭对键盘用户成立） -->
          <div
            class="fixed inset-0 z-30"
            (click)="closeAll()"
            (keydown.escape)="closeAll()"
            aria-label="关闭分支菜单"
            role="button"
            tabindex="0"
          ></div>
        }

        @if (createOpen()) {
          <div
            class="bg-base-100 border-base-300 absolute top-full left-0 z-40 mt-1 w-64 rounded-lg border p-3 shadow-xl"
            aria-label="创建新分支"
            data-testid="wt-branch-create-popover"
            role="dialog"
          >
            <div class="flex flex-col gap-2">
              <div class="text-xs font-medium">
                创建新分支
                <span class="text-base-content/80">（基于 {{ activeBranch() }}）</span>
              </div>
              <input
                class="input input-bordered input-sm w-full"
                #createInput
                [(ngModel)]="branchName"
                (input)="branchError.set(null)"
                (keydown.enter)="confirmCreate()"
                data-testid="wt-branch-name"
                placeholder="feature/my-feature"
                type="text"
              />
              @if (branchError(); as error) {
                <p class="text-error text-xs" role="alert">{{ error }}</p>
              }
              <div class="flex justify-end gap-2">
                <button
                  class="btn btn-ghost btn-sm"
                  (click)="closeAll()"
                  data-testid="wt-branch-create-cancel"
                  type="button"
                >
                  取消
                </button>
                <button
                  class="btn btn-primary btn-sm"
                  (click)="confirmCreate()"
                  data-testid="wt-branch-create-confirm"
                  type="button"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        } @else if (menuOpen()) {
          <div
            class="bg-base-100 border-base-300 absolute top-full left-0 z-40 mt-1 w-72 rounded-lg border py-1 shadow-xl"
            aria-label="分支列表"
            data-testid="wt-branch-menu-popup"
            role="menu"
          >
            <div class="border-base-300 flex items-center justify-between border-b px-3 py-1.5">
              <span class="text-base-content/80 text-xs font-semibold uppercase">分支（{{ branches().length }}）</span>
              <button
                class="btn btn-ghost btn-xs gap-1"
                (click)="openCreate()"
                data-testid="wt-branch-create"
                type="button"
              >
                <svg [lucideIcon]="Plus" size="12"></svg>
                新建
              </button>
            </div>
            <ul class="max-h-72 overflow-y-auto py-1">
              @for (branch of branches(); track branch.id) {
                <li>
                  <button
                    class="hover:bg-base-200 flex w-full items-center gap-1.5 px-3 py-2 text-left transition-colors"
                    [attr.data-branch-id]="branch.id"
                    [class.bg-base-200]="selectedBranchId() === branch.id"
                    (click)="selectBranch.emit(branch.id)"
                    data-testid="wt-branch-item"
                    role="menuitem"
                    type="button"
                  >
                    @if (branch.activated) {
                      <svg class="text-success shrink-0" [lucideIcon]="CircleDot" size="12"></svg>
                    } @else {
                      <svg class="text-base-content/80 shrink-0" [lucideIcon]="GitBranch" size="12"></svg>
                    }
                    <span class="min-w-0 flex-1 truncate text-sm font-medium" [class.text-green-700]="branch.activated">
                      {{ branch.id }}
                    </span>
                    @if (branch.activated) {
                      <span class="badge badge-outline badge-success badge-xs text-green-700">当前</span>
                    }
                    @if (branch.parentId) {
                      <span class="text-base-content/80 flex min-w-0 items-center gap-0.5 text-xs">
                        <svg [lucideIcon]="ChevronRight" size="10"></svg>
                        {{ branch.parentId }}
                      </span>
                    }
                  </button>
                  @if (selectedBranchId() === branch.id && !branch.activated) {
                    <div class="flex flex-wrap gap-1.5 px-3 pb-2">
                      <button
                        class="btn btn-primary btn-outline btn-xs"
                        (click)="switchBranch.emit(branch.id)"
                        data-testid="wt-branch-switch"
                        type="button"
                      >
                        切换
                      </button>
                      <button
                        class="btn btn-success btn-outline btn-xs gap-1"
                        (click)="mergeBranch.emit(branch.id)"
                        data-testid="wt-branch-merge"
                        type="button"
                      >
                        <svg [lucideIcon]="GitMerge" size="11"></svg>
                        合并到 {{ activeBranch() }}
                      </button>
                      <button
                        class="btn btn-error btn-outline btn-xs gap-1"
                        (click)="deleteBranch.emit(branch.id)"
                        data-testid="wt-branch-delete"
                        type="button"
                      >
                        <svg [lucideIcon]="Trash2" size="11"></svg>
                        删除
                      </button>
                    </div>
                  }
                </li>
              }
              @if (branches().length === 0) {
                <li class="text-base-content/80 px-4 py-4 text-center text-sm">暂无分支</li>
              }
            </ul>
          </div>
        }
      </div>
    </div>
  `
})
export class WorkingTreeBranchMenuComponent {
  readonly branches = input.required<readonly RxDBBranch[]>();
  readonly activeBranch = input('');
  readonly selectedBranchId = input<string | null>(null);

  /** 下拉开合；创建弹层打开时恒为 false（两态互斥，避免两个弹层叠着）。 */
  readonly menuOpen = model(false);
  readonly createOpen = model(false);
  readonly branchName = model('');
  readonly branchError = model<string | null>(null);

  readonly selectBranch = output<string>();
  readonly switchBranch = output<string>();
  readonly mergeBranch = output<string>();
  readonly deleteBranch = output<string>();
  /** 创建确认；分支名校验与建库调用由页面做，组件只负责把名字交出去。 */
  readonly createBranch = output<string>();

  readonly createInput = viewChild<ElementRef<HTMLInputElement>>('createInput');

  readonly GitBranch = GitBranch;
  readonly GitMerge = GitMerge;
  readonly Trash2 = Trash2;
  readonly Plus = Plus;
  readonly ChevronDown = ChevronDown;
  readonly ChevronRight = ChevronRight;
  readonly CircleDot = CircleDot;

  constructor() {
    // 弹层一出现就把焦点送进名字输入框：创建分支是两步操作，第二步不能靠用户自己
    // 再点一下输入框（与旧实现同一个 effect 模式）。
    effect(() => {
      if (this.createOpen()) {
        setTimeout(() => this.createInput()?.nativeElement.focus(), 0);
      }
    });
  }

  toggleMenu() {
    if (this.menuOpen()) {
      this.closeAll();
    } else {
      this.createOpen.set(false);
      this.menuOpen.set(true);
    }
  }

  /**
   * Escape 走 document 级监听而不是挂在容器 div 上：焦点在菜单/弹层的任意
   * 子元素上时事件都能冒泡到 document，而容器 div 挂交互 handler 会撞
   * `interactive-supports-focus` 的 lint 规则（div 不可聚焦）。
   */
  @HostListener('document:keydown.escape')
  onDocumentEscape(): void {
    this.closeAll();
  }

  openCreate() {
    this.menuOpen.set(false);
    this.branchName.set('');
    this.branchError.set(null);
    this.createOpen.set(true);
  }

  closeAll() {
    this.menuOpen.set(false);
    this.createOpen.set(false);
  }

  /** 空名不往页面交：那是一条必然被拒的往返，错误就地呈现。 */
  confirmCreate() {
    const name = this.branchName().trim();
    if (!name) {
      this.branchError.set('分支名不能为空');
      return;
    }
    this.createBranch.emit(name);
  }
}
