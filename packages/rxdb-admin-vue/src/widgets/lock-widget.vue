<script setup lang="ts">
import { LockKeyhole as LockKeyholeIcon } from '@lucide/vue';
import { useAdminShell, useAdminText } from '../context.js';
import IconButton from './icon-button.vue';

/**
 * 锁屏按钮。
 */
const shell = useAdminShell();
const t = useAdminText();
</script>

<template>
  <IconButton
    :label="t('widget.lock')"
    test-id="admin-widget-lock"
    @click="shell.lock.lock()"
  >
    <LockKeyholeIcon :size="18" />
  </IconButton>
</template>
