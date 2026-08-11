<script lang="ts" setup>
import { formatFileSize } from '@aiao/utils';
import { AlertTriangle } from '@lucide/vue';
import type { StorageBrowserItem } from '../utils/storage-utils';

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
        File Already Exists
      </h3>
      <p class="mb-4">
        File <span class="font-semibold">{{ file.name }}</span> already exists. Overwrite it?
      </p>
      <div class="bg-base-200 mb-4 space-y-2 rounded-lg p-3">
        <div class="flex justify-between text-sm">
          <span class="text-base-content/60">Existing file:</span>
          <span class="font-mono">{{ formatFileSize(existingEntry.size || 0) }}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-base-content/60">New file:</span>
          <span class="font-mono">{{ formatFileSize(file.size) }}</span>
        </div>
      </div>
      <div class="modal-action">
        <button
          class="btn btn-sm"
          @click="emit('respond', false)"
        >
          Cancel
        </button>
        <button
          class="btn btn-sm btn-warning"
          @click="emit('respond', true)"
        >
          Overwrite
        </button>
      </div>
    </div>
  </div>
</template>
