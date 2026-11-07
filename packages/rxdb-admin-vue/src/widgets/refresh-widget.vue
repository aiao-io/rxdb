<script setup lang="ts">
import { RotateCw as RotateCwIcon } from '@lucide/vue';
import { useAdminShell, useAdminText } from '../context.js';
import IconButton from './icon-button.vue';

/**
 * 刷新按钮：递增刷新计数，内容区据此重建。
 */
const shell = useAdminShell();
const t = useAdminText();
</script>

<template>
  <IconButton
    :label="t('widget.refresh')"
    test-id="admin-widget-refresh"
    @click="shell.ui.refresh()"
  >
    <RotateCwIcon :size="18" />
  </IconButton>
</template>
