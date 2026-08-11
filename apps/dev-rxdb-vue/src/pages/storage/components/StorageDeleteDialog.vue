<script lang="ts" setup>
import { STORAGE_TESTID } from '@aiao/utils';
import { AlertTriangle, Trash2 } from '@lucide/vue';
import type { StorageBrowserItem } from '../utils/storage-utils';

const props = defineProps<{ show: boolean; entry: StorageBrowserItem | null }>();
const emit = defineEmits<{ (e: 'respond', confirmed: boolean): void }>();

const T = STORAGE_TESTID;

function isBatch(entry: StorageBrowserItem | null): boolean {
  return !!entry && !entry.path;
}
</script>

<template>
  <div
    class="modal modal-open"
    v-if="show && entry"
    :data-testid="T.CONFIRM_DIALOG"
    @click="emit('respond', false)"
  >
    <div
      class="modal-box"
      @click.stop
    >
      <h3 class="mb-4 flex items-center gap-2 text-base font-bold">
        <Trash2
          class="text-error"
          :size="18"
        />
        Confirm Delete
      </h3>
      <template v-if="isBatch(entry)">
        <p class="mb-4">
          Are you sure you want to delete <span class="text-error font-semibold">{{ entry.name }}</span
          >?
        </p>
      </template>
      <template v-else>
        <p class="mb-4">
          Are you sure you want to delete
          <span class="font-semibold"> {{ entry.kind === 'file' ? 'file' : 'folder' }} </span>
          <span class="text-error font-semibold">{{ entry.name }}</span
          >?
        </p>
        <p
          class="text-warning mb-4 flex items-center gap-1 text-sm"
          v-if="entry.kind === 'directory'"
        >
          <AlertTriangle :size="16" /> This will delete the folder and all of its contents.
        </p>
      </template>
      <div class="modal-action">
        <button
          class="btn btn-sm"
          :data-testid="T.CONFIRM_NO"
          @click="emit('respond', false)"
        >
          Cancel
        </button>
        <button
          class="btn btn-sm btn-error"
          :data-testid="T.CONFIRM_YES"
          @click="emit('respond', true)"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
