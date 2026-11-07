<script setup lang="ts">
import { Search as SearchIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';

/**
 * 搜索按钮：打开命令面板，并显示快捷键键帽。
 * 可访问名称必须包含按钮上可见的全部文字（含键帽），否则语音控制用户喊不出按钮名（WCAG 2.5.3）。
 */
const shell = useAdminShell();
const t = useAdminText();
const shortcuts = useAdminStore(shell.shortcuts.list);

const keys = computed(() => {
  const shortcut = shortcuts.value.find(info => info.id === 'palette');
  return shortcut?.enabled ? shortcut.keys : [];
});
const label = computed(() => [t('widget.search'), ...keys.value].join(' '));
</script>

<template>
  <button
    type="button"
    class="btn btn-ghost btn-sm admin-search-trigger"
    :aria-label="label"
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
      {{ ' ' }}
      <template
        v-for="(key, index) in keys"
        :key="key"
      >
        {{ index > 0 ? ' ' : '' }}
        <kbd class="kbd kbd-sm">{{ key }}</kbd>
      </template>
    </span>
  </button>
</template>
