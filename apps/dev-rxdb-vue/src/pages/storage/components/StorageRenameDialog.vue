<script lang="ts" setup>
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { STORAGE_TESTID } from '@aiao/utils';
import { ref, watch } from 'vue';
import type { StorageBrowserItem } from '../utils/storage-utils';

const { t } = useI18n();

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
    class="modal modal-open"
    v-if="show && entry"
    :data-testid="T.RENAME_DIALOG"
    @click="emit('cancel')"
  >
    <div
      class="modal-box"
      @click.stop
    >
      <h3 class="mb-4 text-base font-bold">{{ t('file.renameEntry', { kind: entry.kind }) }}</h3>
      <input
        class="input input-bordered w-full"
        v-model="newName"
        :data-testid="T.RENAME_INPUT"
        :placeholder="t(entry.kind === 'file' ? 'file.fileName' : 'file.folderName')"
        @keydown.enter="submit"
        type="text"
      />
      <div class="modal-action">
        <button
          class="btn btn-sm"
          @click="emit('cancel')"
        >
          {{ t('file.cancel') }}
        </button>
        <button
          class="btn btn-sm btn-primary"
          :data-testid="T.RENAME_CONFIRM"
          @click="submit"
        >
          {{ t('file.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>
