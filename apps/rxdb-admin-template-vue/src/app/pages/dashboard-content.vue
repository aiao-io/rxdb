<script setup lang="ts">
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { useCount, useRxDB } from '@aiao/rxdb-vue';
import { computed, onScopeDispose, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { Asset, AssetCategory, AssetEvent } from '../entities/asset-entities';
import {
  DASHBOARD_METRICS,
  dashboardActivityEntityKey,
  dashboardActivityMessageKey,
  dashboardTotal,
  isDashboardEmpty,
  type DashboardActivity,
  type DashboardCounts
} from './dashboard-model';

import { observeDashboardActivities } from './dashboard-activity-source';

const COUNT_OPTIONS = { where: { combinator: 'and', rules: [] } } as const;
const db = useRxDB();
const { t, formatDate } = useI18n();
const categoryCount = useCount(AssetCategory, COUNT_OPTIONS);
const assetCount = useCount(Asset, COUNT_OPTIONS);
const eventCount = useCount(AssetEvent, COUNT_OPTIONS);
const activities = ref<readonly DashboardActivity[]>([]);
const activityLoading = ref(true);
const activityError = ref('');
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

function activityTypeKey(type: DashboardActivity['type']): string {
  return `dashboard.activity.type.${type.toLowerCase()}`;
}

function formatActivityTime(activity: DashboardActivity): string {
  return formatDate(activity.createdAt, { dateStyle: 'medium', timeStyle: 'short' });
}

const subscription = observeDashboardActivities(db).subscribe(state => {
  activities.value = state.activities;
  activityLoading.value = state.loading;
  activityError.value = state.error ?? '';
});
onScopeDispose(() => subscription.unsubscribe());
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
  <section
    class="flex flex-col gap-3"
    data-testid="dashboard-recent-activity"
    aria-labelledby="dashboard-recent-activity-title"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 id="dashboard-recent-activity-title" class="text-base font-semibold">{{ t('dashboard.activity.title') }}</h2>
      <span class="text-xs opacity-60">{{ activities.length }}/5</span>
    </div>
    <p
      v-if="activityLoading"
      class="text-sm opacity-70"
      data-testid="dashboard-recent-activity-loading"
      aria-live="polite"
      ><span class="loading loading-spinner loading-sm"></span>{{ t('dashboard.activity.loading') }}</p
    >
    <p
      v-else-if="activityError"
      class="text-error text-sm"
      data-testid="dashboard-recent-activity-failed"
      role="alert"
      >{{ t('dashboard.activity.failed', { message: activityError }) }}</p
    >
    <p
      v-else-if="activities.length === 0"
      class="bg-base-200 rounded-box p-5 text-sm opacity-70"
      data-testid="dashboard-recent-activity-empty"
      >{{ t('dashboard.activity.empty') }}</p
    >
    <ol
      v-else
      class="divide-base-300 divide-y rounded-box border border-base-300"
      :aria-label="t('dashboard.activity.title')"
    >
      <li
        v-for="activity in activities"
        :key="activity.fingerprint"
        class="flex flex-wrap items-start justify-between gap-3 p-4"
        :data-activity-type="activity.type"
        data-testid="dashboard-activity-item"
      >
        <div class="min-w-0 flex-1">
          <p class="font-medium" :class="{ 'line-through': activity.redoInvalidated }">
            {{ t(dashboardActivityMessageKey(activity.type), { entity: t(dashboardActivityEntityKey(activity), {}, 'rxdb-model'), count: activity.count }) }}
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <span class="badge badge-sm badge-outline">{{ t(activityTypeKey(activity.type)) }}</span>
            <span class="badge badge-sm badge-ghost">{{ t(dashboardActivityEntityKey(activity), {}, 'rxdb-model') }}</span>
            <span v-if="activity.reverted" class="badge badge-sm badge-warning">{{ t('dashboard.activity.reverted') }}</span>
            <span v-if="activity.redoInvalidated" class="badge badge-sm badge-error">{{ t('dashboard.activity.invalidated') }}</span>
          </div>
        </div>
        <time class="text-xs opacity-60" :datetime="activity.createdAt.toISOString()">{{ formatActivityTime(activity) }}</time>
      </li>
    </ol>
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
