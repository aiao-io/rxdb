<script setup lang="ts">
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { useRxDB } from '@aiao/rxdb-vue';
import { computed, ref, shallowRef } from 'vue';
import SearchResults from './search-results.vue';
const { t } = useI18n();
const ready = ref(false);
const failed = ref(false);
const failure = shallowRef<unknown>();
// 失败时只保存原始原因，文案在渲染时按当前语言翻译，切换语言后随之更新；
// 失败与否由独立的标志表示，原因为空串也不会被当成「没有失败」。
const failureMessage = computed(() =>
  failure.value instanceof Error ? failure.value.message : t('app.searchLoadFailed')
);
void useRxDB()
  .connect('sqlite-wasm')
  .then(
    () => (ready.value = true),
    cause => {
      failure.value = cause;
      failed.value = true;
    }
  );
</script>
<template>
  <div
    v-if="failed"
    class="page-host items-center justify-center gap-2 p-8"
    data-testid="search-load-failed"
    role="alert"
    ><span class="text-error font-semibold">{{ t('app.loadFailed') }}</span
    ><span>{{ failureMessage }}</span></div
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
