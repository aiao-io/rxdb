<script lang="ts" setup>
import { formatFileSize } from '@modules/demo-i18n/files';
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { AlertTriangle } from '@lucide/vue';
import type { StorageBrowserItem } from '../utils/storage-utils';

const { t, locale } = useI18n();

defineProps<{
  show: boolean;
  file: File | null;
  existingEntry: StorageBrowserItem | null;
}>();

const emit = defineEmits<{ (e: 'respond', overwrite: boolean): void }>();
</script>

<template>
  <div
    class="modal modal-open"
    v-if="show && file && existingEntry"
    @click="emit('respond', false)"
  >
    <div
      class="modal-box"
      @click.stop
    >
      <h3 class="mb-4 flex items-center gap-2 text-base font-bold">
        <AlertTriangle
          class="text-warning"
          :size="18"
        />
        {{ t('file.fileExists') }}
      </h3>
      <p class="mb-4">
        {{ t('file.overwriteQuestion', { name: file.name }) }}
      </p>
      <div class="bg-base-200 mb-4 space-y-2 rounded-lg p-3">
        <div class="flex justify-between text-sm">
          <span class="text-base-content/60">{{ t('file.existingFile') }}</span>
          <span class="font-mono">{{ formatFileSize(existingEntry.size || 0, locale) }}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-base-content/60">{{ t('file.newFile') }}</span>
          <span class="font-mono">{{ formatFileSize(file.size, locale) }}</span>
        </div>
      </div>
      <div class="modal-action">
        <button
          class="btn btn-sm"
          @click="emit('respond', false)"
        >
          {{ t('file.cancel') }}
        </button>
        <button
          class="btn btn-sm btn-warning"
          @click="emit('respond', true)"
        >
          {{ t('file.overwrite') }}
        </button>
      </div>
    </div>
  </div>
</template>
