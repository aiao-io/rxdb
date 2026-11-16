<script setup lang="ts">
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { useRxDB } from '@aiao/rxdb-vue';
import { onMounted, onScopeDispose, ref } from 'vue';
import DashboardContent from './dashboard-content.vue';
import type { DashboardConnectionState } from './dashboard-model';

const db = useRxDB();
const { t } = useI18n();
const connection = ref<DashboardConnectionState>('connecting');
const connectionError = ref('');
let unsubscribe = (): void => undefined;

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function failConnection(cause: unknown): void {
  connectionError.value = errorMessage(cause);
  connection.value = 'error';
}

onMounted(() => {
  const subscription = db.adapterConnected$('sqlite-wasm').subscribe({
    next: connected => {
      if (connected) connection.value = 'ready';
      else if (connection.value !== 'error') connection.value = 'connecting';
    },
    error: failConnection
  });
  unsubscribe = () => subscription.unsubscribe();
  void Promise.resolve(db.connect('sqlite-wasm')).catch(failConnection);
});

onScopeDispose(() => unsubscribe());
</script>
<template>
  <div
    class="page-host gap-4 overflow-auto p-6"
    :aria-busy="connection === 'connecting'"
    data-testid="dashboard-page"
  >
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h1 class="text-xl font-semibold">{{ t('dashboard.title') }}</h1>
        <p class="max-w-3xl text-sm opacity-70">{{ t('dashboard.description') }}</p>
      </div>
      <span
        class="badge"
        :class="{ 'badge-success': connection === 'ready', 'badge-error': connection === 'error' }"
        data-testid="dashboard-connection-status"
        >{{
          connection === 'ready'
            ? t('dashboard.status.ready')
            : connection === 'error'
              ? t('dashboard.status.error')
              : t('dashboard.status.connecting')
        }}</span
      >
    </header>
    <p
      v-if="connection === 'error'"
      class="text-error"
      data-testid="dashboard-connection-error"
      role="alert"
      >{{ t('dashboard.connectionError', { message: connectionError }) }}</p
    >
    <section
      v-if="connection === 'connecting'"
      class="bg-base-200 rounded-box flex items-center gap-3 p-5"
      data-testid="dashboard-connecting"
      aria-live="polite"
      ><span class="loading loading-spinner loading-sm"></span>{{ t('dashboard.status.connecting') }}</section
    >
    <DashboardContent v-if="connection === 'ready'" />
  </div>
</template>
