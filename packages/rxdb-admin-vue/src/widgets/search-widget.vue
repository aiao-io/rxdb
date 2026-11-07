<script setup lang="ts">
import { Search as SearchIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';

/** 搜索按钮：打开命令面板，并显示快捷键键帽。 */
const shell = useAdminShell();
const t = useAdminText();
const shortcuts = useAdminStore(shell.shortcuts.list);

const keys = computed(() => {
  const shortcut = shortcuts.value.find(info => info.id === 'palette');
  return shortcut?.enabled ? shortcut.keys : [];
});
</script>

<template>
  <button
    type="button"
    class="btn btn-ghost btn-sm admin-search-trigger"
    aria-haspopup="dialog"
    data-testid="admin-widget-search"
    @click="shell.palette.open()"
  >
    <SearchIcon :size="16" />
    <span class="admin-search-label">{{ t('widget.search') }}</span>
    <span
      v-if="keys.length > 0"
      class="ms-auto flex gap-0.5"
    >
      <kbd
        v-for="key in keys"
        :key="key"
        class="kbd kbd-sm"
        >{{ key }}</kbd
      >
    </span>
  </button>
</template>
