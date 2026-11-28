<script setup lang="ts">
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { RouterLink } from 'vue-router';
const { t } = useI18n();
</script>
<template>
  <div class="page-host items-center justify-center gap-5 overflow-auto p-6">
    <h2 class="text-xl font-semibold">{{ t('start.title') }}</h2>
    <p class="max-w-md text-center text-sm">{{ t('start.description') }}</p>
    <div class="flex flex-wrap justify-center gap-3">
      <RouterLink
        class="btn btn-primary"
        to="/entities"
        >{{ t('start.open') }}</RouterLink
      >
      <RouterLink
        class="btn btn-outline"
        to="/backup"
        >{{ t('start.restore') }}</RouterLink
      >
    </div>
    <p class="max-w-md text-center text-sm opacity-70">{{ t('start.warning') }}</p>
  </div>
</template>
