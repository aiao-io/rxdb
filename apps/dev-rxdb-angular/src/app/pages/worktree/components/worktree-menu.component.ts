import type { RxDBBranch } from '@aiao/rxdb';
import type { WorktreeInfo } from '@aiao/rxdb-plugin-worktree';
import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideFolderTree as FolderTree, LucideDynamicIcon, LucideTrash2 as Trash2 } from '@lucide/angular';
import {
  WorktreeDropdownCreateDirective,
  WorktreeDropdownRowActionsDirective,
  WorktreeDropdownRowMetaDirective,
  WorktreeToolbarDropdownComponent,
  type WorktreeToolbarDropdownCopy
} from './toolbar-dropdown.component';

/** 创建弹层交给页面的请求；校验与建库调用由页面做。 */
export interface WorktreeCreateRequest {
  /** `existing` 钉一条已有分支；`new` 先 `createBranch`（FR-017：会复制当前未提交改动），再钉住 */
  readonly mode: 'existing' | 'new';
  /** 要钉的分支（`new` 时即新分支名） */
  readonly branchId: string;
  /** 显示名，原样透传；空串即不起名（`undefined`），全空白由核心拒绝（`WorktreeLabelError`） */
  readonly label: string | undefined;
}

/** worktree 下拉的全部文案（背板的 `Close worktree menu` 是 e2e 点的锚点）。 */
const WORKTREE_MENU_COPY: WorktreeToolbarDropdownCopy = {
  caption: 'Current Worktree',
  heading: 'Worktrees',
  createButton: 'New worktree',
  createTitle: 'Create a worktree',
  filterPlaceholder: 'Filter',
  filterLabel: 'Filter worktrees',
  listLabel: 'Worktree list',
  backdropLabel: 'Close worktree menu',
  emptyText: 'No worktrees yet',
  noMatchText: 'No matching worktrees'
};

/**
 * 工具栏里的 worktree 选择器（US-310，git worktree 能力）。
 *
 * @remarks
 * 下拉骨架与分支下拉共用 `toolbar-dropdown.component.ts`；这里只给行的补充信息（所钉分支）、
 * 行右端的移除按钮与创建表单。
 *
 * **点行 = 切到那个 worktree，不带 `requireClean`**：worktree 的未提交改动按分支隔离保存，
 * 切走再切回原样还在——这正是 worktree 相对「切分支前先提交 / 丢弃」的价值。
 *
 * 当前所在的 worktree 移除按钮禁用（git 同款：删不掉当前 checkout）；有命令在途时所有移除按钮一并禁用。
 *
 * 新建分支模式下，工作树有未提交改动时提示「新分支会带上这些改动」：`createBranch` 从当前工作树
 * 复制一份（FR-017），钉住之后两个 worktree 各有一份。
 */
@Component({
  selector: 'app-worktree-worktree-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucideDynamicIcon,
    WorktreeDropdownCreateDirective,
    WorktreeDropdownRowActionsDirective,
    WorktreeDropdownRowMetaDirective,
    WorktreeToolbarDropdownComponent
  ],
  template: `
    <app-worktree-toolbar-dropdown
      [(createOpen)]="createOpen"
      [(menuOpen)]="menuOpen"
      [busy]="busy()"
      [copy]="COPY"
      [createError]="createError()"
      [createFocusKey]="mode()"
      [icon]="FolderTree"
      [isActive]="isActive"
      [itemBranchId]="branchIdOf"
      [itemKey]="idOf"
      [itemLabel]="labelOf"
      [items]="worktrees()"
      [listError]="listError()"
      [matches]="matches"
      [popupWidth]="popupWidth()"
      [value]="currentLabel()"
      (confirm)="confirmCreate()"
      (createOpening)="resetCreate()"
      (retry)="retryList.emit()"
      (selectItem)="switchWorktree.emit($event.id)"
      testIdPrefix="wt-worktree"
    >
      <ng-template [appWorktreeDropdownRowMeta]="worktrees()" let-worktree>
        <span class="shrink-0 text-xs" [style.color]="'var(--gd-muted)'">{{ worktree.branchId }}</span>
      </ng-template>

      <!-- 移除按钮与行按钮是兄弟而不是嵌套（<button> 里套 <button> 是非法 HTML，读屏与键盘都会走丢） -->
      <ng-template [appWorktreeDropdownRowActions]="worktrees()" let-busy="busy" let-worktree>
        <button
          class="gd-btn-ghost shrink-0 px-2"
          [attr.aria-label]="'Remove worktree ' + labelOf(worktree)"
          [attr.data-branch-id]="worktree.branchId"
          [attr.title]="worktree.active ? 'The current worktree cannot be removed' : null"
          [disabled]="worktree.active || busy"
          (click)="removeWorktree.emit(worktree.id)"
          data-testid="wt-worktree-remove"
          type="button"
        >
          <svg [lucideIcon]="Trash2" size="12"></svg>
        </button>
      </ng-template>

      <ng-template appWorktreeDropdownCreate>
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
            <!-- 首项是禁用的占位：手上的选择不在候选里了（弹层开着时候选变了），就回到它 -->
            <select
              class="gd-input"
              [ngModel]="selection()"
              (ngModelChange)="selectedBranch.set($event); createError.set(null)"
              aria-label="Branch"
              data-autofocus
              data-testid="wt-worktree-branch"
            >
              <option disabled value="">Pick a branch…</option>
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
            [ngModel]="newBranch()"
            (ngModelChange)="newBranch.set($event); createError.set(null)"
            aria-label="New branch name"
            data-autofocus
            data-testid="wt-worktree-new-branch"
            placeholder="feature/my-feature"
            type="text"
          />
          @if (copyNote(); as note) {
            <p class="text-xs" [style.color]="'var(--gd-muted)'" data-testid="wt-worktree-copy-note">{{ note }}</p>
          }
        }
        <input
          class="gd-input"
          [ngModel]="label()"
          (ngModelChange)="label.set($event)"
          aria-label="Label (optional)"
          data-testid="wt-worktree-label"
          placeholder="Label (optional)"
          type="text"
        />
      </ng-template>
    </app-worktree-toolbar-dropdown>
  `
})
export class WorktreeWorktreeMenuComponent {
  readonly worktrees = input.required<readonly WorktreeInfo[]>();
  readonly branches = input.required<readonly RxDBBranch[]>();
  /** 当前 checkout 的分支；它没钉成 worktree 时，触发按钮就显示分支名。 */
  readonly activeBranch = input('');
  readonly popupWidth = input(320);
  /** 有 worktree 命令在途（建 / 切 / 移除）：新建按钮、行、移除按钮与 Create 一并禁用。 */
  readonly busy = input(false);
  /** 列表读取失败的提示（页面拼好）；非 null 时警示条顶替列表，也不给创建候选。 */
  readonly listError = input<string | null>(null);
  /** 当前工作树的未提交改动数；`null` 即没有或读不到（新建分支模式据此提示会带上这些改动）。 */
  readonly uncommittedCount = input<number | null>(null);
  /** 下拉开合；创建弹层打开时恒为 false（两态互斥，避免两个弹层叠着）。 */
  readonly menuOpen = model(false);
  readonly createOpen = model(false);
  readonly createError = model<string | null>(null);

  readonly mode = signal<'existing' | 'new'>('existing');
  /** 用户在下拉框里选的分支；显示用的是 {@link selection}（它会因候选变化而回到占位项）。 */
  readonly selectedBranch = signal('');
  readonly newBranch = signal('');
  /** 显示名草稿；原样交给页面，不 trim。 */
  readonly label = signal('');

  readonly switchWorktree = output<string>();
  readonly removeWorktree = output<string>();
  readonly createWorktree = output<WorktreeCreateRequest>();
  /** 列表读取失败后的「Retry」：页面重读一次列表。 */
  readonly retryList = output<void>();

  readonly COPY = WORKTREE_MENU_COPY;

  /** 触发按钮上的名字：当前 worktree 的 label → 它的分支名 → 当前分支名（没钉住时）。 */
  readonly currentLabel = computed(() => {
    const current = this.worktrees().find(worktree => worktree.active);
    return current ? this.labelOf(current) : this.activeBranch();
  });

  /**
   * 还没钉成 worktree 的分支：一条分支只能有一个 worktree（与 `listWorktrees()` 求差）。
   *
   * 列表读失败时一条都不给：那时 `worktrees` 是空数组，求差会把已经钉住的分支也当成候选。
   */
  readonly candidates = computed<readonly RxDBBranch[]>(() => {
    if (this.listError() !== null) return [];
    const pinned = new Set(this.worktrees().map(worktree => worktree.branchId));
    return this.branches().filter(branch => !pinned.has(branch.id));
  });

  /** 下拉框实际绑定的值：手上的选择还在候选里就是它，否则是占位项的 `''`。 */
  readonly selection = computed(() => {
    const selected = this.selectedBranch();
    return this.candidates().some(branch => branch.id === selected) ? selected : '';
  });

  /** 新建分支模式下的「会带上未提交改动」提示；工作树干净（或读不到条数）时没有。 */
  readonly copyNote = computed(() => {
    const count = this.uncommittedCount();
    if (this.mode() !== 'new' || count === null || count <= 0) return null;
    return `The new branch starts with a copy of your ${count} uncommitted ${count === 1 ? 'change' : 'changes'}.`;
  });

  readonly FolderTree = FolderTree;
  readonly Trash2 = Trash2;

  // 交给下拉的条目访问器（箭头函数字段：当作输入传下去时不丢 this；成员排序规则把它们算作方法）
  readonly idOf = (worktree: WorktreeInfo): string => worktree.id;
  readonly branchIdOf = (worktree: WorktreeInfo): string => worktree.branchId;
  /** 一个 worktree 的显示名：label，没起名就是它钉住的分支名。 */
  readonly labelOf = (worktree: WorktreeInfo): string => worktree.label ?? worktree.branchId;
  readonly isActive = (worktree: WorktreeInfo): boolean => worktree.active;
  /** label 与分支名的大小写不敏感子串匹配（`needle` 已由下拉小写化）。 */
  readonly matches = (worktree: WorktreeInfo, needle: string): boolean =>
    worktree.branchId.toLowerCase().includes(needle) ||
    (worktree.label !== null && worktree.label.toLowerCase().includes(needle));

  /** 创建弹层打开前重置表单；没有可钉的已有分支时直接进「新建分支」：空下拉框是一条走不通的路。 */
  resetCreate(): void {
    const first = this.candidates()[0]?.id ?? '';
    this.mode.set(first === '' ? 'new' : 'existing');
    this.selectedBranch.set(first);
    this.newBranch.set('');
    this.label.set('');
    this.createError.set(null);
  }

  setMode(mode: 'existing' | 'new'): void {
    this.mode.set(mode);
    this.createError.set(null);
  }

  /**
   * 空分支名 / 没选分支不往页面交：那是一条必然被拒的往返，错误就地呈现。
   *
   * 新分支名两端的空白不算名字的一部分；label 则原样交出去——显式给的值静默改写等于替用户改输入，
   * 全空白的 label 由核心拒绝、页面给提示。空串才是「不起名」。
   */
  confirmCreate(): void {
    const mode = this.mode();
    const branchId = mode === 'new' ? this.newBranch().trim() : this.selection();
    if (!branchId) {
      this.createError.set(mode === 'new' ? 'Branch name is required.' : 'Pick a branch.');
      return;
    }
    const label = this.label();
    this.createWorktree.emit({ mode, branchId, label: label === '' ? undefined : label });
  }
}
