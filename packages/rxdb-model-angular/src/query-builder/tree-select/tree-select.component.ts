import { applyPopoverPosition, findNodeByValue, getDisplayNamePath, type FieldTreeNode } from '@aiao/rxdb-model';
import { ActiveDescendantKeyManager, type Highlightable } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  Injector,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  viewChildren
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  LucideBraces as BracesIcon,
  LucideCalendar as CalendarIcon,
  LucideChevronDown as ChevronDownIcon,
  LucideChevronRight as ChevronRightIcon,
  LucideHash as HashIcon,
  LucideLink2 as Link2Icon,
  LucideListChecks as ListChecksIcon,
  LucideList as ListIcon,
  LucideDynamicIcon,
  LucideTable as TableIcon,
  LucideToggleLeft as ToggleLeftIcon,
  LucideType as TypeIcon,
  type LucideIconInput
} from '@lucide/angular';

let _uid = 0;

/** 扁平化的可见树节点（用于渲染和键盘导航） */
interface FlatItem {
  node: FieldTreeNode;
  depth: number;
  isExpandable: boolean;
  isExpanded: boolean;
}

/**
 * 树节点 Directive，实现 CDK {@link Highlightable} 接口
 *
 * 用于 {@link ActiveDescendantKeyManager} 管理键盘导航时的激活样式。
 * `exportAs: 'rxdbTreeItem'` 允许模板中通过 `#ref="rxdbTreeItem"` 访问实例。
 */
@Directive({
  selector: '[rxdbTreeItem]',
  standalone: true,
  exportAs: 'rxdbTreeItem'
})
export class TreeItemDirective implements Highlightable {
  private readonly _active = signal(false);
  readonly isActive = this._active.asReadonly();

  setActiveStyles(): void {
    this._active.set(true);
  }

  setInactiveStyles(): void {
    this._active.set(false);
  }
}

/**
 * 树形下拉选择组件
 *
 * @description
 * 基于 Popover API 和 `@angular/cdk/a11y` 的树形字段选择器：
 * - 使用原生 Popover API，在 `overflow` 容器中不被裁剪
 * - 支持关键字过滤（自动展开匹配路径）
 * - 支持展开/折叠关系节点
 * - 键盘导航：↑↓ 移动、→ 展开、← 折叠、Enter 选中、Escape 关闭
 * - 使用 CDK `ActiveDescendantKeyManager` + `aria-activedescendant` 满足 WAI-ARIA 无障碍规范
 *
 * @example
 * ```html
 * <rxdb-tree-select
 *   [nodes]="fieldTree()"
 *   [selected]="selectedField()"
 *   placeholder="选择字段"
 *   (selectChange)="onFieldSelect($event)"
 * />
 * ```
 */
@Component({
  selector: 'rxdb-tree-select',
  standalone: true,
  imports: [FormsModule, TreeItemDirective, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- 触发按钮 -->
    <button
      class="select select-sm text-left"
      #trigger
      [attr.popovertarget]="uid"
      [style.min-width]="minWidth()"
      aria-haspopup="tree"
      type="button"
    >
      @if (selectedNode(); as node) {
        <svg
          class="w-3.5 shrink-0"
          [class]="typeColorMap[node.type] ?? defaultTypeColor"
          [lucideIcon]="typeIconMap[node.type] ?? defaultTypeIcon"
          size="14"
        ></svg>
      }
      <span class="min-w-0 grow truncate">{{ displayValue() }}</span>
    </button>

    <!-- Popover 浮层 -->
    <div
      class="bg-base-100 text-base-content rounded-box border-base-300 border shadow-xl"
      #popoverEl
      [id]="uid"
      [style.min-width]="minWidth()"
      (beforetoggle)="onBeforeToggle($event)"
      (keydown)="onKeydown($event)"
      (toggle)="onToggle($event)"
      popover
      tabindex="-1"
    >
      <!-- 过滤输入框 -->
      <div class="mb-1 p-1">
        <input
          class="input input-sm w-full"
          #filterInput
          [attr.aria-activedescendant]="activeItemId()"
          [attr.aria-controls]="listId"
          [attr.aria-expanded]="true"
          [attr.aria-owns]="listId"
          [ngModel]="filterText()"
          (ngModelChange)="filterText.set($event)"
          aria-autocomplete="list"
          placeholder="搜索字段..."
          role="combobox"
          type="text"
        />
      </div>

      <!-- 树形列表 -->
      <ul
        class="menu menu-sm max-h-60 w-full flex-nowrap overflow-y-auto px-2"
        [attr.aria-label]="placeholder()"
        [id]="listId"
        role="tree"
      >
        @for (item of visibleItems(); track trackItem(item)) {
          <li [style.padding-left.rem]="item.depth * 0.75" role="none">
            <button
              class="flex w-full items-center gap-1.5 text-left text-sm"
              #treeItemRef="rxdbTreeItem"
              [attr.aria-expanded]="item.isExpandable ? item.isExpanded : null"
              [attr.aria-selected]="!item.isExpandable ? item.node.value === selected() : null"
              [class.bg-primary/15]="!item.isExpandable && item.node.value === selected()"
              [class.font-semibold]="!item.isExpandable && item.node.value === selected()"
              [class.menu-focus]="treeItemRef.isActive()"
              [id]="uid + '-item-' + item.node.value"
              (click)="onItemClick(item)"
              role="treeitem"
              rxdbTreeItem
              type="button"
            >
              <svg
                class="w-3.5 shrink-0"
                [class]="typeColorMap[item.node.type] ?? defaultTypeColor"
                [lucideIcon]="typeIconMap[item.node.type] ?? defaultTypeIcon"
                size="14"
              ></svg>
              <span class="min-w-0 grow truncate">{{ item.node.displayName || item.node.label }}</span>
              @if (!item.isExpandable && item.node.value === selected()) {
                <svg
                  class="text-primary h-3 w-3 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.5"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              }
              @if (item.isExpandable) {
                <span class="shrink-0 text-xs opacity-40">{{ item.node.children!.length }}</span>
                @if (item.isExpanded) {
                  <svg class="w-3.5 shrink-0 opacity-50" [lucideIcon]="ChevronDownIcon" size="14"></svg>
                } @else {
                  <svg class="w-3.5 shrink-0 opacity-50" [lucideIcon]="ChevronRightIcon" size="14"></svg>
                }
              }
            </button>
          </li>
        } @empty {
          <li class="px-3 py-1.5 text-sm opacity-50">无匹配字段</li>
        }
      </ul>
    </div>
  `
})
export class TreeSelectComponent {
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly popoverEl = viewChild.required<ElementRef<HTMLElement>>('popoverEl');
  private readonly filterInput = viewChild<ElementRef<HTMLInputElement>>('filterInput');
  private readonly treeItemDirs = viewChildren(TreeItemDirective);
  private readonly expandedPaths = signal(new Set<string>());
  private readonly keyManager: ActiveDescendantKeyManager<TreeItemDirective>;
  private readonly _activeIdx = signal(-1);

  protected readonly uid = `rxdb-ts-${++_uid}`;
  protected readonly listId = `${this.uid}-list`;
  protected readonly filterText = signal('');
  protected readonly ChevronDownIcon = ChevronDownIcon;
  protected readonly ChevronRightIcon = ChevronRightIcon;
  protected readonly typeIconMap: Partial<Record<string, LucideIconInput>> = {
    string: TypeIcon,
    number: HashIcon,
    boolean: ToggleLeftIcon,
    date: CalendarIcon,
    array: ListIcon,
    object: BracesIcon,
    relation: Link2Icon,
    enum: ListChecksIcon,
    keyValue: TableIcon
  };
  protected readonly typeColorMap: Partial<Record<string, string>> = {
    string: 'text-success',
    number: 'text-warning',
    boolean: 'text-info',
    date: 'text-secondary',
    array: 'text-accent',
    object: 'text-base-content/60',
    relation: 'text-primary',
    enum: 'text-warning',
    keyValue: 'text-accent'
  };
  protected readonly defaultTypeIcon = TypeIcon;
  protected readonly defaultTypeColor = 'text-base-content/40';

  readonly nodes = input.required<FieldTreeNode[]>();
  readonly selected = input<string>('');
  readonly placeholder = input<string>('请选择');
  readonly minWidth = input<string>('14rem');
  readonly selectChange = output<string>();

  readonly displayValue = computed(() => {
    const sel = this.selected();
    return sel ? getDisplayNamePath(this.nodes(), sel) || sel : this.placeholder();
  });

  readonly selectedNode = computed(() => {
    const sel = this.selected();
    return sel ? findNodeByValue(this.nodes(), sel) : null;
  });

  readonly visibleItems = computed<FlatItem[]>(() => {
    const filter = this.filterText().toLowerCase().trim();
    const expanded = this.expandedPaths();
    return filter ? buildFilteredItems(this.nodes(), filter) : buildExpandedItems(this.nodes(), expanded, 0);
  });

  readonly activeItemId = computed(() => {
    const idx = this._activeIdx();
    if (idx < 0) return null;
    const vis = this.visibleItems();
    return idx < vis.length ? `${this.uid}-item-${vis[idx].node.value}` : null;
  });

  constructor() {
    const injector = inject(Injector);

    // Signal 初始化必须在 injection context 内（constructor）
    this.keyManager = new ActiveDescendantKeyManager(this.treeItemDirs, injector).withWrap().withHomeAndEnd();

    // 同步 key manager 的激活索引到本地 signal（用于 aria-activedescendant）
    this.keyManager.change.pipe(takeUntilDestroyed()).subscribe(idx => this._activeIdx.set(idx));

    // 过滤文本变化时，自动高亮第一项
    effect(() => {
      this.filterText();
      untracked(() => {
        setTimeout(() => {
          this.keyManager.setFirstItemActive();
          this._activeIdx.set(this.keyManager.activeItemIndex ?? -1);
        });
      });
    });
  }

  onBeforeToggle(event: Event): void {
    const te = event as ToggleEvent;
    if (te.newState === 'open') {
      applyPopoverPosition(this.popoverEl().nativeElement, this.trigger().nativeElement.getBoundingClientRect());
      this.filterText.set('');
    } else {
      this._activeIdx.set(-1);
      this.keyManager.setActiveItem(-1);
    }
  }

  onToggle(event: Event): void {
    if ((event as ToggleEvent).newState === 'open') {
      this.filterInput()?.nativeElement.focus();
      setTimeout(() => {
        this.keyManager.setFirstItemActive();
        this._activeIdx.set(this.keyManager.activeItemIndex ?? -1);
      });
    }
  }

  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        this.keyManager.onKeydown(event);
        this.scrollActiveIntoView();
        break;
      }
      case 'ArrowRight': {
        event.preventDefault();
        const item = this.visibleItems()[this.keyManager.activeItemIndex ?? -1];
        if (item?.isExpandable && !item.isExpanded) this.toggleExpand(item.node.value);
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        const item = this.visibleItems()[this.keyManager.activeItemIndex ?? -1];
        if (item?.isExpandable && item.isExpanded) this.toggleExpand(item.node.value);
        break;
      }
      case 'Enter': {
        event.preventDefault();
        const item = this.visibleItems()[this.keyManager.activeItemIndex ?? -1];
        if (item) this.onItemClick(item);
        break;
      }
      case 'Escape': {
        event.preventDefault();
        this.popoverEl().nativeElement.hidePopover();
        this.trigger().nativeElement.focus();
        break;
      }
      case 'Tab': {
        this.popoverEl().nativeElement.hidePopover();
        break;
      }
    }
  }

  onItemClick(item: FlatItem): void {
    if (item.isExpandable) {
      this.toggleExpand(item.node.value);
    } else {
      this.selectChange.emit(item.node.value);
      this.popoverEl().nativeElement.hidePopover();
      this.trigger().nativeElement.focus();
    }
  }
  /** 追踪函数：使用 value + isExistsOption 避免重复 key */
  protected trackItem(item: FlatItem): string {
    return item.node.isExistsOption ? `${item.node.value}:exists` : item.node.value;
  }
  private scrollActiveIntoView(): void {
    const idx = this.keyManager.activeItemIndex ?? -1;
    const item = this.visibleItems()[idx];
    if (!item) return;
    document.getElementById(`${this.uid}-item-${item.node.value}`)?.scrollIntoView({ block: 'nearest' });
  }

  private toggleExpand(value: string): void {
    this.expandedPaths.update(prev => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }
}

// ─── 辅助函数 ───────────────────────────────────────────────────────────────────

function buildExpandedItems(nodes: FieldTreeNode[], expanded: Set<string>, depth: number): FlatItem[] {
  const result: FlatItem[] = [];
  for (const node of nodes) {
    const isExpandable = !!node.children?.length;
    const isExpanded = isExpandable && expanded.has(node.value);
    result.push({ node, depth, isExpandable, isExpanded });
    if (isExpanded) {
      result.push(...buildExpandedItems(node.children!, expanded, depth + 1));
    }
  }
  return result;
}

function buildFilteredItems(nodes: FieldTreeNode[], filter: string, depth = 0): FlatItem[] {
  const result: FlatItem[] = [];
  for (const node of nodes) {
    const selfMatches = nodeMatchesFilter(node, filter);
    const isExpandable = !!node.children?.length;
    const childMatches = isExpandable && hasMatchingDescendant(node.children!, filter);

    if (selfMatches || childMatches) {
      result.push({ node, depth, isExpandable, isExpanded: isExpandable && childMatches });
      if (isExpandable && (selfMatches || childMatches)) {
        result.push(...buildFilteredItems(node.children!, filter, depth + 1));
      }
    }
  }
  return result;
}

function nodeMatchesFilter(node: FieldTreeNode, filter: string): boolean {
  return (
    node.label.toLowerCase().includes(filter) ||
    node.displayName.toLowerCase().includes(filter) ||
    (node.description?.toLowerCase().includes(filter) ?? false)
  );
}

function hasMatchingDescendant(nodes: FieldTreeNode[], filter: string): boolean {
  return nodes.some(
    n => nodeMatchesFilter(n, filter) || (n.children?.length ? hasMatchingDescendant(n.children, filter) : false)
  );
}

/** 从树中找到节点（同 rxdb-model 的 findNodeByValue，此处作为 tree-select 内部别名） */
export { findNodeByValue };
