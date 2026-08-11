<script lang="ts" setup>
import { STORAGE_TESTID } from '@aiao/utils';
import { ref, watch } from 'vue';
import type { StorageBrowserItem } from '../utils/storage-utils';

const props = defineProps<{ show: boolean; entry: StorageBrowserItem | null }>();
const emit = defineEmits<{
  (e: 'confirm', name: string): void;
  (e: 'cancel'): void;
}>();

const T = STORAGE_TESTID;
const newName = ref('');

watch(
  () => props.entry,
  entry => {
    newName.value = entry?.name ?? '';
  },
  { immediate: true }
);

function submit(): void {
  if (!newName.value.trim()) return;
  emit('confirm', newName.value.trim());
}
</script>

<template>
  <div
    v-if="show && entry"
    class="modal modal-open"
    :data-testid="T.RENAME_DIALOG"
    @click="emit('cancel')"
  >
    <div
      class="modal-box"
      @click.stop
    >
      <h3 class="mb-4 text-base font-bold">Rename {{ entry.kind === 'file' ? 'File' : 'Folder' }}</h3>
      <input
        v-model="newName"
        class="input input-bordered w-full"
        :data-testid="T.RENAME_INPUT"
        :placeholder="entry.kind === 'file' ? 'File name' : 'Folder name'"
        type="text"
        @keydown.enter="submit"
      >
      <div class="modal-action">
        <button
          class="btn btn-sm"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          class="btn btn-sm btn-primary"
          :data-testid="T.RENAME_CONFIRM"
          @click="submit"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
</template>
