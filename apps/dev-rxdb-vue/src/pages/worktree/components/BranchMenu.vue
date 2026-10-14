<script lang="ts" setup>
import { RxDBBranch } from '@aiao/rxdb';
import { ChevronRight, GitBranch, MoreVertical } from '@lucide/vue';
import { gdRelativeTime } from '../utils/gd';
import type { ToolbarDropdownCopy } from '../utils/worktree-menu';
import ToolbarDropdown from './ToolbarDropdown.vue';

/** 分支菜单的界面文案（三端逐字一致；e2e 点背板靠 `backdropLabel`）。 */
const BRANCH_MENU_COPY: ToolbarDropdownCopy = {
  caption: 'Current Branch',
  heading: 'Branches',
  createButton: 'New branch',
  createTitle: 'Create a branch',
  filterPlaceholder: 'Filter',
  filterLabel: 'Filter branches',
  listLabel: 'Branch list',
  backdropLabel: 'Close branch menu',
  empty: 'No branches yet',
  noMatch: 'No matching branches'
};

/**
 * 顶部分支栏里的分支选择器，模仿 GitHub Desktop 的分支下拉。
 *
 * @remarks
 * 下拉骨架（内联渲染、背板、筛选、键盘与 IME 守卫、ARIA、忙碌态）在共享的 `ToolbarDropdown.vue` 里；
 * 这里只给分支行的附加信息（父分支 + 相对时间）与创建表单（分支名）。
 *
 * 下拉顶部带筛选框（GitHub Desktop 的分支下拉同样可以打字筛）：按名字子串过滤，
 * 大小写不敏感。当前分支行的前导图标换成 ✓（GitHub Desktop 的选中标记）。
 *
 * **点行立即切换**（GitHub Desktop 同款）：切走仍走 `requireClean` 的被拒路径——
 * demo 要演的「脏工作树被拒」这一步，被拒的 toast 就是行点击的结果。切换 / 合并 / 删除 /
 * 复制分支名收在行的**右键菜单**里（GitHub Desktop 的分支行操作同样在右键菜单里），由页面按条目拼。
 */
defineProps<{
  branches: readonly RxDBBranch[];
  activeBranch?: string;
  popupWidth?: number;
  /** 有分支命令在飞（创建 / 切换 / 删除）：新建、行与确认按钮都禁用。 */
  busy: boolean;
}>();

/** 下拉开合；创建弹层打开时恒为 false（两态互斥，由共享下拉维护）。 */
const menuOpen = defineModel<boolean>('menuOpen', { default: false });
const createOpen = defineModel<boolean>('createOpen', { default: false });
const branchName = defineModel<string>('branchName', { default: '' });
const branchError = defineModel<string | null>('branchError', { default: null });

const emit = defineEmits<{
  (e: 'switchBranch', branchId: string): void;
  /** 行上右键；页面按条目拼菜单（切换 / 合并 / 删除 / 复制分支名）。 */
  (e: 'menuRequest', request: { target: RxDBBranch; event: MouseEvent }): void;
  /** 创建确认；建库调用由页面做，组件只负责把名字交出去。 */
  (e: 'createBranch', name: string): void;
}>();

function onTouchMenu(event: MouseEvent, branch: RxDBBranch): void {
  event.stopPropagation();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  emit('menuRequest', {
    target: branch,
    event: new MouseEvent('contextmenu', { clientX: rect.left, clientY: rect.bottom, bubbles: true })
  });
}

/** 行的键、名字与 `data-branch-id` 都是分支 id。 */
const branchIdOf = (branch: RxDBBranch): string => branch.id;

const isCurrentBranch = (branch: RxDBBranch): boolean => branch.activated;

/** 分支名筛选（大小写不敏感的子串匹配；`needle` 已小写）。 */
const matchesBranch = (branch: RxDBBranch, needle: string): boolean => branch.id.toLowerCase().includes(needle);

/** 分支的展示时间：优先 updatedAt，没有就 createdAt。 */
function branchTime(branch: RxDBBranch): Date {
  return branch.updatedAt ?? branch.createdAt ?? new Date(0);
}

/** 点了非当前分支：立即切换（GitHub Desktop 同款）。 */
function onSelect(branch: RxDBBranch): void {
  emit('switchBranch', branch.id);
}

/** 创建弹层即将打开：清掉上一次的名字与错误。 */
function resetCreateForm(): void {
  branchName.value = '';
  branchError.value = null;
}

/** 创建分支弹层的名字输入：每次键入清掉上一次的错误。 */
function onNameInput(event: Event): void {
  branchName.value = (event.target as HTMLInputElement).value;
  branchError.value = null;
}

/** 分支名去掉两端空白再交；空名不往页面交：那是一条必然被拒的往返，错误就地呈现。 */
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
  <ToolbarDropdown
    v-model:create-open="createOpen"
    v-model:menu-open="menuOpen"
    :busy="busy"
    :copy="BRANCH_MENU_COPY"
    :create-error="branchError"
    :icon="GitBranch"
    :is-active="isCurrentBranch"
    :item-branch-id="branchIdOf"
    :item-key="branchIdOf"
    :item-label="branchIdOf"
    :items="branches"
    :list-error="null"
    :matches="matchesBranch"
    :popup-width="popupWidth"
    :value="activeBranch ?? ''"
    @confirm="confirmCreate"
    @create-opening="resetCreateForm"
    @row-context-menu="emit('menuRequest', $event)"
    @select="onSelect"
    create-focus-key="branch-name"
    test-id-prefix="wt-branch"
  >
    <template #row-meta="{ item }">
      <span
        class="flex min-w-0 items-center gap-0.5 text-xs"
        v-if="item.parentId"
        :style="{ color: 'var(--gd-muted)' }"
      >
        <ChevronRight :size="10" />
        {{ item.parentId }}
      </span>
      <!-- GitHub Desktop 的分支行右端是上次提交的相对时间；悬停给完整时间戳 -->
      <span
        class="shrink-0 text-xs"
        :style="{ color: 'var(--gd-muted)' }"
        :title="branchTime(item).toLocaleString()"
      >
        {{ gdRelativeTime(branchTime(item)) }}
      </span>
    </template>
    <template #row-actions="{ item, busy: rowBusy }">
      <button
        class="gd-icon-btn hidden max-md:inline-flex pointer-coarse:inline-flex"
        :disabled="rowBusy"
        @click="onTouchMenu($event, item)"
        aria-label="更多操作"
        data-testid="wt-branch-more"
        title="更多操作（触屏）"
        type="button"
      >
        <MoreVertical :size="14" />
      </button>
    </template>
    <template #create>
      <div class="text-xs font-medium">
        Create a branch
        <span :style="{ color: 'var(--gd-muted)' }">from {{ activeBranch }}</span>
      </div>
      <input
        class="gd-input"
        :value="branchName"
        @input="onNameInput"
        data-autofocus
        data-testid="wt-branch-name"
        placeholder="feature/my-feature"
        type="text"
      />
    </template>
  </ToolbarDropdown>
</template>
