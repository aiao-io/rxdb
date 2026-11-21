import { useI18n } from '@aiao/rxdb-i18n-react';
import { useCount, useRxDB } from '@aiao/rxdb-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Asset, AssetCategory, AssetEvent } from '../entities/asset-entities';
import {
  DASHBOARD_ACTIVITY_LIMIT,
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

function activityTypeKey(type: DashboardActivity['type']): string {
  return `dashboard.activity.type.${type.toLowerCase()}`;
}

function DashboardContent() {
  const db = useRxDB();
  const { t, formatDate } = useI18n();
  const categoryCount = useCount(AssetCategory, COUNT_OPTIONS);
  const assetCount = useCount(Asset, COUNT_OPTIONS);
  const eventCount = useCount(AssetEvent, COUNT_OPTIONS);
  const [activities, setActivities] = useState<readonly DashboardActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);
  const counts = useMemo<DashboardCounts>(
    () => ({
      categories: categoryCount.value,
      assets: assetCount.value,
      events: eventCount.value
    }),
    [assetCount.value, categoryCount.value, eventCount.value]
  );
  const total = dashboardTotal(counts);
  const loading = categoryCount.isLoading || assetCount.isLoading || eventCount.isLoading;
  const error = categoryCount.error ?? assetCount.error ?? eventCount.error;

  useEffect(() => {
    const subscription = observeDashboardActivities(db).subscribe(state => {
      setActivities(state.activities);
      setActivityLoading(state.loading);
      setActivityError(state.error);
    });
    return () => subscription.unsubscribe();
  }, [db]);

  return (
    <>
      <section className='grid gap-4 sm:grid-cols-3' aria-label={t('dashboard.title')} data-testid='dashboard-metrics'>
        {DASHBOARD_METRICS.map(metric => (
          <Link
            className='card bg-base-200 border-base-300 hover:border-primary border transition-colors'
            to={metric.route}
            key={metric.key}
            data-metric={metric.key}
            data-testid='dashboard-metric-card'
          >
            <div className='card-body gap-2 p-5'>
              <h2 className='text-sm opacity-70'>{t(metric.titleKey)}</h2>
              <strong className='text-3xl font-semibold'>{counts[metric.key]}</strong>
            </div>
          </Link>
        ))}
      </section>
      <p className='text-sm opacity-70' data-testid='dashboard-total'>
        {t('dashboard.total', { count: total })}
      </p>
      {loading && (
        <p className='text-sm' data-testid='dashboard-loading' aria-live='polite'>
          <span className='loading loading-spinner loading-sm'></span>
          {t('dashboard.loading')}
        </p>
      )}
      {error && (
        <p className='text-error' data-testid='dashboard-load-failed' role='alert'>
          {t('dashboard.loadFailed', { message: error.message })}
        </p>
      )}
      {!loading && !error && isDashboardEmpty(counts) && (
        <section className='bg-base-200 rounded-box flex flex-col gap-2 p-5' data-testid='dashboard-empty'>
          <h2 className='font-semibold'>{t('dashboard.empty.title')}</h2>
          <p className='text-sm opacity-70'>{t('dashboard.empty.description')}</p>
        </section>
      )}
      <section
        className='flex flex-col gap-3'
        data-testid='dashboard-recent-activity'
        aria-labelledby='dashboard-recent-activity-title'
      >
        <div className='flex items-center justify-between gap-3'>
          <h2 id='dashboard-recent-activity-title' className='text-base font-semibold'>
            {t('dashboard.activity.title')}
          </h2>
          <span className='text-xs opacity-60'>
            {activities.length}/{DASHBOARD_ACTIVITY_LIMIT}
          </span>
        </div>
        {activityLoading && (
          <p className='text-sm opacity-70' data-testid='dashboard-recent-activity-loading' aria-live='polite'>
            <span className='loading loading-spinner loading-sm'></span>
            {t('dashboard.activity.loading')}
          </p>
        )}
        {!activityLoading && activityError !== null && (
          <p className='text-error text-sm' data-testid='dashboard-recent-activity-failed' role='alert'>
            {t('dashboard.activity.failed', { message: activityError })}
          </p>
        )}
        {!activityLoading && activityError === null && activities.length === 0 && (
          <p className='bg-base-200 rounded-box p-5 text-sm opacity-70' data-testid='dashboard-recent-activity-empty'>
            {t('dashboard.activity.empty')}
          </p>
        )}
        {!activityLoading && activityError === null && activities.length > 0 && (
          <ol
            className='divide-base-300 rounded-box border-base-300 divide-y border'
            aria-label={t('dashboard.activity.title')}
          >
            {activities.map(activity => (
              <li
                className='flex flex-wrap items-start justify-between gap-3 p-4'
                key={activity.fingerprint}
                data-activity-type={activity.type}
                data-testid='dashboard-activity-item'
              >
                <div className='min-w-0 flex-1'>
                  <p className={`font-medium ${activity.redoInvalidated ? 'line-through' : ''}`}>
                    {t(dashboardActivityMessageKey(activity.type), {
                      entity: t(dashboardActivityEntityKey(activity), {}, 'rxdb-model'),
                      count: activity.count
                    })}
                  </p>
                  <div className='mt-2 flex flex-wrap gap-2'>
                    <span className='badge badge-sm badge-outline'>{t(activityTypeKey(activity.type))}</span>
                    <span className='badge badge-sm badge-ghost'>
                      {t(dashboardActivityEntityKey(activity), {}, 'rxdb-model')}
                    </span>
                    {activity.reverted && (
                      <span className='badge badge-sm badge-warning'>{t('dashboard.activity.reverted')}</span>
                    )}
                    {activity.redoInvalidated && (
                      <span className='badge badge-sm badge-error'>{t('dashboard.activity.invalidated')}</span>
                    )}
                  </div>
                </div>
                <time className='text-xs opacity-60' dateTime={activity.createdAt.toISOString()}>
                  {formatDate(activity.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className='flex flex-col gap-3' data-testid='dashboard-quick-actions'>
        <h2 className='text-base font-semibold'>{t('dashboard.quick.title')}</h2>
        <div className='flex flex-wrap gap-3'>
          <Link className='btn btn-primary' to='/entities/assets/Asset'>
            {t('dashboard.quick.assets')}
          </Link>
          <Link className='btn btn-outline' to='/search'>
            {t('dashboard.quick.search')}
          </Link>
          <Link className='btn btn-outline' to='/backup'>
            {t('dashboard.quick.backup')}
          </Link>
        </div>
      </section>
    </>
  );
}

/** Dashboard 进入后才建立本地数据库连接，首页仍保持可恢复的空工作台入口。 */
export default function DashboardPage() {
  const db = useRxDB();
  const { t } = useI18n();
  const [connection, setConnection] = useState<DashboardConnectionState>('connecting');
  const [connectionError, setConnectionError] = useState('');

  useEffect(() => {
    let active = true;
    const fail = (cause: unknown): void => {
      if (!active) return;
      setConnectionError(errorMessage(cause));
      setConnection('error');
    };
    const subscription = db.adapterConnected$('sqlite-wasm').subscribe({
      next: connected => {
        if (!active) return;
        if (connected) setConnection('ready');
        else setConnection(current => (current === 'error' ? current : 'connecting'));
      },
      error: fail
    });
    void Promise.resolve(db.connect('sqlite-wasm')).catch(fail);
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [db]);

  return (
    <div
      className='page-host gap-4 overflow-auto p-6'
      aria-busy={connection === 'connecting'}
      data-testid='dashboard-page'
    >
      <header className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex flex-col gap-1'>
          <h1 className='text-xl font-semibold'>{t('dashboard.title')}</h1>
          <p className='max-w-3xl text-sm opacity-70'>{t('dashboard.description')}</p>
        </div>
        <span
          className={`badge ${connection === 'ready' ? 'badge-success' : ''} ${connection === 'error' ? 'badge-error' : ''}`}
          data-testid='dashboard-connection-status'
        >
          {connection === 'ready' && t('dashboard.status.ready')}
          {connection === 'error' && t('dashboard.status.error')}
          {connection === 'connecting' && t('dashboard.status.connecting')}
        </span>
      </header>
      {connection === 'error' && (
        <p className='text-error' data-testid='dashboard-connection-error' role='alert'>
          {t('dashboard.connectionError', { message: connectionError })}
        </p>
      )}
      {connection === 'connecting' && (
        <section
          className='bg-base-200 rounded-box flex items-center gap-3 p-5'
          data-testid='dashboard-connecting'
          aria-live='polite'
        >
          <span className='loading loading-spinner loading-sm'></span>
          {t('dashboard.status.connecting')}
        </section>
      )}
      {connection === 'ready' && <DashboardContent />}
    </div>
  );
}
