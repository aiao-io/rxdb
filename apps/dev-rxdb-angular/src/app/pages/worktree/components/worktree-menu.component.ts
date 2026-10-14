import type { RxDBBranch } from '@aiao/rxdb';
import type { WorktreeInfo } from '@aiao/rxdb-plugin-worktree';
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
  LucideFolderTree as FolderTree,
  LucideDynamicIcon,
  LucidePlus as Plus,
  LucideSearch as Search,
  LucideTrash2 as Trash2
} from '@lucide/angular';

/** 创建弹层交给页面的请求；校验与建库调用由页面做。 */
export interface WorktreeCreateRequest {
  /** `existing` 钉一条已有分支；`new` 先建分支再钉（`git worktree add -b` 同款） */
  readonly mode: 'existing' | 'new';
  /** 要钉的分支（`new` 时即新分支名） */
  readonly branchId: string;
  /** 显示名；空白即不起名 */
  readonly label: string | undefined;
}

/**
 * 工具栏里的 worktree 选择器（US-310，git worktree 能力）。
 *
 * @remarks
 * 形态照抄分支下拉（`branch-menu.component.ts`）：内联 absolute 下拉 + fixed 背板 + 筛选框 + 创建弹层，
 * `left-0` 对齐（理由同那边：右对齐会伸进应用侧栏被滚动容器裁掉）。
 *
 * **点行 = 切到那个 worktree，不带 `requireClean`**：worktree 的未提交改动按分支隔离保存，
 * 切走再切回原样还在——这正是 worktree 相对「切分支前先提交 / 丢弃」的价值。
 *
 * 每行右端的移除按钮与行按钮是**兄弟**而不是嵌套（`<button>` 里套 `<button>` 是非法 HTML，
 * 读屏与键盘都会走丢）。当前所在的 worktree 移除按钮禁用（git 同款：删不掉当前 checkout）。
 */
@Component({
  selector: 'app-worktree-worktree-menu',
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
          data-testid="wt-worktree-menu"
          type="button"
        >
          <svg [lucideIcon]="FolderTree" size="18"></svg>
          <span class="min-w-0 flex-1 text-left"
            ><small>Current Worktree</small
            ><strong class="truncate" data-testid="wt-worktree-current">{{ currentLabel() || '…' }}</strong></span
          >
          <svg
            class="transition-transform"
            [lucideIcon]="ChevronDown"
            [style.transform]="menuOpen() ? 'rotate(180deg)' : null"
            size="14"
          ></svg>
        </button>

        @if (menuOpen() || createOpen()) {
          <div
            class="fixed inset-0 z-30"
            [style.background]="'rgba(0, 0, 0, 0.35)'"
            (click)="closeAll()"
            (keydown.escape)="closeAll()"
            aria-label="Close worktree menu"
            role="button"
            tabindex="0"
          ></div>
        }

        @if (createOpen()) {
          <div
            class="gd-menu gd-menu-flush gd-branch-create-popover absolute top-full left-0 z-40 mt-1"
            [style.width.px]="popupWidth()"
            aria-label="Create a worktree"
            data-testid="wt-worktree-create-popover"
            role="dialog"
          >
            <div class="flex flex-col gap-2">
              <div class="text-xs font-medium">Create a worktree</div>
              <fieldset class="flex gap-3 text-xs">
                <legend class="sr-only">Branch for the new worktree</legend>
                <label class="flex items-center gap-1">
                  <input
                    [checked]="mode() === 'existing'"
                    (change)="setMode('existing')"
                    data-testid="wt-worktree-mode-existing"
                    name="wt-worktree-mode"
                    type="radio"
                  />
                  Existing branch
                </label>
                <label class="flex items-center gap-1">
                  <input
                    [checked]="mode() === 'new'"
                    (change)="setMode('new')"
                    data-testid="wt-worktree-mode-new"
                    name="wt-worktree-mode"
                    type="radio"
                  />
                  New branch
                </label>
              </fieldset>
              @if (mode() === 'existing') {
                @if (candidates().length > 0) {
                  <select
                    class="gd-input"
                    #branchSelect
                    [ngModel]="selectedBranch()"
                    (ngModelChange)="selectedBranch.set($event); createError.set(null)"
                    aria-label="Branch"
                    data-testid="wt-worktree-branch"
                  >
                    @for (branch of candidates(); track branch.id) {
                      <option [value]="branch.id">{{ branch.id }}</option>
                    }
                  </select>
                } @else {
                  <p class="text-xs" [style.color]="'var(--gd-muted)'" data-testid="wt-worktree-no-candidates">
                    Every branch already has a worktree — create a new branch instead.
                  </p>
                }
              } @else {
                <input
                  class="gd-input"
                  #newBranchInput
                  [ngModel]="newBranch()"
                  (keydown.enter)="confirmCreate()"
                  (ngModelChange)="newBranch.set($event); createError.set(null)"
                  aria-label="New branch name"
                  data-testid="wt-worktree-new-branch"
                  placeholder="feature/my-feature"
                  type="text"
                />
              }
              <input
                class="gd-input"
                [ngModel]="label()"
                (keydown.enter)="confirmCreate()"
                (ngModelChange)="label.set($event)"
                aria-label="Label (optional)"
                data-testid="wt-worktree-label"
                placeholder="Label (optional)"
                type="text"
              />
              @if (createError(); as error) {
                <p class="text-xs text-red-600" role="alert">{{ error }}</p>
              }
              <div class="flex justify-end gap-2">
                <button
                  class="gd-btn-secondary"
                  (click)="closeAll()"
                  data-testid="wt-worktree-create-cancel"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  class="gd-btn-primary"
                  (click)="confirmCreate()"
                  data-testid="wt-worktree-create-confirm"
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
            [style.height]="'calc(100vh - 50px)'"
            [style.width.px]="popupWidth()"
            aria-label="Worktree list"
            data-testid="wt-worktree-menu-popup"
            role="menu"
          >
            <div class="flex items-center justify-between px-3 pt-1 pb-1.5">
              <span class="text-[11px] font-semibold uppercase" [style.color]="'var(--gd-muted)'"
                >Worktrees ({{ worktrees().length }})</span
              >
              <button
                class="gd-btn-ghost shrink-0"
                (click)="openCreate()"
                data-testid="wt-worktree-create"
                type="button"
              >
                <svg [lucideIcon]="Plus" size="12"></svg>
                New worktree
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
                aria-label="Filter worktrees"
                placeholder="Filter"
                type="text"
              />
            </div>
            <ul class="min-h-0 flex-1 overflow-y-auto py-1">
              @for (worktree of filteredWorktrees(); track worktree.id) {
                <li>
                  <div class="flex items-stretch">
                    <button
                      class="gd-menu-row min-w-0 flex-1"
                      [attr.data-branch-id]="worktree.branchId"
                      [attr.data-worktree-id]="worktree.id"
                      (click)="onRowClick(worktree)"
                      data-testid="wt-worktree-item"
                      role="menuitem"
                      type="button"
                    >
                      <svg
                        class="shrink-0"
                        [lucideIcon]="worktree.active ? Check : FolderTree"
                        [style.color]="worktree.active ? 'var(--gd-accent)' : null"
                        size="12"
                      ></svg>
                      <span
                        class="min-w-0 flex-1 truncate text-sm font-medium"
                        [class.text-green-700]="worktree.active"
                        data-testid="wt-worktree-label-text"
                      >
                        {{ worktree.label ?? worktree.branchId }}
                      </span>
                      <span class="shrink-0 text-xs" [style.color]="'var(--gd-muted)'">{{ worktree.branchId }}</span>
                    </button>
                    <button
                      class="gd-btn-ghost shrink-0 px-2"
                      [attr.aria-disabled]="worktree.active"
                      [attr.aria-label]="'Remove worktree ' + (worktree.label ?? worktree.branchId)"
                      [attr.data-branch-id]="worktree.branchId"
                      [attr.title]="worktree.active ? 'The current worktree cannot be removed' : null"
                      [disabled]="worktree.active"
                      (click)="removeWorktree.emit(worktree.id)"
                      data-testid="wt-worktree-remove"
                      type="button"
                    >
                      <svg [lucideIcon]="Trash2" size="12"></svg>
                    </button>
                  </div>
                </li>
              }
              @if (worktrees().length === 0) {
                <li class="px-4 py-4 text-center text-sm" [style.color]="'var(--gd-muted)'">No worktrees yet</li>
              } @else if (filteredWorktrees().length === 0) {
                <li class="px-4 py-4 text-center text-sm" [style.color]="'var(--gd-muted)'">No matching worktrees</li>
              }
            </ul>
          </div>
        }
      </div>
    </div>
  `
})
export class WorktreeWorktreeMenuComponent {
  readonly worktrees = input.required<readonly WorktreeInfo[]>();
  readonly branches = input.required<readonly RxDBBranch[]>();
  /** 当前 checkout 的分支；它没钉成 worktree 时，触发按钮就显示分支名。 */
  readonly activeBranch = input('');
  readonly popupWidth = input(320);
  /** 下拉开合；创建弹层打开时恒为 false（两态互斥，避免两个弹层叠着）。 */
  readonly menuOpen = model(false);
  readonly createOpen = model(false);
  readonly createError = model<string | null>(null);

  /** worktree 筛选（label 与分支名的大小写不敏感子串匹配）。 */
  readonly filter = signal('');
  readonly mode = signal<'existing' | 'new'>('existing');
  readonly selectedBranch = signal('');
  readonly newBranch = signal('');
  readonly label = signal('');

  readonly switchWorktree = output<string>();
  readonly removeWorktree = output<string>();
  readonly createWorktree = output<WorktreeCreateRequest>();

  readonly newBranchInput = viewChild<ElementRef<HTMLInputElement>>('newBranchInput');
  readonly branchSelect = viewChild<ElementRef<HTMLSelectElement>>('branchSelect');

  /** 触发按钮上的名字：当前 worktree 的 label → 它的分支名 → 当前分支名（没钉住时）。 */
  readonly currentLabel = computed(() => {
    const current = this.worktrees().find(worktree => worktree.active);
    return current ? (current.label ?? current.branchId) : this.activeBranch();
  });

  readonly filteredWorktrees = computed(() => {
    const needle = this.filter().trim().toLowerCase();
    if (needle === '') return this.worktrees();
    return this.worktrees().filter(
      worktree =>
        worktree.branchId.toLowerCase().includes(needle) || (worktree.label ?? '').toLowerCase().includes(needle)
    );
  });

  /** 还没钉成 worktree 的分支：一条分支只能有一个 worktree（与 `listWorktrees()` 求差）。 */
  readonly candidates = computed(() => {
    const pinned = new Set(this.worktrees().map(worktree => worktree.branchId));
    return this.branches().filter(branch => !pinned.has(branch.id));
  });

  readonly Check = Check;
  readonly ChevronDown = ChevronDown;
  readonly FolderTree = FolderTree;
  readonly Plus = Plus;
  readonly Search = Search;
  readonly Trash2 = Trash2;

  constructor() {
    // 弹层一出现就把焦点送进第一个输入控件：创建是两步操作，第二步不能靠用户自己再点一下。
    effect(() => {
      if (!this.createOpen()) return;
      const mode = this.mode();
      setTimeout(() => {
        const target = mode === 'new' ? this.newBranchInput() : this.branchSelect();
        target?.nativeElement.focus();
      }, 0);
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

  /** Escape 走 document 级监听，理由同分支下拉：焦点在弹层任意子元素上都能冒泡到这里。 */
  @HostListener('document:keydown.escape')
  onDocumentEscape(): void {
    this.closeAll();
  }

  openCreate() {
    this.menuOpen.set(false);
    // 没有可钉的已有分支时直接进「新建分支」：空下拉框是一条走不通的路。
    const first = this.candidates()[0]?.id ?? '';
    this.mode.set(first === '' ? 'new' : 'existing');
    this.selectedBranch.set(first);
    this.newBranch.set('');
    this.label.set('');
    this.createError.set(null);
    this.createOpen.set(true);
  }

  setMode(mode: 'existing' | 'new') {
    this.mode.set(mode);
    this.createError.set(null);
  }

  closeAll() {
    this.menuOpen.set(false);
    this.createOpen.set(false);
    this.filter.set('');
  }

  /** 点行：别的 worktree 立即切过去；当前那个只收起菜单。 */
  onRowClick(worktree: WorktreeInfo) {
    if (worktree.active) {
      this.closeAll();
      return;
    }
    this.switchWorktree.emit(worktree.id);
  }

  /** 空分支名不往页面交：那是一条必然被拒的往返，错误就地呈现。 */
  confirmCreate() {
    const branchId = (this.mode() === 'new' ? this.newBranch() : this.selectedBranch()).trim();
    if (!branchId) {
      this.createError.set(this.mode() === 'new' ? 'Branch name is required.' : 'Pick a branch.');
      return;
    }
    const label = this.label().trim();
    this.createWorktree.emit({ mode: this.mode(), branchId, label: label === '' ? undefined : label });
  }
}
