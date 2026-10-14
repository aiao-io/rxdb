<script lang="ts" setup generic="T">
import { Check, ChevronDown, Plus, Search } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue';
import type { WorktreeContextMenuRequest } from '../utils/context-menu';
import { isImeComposing } from '../utils/ime';
import type { ToolbarDropdownCopy } from '../utils/worktree-menu';

/**
 * 工具栏下拉的共享骨架：分支菜单（`BranchMenu.vue`）与 worktree 菜单（`WorktreeMenu.vue`）都是它的薄包装。
 *
 * @remarks
 * 开合状态机、背板、Escape / Enter 的键盘口径（含 IME 守卫）、焦点、筛选、ARIA、列表报错与忙碌态
 * 都只在这里写一次；包装组件只给文案常量、行的附加信息与创建表单，不处理任何按键。
 *
 * 下拉与创建弹层都是**内联**渲染（absolute 定位在按钮下方）而不是 overlay：overlay 会把节点追加到
 * `<body>` 末尾，Tab 顺序上排在整页面板之后——键盘用户从触发按钮按 Tab 会直接跳进侧栏，永远走不进下拉。
 * 内联渲染让「按钮 → 筛选框 → 新建 → 行」落在自然 DOM 顺序里，a11y 用例的纯 Tab 走查才走得通。
 *
 * **下拉必须左对齐（`left-0`）而不是右对齐。** 应用壳的侧栏展开后占 240px，`#layout-container` 是
 * `overflow: auto` 的滚动容器；右对齐会让下拉向左伸进侧栏区域，被滚动容器裁剪——裁掉的那块恰好是
 * 操作按钮的位置，点击会被 fixed 背板吃掉（2026-09-18 实测复现，见 e2e）。
 *
 * ARIA：触发按钮 `aria-haspopup="dialog"` + `aria-controls` 指向列表弹层；列表弹层是非模态
 * `role="dialog"`；行是原生 `<ul>/<li>` 里的普通 `<button>`，当前项带 `aria-current="true"`。
 * 旧的 `role="menu"` 里混着筛选框与新建按钮，不是合法的 menu 结构。
 *
 * 测试锚点全由 `testIdPrefix` 拼出，按完整 id grep 会落到这张表：
 *
 * | 后缀              | 分支菜单                   | worktree 菜单                | 元素                      |
 * | ----------------- | -------------------------- | ---------------------------- | ------------------------- |
 * | `-menu`           | `wt-branch-menu`           | `wt-worktree-menu`           | 触发按钮                  |
 * | `-current`        | `wt-branch-current`        | `wt-worktree-current`        | 触发按钮上的粗体当前值    |
 * | `-menu-popup`     | `wt-branch-menu-popup`     | `wt-worktree-menu-popup`     | 列表弹层（同名 `id`）     |
 * | `-create`         | `wt-branch-create`         | `wt-worktree-create`         | 列表头的新建按钮          |
 * | `-create-popover` | `wt-branch-create-popover` | `wt-worktree-create-popover` | 创建弹层                  |
 * | `-create-cancel`  | `wt-branch-create-cancel`  | `wt-worktree-create-cancel`  | 创建弹层的取消            |
 * | `-create-confirm` | `wt-branch-create-confirm` | `wt-worktree-create-confirm` | 创建弹层的确认            |
 * | `-item`           | `wt-branch-item`           | `wt-worktree-item`           | 行按钮（`data-branch-id`）|
 * | `-label-text`     | `wt-branch-label-text`     | `wt-worktree-label-text`     | 行按钮里的名字            |
 * | `-list-error`     | `wt-branch-list-error`     | `wt-worktree-list-error`     | 列表读取失败的提示块      |
 * | `-list-retry`     | `wt-branch-list-retry`     | `wt-worktree-list-retry`     | 提示块里的重试按钮        |
 */
const props = defineProps<{
  /** 测试锚点前缀；全部共享锚点由它拼出（见上表）。 */
  testIdPrefix: 'wt-branch' | 'wt-worktree';
  /** 本菜单的界面文案（包装组件各一份常量）。 */
  copy: ToolbarDropdownCopy;
  /** 触发按钮与非当前行的前导图标（lucide 组件）。 */
  icon: Component;
  /** 触发按钮上的粗体当前值；空串显示 `…`。 */
  value: string;
  popupWidth?: number;
  items: readonly T[];
  itemKey: (item: T) => string;
  itemLabel: (item: T) => string;
  /** 行按钮上的 `data-branch-id`：e2e 按它取行（行文本里混着父分支名，文本过滤会误中）。 */
  itemBranchId: (item: T) => string;
  isActive: (item: T) => boolean;
  /** 筛选判据；`needle` 已 trim + 小写且非空。 */
  matches: (item: T, needle: string) => boolean;
  /** 有命令在飞：新建按钮、每个行按钮与确认按钮都禁用，确认直接返回。 */
  busy: boolean;
  /** 列表读取失败的提示；非 null 时替换整个列表，新建按钮禁用。 */
  listError: string | null;
  /** 创建弹层的就地错误。 */
  createError: string | null;
  /** 它变化时（以及弹层打开时）把焦点送到弹层里带 `data-autofocus` 的控件。 */
  createFocusKey: string;
}>();

/** 列表弹层开合；创建弹层打开时恒为 false（两态互斥，避免两个弹层叠着）。 */
const menuOpen = defineModel<boolean>('menuOpen', { default: false });
const createOpen = defineModel<boolean>('createOpen', { default: false });

const emit = defineEmits<{
  /** 点了非当前行；当前行只收起菜单，不发。 */
  (e: 'select', item: T): void;
  /** 行上右键；包装组件转给页面按条目拼菜单。 */
  (e: 'rowContextMenu', request: WorktreeContextMenuRequest<T>): void;
  /** 创建弹层即将打开（`createOpen` 置真之前）：包装组件在这里重置表单。 */
  (e: 'createOpening'): void;
  /** 确认创建（Create 按钮或文本框里的 Enter）；忙碌时不发。 */
  (e: 'confirm'): void;
  /** 列表读取失败后点了 Retry。 */
  (e: 'retry'): void;
}>();

defineSlots<{
  /** 行按钮里名字之后的附加信息（分支：父分支 + 相对时间；worktree：分支名）。 */
  'row-meta'(props: { item: T }): unknown;
  /** 行按钮右侧的兄弟操作（`<button>` 里不能再套 `<button>`）；可选。 */
  'row-actions'?(props: { item: T; busy: boolean }): unknown;
  /** 创建弹层的表单主体（标题 + 输入控件）；错误行与取消 / 确认按钮由本组件画。 */
  create(): unknown;
}>();

/** 筛选词；匹配口径由 `matches` 决定。 */
const filter = ref('');

const createPopover = ref<HTMLElement | null>(null);
const menuPopup = ref<HTMLElement | null>(null);
const popupLeft = ref(0);

watch(
  [menuOpen, createOpen, () => props.popupWidth],
  () => {
    if (!menuOpen.value && !createOpen.value) return;
    const popup = menuOpen.value ? menuPopup.value : createPopover.value;
    const section = popup?.offsetParent as HTMLElement | null;
    if (!popup || !section) return;
    const sectionLeft = section.getBoundingClientRect().left;
    popupLeft.value = Math.max(8 - sectionLeft, Math.min(0, window.innerWidth - sectionLeft - popup.offsetWidth - 8));
  },
  { flush: 'post' }
);

/** 筛出来的行；空筛选 = 全量。 */
const filteredItems = computed<readonly T[]>(() => {
  const needle = filter.value.trim().toLowerCase();
  if (needle === '') return props.items;
  return props.items.filter(item => props.matches(item, needle));
});

// 弹层一出现、或包装组件换了首个输入控件（worktree 菜单切模式），就把焦点送进带 `data-autofocus` 的控件：
// 创建是两步操作，第二步不能靠用户自己再点一下。`flush: 'post'` 让回调在 DOM 更新之后跑，新控件已经在了。
watch(
  [createOpen, () => props.createFocusKey],
  ([open]) => {
    if (open) createPopover.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  },
  { flush: 'post' }
);

/**
 * Escape 走 document 级监听而不是挂在容器 div 上：焦点在弹层任意子元素上时事件都能冒泡到 document。
 * 只在本下拉有弹层开着时生效（两个下拉各挂一个监听）；组字中的 Escape 是输入法在取消组字，放过。
 * 一次收起全部层（列表与创建弹层）：a11y 走查靠它退出。
 */
const onDocumentKeydown = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape' || isImeComposing(event)) return;
  if (menuOpen.value || createOpen.value) closeAll();
};

onMounted(() => document.addEventListener('keydown', onDocumentKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown));

/** 触发按钮：开着就全收；关着就先收起创建弹层再打开列表，筛选词在打开时清空。 */
function toggleMenu(): void {
  if (menuOpen.value) {
    closeAll();
    return;
  }
  createOpen.value = false;
  filter.value = '';
  menuOpen.value = true;
}

/** 列表头的新建按钮：先收起列表，让包装组件重置表单，再打开创建弹层。 */
function openCreate(): void {
  menuOpen.value = false;
  emit('createOpening');
  createOpen.value = true;
}

function closeAll(): void {
  menuOpen.value = false;
  createOpen.value = false;
}

/** 点行：非当前项交给包装组件（立即切换），当前项只收起菜单。 */
function onRowClick(item: T): void {
  if (props.isActive(item)) {
    closeAll();
    return;
  }
  emit('select', item);
}

/** 确认创建；忙碌时直接返回（按钮已禁用，这里兜的是 Enter 那条路）。 */
function confirmCreate(): void {
  if (props.busy) return;
  emit('confirm');
}

/**
 * 创建弹层上唯一的键盘提交入口：容器上的一个 keydown 监听。
 *
 * 只认文本框里的 Enter：焦点在 Create 按钮上按 Enter 时原生 click 已经提交一次，这里再提交就是双发；
 * 下拉框与单选框上的 Enter 也不该提交。组字中的 Enter 是输入法在上屏，放过。
 */
function onCreateKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || isImeComposing(event)) return;
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === 'text') confirmCreate();
}
</script>

<template>
  <div class="flex h-full items-stretch">
    <div class="relative flex-1">
      <button
        class="gd-toolbar-select"
        :aria-controls="`${testIdPrefix}-menu-popup`"
        :aria-expanded="menuOpen"
        :data-testid="`${testIdPrefix}-menu`"
        @click="toggleMenu"
        aria-haspopup="dialog"
        type="button"
      >
        <component
          :is="icon"
          :size="18"
        />
        <span class="min-w-0 flex-1 text-left"
          ><small>{{ copy.caption }}</small
          ><strong
            class="truncate"
            :data-testid="`${testIdPrefix}-current`"
            >{{ value || '…' }}</strong
          ></span
        >
        <!-- 注意：动态 class 绑定会被 lucide 指令的 className 覆写，旋转改用 style 绑定 -->
        <ChevronDown
          class="transition-transform"
          :size="14"
          :style="{ transform: menuOpen ? 'rotate(180deg)' : undefined }"
        />
      </button>

      <div
        class="fixed inset-0 z-30"
        v-if="menuOpen || createOpen"
        :aria-label="copy.backdropLabel"
        :style="{ background: 'rgba(0, 0, 0, 0.35)' }"
        @click="closeAll"
        @keydown.escape="closeAll"
        role="button"
        tabindex="0"
      ></div>

      <div
        class="gd-menu gd-menu-flush gd-branch-create-popover absolute top-full left-0 z-40 mt-1"
        v-if="createOpen"
        ref="createPopover"
        :aria-label="copy.createTitle"
        :data-testid="`${testIdPrefix}-create-popover`"
        :style="{ width: popupWidth + 'px', left: popupLeft + 'px' }"
        @keydown="onCreateKeydown"
        role="dialog"
      >
        <div class="flex flex-col gap-2">
          <slot name="create" />
          <p
            class="text-xs text-red-600"
            v-if="createError !== null"
            role="alert"
          >
            {{ createError }}
          </p>
          <div class="flex justify-end gap-2">
            <button
              class="gd-btn-secondary"
              :data-testid="`${testIdPrefix}-create-cancel`"
              @click="closeAll"
              type="button"
            >
              Cancel
            </button>
            <button
              class="gd-btn-primary"
              :data-testid="`${testIdPrefix}-create-confirm`"
              :disabled="busy"
              @click="confirmCreate"
              type="button"
            >
              Create
            </button>
          </div>
        </div>
      </div>
      <div
        class="gd-menu gd-menu-flush absolute top-full left-0 z-40 flex flex-col overflow-y-auto"
        v-else-if="menuOpen"
        ref="menuPopup"
        :id="`${testIdPrefix}-menu-popup`"
        :aria-label="copy.listLabel"
        :data-testid="`${testIdPrefix}-menu-popup`"
        :style="{ height: 'calc(100vh - 50px)', width: popupWidth + 'px', left: popupLeft + 'px' }"
        role="dialog"
      >
        <div class="flex items-center justify-between px-3 pt-1 pb-1.5">
          <span
            class="text-[11px] font-semibold uppercase"
            :style="{ color: 'var(--gd-muted)' }"
            >{{ copy.heading }} ({{ items.length }})</span
          >
          <button
            class="gd-btn-ghost shrink-0"
            :data-testid="`${testIdPrefix}-create`"
            :disabled="busy || listError !== null"
            @click="openCreate"
            type="button"
          >
            <Plus :size="12" />
            {{ copy.createButton }}
          </button>
        </div>
        <div class="relative px-2 pb-1.5">
          <Search
            class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
            :size="12"
            :style="{ color: 'var(--gd-muted)' }"
          />
          <input
            class="gd-input"
            :aria-label="copy.filterLabel"
            :placeholder="copy.filterPlaceholder"
            :style="{ paddingLeft: '26px' }"
            :value="filter"
            @input="filter = ($event.target as HTMLInputElement).value"
            type="text"
          />
        </div>
        <!-- 读不到列表时整块替换 <ul>：<li role="alert"> 过不了 axe 的 list 规则。 -->
        <div
          class="gd-warn-strip mx-2 flex items-center gap-2 rounded"
          v-if="listError !== null"
          :data-testid="`${testIdPrefix}-list-error`"
          role="alert"
        >
          <span class="min-w-0 flex-1">{{ listError }}</span>
          <button
            class="gd-btn-secondary shrink-0"
            :data-testid="`${testIdPrefix}-list-retry`"
            @click="emit('retry')"
            type="button"
          >
            Retry
          </button>
        </div>
        <ul
          class="min-h-0 flex-1 overflow-y-auto py-1"
          v-else
        >
          <li
            v-for="item in filteredItems"
            :key="itemKey(item)"
          >
            <div class="flex items-stretch">
              <button
                class="gd-menu-row min-w-0 flex-1"
                :aria-current="isActive(item) ? 'true' : undefined"
                :data-branch-id="itemBranchId(item)"
                :data-testid="`${testIdPrefix}-item`"
                :disabled="busy"
                @click="onRowClick(item)"
                @contextmenu="emit('rowContextMenu', { target: item, event: $event })"
                type="button"
              >
                <!-- 当前项：前导图标换成勾（GitHub Desktop 同款） -->
                <Check
                  class="shrink-0"
                  v-if="isActive(item)"
                  :size="12"
                  :style="{ color: 'var(--gd-accent)' }"
                />
                <component
                  class="shrink-0"
                  v-else
                  :is="icon"
                  :size="12"
                />
                <span
                  class="min-w-0 flex-1 truncate text-sm font-medium"
                  :class="{ 'text-green-700': isActive(item) }"
                  :data-testid="`${testIdPrefix}-label-text`"
                  >{{ itemLabel(item) }}</span
                >
                <slot
                  name="row-meta"
                  :item="item"
                />
              </button>
              <slot
                name="row-actions"
                :busy="busy"
                :item="item"
              />
            </div>
          </li>
          <li
            class="px-4 py-4 text-center text-sm"
            v-if="items.length === 0"
            :style="{ color: 'var(--gd-muted)' }"
          >
            {{ copy.empty }}
          </li>
          <li
            class="px-4 py-4 text-center text-sm"
            v-else-if="filteredItems.length === 0"
            :style="{ color: 'var(--gd-muted)' }"
          >
            {{ copy.noMatch }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
