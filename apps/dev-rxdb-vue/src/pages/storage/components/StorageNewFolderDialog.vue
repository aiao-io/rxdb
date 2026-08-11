<script lang="ts" setup>
import { STORAGE_TESTID } from '@aiao/utils';
import { ref, watch } from 'vue';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{
  (e: 'confirm', name: string): void;
  (e: 'cancel'): void;
}>();

const T = STORAGE_TESTID;
const name = ref('');

watch(
  () => props.show,
  visible => {
    if (!visible) name.value = '';
  }
);

function submit(): void {
  if (!name.value.trim()) return;
  emit('confirm', name.value.trim());
}
</script>

<template>
  <div
    v-if="show"
    class="modal modal-open"
    :data-testid="T.NEW_FOLDER_DIALOG"
    @click="emit('cancel')"
  >
    <div
      class="modal-box"
      @click.stop
    >
      <h3 class="mb-4 text-base font-bold">New Folder</h3>
      <input
        v-model="name"
        class="input input-bordered w-full"
        :data-testid="T.NEW_FOLDER_INPUT"
        placeholder="Folder name"
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
          :data-testid="T.NEW_FOLDER_CONFIRM"
          @click="submit"
        >
          Create
        </button>
      </div>
    </div>
  </div>
</template>
