import { useCount, useRxDB } from '@aiao/rxdb-angular';
import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Asset, AssetCategory, AssetEvent } from '../entities/asset-entities';
import {
  DASHBOARD_METRICS,
  dashboardActivityEntityKey,
  dashboardActivityMessageKey,
  dashboardTotal,
  isDashboardEmpty,
  type DashboardActivity,
  type DashboardConnectionState,
  type DashboardCounts
} from './dashboard-model';

import { observeDashboardActivities } from './dashboard-activity-source';

const COUNT_OPTIONS = { where: { combinator: 'and', rules: [] } } as const;

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

@Component({
  selector: 'app-dashboard-content',
  imports: [RouterLink],
  template: `
    <section
      class="grid gap-4 sm:grid-cols-3"
      [attr.aria-label]="t('dashboard.title')"
      data-testid="dashboard-metrics"
    >
      @for (metric of metrics; track metric.key) {
        <a
          class="card bg-base-200 border-base-300 hover:border-primary border transition-colors"
          [routerLink]="metric.route"
          [attr.data-metric]="metric.key"
          data-testid="dashboard-metric-card"
        >
          <div class="card-body gap-2 p-5">
            <h2 class="text-sm opacity-70">{{ t(metric.titleKey) }}</h2>
            <strong class="text-3xl font-semibold">{{ countFor(metric.key) }}</strong>
          </div>
        </a>
      }
    </section>
    <p class="text-sm opacity-70" data-testid="dashboard-total">{{ t('dashboard.total', { count: total() }) }}</p>
    @if (loading()) {
      <p class="text-sm" data-testid="dashboard-loading" aria-live="polite">
        <span class="loading loading-spinner loading-sm"></span>{{ t('dashboard.loading') }}
      </p>
    }
    @if (errorMessageValue(); as message) {
      <p class="text-error" data-testid="dashboard-load-failed" role="alert">
        {{ t('dashboard.loadFailed', { message }) }}
      </p>
    }
    @if (empty()) {
      <section class="bg-base-200 rounded-box flex flex-col gap-2 p-5" data-testid="dashboard-empty">
        <h2 class="font-semibold">{{ t('dashboard.empty.title') }}</h2>
        <p class="text-sm opacity-70">{{ t('dashboard.empty.description') }}</p>
      </section>
    }
    <section class="flex flex-col gap-3" data-testid="dashboard-recent-activity" aria-labelledby="dashboard-recent-activity-title">
      <div class="flex items-center justify-between gap-3">
        <h2 id="dashboard-recent-activity-title" class="text-base font-semibold">{{ t('dashboard.activity.title') }}</h2>
        <span class="text-xs opacity-60">{{ activities().length }}/5</span>
      </div>
      @if (activityLoading()) {
        <p class="text-sm opacity-70" data-testid="dashboard-recent-activity-loading" aria-live="polite">
          <span class="loading loading-spinner loading-sm"></span>{{ t('dashboard.activity.loading') }}
        </p>
      } @else if (activityError(); as message) {
        <p class="text-error text-sm" data-testid="dashboard-recent-activity-failed" role="alert">
          {{ t('dashboard.activity.failed', { message }) }}
        </p>
      } @else if (activities().length === 0) {
        <p class="bg-base-200 rounded-box p-5 text-sm opacity-70" data-testid="dashboard-recent-activity-empty">
          {{ t('dashboard.activity.empty') }}
        </p>
      } @else {
        <ol class="divide-base-300 divide-y rounded-box border border-base-300" aria-label="{{ t('dashboard.activity.title') }}">
          @for (activity of activities(); track activity.fingerprint) {
            <li
              class="flex flex-wrap items-start justify-between gap-3 p-4"
              [attr.data-activity-type]="activity.type"
              data-testid="dashboard-activity-item"
            >
              <div class="min-w-0 flex-1">
                <p class="font-medium" [class.line-through]="activity.redoInvalidated">
                  {{ activityMessage(activity) }}
                </p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span class="badge badge-sm badge-outline">{{ t(activityTypeKey(activity.type)) }}</span>
                  <span class="badge badge-sm badge-ghost">{{ activityEntity(activity) }}</span>
                  @if (activity.reverted) {
                    <span class="badge badge-sm badge-warning">{{ t('dashboard.activity.reverted') }}</span>
                  }
                  @if (activity.redoInvalidated) {
                    <span class="badge badge-sm badge-error">{{ t('dashboard.activity.invalidated') }}</span>
                  }
                </div>
              </div>
              <time class="text-xs opacity-60" [attr.datetime]="activity.createdAt.toISOString()">
                {{ formatActivityTime(activity) }}
              </time>
            </li>
          }
        </ol>
      }
    </section>
    <section class="flex flex-col gap-3" data-testid="dashboard-quick-actions">
      <h2 class="text-base font-semibold">{{ t('dashboard.quick.title') }}</h2>
      <div class="flex flex-wrap gap-3">
        <a class="btn btn-primary" routerLink="/entities/assets/Asset">{{ t('dashboard.quick.assets') }}</a>
        <a class="btn btn-outline" routerLink="/search">{{ t('dashboard.quick.search') }}</a>
        <a class="btn btn-outline" routerLink="/backup">{{ t('dashboard.quick.backup') }}</a>
      </div>
    </section>
  `
})
class DashboardContent {
  private readonly db = useRxDB();
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = useI18n();
  private readonly categoryCount = useCount(AssetCategory, COUNT_OPTIONS);
  private readonly assetCount = useCount(Asset, COUNT_OPTIONS);
  private readonly eventCount = useCount(AssetEvent, COUNT_OPTIONS);
  readonly t = this.i18n.t;
  readonly metrics = DASHBOARD_METRICS;
  readonly activities = signal<readonly DashboardActivity[]>([]);
  readonly activityLoading = signal(true);
  readonly activityError = signal('');
  readonly counts = computed<DashboardCounts>(() => ({
    categories: this.categoryCount.value(),
    assets: this.assetCount.value(),
    events: this.eventCount.value()
  }));
  readonly total = computed(() => dashboardTotal(this.counts()));
  readonly loading = computed(
    () => this.categoryCount.isLoading() || this.assetCount.isLoading() || this.eventCount.isLoading()
  );
  readonly errorMessageValue = computed(() => {
    const error = this.categoryCount.error() ?? this.assetCount.error() ?? this.eventCount.error();
    return error?.message ?? '';
  });
  readonly empty = computed(() => !this.loading() && !this.errorMessageValue() && isDashboardEmpty(this.counts()));

  constructor() {
    const subscription = observeDashboardActivities(this.db).subscribe(state => {
      this.activities.set(state.activities);
      this.activityLoading.set(state.loading);
      this.activityError.set(state.error ?? '');
    });
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  countFor(key: (typeof DASHBOARD_METRICS)[number]['key']): number {
    return this.counts()[key];
  }

  activityTypeKey(type: DashboardActivity['type']): string {
    return `dashboard.activity.type.${type.toLowerCase()}`;
  }

  activityMessage(activity: DashboardActivity): string {
    return this.t(dashboardActivityMessageKey(activity.type), {
      entity: this.t(dashboardActivityEntityKey(activity), {}, 'rxdb-model'),
      count: activity.count
    });
  }

  activityEntity(activity: DashboardActivity): string {
    return this.t(dashboardActivityEntityKey(activity), {}, 'rxdb-model');
  }

  formatActivityTime(activity: DashboardActivity): string {
    return this.i18n.formatDate(activity.createdAt, { dateStyle: 'medium', timeStyle: 'short' });
  }
}

@Component({
  selector: 'app-dashboard-page',
  imports: [DashboardContent],
  template: `
    <div class="page-host gap-4 overflow-auto p-6" [attr.aria-busy]="connection() === 'connecting'" data-testid="dashboard-page">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
          <h1 class="text-xl font-semibold">{{ t('dashboard.title') }}</h1>
          <p class="max-w-3xl text-sm opacity-70">{{ t('dashboard.description') }}</p>
        </div>
        <span
          class="badge"
          [class.badge-success]="connection() === 'ready'"
          [class.badge-error]="connection() === 'error'"
          data-testid="dashboard-connection-status"
        >
          @switch (connection()) {
            @case ('ready') {
              {{ t('dashboard.status.ready') }}
            }
            @case ('error') {
              {{ t('dashboard.status.error') }}
            }
            @default {
              {{ t('dashboard.status.connecting') }}
            }
          }
        </span>
      </header>
      @if (connection() === 'error') {
        <p class="text-error" data-testid="dashboard-connection-error" role="alert">
          {{ t('dashboard.connectionError', { message: connectionError() }) }}
        </p>
      }
      @if (connection() === 'connecting') {
        <section class="bg-base-200 rounded-box flex items-center gap-3 p-5" data-testid="dashboard-connecting" aria-live="polite">
          <span class="loading loading-spinner loading-sm"></span>{{ t('dashboard.status.connecting') }}
        </section>
      }
      @if (connection() === 'ready') {
        <app-dashboard-content />
      }
    </div>
  `
})
export default class DashboardPage {
  private readonly db = useRxDB();
  private readonly destroyRef = inject(DestroyRef);
  readonly t = useI18n().t;
  readonly connection = signal<DashboardConnectionState>('connecting');
  readonly connectionError = signal('');

  constructor() {
    const subscription = this.db.adapterConnected$('sqlite-wasm').subscribe({
      next: connected => {
        if (connected) this.connection.set('ready');
        else if (this.connection() !== 'error') this.connection.set('connecting');
      },
      error: cause => this.failConnection(cause)
    });
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
    void Promise.resolve(this.db.connect('sqlite-wasm')).catch(cause => this.failConnection(cause));
  }

  private failConnection(cause: unknown): void {
    this.connectionError.set(errorMessage(cause));
    this.connection.set('error');
  }
}
