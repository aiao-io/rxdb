/**
 * @fileoverview 树形下拉选择组件（Angular `TreeSelectComponent` 的 React 移植）。
 *
 * 语义与 Angular 侧一致：
 * - 基于 Popover API，在 `overflow` 容器中不被裁剪；
 * - 支持关键字过滤（自动展开匹配路径）、关系节点的展开/折叠；
 * - 键盘导航：↑↓ 循环移动（含 Home/End 语义）、→ 展开、← 折叠、Enter 选中、
 *   Escape 关闭并聚焦触发按钮、Tab 关闭；
 * - `aria-activedescendant` 满足 WAI-ARIA 无障碍规范。
 *
 * 差异：Angular 用 CDK `ActiveDescendantKeyManager` 管理高亮（`TreeItemDirective` 实现
 * `Highlightable`），React 侧以索引状态实现同语义导航；`TreeItemDirective` 仍导出
 * （保留公开 API 面的对称性）。
 *
 * @module query-builder/tree-select
 */
import { applyPopoverPosition, cn, findNodeByValue, getDisplayNamePath, type FieldTreeNode } from '@aiao/rxdb-model';
import {
  Braces,
  Calendar,
  ChevronDown,
  ChevronRight,
  Hash,
  Link2,
  List,
  ListChecks,
  Table,
  ToggleLeft,
  Type,
  type LucideIcon
} from 'lucide-react';
import { useMemo, useRef, useState, type JSX } from 'react';

let uidCounter = 0;

/** 扁平化的可见树节点（用于渲染和键盘导航）。 */
interface FlatItem {
  node: FieldTreeNode;
  depth: number;
  isExpandable: boolean;
  isExpanded: boolean;
}

/**
 * 树节点高亮指令（Angular 侧 `TreeItemDirective` 的 React 等价物）。
 *
 * @remarks
 * React 树形选择的激活态由组件内部索引管理，本类保留公开 API 面的对称性；
 * 自定义主题需要按 `Highlightable` 约定与树节点交互时使用。
 */
export class TreeItemDirective {
  #active = false;

  /** 当前节点是否处于激活（高亮）状态。 */
  get isActive(): boolean {
    return this.#active;
  }

  /** 设置激活样式（键盘导航命中时）。 */
  setActiveStyles(): void {
    this.#active = true;
  }

  /** 清除激活样式。 */
  setInactiveStyles(): void {
    this.#active = false;
  }
}

/** 类型 → lucide 图标映射（Angular 侧 `typeIconMap` 同表）。 */
const typeIconMap: Partial<Record<string, LucideIcon>> = {
  string: Type,
  number: Hash,
  boolean: ToggleLeft,
  date: Calendar,
  array: List,
  object: Braces,
  relation: Link2,
  enum: ListChecks,
  keyValue: Table
};

/** 类型 → 图标颜色映射（Angular 侧 `typeColorMap` 同表）。 */
const typeColorMap: Partial<Record<string, string>> = {
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

const defaultTypeIcon = Type;
const defaultTypeColor = 'text-base-content/40';

/** {@link TreeSelect} 的 props。 */
export interface TreeSelectProps {
  /** 树节点。 */
  nodes: FieldTreeNode[];
  /** 当前选中值。 */
  selected?: string;
  /** 占位文案，缺省 `'请选择'`。 */
  placeholder?: string;
  /** 触发器与弹层最小宽度，缺省 `'14rem'`。 */
  minWidth?: string;
  /** 选中回调。 */
  onSelectChange?: (value: string) => void;
}

/**
 * 树形下拉选择组件：Popover API + 过滤 + 展开/折叠 + 键盘导航。
 */
export function TreeSelect({
  nodes,
  selected = '',
  placeholder = '请选择',
  minWidth = '14rem',
  onSelectChange
}: TreeSelectProps): JSX.Element {
  const [uid] = useState(() => `rxdb-ts-${++uidCounter}`);
  const listId = `${uid}-list`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const [filterText, setFilterText] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(-1);

  const displayValue = selected ? getDisplayNamePath(nodes, selected) || selected : placeholder;

  const selectedNode = selected ? findNodeByValue(nodes, selected) : null;

  const visibleItems = useMemo<FlatItem[]>(() => {
    const filter = filterText.toLowerCase().trim();
    return filter ? buildFilteredItems(nodes, filter) : buildExpandedItems(nodes, expandedPaths, 0);
  }, [nodes, filterText, expandedPaths]);

  const activeItemId =
    activeIndex >= 0 && activeIndex < visibleItems.length ?
      `${uid}-item-${visibleItems[activeIndex].node.value}`
    : null;

  /** beforetoggle open：清空过滤词并应用弹层定位；closed：清空高亮索引。 */
  const onBeforeToggle = (event: React.ToggleEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.newState === 'open') {
      applyPopoverPosition(popoverRef.current as HTMLDivElement, triggerRef.current!.getBoundingClientRect());
      setFilterText('');
    } else {
      setActiveIndex(-1);
    }
  };

  /** toggle open：聚焦搜索框并高亮第一项。 */
  const onToggle = (event: React.ToggleEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.newState === 'open') {
      filterInputRef.current?.focus();
      setActiveIndex(visibleItems.length > 0 ? 0 : -1);
    }
  };

  /** 展开 / 折叠节点。 */
  const toggleExpand = (value: string): void => {
    setExpandedPaths(previous => {
      const next = new Set(previous);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const scrollActiveIntoView = (index: number): void => {
    const item = visibleItems[index];
    if (!item) return;
    document.getElementById(`${uid}-item-${item.node.value}`)?.scrollIntoView({ block: 'nearest' });
  };

  /** 点击节点：可展开节点切换展开态，叶子节点选中并关闭弹层。 */
  const onItemClick = (item: FlatItem): void => {
    if (item.isExpandable) {
      toggleExpand(item.node.value);
    } else {
      onSelectChange?.(item.node.value);
      popoverRef.current?.hidePopover();
      triggerRef.current?.focus();
    }
  };

  /** 键盘导航（↑↓ 循环、→ 展开、← 折叠、Enter 选中、Escape / Tab 关闭）。 */
  const onKeydown = (event: React.KeyboardEvent): void => {
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const len = visibleItems.length;
        if (len > 0) {
          const next = (activeIndex + 1) % len;
          setActiveIndex(next);
          scrollActiveIntoView(next);
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const len = visibleItems.length;
        if (len > 0) {
          const next = (activeIndex - 1 + len) % len;
          setActiveIndex(next);
          scrollActiveIntoView(next);
        }
        break;
      }
      case 'ArrowRight': {
        event.preventDefault();
        const item = visibleItems[activeIndex];
        if (item?.isExpandable && !item.isExpanded) toggleExpand(item.node.value);
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        const item = visibleItems[activeIndex];
        if (item?.isExpandable && item.isExpanded) toggleExpand(item.node.value);
        break;
      }
      case 'Enter': {
        event.preventDefault();
        const item = visibleItems[activeIndex];
        if (item) onItemClick(item);
        break;
      }
      case 'Escape': {
        event.preventDefault();
        popoverRef.current?.hidePopover();
        triggerRef.current?.focus();
        break;
      }
      case 'Tab': {
        popoverRef.current?.hidePopover();
        break;
      }
    }
  };

  const renderIcon = (item: FlatItem): JSX.Element => {
    const Icon = typeIconMap[item.node.type] ?? defaultTypeIcon;
    const color = typeColorMap[item.node.type] ?? defaultTypeColor;
    return <Icon className={cn('w-3.5 shrink-0', color)} size={14} />;
  };

  return (
    <>
      {/* 触发按钮 */}
      <button
        ref={triggerRef}
        className='select select-sm text-left'
        popoverTarget={uid}
        style={{ minWidth }}
        aria-haspopup='tree'
        type='button'
      >
        {selectedNode && renderIcon({ node: selectedNode, depth: 0, isExpandable: false, isExpanded: false })}
        <span className='min-w-0 grow truncate'>{displayValue}</span>
      </button>

      {/* Popover 浮层 */}
      <div
        ref={popoverRef}
        id={uid}
        className='bg-base-100 text-base-content rounded-box border-base-300 border shadow-xl'
        style={{ minWidth }}
        onBeforeToggle={onBeforeToggle}
        onToggle={onToggle}
        onKeyDown={onKeydown}
        popover=''
        tabIndex={-1}
      >
        <div className='mb-1 p-1'>
          <input
            ref={filterInputRef}
            className='input input-sm w-full'
            aria-activedescendant={activeItemId ?? undefined}
            aria-controls={listId}
            aria-expanded='true'
            aria-owns={listId}
            aria-autocomplete='list'
            placeholder='搜索字段...'
            role='combobox'
            type='text'
            value={filterText}
            onChange={event => {
              setFilterText(event.target.value);
              // 过滤词变化后自动高亮第一项（Angular 侧 effect 同语义）
              setActiveIndex(0);
            }}
          />
        </div>

        {/* 树形列表 */}
        <ul
          className='menu menu-sm max-h-60 w-full flex-nowrap overflow-y-auto px-2'
          aria-label={placeholder}
          id={listId}
          role='tree'
        >
          {visibleItems.map((item, index) => (
            <li style={{ paddingLeft: `${item.depth * 0.75}rem` }} role='none' key={trackItem(item)}>
              <button
                className={cn(
                  'flex w-full items-center gap-1.5 text-left text-sm',
                  !item.isExpandable && item.node.value === selected && 'bg-primary/15 font-semibold',
                  index === activeIndex && 'menu-focus'
                )}
                aria-expanded={item.isExpandable ? item.isExpanded : undefined}
                aria-selected={!item.isExpandable ? item.node.value === selected : undefined}
                id={`${uid}-item-${item.node.value}`}
                role='treeitem'
                type='button'
                onClick={() => onItemClick(item)}
              >
                {renderIcon(item)}
                <span className='min-w-0 grow truncate'>{item.node.displayName || item.node.label}</span>
                {!item.isExpandable && item.node.value === selected && (
                  <svg
                    className='text-primary h-3 w-3 shrink-0'
                    fill='none'
                    stroke='currentColor'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2.5'
                    viewBox='0 0 24 24'
                  >
                    <polyline points='20 6 9 17 4 12' />
                  </svg>
                )}
                {item.isExpandable && (
                  <>
                    <span className='shrink-0 text-xs opacity-40'>{item.node.children!.length}</span>
                    {item.isExpanded ?
                      <ChevronDown className='w-3.5 shrink-0 opacity-50' size={14} />
                    : <ChevronRight className='w-3.5 shrink-0 opacity-50' size={14} />}
                  </>
                )}
              </button>
            </li>
          ))}
          {visibleItems.length === 0 && <li className='px-3 py-1.5 text-sm opacity-50'>无匹配字段</li>}
        </ul>
      </div>
    </>
  );
}

/** 追踪函数：使用 value + isExistsOption 避免重复 key。 */
function trackItem(item: FlatItem): string {
  return item.node.isExistsOption ? `${item.node.value}:exists` : item.node.value;
}

/** 按展开状态构建可见项列表。 */
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

/** 按过滤词构建可见项列表（命中子节点时自动展开父路径）。 */
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
