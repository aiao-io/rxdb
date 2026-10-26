<script lang="ts" setup>
import type { BranchDiffEntry, MergePreviewEntry } from '@aiao/rxdb-plugin-history';
import { AlertTriangle } from '@lucide/vue';
import { computed } from 'vue';
import { branchDiffRow } from '../utils/branch-diff';
import { gdOpColor, gdOpIcon, gdOpLabel, gdPathColor } from '../utils/gd';

/**
 * 分支对比与合并预览共用的差异列表。
 *
 * @remarks
 * 一行一个实体：状态图标（装饰；读屏读旁边 sr-only 的状态名）+ 路径，下面逐字段「旧值 → 新值」；
 * 预览条目撞上目标分支的改动时再加一行覆盖说明。条目多时只能滚动查看，滚动区本身要能被键盘聚焦
 * （axe `scrollable-region-focusable`）。
 */
const props = defineProps<{
  /** `compareBranches()` 或 `previewMerge()` 的条目 */
  entries: readonly (BranchDiffEntry | MergePreviewEntry)[];
  /** 合并的目标分支（当前分支）：覆盖说明里点名 */
  target: string;
  /** 滚动区的可读名 */
  label: string;
  /** 没有条目时的说明 */
  emptyText: string;
}>();

const rows = computed(() => props.entries.map(entry => branchDiffRow(entry, props.target)));
</script>

<template>
  <p
    class="py-3 text-center text-xs"
    v-if="rows.length === 0"
    :style="{ color: 'var(--gd-muted)' }"
    data-testid="wt-branch-diff-empty"
  >
    {{ emptyText }}
  </p>
  <div
    class="max-h-64 overflow-y-auto rounded border border-[var(--gd-border)] focus-visible:outline-2 focus-visible:outline-[var(--gd-accent)]"
    v-else
    :aria-label="label"
    role="region"
    tabindex="0"
  >
    <ul data-testid="wt-branch-diff-list">
      <li
        class="border-b border-[var(--gd-border)] px-3 py-2 last:border-b-0"
        v-for="row in rows"
        :key="row.key"
        data-testid="wt-branch-diff-item"
      >
        <div class="flex min-w-0 items-center gap-2">
          <component
            class="shrink-0"
            :is="gdOpIcon(row.operation)"
            :size="14"
            :style="{ color: gdOpColor(row.operation) }"
            aria-hidden="true"
          />
          <span class="sr-only">{{ gdOpLabel(row.operation) }}</span>
          <span
            class="min-w-0 truncate font-mono text-xs"
            :style="{ color: gdPathColor(row.operation) }"
            :title="row.path"
          >
            {{ row.path }}
          </span>
        </div>
        <ul
          class="mt-1 space-y-0.5 pl-6 font-mono text-xs"
          v-if="row.fields.length > 0"
        >
          <li
            class="break-all"
            v-for="field in row.fields"
            :key="field.key"
          >
            <span :style="{ color: 'var(--gd-muted)' }">{{ field.key }}:</span>
            {{ field.before }}<span aria-hidden="true"> → </span><span class="sr-only"> to </span>{{ field.after }}
          </li>
        </ul>
        <p
          class="mt-1 flex items-start gap-1.5 pl-6 text-xs"
          v-if="row.conflict !== null"
          :style="{ color: 'var(--gd-warn-fg)' }"
          data-testid="wt-branch-diff-conflict"
        >
          <AlertTriangle
            class="mt-px shrink-0"
            :size="12"
            aria-hidden="true"
          />
          {{ row.conflict }}
        </p>
      </li>
    </ul>
  </div>
</template>
