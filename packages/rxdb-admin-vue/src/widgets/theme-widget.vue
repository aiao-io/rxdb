<script setup lang="ts">
import { Monitor as MonitorIcon, Moon as MoonIcon, Palette as PaletteIcon, Sun as SunIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import IconButton from './icon-button.vue';

/**
 * 主题按钮：在 system → 浅色 → 深色之间循环，图标跟随当前主题（自选主题按明暗显示）。
 */
const shell = useAdminShell();
const t = useAdminText();
const prefs = useAdminStore(shell.preferences);
const isDark = useAdminStore(shell.theme.isDark);

const icon = computed(() => {
  const { name } = prefs.value.theme;
  return (
    name === 'system' ? MonitorIcon
    : name === 'light' ? SunIcon
    : name === 'dark' ? MoonIcon
    : isDark.value ? MoonIcon
    : PaletteIcon
  );
});
</script>

<template>
  <IconButton
    :label="`${t('widget.theme')}：${shell.theme.label(prefs.theme.name)}`"
    test-id="admin-widget-theme"
    @click="shell.theme.cycle()"
  >
    <component
      :is="icon"
      :size="18"
    />
  </IconButton>
</template>
