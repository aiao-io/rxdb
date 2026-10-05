<script lang="ts" setup>
/**
 * 最近一轮推送里被远端拒绝的变更（US-218 AC#16）。
 *
 * 只有「空态 / 有数据」两态：数据是同步快照，无加载态；提交失败不上报，无错误态。
 * 列表不被后续成功清空，下一轮有被拒时整体替换（`SyncState.lastRejections` 的语义）。
 */
import type { SyncRejection } from '@aiao/rxdb';
import { useSyncState } from '@aiao/rxdb-vue';

// 与 Angular `sync-rejections-panel.ts`、React `SyncRejectionsPanel.tsx` 同一份文案
const REASON_LABELS: Readonly<Record<SyncRejection['reason'], string>> = {
  denied: '无权限',
  gone: '已被删除',
  dependency: '依赖未满足'
};

const { lastRejections } = useSyncState();
</script>

<template>
  <section
    class="mx-auto mb-3 max-w-4xl px-4"
    aria-labelledby="sync-rejections-title"
    data-testid="sync-rejections-panel"
  >
    <h2
      class="text-sm font-semibold"
      id="sync-rejections-title"
    >
      被拒的推送
    </h2>
    <p
      class="text-base-content/70 text-sm"
      v-if="lastRejections.length === 0"
    >
      最近没有被远端拒绝的推送
    </p>
    <ul
      class="divide-base-200 divide-y text-sm"
      v-else
    >
      <li
        class="flex flex-wrap gap-2 py-1"
        :key="`${rejection.namespace}${rejection.entity}${rejection.entityId}`"
        v-for="rejection in lastRejections"
      >
        <span class="font-medium">{{ rejection.entity }}</span>
        <span>{{ rejection.op }}</span>
        <span>{{ REASON_LABELS[rejection.reason] }}（{{ rejection.code }}）</span>
        <span class="break-all">{{ rejection.message }}</span>
      </li>
    </ul>
  </section>
</template>
