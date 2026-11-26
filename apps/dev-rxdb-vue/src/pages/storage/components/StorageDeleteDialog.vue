<script lang="ts" setup>
import type { FileDeleteTarget } from '@modules/demo-i18n/files';
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { STORAGE_TESTID } from '@aiao/utils';
import { AlertTriangle, Trash2 } from '@lucide/vue';
import type { StorageBrowserItem } from '../utils/storage-utils';

const { t } = useI18n();

defineProps<{ show: boolean; target: FileDeleteTarget<StorageBrowserItem> | null }>();
const emit = defineEmits<{ (e: 'respond', confirmed: boolean): void }>();

const T = STORAGE_TESTID;
</script>

<template>
  <div
    class="modal modal-open"
    v-if="show && target"
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
        {{ t('file.confirmDelete') }}
      </h3>
      <p class="mb-4">
        {{
          target.type === 'batch' ?
            t('file.deleteMany', { count: target.count })
          : t('file.deleteOne', { kind: target.entry.kind, name: target.entry.name })
        }}
      </p>
      <p
        class="text-warning mb-4 flex items-center gap-1 text-sm"
        v-if="target.type === 'single' && target.entry.kind === 'directory'"
      >
        <AlertTriangle :size="16" /> {{ t('file.deleteContents') }}
      </p>
      <div class="modal-action">
        <button
          class="btn btn-sm"
          :data-testid="T.CONFIRM_NO"
          @click="emit('respond', false)"
        >
          {{ t('file.cancel') }}
        </button>
        <button
          class="btn btn-sm btn-error"
          :data-testid="T.CONFIRM_YES"
          @click="emit('respond', true)"
        >
          {{ t('file.delete') }}
        </button>
      </div>
    </div>
  </div>
</template>
