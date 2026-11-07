<script setup lang="ts">
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { useRxDB } from '@aiao/rxdb-vue';
import { ref } from 'vue';
import SearchResults from './search-results.vue';
const { t } = useI18n();
const ready = ref(false);
const error = ref('');
void useRxDB()
  .connect('sqlite-wasm')
  .then(
    () => (ready.value = true),
    cause => (error.value = cause instanceof Error ? cause.message : t('app.searchLoadFailed'))
  );
</script>
<template>
  <div
    v-if="error"
    class="page-host items-center justify-center gap-2 p-8"
    data-testid="search-load-failed"
    role="alert"
    ><span class="text-error font-semibold">{{ t('app.loadFailed') }}</span
    ><span>{{ error }}</span></div
  >
  <SearchResults v-else-if="ready" />
  <div
    v-else
    class="page-host items-center justify-center"
    data-testid="loading-fallback"
    role="status"
    :aria-label="t('app.loading')"
    ><span class="loading loading-spinner loading-lg"></span
  ></div>
</template>
