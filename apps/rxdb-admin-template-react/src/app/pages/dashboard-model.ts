/** Dashboard 的三张统计卡与对应实体入口。 */
export const DASHBOARD_METRICS = [
  {
    key: 'categories',
    entityName: 'AssetCategory',
    titleKey: 'dashboard.metric.categories',
    route: '/entities/assets/AssetCategory'
  },
  {
    key: 'assets',
    entityName: 'Asset',
    titleKey: 'dashboard.metric.assets',
    route: '/entities/assets/Asset'
  },
  {
    key: 'events',
    entityName: 'AssetEvent',
    titleKey: 'dashboard.metric.events',
    route: '/entities/assets/AssetEvent'
  }
] as const;

export type DashboardMetricKey = (typeof DASHBOARD_METRICS)[number]['key'];
export type DashboardCounts = Readonly<Record<DashboardMetricKey, number>>;
export type DashboardConnectionState = 'connecting' | 'ready' | 'error';

export function dashboardTotal(counts: DashboardCounts): number {
  return counts.categories + counts.assets + counts.events;
}

export function isDashboardEmpty(counts: DashboardCounts): boolean {
  return dashboardTotal(counts) === 0;
}
