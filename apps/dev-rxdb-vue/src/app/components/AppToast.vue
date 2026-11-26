<script lang="ts" setup>
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { STORAGE_TESTID } from '@aiao/utils';
import { X } from '@lucide/vue';
import { renderFileMessage } from '@modules/demo-i18n/files';
import { useToast } from '../composables/useToast';

const { toasts, dismiss } = useToast();
const { t } = useI18n();
const toastTestIds = { error: STORAGE_TESTID.ERROR_TOAST, success: STORAGE_TESTID.SUCCESS_TOAST, info: undefined };
</script>

<template>
  <div
    class="toast toast-top toast-end z-50"
    v-if="toasts.length > 0"
  >
    <div
      class="alert cursor-pointer"
      :data-testid="typeof toast.message === 'string' ? undefined : toastTestIds[toast.type]"
      v-for="toast in toasts"
      :class="{
        'alert-error': toast.type === 'error',
        'alert-success': toast.type === 'success',
        'alert-info': toast.type === 'info'
      }"
      :key="toast.id"
      @click="dismiss(toast.id)"
      role="alert"
    >
      <span>{{ renderFileMessage(t, toast.message) }}</span>
      <button
        v-if="typeof toast.message !== 'string'"
        class="btn btn-sm btn-ghost"
        :aria-label="t('file.close')"
        @click.stop="dismiss(toast.id)"
      >
        <X :size="14" />
      </button>
    </div>
  </div>
</template>
