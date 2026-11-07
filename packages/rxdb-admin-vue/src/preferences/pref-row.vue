<script setup lang="ts">
import type { DrawerRow } from '@aiao/rxdb-admin';
import { computed } from 'vue';
import { STACKED_KINDS } from './controls.js';
import RowControl from './row-control.vue';

/**
 * 抽屉里的一行设置：标题 / 说明在左，控件在右（需要独占一行的控件在标题下方）。
 */
const props = defineProps<{
  /** 设置行。 */
  row: DrawerRow;
}>();

const stacked = computed(() => STACKED_KINDS.has(props.row.control.kind));
const labelled = computed(() => props.row.control.kind !== 'widgets' && props.row.control.kind !== 'shortcuts');
</script>

<template>
  <div
    class="admin-row"
    :data-disabled="!row.enabled"
    :data-stacked="stacked"
    :data-testid="`pref-row-${row.path}`"
  >
    <div>
      <label
        v-if="labelled"
        :class="row.labelHidden ? 'admin-sr-only' : 'admin-row-label'"
        :for="`prefs-${row.id}`"
        >{{ row.label }}</label
      >
      <p
        v-if="row.hint"
        class="admin-row-hint"
        >{{ row.hint }}</p
      >
    </div>
    <RowControl :row="row" />
  </div>
</template>
