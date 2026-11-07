<script setup lang="ts">
import { Settings2 as Settings2Icon } from '@lucide/vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import IconButton from './icon-button.vue';

/**
 * 偏好按钮：打开偏好抽屉，有相对默认值的改动时带红点。
 */
const shell = useAdminShell();
const t = useAdminText();
const hasDiff = useAdminStore(shell.preferences.hasDiff);
</script>

<template>
  <IconButton
    :label="t('widget.preferences')"
    test-id="admin-widget-preferences"
    @click="shell.ui.setPreferencesOpen(true)"
  >
    <span class="relative inline-flex"
      ><Settings2Icon :size="18" /><span
        v-if="hasDiff"
        class="admin-reset-dot absolute -top-1 -right-1"
        aria-hidden="true"
    /></span>
  </IconButton>
</template>
