<script lang="ts" setup>
import { STORAGE_TESTID } from '@aiao/utils';
import { AlertTriangle } from '@lucide/vue';

defineProps<{ show: boolean; message: string }>();
const emit = defineEmits<{ (e: 'respond', confirmed: boolean): void }>();
const T = STORAGE_TESTID;
</script>

<template>
  <div
    class="modal modal-open"
    v-if="show"
    :data-testid="T.CONFIRM_DIALOG"
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
        Confirm Action
      </h3>
      <p class="mb-4">{{ message }}</p>
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
          Confirm
        </button>
      </div>
    </div>
  </div>
</template>
