<script lang="ts" setup>
import { RxDBBranch } from '@aiao/rxdb';
import type { WorktreeInfo } from '@aiao/rxdb-plugin-worktree';
import { FolderTree, Trash2 } from '@lucide/vue';
import { computed, ref } from 'vue';
import type { ToolbarDropdownCopy, WorktreeCreateRequest } from '../utils/worktree-menu';
import ToolbarDropdown from './ToolbarDropdown.vue';

/** worktree 菜单的界面文案（三端逐字一致；e2e 点背板靠 `backdropLabel`）。 */
const WORKTREE_MENU_COPY: ToolbarDropdownCopy = {
  caption: 'Current Worktree',
  heading: 'Worktrees',
  createButton: 'New worktree',
  createTitle: 'Create a worktree',
  filterPlaceholder: 'Filter',
  filterLabel: 'Filter worktrees',
  listLabel: 'Worktree list',
  backdropLabel: 'Close worktree menu',
  empty: 'No worktrees yet',
  noMatch: 'No matching worktrees'
};

/**
 * 工具栏里的 worktree 选择器（US-310，git worktree 能力；Angular 参考实现的行为级移植）。
 *
 * @remarks
 * 下拉骨架与分支菜单共用 `ToolbarDropdown.vue`；这里只给行的附加信息（分支名）、行右端的移除按钮
 * 与创建表单（钉已有分支 / 新建分支再钉）。
 *
 * **点行 = 切到那个 worktree，不带 `requireClean`**：worktree 的未提交改动按分支隔离保存，
 * 切走再切回原样还在——这正是 worktree 相对「切分支前先提交 / 丢弃」的价值。
 *
 * 每行右端的移除按钮与行按钮是**兄弟**而不是嵌套（`<button>` 里套 `<button>` 是非法 HTML，
 * 读屏与键盘都会走丢）。当前所在的 worktree 移除按钮禁用（git 同款：删不掉当前 checkout）。
 */
const props = defineProps<{
  worktrees: readonly WorktreeInfo[];
  branches: readonly RxDBBranch[];
  /** 当前 checkout 的分支；它没钉成 worktree 时，触发按钮就显示分支名。 */
  activeBranch?: string;
  popupWidth?: number;
  /** 有 worktree 命令在飞（创建 / 切换 / 移除）：新建、行、移除与确认按钮都禁用。 */
  busy: boolean;
  /** 列表读取失败的提示；非 null 时列表换成报错块，也不提供可钉的已有分支。 */
  listError: string | null;
  /** 当前工作树的未提交条数；新建分支会复制它们（FR-017），大于 0 时在 New branch 模式下提示。 */
  uncommittedCount: number | null;
}>();

/** 下拉开合；创建弹层打开时恒为 false（两态互斥，由共享下拉维护）。 */
const menuOpen = defineModel<boolean>('menuOpen', { default: false });
const createOpen = defineModel<boolean>('createOpen', { default: false });
const createError = defineModel<string | null>('createError', { default: null });

const emit = defineEmits<{
  (e: 'switchWorktree', id: string): void;
  (e: 'removeWorktree', id: string): void;
  (e: 'createWorktree', request: WorktreeCreateRequest): void;
  /** 列表读取失败后点了 Retry。 */
  (e: 'retryList'): void;
}>();

const mode = ref<'existing' | 'new'>('existing');
const selectedBranch = ref('');
const newBranch = ref('');
const label = ref('');

/** 触发按钮上的名字：当前 worktree 的 label → 它的分支名 → 当前分支名（没钉住时）。 */
const currentLabel = computed(() => {
  const current = props.worktrees.find(worktree => worktree.active);
  return current ? nameOf(current) : (props.activeBranch ?? '');
});

/**
 * 还没钉成 worktree 的分支：一条分支只能有一个 worktree（与 `listWorktrees()` 求差）。
 * 列表读取失败时一条都不给：手上没有可信的「已钉」集合，求差会把已钉的分支也当成候选。
 */
const candidates = computed(() => {
  if (props.listError !== null) return [];
  const pinned = new Set(props.worktrees.map(worktree => worktree.branchId));
  return props.branches.filter(branch => !pinned.has(branch.id));
});

/**
 * 下拉框实际显示的选择：选中的分支还在候选里才算数，否则落到「Pick a branch…」占位项。
 * 候选会随实时列表变化（别处刚钉走了它），不派生的话下拉框会停在一个已经不能钉的值上。
 */
const selection = computed(() =>
  candidates.value.some(branch => branch.id === selectedBranch.value) ? selectedBranch.value : ''
);

/** New branch 模式的复制提示：新分支从当前工作树复制一份未提交改动（FR-017）。 */
const copyNote = computed(() => {
  const count = props.uncommittedCount;
  if (mode.value !== 'new' || count === null || count <= 0) return null;
  return `The new branch starts with a copy of your ${count} uncommitted ${count === 1 ? 'change' : 'changes'}.`;
});

/** 一个 worktree 在界面上的名字：label（原样），没有就是分支名。 */
function nameOf(worktree: WorktreeInfo): string {
  return worktree.label ?? worktree.branchId;
}

const idOf = (worktree: WorktreeInfo): string => worktree.id;

const branchIdOf = (worktree: WorktreeInfo): string => worktree.branchId;

const isCurrentWorktree = (worktree: WorktreeInfo): boolean => worktree.active;

/** worktree 筛选（label 与分支名的大小写不敏感子串匹配；`needle` 已小写）。 */
const matchesWorktree = (worktree: WorktreeInfo, needle: string): boolean =>
  worktree.branchId.toLowerCase().includes(needle) || (worktree.label ?? '').toLowerCase().includes(needle);

/** 点了别的 worktree：立即切过去。 */
function onSelect(worktree: WorktreeInfo): void {
  emit('switchWorktree', worktree.id);
}

/** 创建弹层即将打开：重置表单，预选第一个候选。 */
function resetCreateForm(): void {
  // 没有可钉的已有分支时直接进「新建分支」：空下拉框是一条走不通的路。
  const first = candidates.value[0]?.id ?? '';
  mode.value = first === '' ? 'new' : 'existing';
  selectedBranch.value = first;
  newBranch.value = '';
  label.value = '';
  createError.value = null;
}

function setMode(next: 'existing' | 'new'): void {
  mode.value = next;
  createError.value = null;
}

function onSelectBranch(event: Event): void {
  selectedBranch.value = (event.target as HTMLSelectElement).value;
  createError.value = null;
}

function onNewBranchInput(event: Event): void {
  newBranch.value = (event.target as HTMLInputElement).value;
  createError.value = null;
}

/**
 * 空分支名 / 空选择不往页面交：那是一条必然被拒的往返，错误就地呈现。
 *
 * 新分支名去掉两端空白（分支名可以 trim）；label **不** trim：空串即不起名，其余原样交给核心——
 * 全空白由核心以 `WorktreeLabelError` 拒绝，界面替用户改输入等于静默吞掉一次误操作。
 */
function confirmCreate(): void {
  const branchId = mode.value === 'new' ? newBranch.value.trim() : selection.value;
  if (branchId === '') {
    createError.value = mode.value === 'new' ? 'Branch name is required.' : 'Pick a branch.';
    return;
  }
  emit('createWorktree', { mode: mode.value, branchId, label: label.value === '' ? undefined : label.value });
}
</script>

<template>
  <ToolbarDropdown
    v-model:create-open="createOpen"
    v-model:menu-open="menuOpen"
    :busy="busy"
    :copy="WORKTREE_MENU_COPY"
    :create-error="createError"
    :create-focus-key="mode"
    :icon="FolderTree"
    :is-active="isCurrentWorktree"
    :item-branch-id="branchIdOf"
    :item-key="idOf"
    :item-label="nameOf"
    :items="worktrees"
    :list-error="listError"
    :matches="matchesWorktree"
    :popup-width="popupWidth"
    :value="currentLabel"
    @confirm="confirmCreate"
    @create-opening="resetCreateForm"
    @retry="emit('retryList')"
    @select="onSelect"
    test-id-prefix="wt-worktree"
  >
    <template #row-meta="{ item }">
      <span
        class="shrink-0 text-xs"
        :style="{ color: 'var(--gd-muted)' }"
        >{{ item.branchId }}</span
      >
    </template>
    <template #row-actions="{ item, busy: rowBusy }">
      <button
        class="gd-btn-ghost shrink-0 px-2"
        :aria-label="`Remove worktree ${nameOf(item)}`"
        :data-branch-id="item.branchId"
        :disabled="item.active || rowBusy"
        :title="item.active ? 'The current worktree cannot be removed' : undefined"
        @click="emit('removeWorktree', item.id)"
        data-testid="wt-worktree-remove"
        type="button"
      >
        <Trash2 :size="12" />
      </button>
    </template>
    <template #create>
      <div class="text-xs font-medium">Create a worktree</div>
      <fieldset class="flex gap-3 text-xs">
        <legend class="sr-only">Branch for the new worktree</legend>
        <label class="flex items-center gap-1">
          <input
            :checked="mode === 'existing'"
            @change="setMode('existing')"
            data-testid="wt-worktree-mode-existing"
            name="wt-worktree-mode"
            type="radio"
          />
          Existing branch
        </label>
        <label class="flex items-center gap-1">
          <input
            :checked="mode === 'new'"
            @change="setMode('new')"
            data-testid="wt-worktree-mode-new"
            name="wt-worktree-mode"
            type="radio"
          />
          New branch
        </label>
      </fieldset>
      <template v-if="mode === 'existing'">
        <select
          class="gd-input"
          v-if="candidates.length > 0"
          :value="selection"
          @change="onSelectBranch"
          aria-label="Branch"
          data-autofocus
          data-testid="wt-worktree-branch"
        >
          <option
            disabled
            value=""
          >
            Pick a branch…
          </option>
          <option
            v-for="branch in candidates"
            :key="branch.id"
            :value="branch.id"
          >
            {{ branch.id }}
          </option>
        </select>
        <p
          class="text-xs"
          v-else
          :style="{ color: 'var(--gd-muted)' }"
          data-testid="wt-worktree-no-candidates"
        >
          Every branch already has a worktree — create a new branch instead.
        </p>
      </template>
      <input
        class="gd-input"
        v-else
        :value="newBranch"
        @input="onNewBranchInput"
        aria-label="New branch name"
        data-autofocus
        data-testid="wt-worktree-new-branch"
        placeholder="feature/my-feature"
        type="text"
      />
      <input
        class="gd-input"
        :value="label"
        @input="label = ($event.target as HTMLInputElement).value"
        aria-label="Label (optional)"
        data-testid="wt-worktree-label"
        placeholder="Label (optional)"
        type="text"
      />
      <p
        class="text-xs"
        v-if="copyNote !== null"
        :style="{ color: 'var(--gd-muted)' }"
        data-testid="wt-worktree-copy-note"
      >
        {{ copyNote }}
      </p>
    </template>
  </ToolbarDropdown>
</template>
