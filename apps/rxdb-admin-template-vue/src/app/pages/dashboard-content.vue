<script setup lang="ts">
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { useCount } from '@aiao/rxdb-vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Asset, AssetCategory, AssetEvent } from '../entities/asset-entities';
import { DASHBOARD_METRICS, dashboardTotal, isDashboardEmpty, type DashboardCounts } from './dashboard-model';

const COUNT_OPTIONS = { where: { combinator: 'and', rules: [] } } as const;
const { t } = useI18n();
const categoryCount = useCount(AssetCategory, COUNT_OPTIONS);
const assetCount = useCount(Asset, COUNT_OPTIONS);
const eventCount = useCount(AssetEvent, COUNT_OPTIONS);
const counts = computed<DashboardCounts>(() => ({
  categories: categoryCount.value,
  assets: assetCount.value,
  events: eventCount.value
}));
const total = computed(() => dashboardTotal(counts.value));
const loading = computed(() => categoryCount.isLoading || assetCount.isLoading || eventCount.isLoading);
const errorMessage = computed(
  () => categoryCount.error?.message ?? assetCount.error?.message ?? eventCount.error?.message ?? ''
);
const empty = computed(() => !loading.value && !errorMessage.value && isDashboardEmpty(counts.value));
</script>
<template>
  <section
    class="grid gap-4 sm:grid-cols-3"
    :aria-label="t('dashboard.title')"
    data-testid="dashboard-metrics"
  >
    <RouterLink
      v-for="metric in DASHBOARD_METRICS"
      :key="metric.key"
      class="card bg-base-200 border-base-300 hover:border-primary border transition-colors"
      :to="metric.route"
      :data-metric="metric.key"
      data-testid="dashboard-metric-card"
    >
      <div class="card-body gap-2 p-5">
        <h2 class="text-sm opacity-70">{{ t(metric.titleKey) }}</h2>
        <strong class="text-3xl font-semibold">{{ counts[metric.key] }}</strong>
      </div>
    </RouterLink>
  </section>
  <p class="text-sm opacity-70" data-testid="dashboard-total">{{ t('dashboard.total', { count: total }) }}</p>
  <p
    v-if="loading"
    class="text-sm"
    data-testid="dashboard-loading"
    aria-live="polite"
    ><span class="loading loading-spinner loading-sm"></span>{{ t('dashboard.loading') }}</p
  >
  <p
    v-if="errorMessage"
    class="text-error"
    data-testid="dashboard-load-failed"
    role="alert"
    >{{ t('dashboard.loadFailed', { message: errorMessage }) }}</p
  >
  <section
    v-if="empty"
    class="bg-base-200 rounded-box flex flex-col gap-2 p-5"
    data-testid="dashboard-empty"
  >
    <h2 class="font-semibold">{{ t('dashboard.empty.title') }}</h2>
    <p class="text-sm opacity-70">{{ t('dashboard.empty.description') }}</p>
  </section>
  <section class="flex flex-col gap-3" data-testid="dashboard-quick-actions">
    <h2 class="text-base font-semibold">{{ t('dashboard.quick.title') }}</h2>
    <div class="flex flex-wrap gap-3">
      <RouterLink class="btn btn-primary" to="/entities/assets/Asset">{{ t('dashboard.quick.assets') }}</RouterLink>
      <RouterLink class="btn btn-outline" to="/search">{{ t('dashboard.quick.search') }}</RouterLink>
      <RouterLink class="btn btn-outline" to="/backup">{{ t('dashboard.quick.backup') }}</RouterLink>
    </div>
  </section>
</template>
