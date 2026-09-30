<script lang="ts" setup>
import { RxDBBranch } from '@aiao/rxdb';
import { Check, ChevronDown, ChevronRight, GitBranch, Plus, Search } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { gdRelativeTime } from '../utils/gd';

/**
 * 顶部分支栏里的分支选择器，模仿 GitHub Desktop 的分支下拉。
 *
 * @remarks
 * 下拉与创建弹层都是**内联**渲染（absolute 定位在按钮下方）而不是 overlay：
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
const props = defineProps<{
  branches: readonly RxDBBranch[];
  activeBranch?: string;
  popupWidth?: number;
}>();

/** 下拉开合；创建弹层打开时恒为 false（两态互斥，避免两个弹层叠着）。 */
const menuOpen = defineModel<boolean>('menuOpen', { default: false });
const createOpen = defineModel<boolean>('createOpen', { default: false });
const branchName = defineModel<string>('branchName', { default: '' });
const branchError = defineModel<string | null>('branchError', { default: null });

const emit = defineEmits<{
  (e: 'switchBranch', branchId: string): void;
  /** 行上右键；页面按条目拼菜单（切换 / 合并 / 删除 / 复制分支名）。 */
  (e: 'menuRequest', request: { target: RxDBBranch; event: MouseEvent }): void;
  /** 创建确认；分支名校验与建库调用由页面做，组件只负责把名字交出去。 */
  (e: 'createBranch', name: string): void;
}>();

/** 分支名筛选（大小写不敏感的子串匹配）。 */
const filter = ref('');

const createInput = ref<HTMLInputElement | null>(null);

/** 筛出来的分支；空筛选 = 全量。 */
const filteredBranches = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  if (needle === '') return props.branches;
  return props.branches.filter(branch => branch.id.toLowerCase().includes(needle));
});

// 弹层一出现就把焦点送进名字输入框：创建分支是两步操作，第二步不能靠用户自己
// 再点一下输入框（与旧实现同一个 effect 模式）。
watch(createOpen, open => {
  if (open) void nextTick(() => createInput.value?.focus());
});

function toggleMenu(): void {
  if (menuOpen.value) {
    closeAll();
  } else {
    createOpen.value = false;
    menuOpen.value = true;
  }
}

/**
 * Escape 走 document 级监听而不是挂在容器 div 上：焦点在菜单/弹层的任意
 * 子元素上时事件都能冒泡到 document，而容器 div 挂交互 handler 会撞
 * `interactive-supports-focus` 的 lint 规则（div 不可聚焦）。
 * 只认 Escape（Angular 侧是 key 过滤的 `keydown.escape` 监听）：其余按键不关菜单。
 */
const onDocumentKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') closeAll();
};

onMounted(() => document.addEventListener('keydown', onDocumentKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown));

function openCreate(): void {
  menuOpen.value = false;
  branchName.value = '';
  branchError.value = null;
  createOpen.value = true;
}

function closeAll(): void {
  menuOpen.value = false;
  createOpen.value = false;
  filter.value = '';
}

/** 分支的展示时间：优先 updatedAt，没有就 createdAt。 */
function branchTime(branch: RxDBBranch): Date {
  return branch.updatedAt ?? branch.createdAt ?? new Date(0);
}

/** 点行：非当前分支立即切换（GitHub Desktop 同款），当前分支只收起菜单。 */
function onRowClick(branch: RxDBBranch): void {
  if (branch.activated) {
    closeAll();
    return;
  }
  emit('switchBranch', branch.id);
}

/** 创建分支弹层的名字输入：每次键入清掉上一次的错误。 */
function onNameInput(event: Event): void {
  branchName.value = (event.target as HTMLInputElement).value;
  branchError.value = null;
}

/** 空名不往页面交：那是一条必然被拒的往返，错误就地呈现。 */
function confirmCreate(): void {
  const name = branchName.value.trim();
  if (!name) {
    branchError.value = 'Branch name is required.';
    return;
  }
  emit('createBranch', name);
}
</script>

<template>
  <div class="flex h-full items-stretch">
    <div class="relative flex-1">
      <button
        class="gd-toolbar-select"
        :aria-expanded="menuOpen"
        @click="toggleMenu"
        aria-haspopup="true"
        data-testid="wt-branch-menu"
        type="button"
      >
        <GitBranch :size="18" />
        <span class="min-w-0 flex-1 text-left"
          ><small>Current Branch</small><strong class="truncate">{{ activeBranch || '…' }}</strong></span
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
        :style="{ background: 'rgba(0, 0, 0, 0.35)' }"
        @click="closeAll"
        @keydown.escape="closeAll"
        aria-label="Close branch menu"
        role="button"
        tabindex="0"
      ></div>

      <div
        class="gd-menu gd-menu-flush gd-branch-create-popover absolute top-full left-0 z-40 mt-1"
        v-if="createOpen"
        :style="{ width: popupWidth + 'px' }"
        aria-label="Create a branch"
        data-testid="wt-branch-create-popover"
        role="dialog"
      >
        <div class="flex flex-col gap-2">
          <div class="text-xs font-medium">
            Create a branch
            <span :style="{ color: 'var(--gd-muted)' }">from {{ activeBranch }}</span>
          </div>
          <input
            class="gd-input"
            :value="branchName"
            @input="onNameInput"
            @keydown.enter="confirmCreate"
            data-testid="wt-branch-name"
            placeholder="feature/my-feature"
            ref="createInput"
            type="text"
          />
          <p
            class="text-xs text-red-600"
            v-if="branchError !== null"
            role="alert"
          >
            {{ branchError }}
          </p>
          <div class="flex justify-end gap-2">
            <button
              class="gd-btn-secondary"
              @click="closeAll"
              data-testid="wt-branch-create-cancel"
              type="button"
            >
              Cancel
            </button>
            <button
              class="gd-btn-primary"
              @click="confirmCreate"
              data-testid="wt-branch-create-confirm"
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
        :style="{ height: 'calc(100vh - 50px)', width: popupWidth + 'px' }"
        aria-label="Branch list"
        data-testid="wt-branch-menu-popup"
        role="menu"
      >
        <div class="flex items-center justify-between px-3 pt-1 pb-1.5">
          <span
            class="text-[11px] font-semibold uppercase"
            :style="{ color: 'var(--gd-muted)' }"
            >Branches ({{ branches.length }})</span
          >
          <button
            class="gd-btn-ghost shrink-0"
            @click="openCreate"
            data-testid="wt-branch-create"
            type="button"
          >
            <Plus :size="12" />
            New branch
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
            :style="{ paddingLeft: '26px' }"
            :value="filter"
            @input="filter = ($event.target as HTMLInputElement).value"
            aria-label="Filter branches"
            placeholder="Filter"
            type="text"
          />
        </div>
        <ul class="min-h-0 flex-1 overflow-y-auto py-1">
          <li
            v-for="branch in filteredBranches"
            :key="branch.id"
          >
            <div class="flex items-stretch">
              <button
                class="gd-menu-row min-w-0 flex-1"
                :data-branch-id="branch.id"
                @click="onRowClick(branch)"
                @contextmenu="emit('menuRequest', { target: branch, event: $event })"
                data-testid="wt-branch-item"
                role="menuitem"
                type="button"
              >
                <!-- 当前分支：前导图标换成勾（GitHub Desktop 同款） -->
                <Check
                  class="shrink-0"
                  v-if="branch.activated"
                  :size="12"
                  :style="{ color: 'var(--gd-accent)' }"
                />
                <GitBranch
                  class="shrink-0"
                  v-else
                  :size="12"
                />
                <span
                  class="min-w-0 flex-1 truncate text-sm font-medium"
                  :class="{ 'text-green-700': branch.activated }"
                >
                  {{ branch.id }}
                </span>
                <span
                  class="flex min-w-0 items-center gap-0.5 text-xs"
                  v-if="branch.parentId"
                  :style="{ color: 'var(--gd-muted)' }"
                >
                  <ChevronRight :size="10" />
                  {{ branch.parentId }}
                </span>
                <!-- GitHub Desktop 的分支行右端是上次提交的相对时间；悬停给完整时间戳 -->
                <span
                  class="shrink-0 text-xs"
                  :style="{ color: 'var(--gd-muted)' }"
                  :title="branchTime(branch).toLocaleString()"
                >
                  {{ gdRelativeTime(branchTime(branch)) }}
                </span>
              </button>
            </div>
          </li>
          <li
            class="px-4 py-4 text-center text-sm"
            v-if="branches.length === 0"
            :style="{ color: 'var(--gd-muted)' }"
          >
            No branches yet
          </li>
          <li
            class="px-4 py-4 text-center text-sm"
            v-else-if="filteredBranches.length === 0"
            :style="{ color: 'var(--gd-muted)' }"
          >
            No matching branches
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
