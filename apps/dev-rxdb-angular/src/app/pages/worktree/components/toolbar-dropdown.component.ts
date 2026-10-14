import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  output,
  signal,
  TemplateRef,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideCheck as Check,
  LucideChevronDown as ChevronDown,
  LucideDynamicIcon,
  type LucideIconInput,
  LucidePlus as Plus,
  LucideSearch as Search
} from '@lucide/angular';
import { isImeComposing } from '../worktree.ime';

/** 一个下拉的全部界面文案；分支 / worktree 两个包装各定义一份常量。 */
export interface WorktreeToolbarDropdownCopy {
  /** 触发按钮上的小字（`Current Branch`） */
  readonly caption: string;
  /** 列表顶部的分组标题，后面跟条数（`Branches (3)`） */
  readonly heading: string;
  /** 新建按钮的文案（`New branch`） */
  readonly createButton: string;
  /** 创建弹层（`role="dialog"`）的可访问名（`Create a branch`）；可见标题由包装的创建表单自己画 */
  readonly createTitle: string;
  /** 筛选框的占位文字 */
  readonly filterPlaceholder: string;
  /** 筛选框的可访问名（`Filter branches`） */
  readonly filterLabel: string;
  /** 列表弹层（`role="dialog"`）的可访问名（`Branch list`） */
  readonly listLabel: string;
  /** 背板的可访问名（`Close branch menu`；e2e 点它关菜单） */
  readonly backdropLabel: string;
  /** 一条都没有时的占位行（`No branches yet`） */
  readonly emptyText: string;
  /** 筛空时的占位行（`No matching branches`） */
  readonly noMatchText: string;
}

/** 行内补充信息插槽的模板上下文：`let-item` 拿到这一行的条目。 */
export interface WorktreeDropdownRowContext<T> {
  readonly $implicit: T;
}

/** 行右端操作插槽的模板上下文：条目 + 下拉是否忙（`let-busy="busy"`）。 */
export interface WorktreeDropdownRowActionsContext<T> {
  readonly $implicit: T;
  readonly busy: boolean;
}

/** 行上的右键：条目 + 原始事件（页面据此定位右键菜单）。 */
export interface WorktreeDropdownContextMenuRequest<T> {
  readonly item: T;
  readonly event: MouseEvent;
}

/**
 * 行内补充信息插槽：渲染在行按钮里、名字之后（父分支 + 相对时间 / 所钉分支）。
 *
 * @remarks
 * 绑定值只用来推断条目类型：传与下拉 `items` 同一个数组，`let-` 出来的条目就带上元素类型，
 * 模板里读它的字段才过得了 strictTemplates。
 */
@Directive({ selector: 'ng-template[appWorktreeDropdownRowMeta]', standalone: true })
export class WorktreeDropdownRowMetaDirective<T> {
  readonly appWorktreeDropdownRowMeta = input.required<readonly T[]>();
  readonly template = inject<TemplateRef<WorktreeDropdownRowContext<T>>>(TemplateRef);

  /**
   * 只在模板类型检查时生效：告诉编译器 `let-` 出来的上下文是什么形状（运行时从不调用）。
   * 判定写在只有类型的重载签名上，实现体不收参数——参数只出现在类型谓词里。
   */
  static ngTemplateContextGuard<T>(
    directive: WorktreeDropdownRowMetaDirective<T>,
    context: unknown
  ): context is WorktreeDropdownRowContext<T>;
  static ngTemplateContextGuard(): boolean {
    return true;
  }
}

/**
 * 行右端操作插槽（可选）：渲染在行按钮的**兄弟**位置（`<button>` 里套 `<button>` 是非法 HTML）。
 *
 * @remarks
 * 绑定值的用途同 {@link WorktreeDropdownRowMetaDirective}。上下文里的 `busy` 让操作按钮跟着禁用。
 */
@Directive({ selector: 'ng-template[appWorktreeDropdownRowActions]', standalone: true })
export class WorktreeDropdownRowActionsDirective<T> {
  readonly appWorktreeDropdownRowActions = input.required<readonly T[]>();
  readonly template = inject<TemplateRef<WorktreeDropdownRowActionsContext<T>>>(TemplateRef);

  /** 同 {@link WorktreeDropdownRowMetaDirective.ngTemplateContextGuard}。 */
  static ngTemplateContextGuard<T>(
    directive: WorktreeDropdownRowActionsDirective<T>,
    context: unknown
  ): context is WorktreeDropdownRowActionsContext<T>;
  static ngTemplateContextGuard(): boolean {
    return true;
  }
}

/** 创建弹层的表单插槽（标题 + 输入控件）；错误行与 Cancel / Create 两个按钮由下拉自己画。 */
@Directive({ selector: 'ng-template[appWorktreeDropdownCreate]', standalone: true })
export class WorktreeDropdownCreateDirective {
  readonly template = inject<TemplateRef<void>>(TemplateRef);
}

/**
 * 工具栏下拉的共用骨架：分支下拉（`branch-menu.component.ts`）与 worktree 下拉
 * （`worktree-menu.component.ts`）都是它的薄包装，开合、Escape、回车提交、焦点、筛选、ARIA
 * 与忙态的毛病在这里只修一次。
 *
 * @remarks
 * 下拉与创建弹层都是**内联**渲染（absolute 定位在按钮下方）而不是 CDK overlay：overlay 会把节点
 * 追加到 `<body>` 末尾，Tab 顺序上排在整页面板之后——键盘用户从触发按钮按 Tab 会直接跳进侧栏，
 * 永远走不进下拉。内联渲染让「按钮 → 新建 → 筛选框 → 行」落在自然 DOM 顺序里，a11y 用例的纯 Tab
 * 走查才走得通。
 *
 * **下拉必须左对齐（`left-0`）而不是右对齐。** 应用壳的侧栏展开后占 240px，`#layout-container`
 * 是 `overflow: auto` 的滚动容器；右对齐会让下拉向左伸进侧栏区域，被滚动容器裁剪——裁掉的那块
 * 恰好是操作按钮的位置，点击会被 fixed 背板吃掉（2026-09-18 实测复现，见 e2e）。
 *
 * ARIA：列表弹层是**非模态 dialog**（里面有筛选框、新建按钮和一列普通按钮，不是 `menu` /
 * `menuitem` 那套方向键模型——旧的 `role="menu"` 结构 axe 判不合法）；行是 `<ul>/<li>` 里的
 * 普通 `<button>`，当前项带 `aria-current="true"`。列表读取失败时警示条**顶替** `<ul>`：
 * `<li role="alert">` 过不了 axe 的 `list` 规则。
 *
 * 插槽是带 `ngTemplateContextGuard` 的 `ng-template` 标记指令、按需懒渲染，而不是 `ng-content`：
 * 行内容要随每一行重复渲染，`ng-content` 只投影一次。
 */
@Component({
  selector: 'app-worktree-toolbar-dropdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideDynamicIcon, NgTemplateOutlet],
  host: {
    class: 'flex h-full items-stretch',
    '(document:keydown)': 'onDocumentKeydown($event)'
  },
  template: `
    <div class="relative flex-1">
      <button
        class="gd-toolbar-select"
        [attr.aria-controls]="ids().popup"
        [attr.aria-expanded]="menuOpen()"
        [attr.data-testid]="ids().menu"
        (click)="toggleMenu()"
        aria-haspopup="dialog"
        type="button"
      >
        <svg [lucideIcon]="icon()" size="18"></svg>
        <span class="min-w-0 flex-1 text-left"
          ><small>{{ copy().caption }}</small
          ><strong class="truncate" [attr.data-testid]="ids().current">{{ value() || '…' }}</strong></span
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
          [attr.aria-label]="copy().backdropLabel"
          [style.background]="'rgba(0, 0, 0, 0.35)'"
          (click)="closeAll()"
          (keydown.escape)="closeAll()"
          role="button"
          tabindex="0"
        ></div>
      }

      @if (createOpen()) {
        <!-- 回车提交只在这一个监听里（见 onCreateKeydown）；两个包装都不碰按键 -->
        <div
          class="gd-menu gd-menu-flush gd-branch-create-popover absolute top-full left-0 z-40 mt-1"
          #createPopover
          [attr.aria-label]="copy().createTitle"
          [attr.data-testid]="ids().createPopover"
          [style.width.px]="popupWidth()"
          (keydown)="onCreateKeydown($event)"
          role="dialog"
        >
          <div class="flex flex-col gap-2">
            <ng-container [ngTemplateOutlet]="createBody().template" />
            @if (createError(); as error) {
              <p class="text-xs text-red-600" role="alert">{{ error }}</p>
            }
            <div class="flex justify-end gap-2">
              <button
                class="gd-btn-secondary"
                [attr.data-testid]="ids().createCancel"
                (click)="closeAll()"
                type="button"
              >
                Cancel
              </button>
              <button
                class="gd-btn-primary"
                [attr.data-testid]="ids().createConfirm"
                [disabled]="busy()"
                (click)="submitCreate()"
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
          [attr.aria-label]="copy().listLabel"
          [attr.data-testid]="ids().popup"
          [id]="ids().popup"
          [style.height]="'calc(100vh - 50px)'"
          [style.width.px]="popupWidth()"
          role="dialog"
        >
          <div class="flex items-center justify-between px-3 pt-1 pb-1.5">
            <span class="text-[11px] font-semibold uppercase" [style.color]="'var(--gd-muted)'"
              >{{ copy().heading }} ({{ items().length }})</span
            >
            <button
              class="gd-btn-ghost shrink-0"
              [attr.data-testid]="ids().create"
              [disabled]="createBlocked()"
              (click)="openCreate()"
              type="button"
            >
              <svg [lucideIcon]="Plus" size="12"></svg>
              {{ copy().createButton }}
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
              [attr.aria-label]="copy().filterLabel"
              [ngModel]="filter()"
              [placeholder]="copy().filterPlaceholder"
              [style.padding-left.px]="26"
              (ngModelChange)="filter.set($event)"
              type="text"
            />
          </div>
          @if (listError(); as error) {
            <div
              class="gd-warn-strip mx-2 flex items-center gap-2 rounded"
              [attr.data-testid]="ids().listError"
              role="alert"
            >
              <span class="min-w-0 flex-1">{{ error }}</span>
              <button
                class="gd-btn-secondary shrink-0"
                [attr.data-testid]="ids().listRetry"
                (click)="retry.emit()"
                type="button"
              >
                Retry
              </button>
            </div>
          } @else {
            <ul class="min-h-0 flex-1 overflow-y-auto py-1">
              @for (item of filteredItems(); track itemKey()(item)) {
                @let active = isActive()(item);
                <li>
                  <div class="flex items-stretch">
                    <button
                      class="gd-menu-row min-w-0 flex-1"
                      [attr.aria-current]="active ? 'true' : null"
                      [attr.data-branch-id]="itemBranchId()(item)"
                      [attr.data-testid]="ids().item"
                      [disabled]="busy()"
                      (click)="onRowClick(item)"
                      (contextmenu)="rowContextMenu.emit({ item: item, event: $event })"
                      type="button"
                    >
                      <!-- 当前项：前导图标换成勾（GitHub Desktop 同款） -->
                      <svg
                        class="shrink-0"
                        [lucideIcon]="active ? Check : icon()"
                        [style.color]="active ? 'var(--gd-accent)' : null"
                        size="12"
                      ></svg>
                      <!-- 名字紧贴标签、不留空白：label 原样落库，前后空格也是它的一部分 -->
                      <span
                        class="min-w-0 flex-1 truncate text-sm font-medium"
                        [attr.data-testid]="ids().labelText"
                        [class.text-green-700]="active"
                        >{{ itemLabel()(item) }}</span
                      >
                      <ng-container
                        [ngTemplateOutlet]="rowMeta().template"
                        [ngTemplateOutletContext]="{ $implicit: item }"
                      />
                    </button>
                    @if (rowActions(); as actions) {
                      <ng-container
                        [ngTemplateOutlet]="actions.template"
                        [ngTemplateOutletContext]="{ $implicit: item, busy: busy() }"
                      />
                    }
                  </div>
                </li>
              }
              @if (items().length === 0) {
                <li class="px-4 py-4 text-center text-sm" [style.color]="'var(--gd-muted)'">{{ copy().emptyText }}</li>
              } @else if (filteredItems().length === 0) {
                <li class="px-4 py-4 text-center text-sm" [style.color]="'var(--gd-muted)'">
                  {{ copy().noMatchText }}
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
  `
})
export class WorktreeToolbarDropdownComponent<T> {
  readonly #injector = inject(Injector);

  /** e2e 锚点前缀；全部测试 id 由它派生（见 {@link ids}）。 */
  readonly testIdPrefix = input.required<'wt-branch' | 'wt-worktree'>();
  readonly copy = input.required<WorktreeToolbarDropdownCopy>();
  /** 触发按钮与非当前行的前导图标。 */
  readonly icon = input.required<LucideIconInput>();
  /** 触发按钮上的粗体当前值；空串时显示 `…`。 */
  readonly value = input('');
  /** 下拉面板宽：与仓库 foldout 同宽（页面把宽度传进来）。 */
  readonly popupWidth = input(320);
  readonly items = input.required<readonly T[]>();
  readonly itemKey = input.required<(item: T) => string>();
  readonly itemLabel = input.required<(item: T) => string>();
  /** 行按钮上的 `data-branch-id`（e2e 按它取行，见 `worktree-utils.ts` 的 `worktreeRow`）。 */
  readonly itemBranchId = input.required<(item: T) => string>();
  readonly isActive = input.required<(item: T) => boolean>();
  /** 筛选判据；`needle` 已经 trim + 小写，且非空。 */
  readonly matches = input.required<(item: T, needle: string) => boolean>();
  /** 有命令在途：新建按钮、每个行按钮与 Create 按钮都禁用，`confirm` 也不发。 */
  readonly busy = input(false);
  /** 列表读取失败的提示；非 null 时警示条顶替列表，新建按钮禁用。 */
  readonly listError = input<string | null>(null);
  /** 创建弹层里的就地错误（`role="alert"`）。 */
  readonly createError = input<string | null>(null);
  /** 变了就把焦点重新送进 `[data-autofocus]`：worktree 弹层切模式时换了输入控件。 */
  readonly createFocusKey = input('');
  /** 列表开合；创建弹层打开时恒为 false（两态互斥，避免两个弹层叠着）。 */
  readonly menuOpen = model(false);
  readonly createOpen = model(false);

  /** 点了非当前行；点当前行只收起菜单，不发它。 */
  readonly selectItem = output<T>();
  /** 行上的右键；分支下拉据此拼右键菜单，worktree 下拉不接（留给浏览器原生菜单）。 */
  readonly rowContextMenu = output<WorktreeDropdownContextMenuRequest<T>>();
  /** `createOpen` 变成 true 的前一刻：包装在这里重置表单。 */
  readonly createOpening = output<void>();
  /** 创建确认（Create 按钮或文本框里的回车）；校验与提交由包装做。 */
  readonly confirm = output<void>();
  /** 列表读取失败后的「Retry」。 */
  readonly retry = output<void>();

  /** 筛选框文字；每次**打开**列表时清空（关闭可能来自页面直接改 `menuOpen`，不经这里）。 */
  readonly filter = signal('');

  readonly rowMeta = contentChild.required<WorktreeDropdownRowMetaDirective<T>>(WorktreeDropdownRowMetaDirective);
  readonly rowActions = contentChild<WorktreeDropdownRowActionsDirective<T>>(WorktreeDropdownRowActionsDirective);
  readonly createBody = contentChild.required(WorktreeDropdownCreateDirective);
  readonly createPopover = viewChild<ElementRef<HTMLElement>>('createPopover');

  /**
   * 由 `testIdPrefix` 派生的全部测试 id。grep 完整 id 会落到这张表：
   *
   * | 后缀               | 元素                                               | 分支 / worktree                                        |
   * | ------------------ | -------------------------------------------------- | ------------------------------------------------------ |
   * | `-menu`            | 触发按钮                                           | `wt-branch-menu` / `wt-worktree-menu`                  |
   * | `-current`         | 触发按钮上的当前值                                 | `wt-branch-current` / `wt-worktree-current`            |
   * | `-menu-popup`      | 列表弹层（也是它的 `id`，触发按钮 `aria-controls`）| `wt-branch-menu-popup` / `wt-worktree-menu-popup`      |
   * | `-create`          | 「New …」按钮                                      | `wt-branch-create` / `wt-worktree-create`              |
   * | `-create-popover`  | 创建弹层                                           | `wt-branch-create-popover` / `wt-worktree-create-popover` |
   * | `-create-cancel`   | 创建弹层的 Cancel                                  | `wt-branch-create-cancel` / `wt-worktree-create-cancel` |
   * | `-create-confirm`  | 创建弹层的 Create                                  | `wt-branch-create-confirm` / `wt-worktree-create-confirm` |
   * | `-item`            | 行按钮（带 `data-branch-id`）                      | `wt-branch-item` / `wt-worktree-item`                  |
   * | `-label-text`      | 行按钮里的名字                                     | `wt-branch-label-text` / `wt-worktree-label-text`      |
   * | `-list-error`      | 列表读取失败的警示条（`role="alert"`）             | `wt-branch-list-error` / `wt-worktree-list-error`      |
   * | `-list-retry`      | 警示条里的 Retry                                   | `wt-branch-list-retry` / `wt-worktree-list-retry`      |
   */
  readonly ids = computed(() => {
    const prefix = this.testIdPrefix();
    return {
      menu: `${prefix}-menu`,
      current: `${prefix}-current`,
      popup: `${prefix}-menu-popup`,
      create: `${prefix}-create`,
      createPopover: `${prefix}-create-popover`,
      createCancel: `${prefix}-create-cancel`,
      createConfirm: `${prefix}-create-confirm`,
      item: `${prefix}-item`,
      labelText: `${prefix}-label-text`,
      listError: `${prefix}-list-error`,
      listRetry: `${prefix}-list-retry`
    };
  });

  /** 筛出来的行；空筛选 = 全量（大小写不敏感的子串匹配，判据由包装给）。 */
  readonly filteredItems = computed(() => {
    const needle = this.filter().trim().toLowerCase();
    const items = this.items();
    if (needle === '') return items;
    const matches = this.matches();
    return items.filter(item => matches(item, needle));
  });

  /** 新建按钮禁用：有命令在途，或列表没读出来（手上没有真实的已有集合，建出来的东西对不上号）。 */
  readonly createBlocked = computed(() => this.busy() || this.listError() !== null);

  readonly Check = Check;
  readonly ChevronDown = ChevronDown;
  readonly Plus = Plus;
  readonly Search = Search;

  constructor() {
    // 弹层一出现（或换了输入控件）就把焦点送进 `[data-autofocus]`：创建是两步操作，第二步不能靠
    // 用户自己再点一下。等这一轮渲染落地再找——插槽是懒渲染的，effect 跑的时候它还不在 DOM 里。
    effect(() => {
      if (!this.createOpen()) return;
      // 只为建立依赖：worktree 弹层切模式时 key 变了，焦点要跟到新出现的控件上。
      this.createFocusKey();
      afterNextRender(() => this.focusAutofocusTarget(), { injector: this.#injector });
    });
  }

  toggleMenu(): void {
    if (this.menuOpen()) {
      this.closeAll();
      return;
    }
    this.createOpen.set(false);
    this.filter.set('');
    this.menuOpen.set(true);
  }

  /** 进创建弹层：先收起列表，再让包装重置表单，最后才打开（包装读到的是干净的初值）。 */
  openCreate(): void {
    if (this.createBlocked()) return;
    this.menuOpen.set(false);
    this.createOpening.emit();
    this.createOpen.set(true);
  }

  closeAll(): void {
    this.menuOpen.set(false);
    this.createOpen.set(false);
  }

  /** 点行：非当前项交给包装（立即切换，GitHub Desktop 同款）；当前项只收起菜单。 */
  onRowClick(item: T): void {
    if (this.isActive()(item)) {
      this.closeAll();
      return;
    }
    this.selectItem.emit(item);
  }

  /**
   * 创建弹层里唯一的回车提交入口。
   *
   * 只认文本框里的回车：Create 按钮上的回车本来就会触发一次原生 click，这里再发一次 `confirm`
   * 就是双重提交；单选框 / 下拉框上的回车也不该提交。组字中的回车让给输入法（选词用）。
   */
  onCreateKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || isImeComposing(event)) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'text') return;
    this.submitCreate();
  }

  /** Create 按钮与回车共用；忙时直接返回（zoneless 下 `disabled` 未必赶在第二次点击之前生效）。 */
  submitCreate(): void {
    if (this.busy()) return;
    this.confirm.emit();
  }

  /**
   * Escape 走 document 级监听而不是挂在容器 div 上：焦点在菜单 / 弹层的任意子元素上时事件都能
   * 冒泡到 document，而容器 div 挂交互 handler 会撞 `interactive-supports-focus` 的 lint 规则。
   * 监听的是整个 `keydown` 而不是 `keydown.escape`：带按键修饰的宿主监听，`$event` 只被类型检查成
   * `Event`，读不到 `isComposing`。
   *
   * 两个弹层都关着时什么都不做；组字中的 Escape 是输入法在取消候选，不关弹层。其余情况照旧
   * 一次收起所有层（a11y 走查靠这一下从右键菜单一路退回工具栏）。
   */
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (!this.menuOpen() && !this.createOpen()) return;
    if (isImeComposing(event)) return;
    this.closeAll();
  }

  /** 把焦点送进创建弹层里标了 `data-autofocus` 的控件；弹层已经关了就什么都不做。 */
  private focusAutofocusTarget(): void {
    this.createPopover()?.nativeElement.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }
}
