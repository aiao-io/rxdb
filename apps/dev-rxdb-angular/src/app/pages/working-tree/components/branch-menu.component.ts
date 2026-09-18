import { RxDBBranch } from '@aiao/rxdb';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  input,
  model,
  output,
  signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideCheck as Check,
  LucideChevronDown as ChevronDown,
  LucideChevronRight as ChevronRight,
  LucideGitBranch as GitBranch,
  LucideGitMerge as GitMerge,
  LucideDynamicIcon,
  LucidePlus as Plus,
  LucideSearch as Search,
  LucideTrash2 as Trash2
} from '@lucide/angular';
import { gdRelativeTime } from '../working-tree.gd';

/**
 * 顶部分支栏里的分支选择器，模仿 GitHub Desktop 的分支下拉。
 *
 * @remarks
 * 下拉与创建弹层都是**内联**渲染（absolute 定位在按钮下方）而不是 CDK overlay：
 * overlay 会把节点追加到 `<body>` 末尾，Tab 顺序上排在整页面板之后——键盘用户
 * 从触发按钮按 Tab 会直接跳进侧栏，永远走不进下拉。内联渲染让「按钮 → 筛选框 →
 * 新建 → 分支行 → ⋯」落在自然 DOM 顺序里，a11y 用例的纯 Tab 走查才走得通。
 *
 * 下拉顶部带筛选框（GitHub Desktop 的分支下拉同样可以打字筛）：按名字子串过滤，
 * 大小写不敏感。当前分支行右端画 ✓（GitHub Desktop 的选中标记）。
 *
 * **点行立即切换**（GitHub Desktop 同款）：切走仍走 `requireClean` 的被拒路径——
 * demo 要演的「脏工作树被拒」这一步，被拒的 toast 就是行点击的结果。合并 / 删除
 * 收进每行右端的 ⋯ 按钮（GitHub Desktop 的分支行操作同样藏在行菜单里）。
 *
 * **下拉必须左对齐（`left-0`）而不是右对齐。** 应用壳的侧栏展开后占 240px，
 * `#layout-container` 是 `overflow: auto` 的滚动容器；右对齐会让 w-72 的下拉
 * 向左伸进侧栏区域，被滚动容器裁剪——裁掉的那块恰好是操作按钮的位置，
 * 点击会被 fixed 背板吃掉（2026-09-18 实测复现，见 e2e）。
 */
@Component({
  selector: 'app-working-tree-branch-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  template: `
    <div class="flex h-full items-stretch">
      <div class="relative flex-1">
        <button
          class="gd-toolbar-select"
          [attr.aria-expanded]="menuOpen()"
          [attr.aria-haspopup]="true"
          (click)="toggleMenu()"
          data-testid="wt-branch-menu"
          type="button"
        >
          <svg [lucideIcon]="GitBranch" size="18"></svg>
          <span class="min-w-0 flex-1 text-left"
            ><small>Current Branch</small><strong class="truncate">{{ activeBranch() || '…' }}</strong></span
          >
          <!-- 注意：动态 class 绑定会被 lucide 指令的 className 覆写，旋转改用 style 绑定 -->
          <svg
            class="transition-transform"
            [lucideIcon]="ChevronDown"
            [style.transform]="menuOpen() ? 'rotate(180deg)' : null"
            size="14"
          ></svg>
        </button>

        @if (menuOpen() || createOpen()) {
          <!-- 点外面关闭的背板；与仓库 foldout 同款黑透明遮罩（role=button + tabindex=0，
               让 Escape / 点击关闭对键盘用户成立） -->
          <div
            class="fixed inset-0 z-30"
            (click)="closeAll()"
            (keydown.escape)="closeAll()"
            aria-label="Close branch menu"
            role="button"
            tabindex="0"
            [style.background]="'rgba(0, 0, 0, 0.35)'"
          ></div>
        }

        @if (createOpen()) {
          <div
            class="gd-menu gd-menu-flush absolute top-full left-0 z-40 mt-1 p-3"
            [style.width.px]="popupWidth()"
            aria-label="Create a branch"
            data-testid="wt-branch-create-popover"
            role="dialog"
          >
            <div class="flex flex-col gap-2">
              <div class="text-xs font-medium">
                Create a branch
                <span [style.color]="'var(--gd-muted)'">from {{ activeBranch() }}</span>
              </div>
              <input
                class="gd-input"
                #createInput
                [(ngModel)]="branchName"
                (input)="branchError.set(null)"
                (keydown.enter)="confirmCreate()"
                data-testid="wt-branch-name"
                placeholder="feature/my-feature"
                type="text"
              />
              @if (branchError(); as error) {
                <p class="text-xs text-red-600" role="alert">{{ error }}</p>
              }
              <div class="flex justify-end gap-2">
                <button
                  class="gd-btn-secondary"
                  (click)="closeAll()"
                  data-testid="wt-branch-create-cancel"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  class="gd-btn-primary"
                  (click)="confirmCreate()"
                  data-testid="wt-branch-create-confirm"
                  type="button"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        } @else if (menuOpen()) {
          <div
            class="gd-menu gd-menu-flush absolute top-full left-0 z-40 flex flex-col overflow-y-auto"
            [style.width.px]="popupWidth()"
            [style.height]="'calc(100vh - 50px)'"
            aria-label="Branch list"
            data-testid="wt-branch-menu-popup"
            role="menu"
          >
            <div class="flex items-center justify-between px-3 pt-1 pb-1.5">
              <span class="text-[11px] font-semibold uppercase" [style.color]="'var(--gd-muted)'"
                >Branches ({{ branches().length }})</span
              >
              <button class="gd-btn-ghost shrink-0" (click)="openCreate()" data-testid="wt-branch-create" type="button">
                <svg [lucideIcon]="Plus" size="12"></svg>
                New branch
              </button>
            </div>
            <div class="relative px-2 pb-1.5">
              <svg
                class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
                [lucideIcon]="Search"
                [style.color]="'var(--gd-muted)'"
                size="12"
              ></svg>
              <input
                class="gd-input"
                [ngModel]="filter()"
                [style.padding-left.px]="26"
                (ngModelChange)="filter.set($event)"
                aria-label="Filter branches"
                placeholder="Filter"
                type="text"
              />
            </div>
            <ul class="min-h-0 flex-1 overflow-y-auto py-1">
              @for (branch of filteredBranches(); track branch.id) {
                <li>
                  <div class="flex items-stretch">
                    <button
                      class="gd-menu-row min-w-0 flex-1"
                      [attr.data-branch-id]="branch.id"
                      (click)="onRowClick(branch)"
                      (contextmenu)="menuRequest.emit({ target: branch, event: $event })"
                      data-testid="wt-branch-item"
                      role="menuitem"
                      type="button"
                    >
                      <!-- 当前分支：前导图标换成勾（GitHub Desktop 同款） -->
                      <svg
                        class="shrink-0"
                        [lucideIcon]="branch.activated ? Check : GitBranch"
                        [style.color]="branch.activated ? 'var(--gd-accent)' : null"
                        size="12"
                      ></svg>
                      <span
                        class="min-w-0 flex-1 truncate text-sm font-medium"
                        [class.text-green-700]="branch.activated"
                      >
                        {{ branch.id }}
                      </span>
                      @if (branch.parentId) {
                        <span class="flex min-w-0 items-center gap-0.5 text-xs" [style.color]="'var(--gd-muted)'">
                          <svg [lucideIcon]="ChevronRight" size="10"></svg>
                          {{ branch.parentId }}
                        </span>
                      }
                      <!-- GitHub Desktop 的分支行右端是上次提交的相对时间；悬停给完整时间戳 -->
                      <span class="shrink-0 text-xs" [style.color]="'var(--gd-muted)'" [title]="branchTime(branch).toLocaleString()">
                        {{ gdRelativeTime(branchTime(branch)) }}
                      </span>
                    </button>
                  </div>
                </li>
              }
              @if (branches().length === 0) {
                <li class="px-4 py-4 text-center text-sm" [style.color]="'var(--gd-muted)'">No branches yet</li>
              } @else if (filteredBranches().length === 0) {
                <li class="px-4 py-4 text-center text-sm" [style.color]="'var(--gd-muted)'">No matching branches</li>
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
  /** 下拉面板宽：与仓库 foldout 同宽（页面把左栏宽传进来）。 */
  readonly popupWidth = input(320);
  /** 下拉开合；创建弹层打开时恒为 false（两态互斥，避免两个弹层叠着）。 */
  readonly menuOpen = model(false);
  readonly createOpen = model(false);
  readonly branchName = model('');
  readonly branchError = model<string | null>(null);
  /** 分支名筛选（大小写不敏感的子串匹配）。 */
  readonly filter = signal('');

  readonly switchBranch = output<string>();
  /** 行上右键；页面按条目拼菜单（切换 / 合并 / 删除 / 复制分支名）。 */
  readonly menuRequest = output<{ target: RxDBBranch; event: MouseEvent }>();
  /** 创建确认；分支名校验与建库调用由页面做，组件只负责把名字交出去。 */
  readonly createBranch = output<string>();

  readonly createInput = viewChild<ElementRef<HTMLInputElement>>('createInput');

  /** 筛出来的分支；空筛选 = 全量。 */
  readonly filteredBranches = computed(() => {
    const needle = this.filter().trim().toLowerCase();
    if (needle === '') return this.branches();
    return this.branches().filter(branch => branch.id.toLowerCase().includes(needle));
  });

  readonly Check = Check;
  readonly gdRelativeTime = gdRelativeTime;
  readonly GitBranch = GitBranch;
  readonly GitMerge = GitMerge;
  readonly Trash2 = Trash2;
  readonly Plus = Plus;
  readonly ChevronDown = ChevronDown;
  readonly ChevronRight = ChevronRight;
  readonly Search = Search;

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
    this.filter.set('');
  }

  /** 分支的展示时间：优先 updatedAt，没有就 createdAt。 */
  branchTime(branch: RxDBBranch): Date {
    return branch.updatedAt ?? branch.createdAt ?? new Date(0);
  }

  /** 点行：非当前分支立即切换（GitHub Desktop 同款），当前分支只收起菜单。 */
  onRowClick(branch: RxDBBranch) {
    if (branch.activated) {
      this.closeAll();
      return;
    }
    this.switchBranch.emit(branch.id);
  }

  /** 空名不往页面交：那是一条必然被拒的往返，错误就地呈现。 */
  confirmCreate() {
    const name = this.branchName().trim();
    if (!name) {
      this.branchError.set('Branch name is required.');
      return;
    }
    this.createBranch.emit(name);
  }
}
