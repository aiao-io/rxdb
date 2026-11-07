<script setup lang="ts">
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { useRxDB } from '@aiao/rxdb-vue';
import { onScopeDispose, shallowRef } from 'vue';
import { RouterLink } from 'vue-router';
import { BackupController, restoreFailureMessage } from '../backup/backup-controller';
import { backupErrorMessage } from '../backup/backup-ops';
const i18n = useI18n();
const { t, formatNumber } = i18n;
const controller = new BackupController(useRxDB(), i18n);
const state = shallowRef(controller.state.value);
const subscription = controller.state.subscribe(value => (state.value = value));
onScopeDispose(() => subscription.unsubscribe());
function restoreFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  void controller.restore(file);
}
</script>
<template>
  <div
    class="page-host gap-4 overflow-auto p-6"
    :aria-busy="state.busy"
  >
    <h2 class="text-base font-semibold">{{ t('backup.title') }}</h2>
    <section class="bg-base-200 rounded-box flex flex-col gap-2 p-4">
      <p class="text-sm opacity-80">{{ t('backup.description') }}</p>
      <button
        class="btn btn-primary w-fit"
        :disabled="state.busy"
        data-testid="backup-start"
        @click="controller.backup()"
        ><template v-if="state.backup.kind === 'running'"
          ><span class="loading loading-spinner loading-sm"></span>{{ t('backup.running') }}</template
        ><template v-else>{{ t('backup.download') }}</template></button
      >
      <div data-testid="backup-result">
        <span
          v-if="state.backup.kind === 'success'"
          class="text-success"
          >{{ t('backup.success', { bytes: formatNumber(state.backup.bytes), sha256: state.backup.sha256 }) }}</span
        >
        <span
          v-if="state.backup.kind === 'failed'"
          class="text-error"
          role="alert"
          >{{ backupErrorMessage(state.backup.error, t) }}</span
        >
      </div>
    </section>
    <h2 class="text-base font-semibold">{{ t('backup.restoreTitle') }}</h2>
    <section class="bg-base-200 rounded-box flex flex-col gap-2 p-4">
      <p class="text-sm opacity-80">{{ t('backup.restoreDescription') }}</p>
      <input
        :disabled="state.busy"
        type="file"
        class="file-input file-input-bordered w-full max-w-sm"
        data-testid="restore-input"
        :aria-label="t('backup.selectArchive')"
        @change="restoreFile"
      />
      <div data-testid="restore-result">
        <span v-if="state.restore.kind === 'running'"
          ><span class="loading loading-spinner loading-sm"></span>{{ t('backup.processing') }}</span
        >
        <span
          v-if="state.restore.kind === 'success'"
          class="text-success"
          >{{ t('backup.restored', { sha256: state.restore.sha256 })
          }}<RouterLink
            class="link"
            to="/entities"
            >{{ t('backup.continue') }}</RouterLink
          ></span
        >
        <span
          v-if="state.restore.kind === 'failed'"
          class="text-error"
          role="alert"
          >{{ restoreFailureMessage(state.restore.failure, t) }}</span
        >
      </div>
      <button
        v-if="state.restore.kind === 'failed' && state.restore.needsCleanup"
        class="btn btn-outline btn-warning w-fit"
        :disabled="state.busy"
        data-testid="restore-cleanup"
        @click="controller.cleanup()"
        >{{ t('backup.cleanup') }}</button
      >
    </section>
  </div>
</template>
