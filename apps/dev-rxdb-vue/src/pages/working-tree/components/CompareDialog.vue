<script lang="ts" setup>
import type { BranchComparison } from '@aiao/rxdb-plugin-history';
import { AlertCircle, ChevronRight, GitCompare } from '@lucide/vue';
import { comparisonSummary, type BranchDiffLoad } from '../utils/branch-diff';
import BranchDiffList from './BranchDiffList.vue';
import DialogShell from './DialogShell.vue';

/** 对比对话框的状态；页面持有，本组件只做展示。 */
export interface CompareDialogState {
  /** 拿来和当前分支对比的那条分支 */
  readonly branchId: string;
  readonly comparison: BranchDiffLoad<BranchComparison>;
}

/**
 * 分支对比对话框：不切换就看另一条分支与当前分支差在哪（`compareBranches(当前分支, 那条分支)`）。
 *
 * @remarks
 * 每个字段读作「当前分支上的值 → 那条分支上的值」；新增是只在那条分支上有的实体，删除是只在当前分支上有的。
 */
defineProps<{
  dialog: CompareDialogState | null;
  activeBranch: string;
}>();

const emit = defineEmits<{
  (e: 'closeRequested'): void;
}>();
</script>

<template>
  <DialogShell
    v-if="dialog !== null"
    @close-requested="emit('closeRequested')"
    labelled-by="wt-compare-title"
    test-id="wt-compare-dialog"
  >
    <div class="mb-4 flex items-center gap-2">
      <GitCompare
        class="text-[var(--gd-accent)]"
        :size="18"
        aria-hidden="true"
      />
      <h2
        class="text-[15px] font-semibold"
        id="wt-compare-title"
      >
        Compare branches
      </h2>
    </div>

    <div
      class="mb-4 flex items-center gap-2 rounded border border-[var(--gd-border)] px-3 py-2 text-sm"
      :style="{ background: 'var(--gd-bg)' }"
    >
      <span class="min-w-0 truncate font-mono font-medium text-green-700">{{ activeBranch }}</span>
      <ChevronRight
        class="shrink-0"
        :size="14"
        :style="{ color: 'var(--gd-muted)' }"
        aria-hidden="true"
      />
      <span class="min-w-0 truncate font-mono font-medium text-amber-700">{{ dialog.branchId }}</span>
    </div>

    <div
      class="mb-2 text-xs"
      aria-live="polite"
    >
      <p
        v-if="dialog.comparison.phase === 'loading'"
        :style="{ color: 'var(--gd-muted)' }"
        data-testid="wt-compare-loading"
      >
        Comparing…
      </p>
      <p
        class="flex items-center gap-2"
        v-else-if="dialog.comparison.phase === 'error'"
        :style="{ color: 'var(--gd-del-fg)' }"
        data-testid="wt-compare-error"
      >
        <AlertCircle
          class="shrink-0"
          :size="13"
          aria-hidden="true"
        />
        {{ dialog.comparison.message }}
      </p>
      <p
        v-else
        data-testid="wt-compare-summary"
      >
        {{ comparisonSummary(dialog.comparison.value) }}
      </p>
    </div>

    <template v-if="dialog.comparison.phase === 'success' && dialog.comparison.value.entries.length > 0">
      <BranchDiffList
        :entries="dialog.comparison.value.entries"
        :label="`Differences between ${activeBranch} and ${dialog.branchId}`"
        :target="activeBranch"
        empty-text=""
      />
      <p
        class="mt-2 text-xs"
        :style="{ color: 'var(--gd-muted)' }"
      >
        Each field reads {{ activeBranch }} → {{ dialog.branchId }}.
      </p>
    </template>

    <div class="mt-4 flex justify-end">
      <button
        class="gd-btn-secondary"
        @click="emit('closeRequested')"
        data-testid="wt-compare-close"
        type="button"
      >
        Close
      </button>
    </div>
  </DialogShell>
</template>
