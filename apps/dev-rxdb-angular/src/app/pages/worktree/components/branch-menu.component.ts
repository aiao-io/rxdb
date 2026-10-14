import { RxDBBranch } from '@aiao/rxdb';
import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideChevronRight as ChevronRight,
  LucideGitBranch as GitBranch,
  LucideDynamicIcon,
  LucideMoreVertical as MoreVertical
} from '@lucide/angular';
import { gdRelativeTime } from '../worktree.gd';
import {
  WorktreeDropdownCreateDirective,
  WorktreeDropdownRowActionsDirective,
  WorktreeDropdownRowMetaDirective,
  WorktreeToolbarDropdownComponent,
  type WorktreeToolbarDropdownCopy
} from './toolbar-dropdown.component';

/** 分支下拉的全部文案（背板的 `Close branch menu` 是 e2e 点的锚点）。 */
const BRANCH_MENU_COPY: WorktreeToolbarDropdownCopy = {
  caption: 'Current Branch',
  heading: 'Branches',
  createButton: 'New branch',
  createTitle: 'Create a branch',
  filterPlaceholder: 'Filter',
  filterLabel: 'Filter branches',
  listLabel: 'Branch list',
  backdropLabel: 'Close branch menu',
  emptyText: 'No branches yet',
  noMatchText: 'No matching branches'
};

/**
 * 顶部分支栏里的分支选择器，模仿 GitHub Desktop 的分支下拉。
 *
 * @remarks
 * 下拉骨架（内联渲染、背板、筛选、Escape、回车提交、焦点、ARIA、忙态）在共用的
 * `toolbar-dropdown.component.ts`；这里只给分支行的补充信息（父分支 + 相对时间）与创建表单。
 *
 * 下拉顶部带筛选框（GitHub Desktop 的分支下拉同样可以打字筛）：按名字子串过滤，
 * 大小写不敏感。当前分支行的前导图标换成 ✓（GitHub Desktop 的选中标记）。
 *
 * **点行立即切换**（GitHub Desktop 同款）：切走仍走 `requireClean` 的被拒路径——
 * demo 要演的「脏工作树被拒」这一步，被拒的 toast 就是行点击的结果。切换 / 合并 / 删除 /
 * 复制分支名收在行的**右键菜单**里（GitHub Desktop 的分支右键菜单同款），菜单项由页面按条目拼。
 */
@Component({
  selector: 'app-worktree-branch-menu',
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
      [createError]="branchError()"
      [icon]="GitBranch"
      [isActive]="isActive"
      [itemBranchId]="branchId"
      [itemKey]="branchId"
      [itemLabel]="branchId"
      [items]="branches()"
      [matches]="matches"
      [popupWidth]="popupWidth()"
      [value]="activeBranch()"
      (confirm)="confirmCreate()"
      (createOpening)="resetCreate()"
      (rowContextMenu)="menuRequest.emit({ target: $event.item, event: $event.event })"
      (selectItem)="switchBranch.emit($event.id)"
      testIdPrefix="wt-branch"
    >
      <ng-template [appWorktreeDropdownRowMeta]="branches()" let-branch>
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
      </ng-template>

      <ng-template [appWorktreeDropdownRowActions]="branches()" let-branch let-busy="busy">
        <button
          class="gd-icon-btn hidden max-md:inline-flex pointer-coarse:inline-flex"
          [disabled]="busy"
          (click)="openRowMenu($event, branch)"
          aria-label="更多操作"
          data-testid="wt-branch-more"
          title="更多操作（触屏）"
          type="button"
        >
          <svg [lucideIcon]="MoreVertical" size="14"></svg>
        </button>
      </ng-template>
      <ng-template appWorktreeDropdownCreate>
        <div class="text-xs font-medium">
          Create a branch
          <span [style.color]="'var(--gd-muted)'">from {{ activeBranch() }}</span>
        </div>
        <input
          class="gd-input"
          [(ngModel)]="branchName"
          (input)="branchError.set(null)"
          data-autofocus
          data-testid="wt-branch-name"
          placeholder="feature/my-feature"
          type="text"
        />
      </ng-template>
    </app-worktree-toolbar-dropdown>
  `
})
export class WorktreeBranchMenuComponent {
  readonly MoreVertical = MoreVertical;

  readonly branches = input.required<readonly RxDBBranch[]>();
  readonly activeBranch = input('');
  /** 下拉面板宽：与仓库 foldout 同宽（页面把左栏宽传进来）。 */
  readonly popupWidth = input(320);
  /** 有分支命令在途（建 / 切 / 删）：新建按钮、分支行与 Create 一并禁用。 */
  readonly busy = input(false);
  /** 下拉开合；创建弹层打开时恒为 false（两态互斥，避免两个弹层叠着）。 */
  readonly menuOpen = model(false);
  readonly createOpen = model(false);
  readonly branchName = model('');
  readonly branchError = model<string | null>(null);

  readonly switchBranch = output<string>();
  /** 行上右键；页面按条目拼菜单（切换 / 合并 / 删除 / 复制分支名）。 */
  readonly menuRequest = output<{ target: RxDBBranch; event: MouseEvent }>();
  /** 创建确认；分支名校验与建库调用由页面做，组件只负责把名字交出去。 */
  readonly createBranch = output<string>();

  readonly COPY = BRANCH_MENU_COPY;
  readonly gdRelativeTime = gdRelativeTime;
  readonly ChevronRight = ChevronRight;
  readonly GitBranch = GitBranch;

  // 交给下拉的条目访问器（箭头函数字段：当作输入传下去时不丢 this；成员排序规则把它们算作方法）
  /** 行的 key、显示名与 `data-branch-id` 都是分支名本身。 */
  readonly branchId = (branch: RxDBBranch): string => branch.id;
  readonly isActive = (branch: RxDBBranch): boolean => branch.activated;
  /** 分支名筛选（大小写不敏感的子串匹配；`needle` 已由下拉小写化）。 */
  readonly matches = (branch: RxDBBranch, needle: string): boolean => branch.id.toLowerCase().includes(needle);

  /** 触屏操作按钮按自身位置打开与右键相同的菜单。 */
  openRowMenu(event: MouseEvent, branch: RxDBBranch): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuRequest.emit({
      target: branch,
      event: new MouseEvent('contextmenu', { clientX: rect.left, clientY: rect.bottom, bubbles: true })
    });
  }

  /** 创建弹层打开前清掉上一次的名字与错误。 */
  resetCreate(): void {
    this.branchName.set('');
    this.branchError.set(null);
  }

  /** 分支的展示时间：优先 updatedAt，没有就 createdAt。 */
  branchTime(branch: RxDBBranch): Date {
    return branch.updatedAt ?? branch.createdAt ?? new Date(0);
  }

  /** 空名不往页面交：那是一条必然被拒的往返，错误就地呈现。分支名两端的空白不算名字的一部分。 */
  confirmCreate(): void {
    const name = this.branchName().trim();
    if (!name) {
      this.branchError.set('Branch name is required.');
      return;
    }
    this.createBranch.emit(name);
  }
}
