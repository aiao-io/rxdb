import { RxDBBranch } from '@aiao/rxdb';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideCheck as Check,
  LucideChevronDown as ChevronDown,
  LucideChevronRight as ChevronRight,
  LucideGitBranch as GitBranch,
  LucideGitMerge as GitMerge,
  LucideDynamicIcon,
  LucideMoreVertical as MoreVertical,
  LucidePlus as Plus,
  LucideSearch as Search
} from '@lucide/angular';
import { gdRelativeTime } from '../working-tree.gd';
import { isImeComposing } from '../working-tree.ime';

/**
 * 顶部分支栏里的分支选择器，模仿 GitHub Desktop 的分支下拉。
 *
 * @remarks
 * 下拉是**内联**渲染（absolute 定位在按钮下方）而不是 CDK overlay：
 * overlay 会把节点追加到 `<body>` 末尾，Tab 顺序上排在整页面板之后——键盘用户
 * 从触发按钮按 Tab 会直接跳进侧栏，永远走不进下拉。内联渲染让「按钮 → 筛选框 →
 * 新建 → 分支行 → ⋯」落在自然 DOM 顺序里，a11y 用例的纯 Tab 走查才走得通。
 *
 * 下拉顶部带筛选框（GitHub Desktop 的分支下拉同样可以打字筛）：按名字子串过滤，
 * 大小写不敏感。当前分支行右端画 ✓（GitHub Desktop 的选中标记）。
 *
 * **点行立即切换**（GitHub Desktop 同款）：工作树有未提交改动时，页面弹「Switch branch」对话框问改动怎么办。
 * 行上的右键（触屏是行尾 ⋯）只有复制分支名与删除，与 GitHub Desktop 的分支右键菜单一致；合并在下拉底部的
 * 「Choose a branch to merge into 当前分支」（GitHub Desktop `branches-container.tsx` 的 merge-button-row）。
 * 「New branch」收起下拉、交给页面打开「Create a branch」对话框（与 History 右键的从提交建分支共用）。
 *
 * **下拉必须左对齐（`left-0`）而不是右对齐。** 应用壳的侧栏展开后占 240px，
 * `#layout-container` 是 `overflow: auto` 的滚动容器；右对齐会让 w-72 的下拉
 * 向左伸进侧栏区域，被滚动容器裁剪——裁掉的那块恰好是操作按钮的位置，
 * 点击会被 fixed 背板吃掉（2026-09-18 实测复现，见 e2e）。
 *
 * ARIA：列表弹层是非模态的 `role="dialog"`，行是 `<ul>/<li>` 里的普通 `<button>`——弹层里还有
 * 筛选框与新建按钮，`role="menu"` 只许装菜单项（axe `aria-required-children`）；当前分支的行按钮
 * 带 `aria-current="true"`。Escape 关闭在输入法组字期间让给输入法（见 `isImeComposing`）。
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
          (click)="toggleMenu()"
          aria-controls="wt-branch-menu-popup"
          aria-haspopup="dialog"
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

        @if (menuOpen()) {
          <!-- 点外面关闭的背板；与仓库 foldout 同款黑透明遮罩（role=button + tabindex=0，
               让 Escape / 点击关闭对键盘用户成立） -->
          <div
            class="fixed inset-0 z-30"
            [style.background]="'rgba(0, 0, 0, 0.35)'"
            (click)="closeAll()"
            (keydown.escape)="closeAll()"
            aria-label="Close branch menu"
            role="button"
            tabindex="0"
          ></div>
        }

        @if (menuOpen()) {
          <div
            class="gd-menu gd-menu-flush absolute top-full left-0 z-40 flex flex-col overflow-y-auto"
            id="wt-branch-menu-popup"
            [style.height]="'calc(100vh - 50px)'"
            [style.left.px]="popupLeft()"
            [style.width.px]="popupWidth()"
            aria-label="Branch list"
            data-testid="wt-branch-menu-popup"
            role="dialog"
          >
            <div class="flex items-center justify-between px-3 pt-1 pb-1.5">
              <span class="text-[11px] font-semibold uppercase" [style.color]="'var(--gd-muted)'"
                >Branches ({{ branches().length }})</span
              >
              <button
                class="gd-btn-ghost shrink-0"
                (click)="requestCreate()"
                data-testid="wt-branch-create"
                type="button"
              >
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
                      [attr.aria-current]="branch.id === activeBranch() ? 'true' : null"
                      [attr.data-branch-id]="branch.id"
                      (click)="onRowClick(branch)"
                      (contextmenu)="menuRequest.emit({ target: branch, event: $event })"
                      data-testid="wt-branch-item"
                      type="button"
                    >
                      <!-- 当前分支：前导图标换成勾（GitHub Desktop 同款） -->
                      <svg
                        class="shrink-0"
                        [lucideIcon]="branch.id === activeBranch() ? Check : GitBranch"
                        [style.color]="branch.id === activeBranch() ? 'var(--gd-accent)' : null"
                        size="12"
                      ></svg>
                      <span
                        class="min-w-0 flex-1 truncate text-sm font-medium"
                        [class.text-green-700]="branch.id === activeBranch()"
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
                      <span
                        class="shrink-0 text-xs"
                        [style.color]="'var(--gd-muted)'"
                        [title]="branchTime(branch).toLocaleString()"
                      >
                        {{ gdRelativeTime(branchTime(branch)) }}
                      </span>
                    </button>
                    <!-- 触屏没有右键：行尾 ⋯ 打开同一菜单（桌面端隐藏） -->
                    <button
                      class="gd-icon-btn hidden max-md:inline-flex pointer-coarse:inline-flex"
                      (click)="openRowMenu($event, branch)"
                      aria-label="更多操作"
                      data-testid="wt-branch-more"
                      title="更多操作（触屏）"
                      type="button"
                    >
                      <svg [lucideIcon]="MoreVertical" size="14"></svg>
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
            <!-- GitHub Desktop 的分支下拉底部：选一条分支合并进当前分支 -->
            <div class="gd-menu-divider"></div>
            <button
              class="gd-menu-row w-full shrink-0"
              [title]="'Choose a branch to merge into ' + activeBranch()"
              (click)="mergeRequest.emit()"
              data-testid="wt-branch-merge-into"
              type="button"
            >
              <svg class="shrink-0" [lucideIcon]="GitMerge" size="14"></svg>
              <span class="min-w-0 flex-1 truncate text-left text-sm">
                Choose a branch to merge into <strong>{{ activeBranch() }}</strong>
              </span>
            </button>
          </div>
        }
      </div>
    </div>
  `
})
export class WorkingTreeBranchMenuComponent {
  readonly #el = inject(ElementRef) as ElementRef<HTMLElement>;

  /** 窄屏夹回：面板右缘不超出视口（右缘留 8px），左缘最多贴到视口左 8px。 */
  readonly popupLeft = computed(() => {
    const width = this.popupWidth();
    const sectionLeft = this.#el.nativeElement.getBoundingClientRect().left;
    // 面板相对段落 left:0 锚定：放得下为 0；放不下向左移，下界保证面板左缘 ≥ 视口左 8px
    return Math.max(8 - sectionLeft, Math.min(0, window.innerWidth - sectionLeft - width - 8));
  });

  readonly branches = input.required<readonly RxDBBranch[]>();
  readonly activeBranch = input('');
  /** 下拉面板宽：与仓库 foldout 同宽（页面把左栏宽传进来）。 */
  readonly popupWidth = input(320);
  /** 下拉开合 */
  readonly menuOpen = model(false);
  /** 分支名筛选（大小写不敏感的子串匹配）。 */
  readonly filter = signal('');

  readonly switchBranch = output<string>();
  /** 行上右键；页面按条目拼菜单（复制分支名 / 删除）。 */
  readonly menuRequest = output<{ target: RxDBBranch; event: MouseEvent }>();
  /** 下拉底部「Choose a branch to merge into 当前分支」：页面打开合并对话框，在里面挑来源 */
  readonly mergeRequest = output<void>();

  readonly MoreVertical = MoreVertical;

  /** 「New branch」：页面打开「Create a branch」对话框 */
  readonly createRequest = output<void>();

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
  readonly Plus = Plus;
  readonly ChevronDown = ChevronDown;
  readonly ChevronRight = ChevronRight;
  readonly Search = Search;

  toggleMenu() {
    if (this.menuOpen()) {
      this.closeAll();
    } else {
      this.menuOpen.set(true);
    }
  }

  /**
   * Escape 走 document 级监听而不是挂在容器 div 上：焦点在菜单/弹层的任意
   * 子元素上时事件都能冒泡到 document，而容器 div 挂交互 handler 会撞
   * `interactive-supports-focus` 的 lint 规则（div 不可聚焦）。
   *
   * 监听的是整个 `keydown` 而不是 `keydown.escape`：带按键修饰的监听，`$event` 只被类型检查成
   * `Event`，读不到 `isComposing`。组字中的 Escape 是输入法在取消候选，不收菜单。
   */
  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || isImeComposing(event)) return;
    this.closeAll();
  }

  /** 「New branch」：先收起下拉，对话框由页面开 */
  requestCreate() {
    this.closeAll();
    this.createRequest.emit();
  }

  closeAll() {
    this.menuOpen.set(false);
    this.filter.set('');
  }

  /** 分支的展示时间：优先 updatedAt，没有就 createdAt。 */
  branchTime(branch: RxDBBranch): Date {
    return branch.updatedAt ?? branch.createdAt ?? new Date(0);
  }

  /** 点行：非当前分支立即切换（GitHub Desktop 同款），当前分支只收起菜单。 */
  onRowClick(branch: RxDBBranch) {
    if (branch.id === this.activeBranch()) {
      this.closeAll();
      return;
    }
    this.switchBranch.emit(branch.id);
  }

  /**
   * 触屏没有右键：行尾 ⋯ 按钮按自身位置合成一次 contextmenu 请求，
   * 打开与右键相同的菜单（桌面端按钮隐藏，仍走原生右键）。
   */
  openRowMenu(event: MouseEvent, branch: RxDBBranch): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuRequest.emit({
      target: branch,
      event: new MouseEvent('contextmenu', { clientX: rect.left, clientY: rect.bottom, bubbles: true })
    });
  }
}
