<script setup lang="ts">
import { useTemplateRef } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { useModalDialog } from '../use-dialog.js';
import LockForm from './lock-form.vue';

/**
 * 锁屏：模态 `<dialog>` 遮住界面，Esc 不能关闭；未设置密码时先要求设置，忘记密码可重置（数据不受影响）。
 * 未锁定时 `<dialog>` 保持关闭。
 */
const shell = useAdminShell();
const t = useAdminText();
const locked = useAdminStore(shell.lock.locked);
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
useModalDialog(dialog, locked, () => undefined);
</script>

<template>
  <dialog
    ref="dialog"
    class="admin-lock"
    :aria-label="t('lock.title')"
    data-testid="admin-lock"
    @cancel.prevent
  >
    <LockForm v-if="locked" />
  </dialog>
</template>
