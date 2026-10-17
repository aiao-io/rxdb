<script lang="ts" setup>
import type { BranchComparison } from '@aiao/rxdb-plugin-history';
import { AlertCircle, GitCompare, GitMerge, X } from '@lucide/vue';
import { comparisonSummary, type BranchDiffLoad } from '../utils/branch-diff';
import BranchDiffList from './BranchDiffList.vue';

/** History 顶部对比栏的状态；页面持有，本组件只做展示与转发。 */
export interface HistoryCompareState {
  /** 拿来和当前分支对比的那条分支 */
  readonly branchId: string;
  readonly comparison: BranchDiffLoad<BranchComparison>;
}

/**
 * History 顶部的分支对比（GitHub Desktop 的「Select branch to compare…」，`history/compare.tsx`）。
 *
 * @remarks
 * 选一条分支，不切换就看它与当前分支差在哪（`compareBranches(当前分支, 那条分支)`）：每个字段读作
 * 「当前分支上的值 → 那条分支上的值」，新增是只在那条分支上有的实体，删除是只在当前分支上有的。
 * GitHub Desktop 在这里列 Behind / Ahead 的提交；这里的对比按实体给差异，所以列差异，底部同样给
 * 「Merge into 当前分支」。对比进行时页面收起提交列表，清除即回到历史。
 *
 * 选分支用原生 `<select>`：键盘、读屏与触屏都由浏览器给，不必自绘一个组合框。
 */
defineProps<{
  /** 当前分支 */
  activeBranch: string;
  /** 能拿来对比的分支（当前分支以外的） */
  branches: readonly string[];
  /** 正在对比的那条与对比结果；没在对比时是 `null` */
  compare: HistoryCompareState | null;
}>();

const emit = defineEmits<{
  /** 选了一条分支：页面读对比 */
  (e: 'selectBranch', branchId: string): void;
  /** 清除对比：回到历史 */
  (e: 'clearRequested'): void;
  /** 把这条分支合并进当前分支：页面打开合并对话框 */
  (e: 'mergeRequest', branchId: string): void;
}>();

/** 下拉选了一项：占位项（空值）即清除对比。 */
function onSelect(event: Event): void {
  const branchId = (event.target as HTMLSelectElement).value;
  if (branchId === '') emit('clearRequested');
  else emit('selectBranch', branchId);
}
</script>

<template>
  <div
    class="flex shrink-0 items-center gap-2 border-b px-3 py-2"
    :style="{ borderColor: 'var(--gd-border)' }"
  >
    <GitCompare
      class="shrink-0"
      :size="14"
      :style="{ color: 'var(--gd-muted)' }"
      aria-hidden="true"
    />
    <select
      class="gd-input min-w-0 flex-1"
      :disabled="branches.length === 0"
      :value="compare?.branchId ?? ''"
      @change="onSelect"
      aria-label="Select branch to compare"
      data-testid="wt-compare-select"
    >
      <option value="">
        {{ branches.length === 0 ? 'No branches to compare' : 'Select branch to compare…' }}
      </option>
      <option
        v-for="branchId in branches"
        :key="branchId"
        :value="branchId"
      >
        {{ branchId }}
      </option>
    </select>
    <button
      class="gd-icon-btn shrink-0"
      v-if="compare !== null"
      @click="emit('clearRequested')"
      aria-label="Clear branch comparison"
      data-testid="wt-compare-clear"
      title="Back to history"
      type="button"
    >
      <X :size="14" />
    </button>
  </div>

  <!-- 可读名不能与里面差异列表的滚动区同名：两个同名地标是 axe landmark-unique -->
  <section
    class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
    v-if="compare !== null"
    :aria-label="`Compare ${activeBranch} with ${compare.branchId}`"
    data-testid="wt-compare-view"
  >
    <div
      class="text-xs"
      aria-live="polite"
    >
      <p
        v-if="compare.comparison.phase === 'loading'"
        :style="{ color: 'var(--gd-muted)' }"
        data-testid="wt-compare-loading"
      >
        Comparing…
      </p>
      <p
        class="flex items-center gap-2"
        v-else-if="compare.comparison.phase === 'error'"
        :style="{ color: 'var(--gd-del-fg)' }"
        data-testid="wt-compare-error"
      >
        <AlertCircle
          class="shrink-0"
          :size="13"
          aria-hidden="true"
        />
        {{ compare.comparison.message }}
      </p>
      <p
        v-else
        data-testid="wt-compare-summary"
      >
        {{ comparisonSummary(compare.comparison.value) }}
      </p>
    </div>

    <template v-if="compare.comparison.phase === 'success' && compare.comparison.value.entries.length > 0">
      <BranchDiffList
        :entries="compare.comparison.value.entries"
        :label="`Differences between ${activeBranch} and ${compare.branchId}`"
        :target="activeBranch"
        empty-text=""
      />
      <p
        class="text-xs"
        :style="{ color: 'var(--gd-muted)' }"
      >
        Each field reads {{ activeBranch }} → {{ compare.branchId }}.
      </p>
    </template>

    <button
      class="gd-btn-primary mt-1 self-start"
      @click="emit('mergeRequest', compare.branchId)"
      data-testid="wt-compare-merge"
      type="button"
    >
      <GitMerge :size="13" />
      Merge into <strong>{{ activeBranch }}</strong>
    </button>
  </section>
</template>
