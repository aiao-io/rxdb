<script setup lang="ts">
import type { DrawerRow } from '@aiao/rxdb-admin';
import { Monitor as MonitorIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useAdminShell } from '../context.js';

/**
 * 主题网格：每张卡片在自己的 `data-theme` 作用域里预览该主题的配色。
 */
defineProps<{
  /** 主题设置行。 */
  row: DrawerRow;
}>();

const shell = useAdminShell();
const names = computed(() => ['system', ...shell.theme.options.map(theme => theme.name)]);
</script>

<template>
  <div
    class="admin-theme-grid"
    role="group"
    :aria-label="row.label"
  >
    <button
      v-for="name in names"
      :key="name"
      type="button"
      class="admin-theme-card"
      :data-theme="name === 'system' ? undefined : name"
      :aria-pressed="row.value === name"
      :data-testid="`pref-theme-${name}`"
      @click="row.set(name)"
    >
      <span class="admin-theme-card-body">
        <span class="flex items-center gap-1"
          ><MonitorIcon
            v-if="name === 'system'"
            :size="14"
            aria-hidden="true"
          />{{ shell.theme.label(name) }}</span
        >
        <span
          class="admin-theme-swatches"
          aria-hidden="true"
        >
          <i />
          <i />
          <i />
          <i />
        </span>
      </span>
    </button>
  </div>
</template>
