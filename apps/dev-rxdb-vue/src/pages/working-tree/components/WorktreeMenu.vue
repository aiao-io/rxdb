<script lang="ts" setup>
import { WorktreeTableSet } from '@aiao/rxdb';
import type { RxDBBranch } from '@aiao/rxdb';
import type { Worktree } from '@aiao/rxdb-plugin-working-tree';
import { ChevronDown, GitBranch, Pencil, Plus, Trash2 } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/** 工作树下拉的展示与三个操作对话框。页面负责真正调用 `useWorktrees()` 命令。 */
const props = defineProps<{
  rows: readonly Worktree[];
  mounted: WorktreeTableSet;
  activeBranch: string;
  branches: readonly RxDBBranch[];
  busy?: boolean;
}>();

const emit = defineEmits<{
  (event: 'mount-main'): void;
  (event: 'mount', id: string): void;
  (event: 'add', request: { name: string; branchId: string | null }): void;
  (event: 'rename', request: { id: string; name: string }): void;
  (event: 'remove', id: string): void;
}>();

const menuOpen = ref(false);
const dialog = ref<'new' | 'rename' | 'delete' | null>(null);
const selectedRow = ref<Worktree | null>(null);
const name = ref('');
const branchId = ref('');
const error = ref<string | null>(null);

const linkedRows = computed(() => props.rows.filter(row => row.mode === 'writable'));
const currentLinked = computed(() =>
  props.mounted.isMain ? null : (linkedRows.value.find(row => row.tableSetSuffix === props.mounted.suffix) ?? null)
);
const currentLabel = computed(() =>
  props.mounted.isMain ?
    'Main worktree'
  : (currentLinked.value?.name ?? currentLinked.value?.branchId ?? 'Linked worktree')
);
const availableBranches = computed(() => props.branches.filter(branch => branch.activeKey == null));

const onDocumentKeydown = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape') return;
  if (dialog.value !== null) {
    closeDialog();
    return;
  }
  menuOpen.value = false;
};

onMounted(() => document.addEventListener('keydown', onDocumentKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown));

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
}

function closeMenu(): void {
  menuOpen.value = false;
}

function mountMain(): void {
  closeMenu();
  if (!props.mounted.isMain) emit('mount-main');
}

function mountRow(row: Worktree): void {
  closeMenu();
  if (row.id !== currentLinked.value?.id) emit('mount', row.id);
}

function openNewDialog(): void {
  name.value = '';
  branchId.value = availableBranches.value[0]?.id ?? '';
  error.value = null;
  dialog.value = 'new';
  closeMenu();
}

function openRenameDialog(row: Worktree): void {
  closeMenu();
  selectedRow.value = row;
  name.value = row.name ?? row.branchId;
  error.value = null;
  dialog.value = 'rename';
}

function openDeleteDialog(row: Worktree): void {
  closeMenu();
  selectedRow.value = row;
  error.value = null;
  dialog.value = 'delete';
}

function closeDialog(): void {
  dialog.value = null;
  selectedRow.value = null;
  error.value = null;
}

function submitNew(): void {
  const trimmed = name.value.trim();
  if (trimmed === '') {
    error.value = 'Enter a worktree name.';
    return;
  }
  if (branchId.value === '' && availableBranches.value.length === 0) {
    error.value = 'Create or free a branch before adding a worktree.';
    return;
  }
  emit('add', { name: trimmed, branchId: branchId.value === '' ? null : branchId.value });
  closeDialog();
}

function submitRename(): void {
  const row = selectedRow.value;
  const trimmed = name.value.trim();
  if (row === null) return;
  if (trimmed === '') {
    error.value = 'Enter a worktree name.';
    return;
  }
  emit('rename', { id: row.id, name: trimmed });
  closeDialog();
}

function submitDelete(): void {
  const row = selectedRow.value;
  if (row === null) return;
  emit('remove', row.id);
  closeDialog();
}
</script>

<template>
  <div class="gd-toolbar-section relative flex h-full items-stretch">
    <button
      class="gd-toolbar-select"
      :aria-expanded="menuOpen"
      aria-controls="wt-worktree-menu-popup"
      aria-haspopup="dialog"
      aria-label="Worktree"
      data-testid="wt-worktree-menu"
      :disabled="busy"
      type="button"
      @click="toggleMenu"
    >
      <GitBranch :size="17" />
      <span class="min-w-0 flex-1 text-left">
        <small>Worktree</small>
        <strong class="block truncate">{{ currentLabel }}</strong>
      </span>
      <ChevronDown :size="14" />
    </button>

    <div
      v-if="menuOpen"
      class="fixed inset-0 z-30"
      :style="{ background: 'rgba(0, 0, 0, 0.35)' }"
      aria-label="Close worktree menu"
      role="button"
      tabindex="0"
      @click="closeMenu"
      @keydown.escape="closeMenu"
    ></div>
    <div
      v-if="menuOpen"
      class="gd-menu absolute top-full left-0 z-40 w-80 overflow-y-auto p-1"
      id="wt-worktree-menu-popup"
      aria-label="Worktree list"
      data-testid="wt-worktree-menu-popup"
      role="dialog"
    >
      <div class="flex items-center justify-between px-3 py-1.5">
        <span class="text-[11px] font-semibold uppercase opacity-70">Worktrees</span>
        <button
          class="gd-btn-ghost shrink-0"
          data-testid="wt-worktree-create"
          type="button"
          @click="openNewDialog"
        >
          <Plus :size="12" />
          New Worktree…
        </button>
      </div>
      <div class="gd-menu-header">Main worktree</div>
      <button
        class="gd-menu-row"
        :aria-current="mounted.isMain ? 'true' : undefined"
        data-testid="wt-worktree-item"
        data-worktree-id="main"
        type="button"
        @click="mountMain"
      >
        <GitBranch :size="14" />
        <span class="min-w-0 flex-1 truncate text-left">Main worktree</span>
        <span class="ml-2 truncate text-xs opacity-70">{{ activeBranch }}</span>
      </button>

      <div class="gd-menu-divider"></div>
      <div class="gd-menu-header">Linked worktrees ({{ linkedRows.length }})</div>
      <p
        v-if="linkedRows.length === 0"
        class="px-3 py-2 text-xs opacity-70"
      >
        No linked worktrees
      </p>
      <div
        v-for="row in linkedRows"
        :key="row.id"
        class="group flex items-center"
      >
        <button
          class="gd-menu-row min-w-0 flex-1"
          :aria-current="row.id === currentLinked?.id ? 'true' : undefined"
          data-testid="wt-worktree-item"
          :data-worktree-id="row.id"
          type="button"
          @click="mountRow(row)"
        >
          <GitBranch :size="14" />
          <span class="min-w-0 flex-1 truncate text-left">{{ row.name ?? row.branchId }}</span>
          <span class="ml-2 max-w-24 truncate text-xs opacity-70">{{ row.branchId }}</span>
        </button>
        <button
          class="gd-icon-btn"
          :aria-label="`Rename ${row.name ?? row.branchId}`"
          :data-testid="`wt-worktree-rename-${row.id}`"
          title="Rename…"
          type="button"
          @click.stop="openRenameDialog(row)"
        >
          <Pencil :size="14" />
        </button>
        <button
          class="gd-icon-btn text-red-600"
          :aria-label="`Delete ${row.name ?? row.branchId}`"
          :data-testid="`wt-worktree-delete-${row.id}`"
          title="Delete…"
          type="button"
          @click.stop="openDeleteDialog(row)"
        >
          <Trash2 :size="14" />
        </button>
      </div>
    </div>

    <div
      v-if="dialog !== null"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
      data-testid="wt-worktree-dialog-backdrop"
      @click.self="closeDialog"
    >
      <div
        class="w-full max-w-md rounded-md border border-[var(--gd-border)] p-5 shadow-2xl"
        :style="{ background: 'var(--gd-panel)' }"
        aria-modal="true"
        :aria-labelledby="`wt-worktree-${dialog === 'new' ? 'create' : dialog}-title`"
        :data-testid="`wt-worktree-${dialog === 'new' ? 'create' : dialog}-dialog`"
        role="dialog"
      >
        <template v-if="dialog === 'new'">
          <h2
            id="wt-worktree-create-title"
            class="mb-4 text-base font-semibold"
            >New Worktree</h2
          >
          <label
            class="mb-3 block text-sm"
            for="wt-worktree-create-name"
            >Name</label
          >
          <input
            id="wt-worktree-create-name"
            v-model="name"
            class="input input-bordered mb-3 w-full"
            data-testid="wt-worktree-create-name"
            autocomplete="off"
            autofocus
            @keydown.enter="submitNew"
          />
          <label
            class="mb-2 block text-sm"
            for="wt-worktree-create-branch"
            >Branch (optional)</label
          >
          <select
            id="wt-worktree-create-branch"
            v-model="branchId"
            class="select select-bordered mb-2 w-full"
            data-testid="wt-worktree-create-branch"
          >
            <option value="">Choose an available branch</option>
            <option
              v-for="branch in branches"
              :key="branch.id"
              :disabled="branch.activeKey !== null && branch.activeKey !== undefined"
              :value="branch.id"
            >
              {{ branch.id }}{{ branch.activeKey ? ' (in use)' : '' }}
            </option>
          </select>
          <p class="mb-3 text-xs opacity-70">The selected branch will be checked out in this worktree.</p>
        </template>
        <template v-else-if="dialog === 'rename'">
          <h2
            id="wt-worktree-rename-title"
            class="mb-4 text-base font-semibold"
            >Rename Worktree</h2
          >
          <label
            class="mb-3 block text-sm"
            for="wt-worktree-rename-name"
            >Name</label
          >
          <input
            id="wt-worktree-rename-name"
            v-model="name"
            class="input input-bordered mb-2 w-full"
            data-testid="wt-worktree-rename-name"
            autocomplete="off"
            autofocus
            @keydown.enter="submitRename"
          />
        </template>
        <template v-else>
          <h2
            id="wt-worktree-delete-title"
            class="mb-4 text-base font-semibold"
            >Delete Worktree</h2
          >
          <p
            class="mb-4 text-sm"
            data-testid="wt-worktree-delete-warning"
            role="alert"
          >
            Delete <strong>{{ selectedRow?.name ?? selectedRow?.branchId }}</strong
            >? Any uncommitted changes stay on its branch.
          </p>
        </template>
        <p
          v-if="error !== null"
          class="mb-3 text-sm text-red-600"
          data-testid="wt-worktree-error"
          role="alert"
        >
          {{ error }}
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="gd-btn-secondary"
            :data-testid="`wt-worktree-${dialog === 'new' ? 'create' : dialog}-cancel`"
            type="button"
            @click="closeDialog"
          >
            Cancel
          </button>
          <button
            v-if="dialog === 'new'"
            class="gd-btn-primary"
            data-testid="wt-worktree-create-confirm"
            type="button"
            @click="submitNew"
          >
            Create
          </button>
          <button
            v-else-if="dialog === 'rename'"
            class="gd-btn-primary"
            data-testid="wt-worktree-rename-confirm"
            type="button"
            @click="submitRename"
          >
            Rename
          </button>
          <button
            v-else
            class="gd-btn-primary"
            data-testid="wt-worktree-delete-confirm"
            type="button"
            @click="submitDelete"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
