<script setup lang="ts">
import { Maximize2 as Maximize2Icon, Minimize2 as Minimize2Icon } from '@lucide/vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import IconButton from './icon-button.vue';

/**
 * 全屏按钮：切换浏览器全屏，`aria-pressed` 与标签跟随 `fullscreenchange`（Esc 退出也能感知）。
 */
const shell = useAdminShell();
const t = useAdminText();
const fullscreen = useAdminStore(shell.fullscreen.isFullscreen);

const toggle = (): void => void shell.fullscreen.toggle();
</script>

<template>
  <IconButton
    :label="fullscreen ? t('widget.exitFullscreen') : t('widget.fullscreen')"
    test-id="admin-widget-fullscreen"
    :aria-pressed="fullscreen"
    @click="toggle"
  >
    <Minimize2Icon
      v-if="fullscreen"
      :size="18"
    />
    <Maximize2Icon
      v-else
      :size="18"
    />
  </IconButton>
</template>
