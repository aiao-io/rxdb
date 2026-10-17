<script lang="ts" setup>
import type { MergeStrategy } from '@aiao/rxdb';
import type { MergePreview } from '@aiao/rxdb-plugin-history';
import { AlertCircle, ChevronRight, GitBranch, GitMerge } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { mergePreviewSummary, type BranchDiffLoad } from '../utils/branch-diff';
import BranchDiffList from './BranchDiffList.vue';
import DialogShell from './DialogShell.vue';

/** 合并对话框的草稿状态；页面持有，本组件只做展示与转发。 */
export interface MergeDialogState {
  /** 要合并进当前分支的那条；从分支下拉底部打开时还没选，是 `null` */
  sourceBranchId: string | null;
  strategy: MergeStrategy;
  deleteSource: boolean;
}

/**
 * 合并对话框（GitHub Desktop 的「Merge into 当前分支」，`merge-choose-branch-dialog.tsx`；视觉为 GitHub Desktop
 * 对话框形态：白面板圆角描边、标题 15px 半粗、蓝底白字主按钮、白底灰边取消）。
 *
 * @remarks
 * 顶部是带筛选的分支列表，选一条作合并来源（从 History 的对比进来时已经选好）。选好之后显示预览（`previewMerge()`）：
 * 一句摘要（落多少条，跟着策略变）+ 将落的增删改，撞上当前分支分叉以来改动的条目带覆盖说明。预览是只读的参考，
 * 读失败只显示错误，合并照常可点；没选来源时合并置灰。外壳见 `DialogShell.vue`。
 */
const props = defineProps<{
  dialog: MergeDialogState | null;
  activeBranch: string;
  /** 能合并进来的分支（当前分支以外的） */
  branches: readonly string[];
  /** 按当前策略读的合并预览；读失败不挡合并 */
  preview: BranchDiffLoad<MergePreview>;
  error: string | null;
}>();

const emit = defineEmits<{
  (e: 'closeRequested'): void;
  /** 选了合并来源 */
  (e: 'sourceChange', branchId: string): void;
  (e: 'strategyChange', strategy: MergeStrategy): void;
  (e: 'deleteSourceChange', value: boolean): void;
  (e: 'confirm'): void;
}>();

/** 分支名筛选（大小写不敏感的子串匹配）；对话框关掉即清空，下次打开不留上一次的筛选词 */
const filter = ref('');
const filteredBranches = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  return needle === '' ? props.branches : props.branches.filter(id => id.toLowerCase().includes(needle));
});

// 组件跟着页面常驻，不随开关重建：关掉时清空筛选，下次打开从完整列表起
watch(
  () => props.dialog,
  dialog => {
    if (dialog === null) filter.value = '';
  }
);
</script>

<template>
  <DialogShell
    v-if="dialog !== null"
    @close-requested="emit('closeRequested')"
    labelled-by="wt-merge-title"
    test-id="wt-merge-dialog"
  >
    <div class="mb-4 flex items-center gap-2">
      <GitMerge
        class="text-[var(--gd-accent)]"
        :size="18"
        aria-hidden="true"
      />
      <h2
        class="text-[15px] font-semibold"
        id="wt-merge-title"
      >
        Merge into <strong>{{ activeBranch }}</strong>
      </h2>
    </div>

    <div class="mb-4">
      <input
        class="gd-input mb-2"
        :value="filter"
        @input="filter = ($event.target as HTMLInputElement).value"
        aria-label="Filter branches"
        data-testid="wt-merge-branch-filter"
        placeholder="Filter"
        type="text"
      />
      <ul
        class="max-h-40 overflow-y-auto rounded border border-[var(--gd-border)]"
        aria-label="Branches to merge"
        data-testid="wt-merge-branch-list"
      >
        <li
          v-for="branchId in filteredBranches"
          :key="branchId"
        >
          <button
            class="gd-row flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
            :aria-current="branchId === dialog.sourceBranchId ? 'true' : undefined"
            :class="{ 'gd-row-selected': branchId === dialog.sourceBranchId }"
            :data-branch-id="branchId"
            @click="emit('sourceChange', branchId)"
            data-testid="wt-merge-branch-item"
            type="button"
          >
            <GitBranch
              class="shrink-0"
              :size="12"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate font-mono">{{ branchId }}</span>
          </button>
        </li>
        <li
          class="px-3 py-2 text-center text-xs"
          v-if="filteredBranches.length === 0"
          :style="{ color: 'var(--gd-muted)' }"
        >
          {{ branches.length === 0 ? 'No other branches to merge' : 'No matching branches' }}
        </li>
      </ul>
    </div>

    <template v-if="dialog.sourceBranchId !== null">
      <div
        class="mb-4 flex items-center gap-2 rounded border border-[var(--gd-border)] px-3 py-2 text-sm"
        :style="{ background: 'var(--gd-bg)' }"
      >
        <span class="min-w-0 truncate font-mono font-medium text-amber-700">{{ dialog.sourceBranchId }}</span>
        <ChevronRight
          class="shrink-0"
          :size="14"
          :style="{ color: 'var(--gd-muted)' }"
          aria-hidden="true"
        />
        <span class="min-w-0 truncate font-mono font-medium text-green-700">{{ activeBranch }}</span>
      </div>

      <div class="mb-4">
        <span class="mb-1.5 block text-sm font-medium">Merge strategy</span>
        <div class="flex gap-2">
          <button
            class="flex-1 rounded border px-3 py-2 text-left text-sm transition-colors"
            :style="{
              background: dialog.strategy === 'squash' ? 'var(--gd-selected)' : 'var(--gd-panel)',
              borderColor: dialog.strategy === 'squash' ? 'var(--gd-accent)' : 'var(--gd-border)'
            }"
            @click="emit('strategyChange', 'squash')"
            data-testid="wt-merge-strategy-squash"
            type="button"
          >
            <div class="font-medium">Squash</div>
            <div
              class="mt-0.5 text-xs"
              :style="{ color: 'var(--gd-muted)' }"
            >
              Squash into a minimal change set, filtering ghost operations
            </div>
          </button>
          <button
            class="flex-1 rounded border px-3 py-2 text-left text-sm transition-colors"
            :style="{
              background: dialog.strategy === 'normal' ? 'var(--gd-selected)' : 'var(--gd-panel)',
              borderColor: dialog.strategy === 'normal' ? 'var(--gd-accent)' : 'var(--gd-border)'
            }"
            @click="emit('strategyChange', 'normal')"
            data-testid="wt-merge-strategy-normal"
            type="button"
          >
            <div class="font-medium">Normal</div>
            <div
              class="mt-0.5 text-xs"
              :style="{ color: 'var(--gd-muted)' }"
            >
              Apply each change separately, keeping individual change records
            </div>
          </button>
        </div>
      </div>

      <section
        class="mb-4"
        aria-labelledby="wt-merge-preview-title"
        data-testid="wt-merge-preview"
      >
        <h3
          class="mb-1.5 text-sm font-medium"
          id="wt-merge-preview-title"
        >
          Preview
        </h3>
        <div
          class="mb-2 text-xs"
          aria-live="polite"
        >
          <p
            v-if="preview.phase === 'loading'"
            :style="{ color: 'var(--gd-muted)' }"
            data-testid="wt-merge-preview-loading"
          >
            Loading preview…
          </p>
          <p
            class="flex items-center gap-2"
            v-else-if="preview.phase === 'error'"
            :style="{ color: 'var(--gd-del-fg)' }"
            data-testid="wt-merge-preview-error"
          >
            <AlertCircle
              class="shrink-0"
              :size="13"
              aria-hidden="true"
            />
            Preview unavailable: {{ preview.message }}
          </p>
          <p
            v-else
            data-testid="wt-merge-preview-summary"
          >
            {{ mergePreviewSummary(preview.value) }}
          </p>
        </div>
        <BranchDiffList
          v-if="preview.phase === 'success' && preview.value.merged > 0"
          :empty-text="`These changes cancel out; nothing on ${activeBranch} changes.`"
          :entries="preview.value.entries"
          :target="activeBranch"
          label="Merge preview"
        />
      </section>

      <label class="mb-2 flex cursor-pointer items-center gap-3">
        <input
          class="checkbox checkbox-sm"
          :checked="dialog.deleteSource"
          @change="emit('deleteSourceChange', ($event.target as HTMLInputElement).checked)"
          data-testid="wt-merge-delete-source"
          type="checkbox"
        />
        <span class="text-sm">
          Delete source branch after merging
          <code class="text-xs opacity-70">{{ dialog.sourceBranchId }}</code>
        </span>
      </label>

      <p
        class="mb-4 text-xs"
        :style="{ color: 'var(--gd-muted)' }"
      >
        The result lands in the
        <strong>working tree</strong>
        of
        {{ activeBranch }}
        (like
        <code>git merge --no-commit</code>
        ) and enters history only after a commit.
      </p>
    </template>
    <p
      class="mb-4 text-sm"
      v-else
      :style="{ color: 'var(--gd-muted)' }"
      data-testid="wt-merge-choose-hint"
    >
      Choose a branch to merge into {{ activeBranch }}.
    </p>

    <div
      class="mb-4 flex items-center gap-2 rounded border border-red-300 p-2 text-sm text-red-700"
      v-if="error !== null"
      data-testid="wt-merge-error"
    >
      <AlertCircle
        class="shrink-0"
        :size="15"
      />
      {{ error }}
    </div>

    <div class="flex justify-end gap-2">
      <button
        class="gd-btn-secondary"
        @click="emit('closeRequested')"
        data-testid="wt-merge-cancel"
        type="button"
      >
        Cancel
      </button>
      <button
        class="gd-btn-primary"
        :disabled="dialog.sourceBranchId === null"
        @click="emit('confirm')"
        data-testid="wt-merge-confirm"
        type="button"
      >
        <GitMerge :size="13" />
        Merge
      </button>
    </div>
  </DialogShell>
</template>
