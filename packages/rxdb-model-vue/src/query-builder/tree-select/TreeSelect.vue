<script lang="ts" setup>
/**
 * 树形下拉选择组件（对齐 Angular 侧 `TreeSelectComponent`）。
 *
 * 基于原生 Popover API 的树形字段选择器（`@angular/cdk/a11y` 的
 * `ActiveDescendantKeyManager` 由包内 {@link TreeKeyManager} 替代）：
 * - 使用原生 Popover API，在 `overflow` 容器中不被裁剪；
 * - 支持关键字过滤（自动展开匹配路径）；
 * - 支持展开/折叠关系节点；
 * - 键盘导航：↑↓ 移动、→ 展开、← 折叠、Enter 选中、Escape 关闭；
 * - `aria-activedescendant` 满足 WAI-ARIA 无障碍规范。
 */
import { applyPopoverPosition, findNodeByValue, getDisplayNamePath, type FieldTreeNode } from '@aiao/rxdb-model';
import {
  Braces as BracesIcon,
  Calendar as CalendarIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  Hash as HashIcon,
  Link2 as Link2Icon,
  List as ListIcon,
  ListChecks as ListChecksIcon,
  Table as TableIcon,
  ToggleLeft as ToggleLeftIcon,
  Type as TypeIcon
} from '@lucide/vue';
import { computed, ref, watch, type Component } from 'vue';

/**
 * 键盘导航管理器（`ActiveDescendantKeyManager` 的包内替代）：
 * 维护高亮索引，支持 ↑↓ 循环（withWrap）与 Home / End（withHomeAndEnd）。
 */
class TreeKeyManager {
  #activeIndex = -1;
  readonly #getLength: () => number;

  constructor(getLength: () => number) {
    this.#getLength = getLength;
  }

  get activeItemIndex(): number {
    return this.#activeIndex;
  }

  setFirstItemActive(): void {
    this.#activeIndex = this.#getLength() > 0 ? 0 : -1;
  }

  setActiveItem(index: number): void {
    this.#activeIndex = index;
  }

  onKeydown(event: KeyboardEvent): void {
    const length = this.#getLength();
    if (length === 0) return;
    switch (event.key) {
      case 'ArrowDown':
        this.#activeIndex = this.#activeIndex === -1 ? 0 : (this.#activeIndex + 1) % length;
        break;
      case 'ArrowUp':
        this.#activeIndex = this.#activeIndex === -1 ? length - 1 : (this.#activeIndex - 1 + length) % length;
        break;
      case 'Home':
        this.#activeIndex = 0;
        break;
      case 'End':
        this.#activeIndex = length - 1;
        break;
    }
  }
}

/** 扁平化的可见树节点（用于渲染和键盘导航） */
interface FlatItem {
  node: FieldTreeNode;
  depth: number;
  isExpandable: boolean;
  isExpanded: boolean;
}

let moduleUid = 0;

const props = withDefaults(
  defineProps<{
    /** 树节点 */
    nodes: FieldTreeNode[];
    /** 当前选中值 */
    selected?: string;
    /** 未选中时的占位文案 */
    placeholder?: string;
    /** 最小宽度 */
    minWidth?: string;
  }>(),
  { selected: '', placeholder: '请选择', minWidth: '14rem' }
);

const emit = defineEmits<{
  /** 选中叶子节点 */
  selectChange: [value: string];
}>();

const uid = `rxdb-ts-${++moduleUid}`;
const listId = `${uid}-list`;
const filterText = ref('');
const expandedPaths = ref(new Set<string>());
const _activeIdx = ref(-1);

const trigger = ref<HTMLButtonElement | null>(null);
const popoverEl = ref<HTMLElement | null>(null);
const filterInput = ref<HTMLInputElement | null>(null);

const typeIconMap: Partial<Record<string, Component>> = {
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
const defaultTypeIcon = TypeIcon;
const defaultTypeColor = 'text-base-content/40';

const keyManager = new TreeKeyManager(() => visibleItems.value.length);

const displayValue = computed(() => {
  const sel = props.selected;
  return sel ? getDisplayNamePath(props.nodes, sel) || sel : props.placeholder;
});

const selectedNode = computed(() => {
  const sel = props.selected;
  return sel ? findNodeByValue(props.nodes, sel) : null;
});

const visibleItems = computed<FlatItem[]>(() => {
  const filter = filterText.value.toLowerCase().trim();
  const expanded = expandedPaths.value;
  return filter ? buildFilteredItems(props.nodes, filter) : buildExpandedItems(props.nodes, expanded, 0);
});

const activeItemId = computed(() => {
  const idx = _activeIdx.value;
  if (idx < 0) return null;
  const vis = visibleItems.value;
  return idx < vis.length ? `${uid}-item-${vis[idx].node.value}` : null;
});

// 过滤文本变化时，自动高亮第一项
watch(filterText, () => {
  setTimeout(() => {
    keyManager.setFirstItemActive();
    _activeIdx.value = keyManager.activeItemIndex;
  });
});

const onBeforeToggle = (event: Event): void => {
  const te = event as ToggleEvent;
  if (te.newState === 'open') {
    if (popoverEl.value && trigger.value) {
      applyPopoverPosition(popoverEl.value, trigger.value.getBoundingClientRect());
    }
    filterText.value = '';
  } else {
    _activeIdx.value = -1;
    keyManager.setActiveItem(-1);
  }
};

const onToggle = (event: Event): void => {
  if ((event as ToggleEvent).newState === 'open') {
    filterInput.value?.focus();
    setTimeout(() => {
      keyManager.setFirstItemActive();
      _activeIdx.value = keyManager.activeItemIndex;
    });
  }
};

const onKeydown = (event: KeyboardEvent): void => {
  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      event.preventDefault();
      keyManager.onKeydown(event);
      scrollActiveIntoView();
      break;
    }
    case 'ArrowRight': {
      event.preventDefault();
      const item = visibleItems.value[keyManager.activeItemIndex];
      if (item?.isExpandable && !item.isExpanded) toggleExpand(item.node.value);
      break;
    }
    case 'ArrowLeft': {
      event.preventDefault();
      const item = visibleItems.value[keyManager.activeItemIndex];
      if (item?.isExpandable && item.isExpanded) toggleExpand(item.node.value);
      break;
    }
    case 'Enter': {
      event.preventDefault();
      const item = visibleItems.value[keyManager.activeItemIndex];
      if (item) onItemClick(item);
      break;
    }
    case 'Escape': {
      event.preventDefault();
      popoverEl.value?.hidePopover();
      trigger.value?.focus();
      break;
    }
    case 'Tab': {
      popoverEl.value?.hidePopover();
      break;
    }
  }
};

const onItemClick = (item: FlatItem): void => {
  if (item.isExpandable) {
    toggleExpand(item.node.value);
  } else {
    emit('selectChange', item.node.value);
    popoverEl.value?.hidePopover();
    trigger.value?.focus();
  }
};

/** 追踪函数：使用 value + isExistsOption 避免重复 key */
const trackItem = (item: FlatItem): string =>
  item.node.isExistsOption ? `${item.node.value}:exists` : item.node.value;

const scrollActiveIntoView = (): void => {
  const item = visibleItems.value[keyManager.activeItemIndex];
  if (!item) return;
  document.getElementById(`${uid}-item-${item.node.value}`)?.scrollIntoView({ block: 'nearest' });
};

const toggleExpand = (value: string): void => {
  expandedPaths.value = (() => {
    const next = new Set(expandedPaths.value);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    return next;
  })();
};

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

defineExpose({
  uid,
  listId,
  filterText,
  displayValue,
  selectedNode,
  visibleItems,
  activeItemId,
  keyManager,
  _activeIdx,
  onBeforeToggle,
  onToggle,
  onKeydown,
  onItemClick,
  trackItem,
  scrollActiveIntoView,
  typeIconMap,
  typeColorMap,
  defaultTypeIcon,
  defaultTypeColor
});
</script>

<template>
  <!-- 触发按钮 -->
  <button
    class="select select-sm text-left"
    :popovertarget="uid"
    :style="{ 'min-width': minWidth }"
    aria-haspopup="tree"
    ref="trigger"
    type="button"
  >
    <component
      class="w-3.5 shrink-0"
      :class="selectedNode ? (typeColorMap[selectedNode.type] ?? defaultTypeColor) : defaultTypeColor"
      :is="selectedNode ? (typeIconMap[selectedNode.type] ?? defaultTypeIcon) : defaultTypeIcon"
      :size="14"
    />
    <span class="min-w-0 grow truncate">{{ displayValue }}</span>
  </button>

  <!-- Popover 浮层 -->
  <div
    class="bg-base-100 text-base-content rounded-box border-base-300 border shadow-xl"
    :id="uid"
    :style="{ 'min-width': minWidth }"
    @beforetoggle="onBeforeToggle"
    @keydown="onKeydown"
    @toggle="onToggle"
    popover
    ref="popoverEl"
    tabindex="-1"
  >
    <!-- 过滤输入框 -->
    <div class="mb-1 p-1">
      <input
        class="input input-sm w-full"
        v-model="filterText"
        :aria-activedescendant="activeItemId ?? undefined"
        :aria-controls="listId"
        :aria-expanded="true"
        :aria-owns="listId"
        aria-autocomplete="list"
        placeholder="搜索字段..."
        ref="filterInput"
        role="combobox"
        type="text"
      />
    </div>

    <!-- 树形列表 -->
    <ul
      class="menu menu-sm max-h-60 w-full flex-nowrap overflow-y-auto px-2"
      :aria-label="placeholder"
      :id="listId"
      role="tree"
    >
      <li
        v-for="item in visibleItems"
        :key="trackItem(item)"
        :style="{ 'padding-left': item.depth * 0.75 + 'rem' }"
        role="none"
      >
        <button
          class="flex w-full items-center gap-1.5 text-left text-sm"
          :aria-expanded="item.isExpandable ? item.isExpanded : undefined"
          :aria-selected="!item.isExpandable ? item.node.value === selected : undefined"
          :class="{
            'bg-primary/15': !item.isExpandable && item.node.value === selected,
            'font-semibold': !item.isExpandable && item.node.value === selected,
            'menu-focus': _activeIdx === visibleItems.indexOf(item)
          }"
          :id="`${uid}-item-${item.node.value}`"
          @click="onItemClick(item)"
          role="treeitem"
          type="button"
        >
          <component
            class="w-3.5 shrink-0"
            :class="typeColorMap[item.node.type] ?? defaultTypeColor"
            :is="typeIconMap[item.node.type] ?? defaultTypeIcon"
            :size="14"
          />
          <span class="min-w-0 grow truncate">{{ item.node.displayName || item.node.label }}</span>
          <svg
            class="text-primary h-3 w-3 shrink-0"
            v-if="!item.isExpandable && item.node.value === selected"
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
          <template v-if="item.isExpandable">
            <span class="shrink-0 text-xs opacity-40">{{ item.node.children!.length }}</span>
            <component
              class="w-3.5 shrink-0 opacity-50"
              :is="item.isExpanded ? ChevronDownIcon : ChevronRightIcon"
              :size="14"
            />
          </template>
        </button>
      </li>
      <li
        class="px-3 py-1.5 text-sm opacity-50"
        v-if="visibleItems.length === 0"
      >
        无匹配字段
      </li>
    </ul>
  </div>
</template>
