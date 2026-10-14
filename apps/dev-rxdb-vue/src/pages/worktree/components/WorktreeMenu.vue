<script lang="ts" setup>
import { RxDBBranch } from '@aiao/rxdb';
import type { WorktreeInfo } from '@aiao/rxdb-plugin-worktree';
import { Check, ChevronDown, FolderTree, Plus, Search, Trash2 } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { WorktreeCreateRequest } from '../utils/worktree-menu';

/**
 * 工具栏里的 worktree 选择器（US-310，git worktree 能力；Angular 参考实现的行为级移植）。
 *
 * @remarks
 * 形态照抄分支下拉（`BranchMenu.vue`）：内联 absolute 下拉 + fixed 背板 + 筛选框 + 创建弹层，
 * `left-0` 对齐（理由同那边：右对齐会伸进应用侧栏被滚动容器裁掉）。
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
}>();

/** 下拉开合；创建弹层打开时恒为 false（两态互斥，避免两个弹层叠着）。 */
const menuOpen = defineModel<boolean>('menuOpen', { default: false });
const createOpen = defineModel<boolean>('createOpen', { default: false });
const createError = defineModel<string | null>('createError', { default: null });

const emit = defineEmits<{
  (e: 'switchWorktree', id: string): void;
  (e: 'removeWorktree', id: string): void;
  (e: 'createWorktree', request: WorktreeCreateRequest): void;
}>();

/** worktree 筛选（label 与分支名的大小写不敏感子串匹配）。 */
const filter = ref('');
const mode = ref<'existing' | 'new'>('existing');
const selectedBranch = ref('');
const newBranch = ref('');
const label = ref('');

const newBranchInput = ref<HTMLInputElement | null>(null);
const branchSelect = ref<HTMLSelectElement | null>(null);

/** 触发按钮上的名字：当前 worktree 的 label → 它的分支名 → 当前分支名（没钉住时）。 */
const currentLabel = computed(() => {
  const current = props.worktrees.find(worktree => worktree.active);
  return current ? (current.label ?? current.branchId) : (props.activeBranch ?? '');
});

const filteredWorktrees = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  if (needle === '') return props.worktrees;
  return props.worktrees.filter(
    worktree =>
      worktree.branchId.toLowerCase().includes(needle) || (worktree.label ?? '').toLowerCase().includes(needle)
  );
});

/** 还没钉成 worktree 的分支：一条分支只能有一个 worktree（与 `listWorktrees()` 求差）。 */
const candidates = computed(() => {
  const pinned = new Set(props.worktrees.map(worktree => worktree.branchId));
  return props.branches.filter(branch => !pinned.has(branch.id));
});

// 弹层一出现就把焦点送进第一个输入控件：创建是两步操作，第二步不能靠用户自己再点一下。
watch([createOpen, mode], ([open, current]) => {
  if (!open) return;
  void nextTick(() => (current === 'new' ? newBranchInput.value : branchSelect.value)?.focus());
});

function toggleMenu(): void {
  if (menuOpen.value) {
    closeAll();
  } else {
    createOpen.value = false;
    menuOpen.value = true;
  }
}

/** Escape 走 document 级监听，理由同分支下拉：焦点在弹层任意子元素上都能冒泡到这里。 */
const onDocumentKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') closeAll();
};

onMounted(() => document.addEventListener('keydown', onDocumentKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown));

function openCreate(): void {
  menuOpen.value = false;
  // 没有可钉的已有分支时直接进「新建分支」：空下拉框是一条走不通的路。
  const first = candidates.value[0]?.id ?? '';
  mode.value = first === '' ? 'new' : 'existing';
  selectedBranch.value = first;
  newBranch.value = '';
  label.value = '';
  createError.value = null;
  createOpen.value = true;
}

function setMode(next: 'existing' | 'new'): void {
  mode.value = next;
  createError.value = null;
}

function closeAll(): void {
  menuOpen.value = false;
  createOpen.value = false;
  filter.value = '';
}

/** 点行：别的 worktree 立即切过去；当前那个只收起菜单。 */
function onRowClick(worktree: WorktreeInfo): void {
  if (worktree.active) {
    closeAll();
    return;
  }
  emit('switchWorktree', worktree.id);
}

function onSelectBranch(event: Event): void {
  selectedBranch.value = (event.target as HTMLSelectElement).value;
  createError.value = null;
}

function onNewBranchInput(event: Event): void {
  newBranch.value = (event.target as HTMLInputElement).value;
  createError.value = null;
}

/** 空分支名不往页面交：那是一条必然被拒的往返，错误就地呈现。 */
function confirmCreate(): void {
  const branchId = (mode.value === 'new' ? newBranch.value : selectedBranch.value).trim();
  if (!branchId) {
    createError.value = mode.value === 'new' ? 'Branch name is required.' : 'Pick a branch.';
    return;
  }
  const trimmed = label.value.trim();
  emit('createWorktree', { mode: mode.value, branchId, label: trimmed === '' ? undefined : trimmed });
}

/** 一个 worktree 在界面上的名字：label，没有就是分支名。 */
function nameOf(worktree: WorktreeInfo): string {
  return worktree.label ?? worktree.branchId;
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
        data-testid="wt-worktree-menu"
        type="button"
      >
        <FolderTree :size="18" />
        <span class="min-w-0 flex-1 text-left"
          ><small>Current Worktree</small
          ><strong
            class="truncate"
            data-testid="wt-worktree-current"
            >{{ currentLabel || '…' }}</strong
          ></span
        >
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
        aria-label="Close worktree menu"
        role="button"
        tabindex="0"
      ></div>

      <div
        class="gd-menu gd-menu-flush gd-branch-create-popover absolute top-full left-0 z-40 mt-1"
        v-if="createOpen"
        :style="{ width: popupWidth + 'px' }"
        aria-label="Create a worktree"
        data-testid="wt-worktree-create-popover"
        role="dialog"
      >
        <div class="flex flex-col gap-2">
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
              :value="selectedBranch"
              @change="onSelectBranch"
              aria-label="Branch"
              data-testid="wt-worktree-branch"
              ref="branchSelect"
            >
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
            @keydown.enter="confirmCreate"
            aria-label="New branch name"
            data-testid="wt-worktree-new-branch"
            placeholder="feature/my-feature"
            ref="newBranchInput"
            type="text"
          />
          <input
            class="gd-input"
            :value="label"
            @input="label = ($event.target as HTMLInputElement).value"
            @keydown.enter="confirmCreate"
            aria-label="Label (optional)"
            data-testid="wt-worktree-label"
            placeholder="Label (optional)"
            type="text"
          />
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
              @click="closeAll"
              data-testid="wt-worktree-create-cancel"
              type="button"
            >
              Cancel
            </button>
            <button
              class="gd-btn-primary"
              @click="confirmCreate"
              data-testid="wt-worktree-create-confirm"
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
        aria-label="Worktree list"
        data-testid="wt-worktree-menu-popup"
        role="menu"
      >
        <div class="flex items-center justify-between px-3 pt-1 pb-1.5">
          <span
            class="text-[11px] font-semibold uppercase"
            :style="{ color: 'var(--gd-muted)' }"
            >Worktrees ({{ worktrees.length }})</span
          >
          <button
            class="gd-btn-ghost shrink-0"
            @click="openCreate"
            data-testid="wt-worktree-create"
            type="button"
          >
            <Plus :size="12" />
            New worktree
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
            aria-label="Filter worktrees"
            placeholder="Filter"
            type="text"
          />
        </div>
        <ul class="min-h-0 flex-1 overflow-y-auto py-1">
          <li
            v-for="worktree in filteredWorktrees"
            :key="worktree.id"
          >
            <div class="flex items-stretch">
              <button
                class="gd-menu-row min-w-0 flex-1"
                :data-branch-id="worktree.branchId"
                :data-worktree-id="worktree.id"
                @click="onRowClick(worktree)"
                data-testid="wt-worktree-item"
                role="menuitem"
                type="button"
              >
                <Check
                  class="shrink-0"
                  v-if="worktree.active"
                  :size="12"
                  :style="{ color: 'var(--gd-accent)' }"
                />
                <FolderTree
                  class="shrink-0"
                  v-else
                  :size="12"
                />
                <span
                  class="min-w-0 flex-1 truncate text-sm font-medium"
                  :class="{ 'text-green-700': worktree.active }"
                  data-testid="wt-worktree-label-text"
                >
                  {{ nameOf(worktree) }}
                </span>
                <span
                  class="shrink-0 text-xs"
                  :style="{ color: 'var(--gd-muted)' }"
                  >{{ worktree.branchId }}</span
                >
              </button>
              <button
                class="gd-btn-ghost shrink-0 px-2"
                :aria-disabled="worktree.active"
                :aria-label="'Remove worktree ' + nameOf(worktree)"
                :data-branch-id="worktree.branchId"
                :disabled="worktree.active"
                :title="worktree.active ? 'The current worktree cannot be removed' : undefined"
                @click="emit('removeWorktree', worktree.id)"
                data-testid="wt-worktree-remove"
                type="button"
              >
                <Trash2 :size="12" />
              </button>
            </div>
          </li>
          <li
            class="px-4 py-4 text-center text-sm"
            v-if="worktrees.length === 0"
            :style="{ color: 'var(--gd-muted)' }"
          >
            No worktrees yet
          </li>
          <li
            class="px-4 py-4 text-center text-sm"
            v-else-if="filteredWorktrees.length === 0"
            :style="{ color: 'var(--gd-muted)' }"
          >
            No matching worktrees
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
