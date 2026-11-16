import type { HistoryItem } from '@aiao/rxdb';

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

export const DASHBOARD_ACTIVITY_LIMIT = 5;

export type DashboardMetricKey = (typeof DASHBOARD_METRICS)[number]['key'];
export type DashboardCounts = Readonly<Record<DashboardMetricKey, number>>;
export type DashboardConnectionState = 'connecting' | 'ready' | 'error';
export type DashboardActivityType = HistoryItem['type'];
export type DashboardActivityMessageKey = `dashboard.activity.${Lowercase<DashboardActivityType>}`;

export interface DashboardChange {
  readonly id: number;
  readonly namespace: string;
  readonly entity: string;
  readonly type: Exclude<DashboardActivityType, 'TRANSACTION'>;
  readonly transactionId?: string | null;
  readonly createdAt: Date;
  readonly revertChangeId?: number | null;
  readonly redoInvalidatedAt?: Date | null;
}

export interface DashboardActivity {
  readonly changeId: number;
  readonly fingerprint: string;
  readonly namespace: string;
  readonly entity: string;
  readonly type: DashboardActivityType;
  readonly count: number;
  readonly createdAt: Date;
  readonly reverted: boolean;
  readonly redoInvalidated: boolean;
}

export function dashboardTotal(counts: DashboardCounts): number {
  return counts.categories + counts.assets + counts.events;
}

export function isDashboardEmpty(counts: DashboardCounts): boolean {
  return dashboardTotal(counts) === 0;
}

export function normalizeDashboardActivities(
  histories: readonly DashboardActivity[],
  limit = DASHBOARD_ACTIVITY_LIMIT
): DashboardActivity[] {
  return [...histories]
    .sort((left, right) => {
      const createdAtDelta = right.createdAt.getTime() - left.createdAt.getTime();
      return createdAtDelta || right.changeId - left.changeId;
    })
    .slice(0, Math.max(0, limit))
    .map(({ changeId, fingerprint, namespace, entity, type, count, createdAt, reverted, redoInvalidated }) => ({
      changeId,
      fingerprint,
      namespace,
      entity,
      type,
      count,
      createdAt,
      reverted,
      redoInvalidated
    }));
}

export function normalizeDashboardChanges(
  changes: readonly DashboardChange[],
  limit = DASHBOARD_ACTIVITY_LIMIT
): DashboardActivity[] {
  const groups: DashboardChange[][] = [];
  for (const change of [...changes].sort((left, right) => right.id - left.id)) {
    const current = groups.at(-1);
    if (change.transactionId && current?.[0]?.transactionId === change.transactionId) current.push(change);
    else groups.push([change]);
  }

  const records = groups.map(group => {
    const first = group[0]!;
    const type: DashboardActivityType = first.transactionId ? 'TRANSACTION' : first.type;
    return {
      changeId: group.reduce((max, change) => Math.max(max, change.id), first.id),
      fingerprint: `${type}:${group.map(change => change.id).join(':')}`,
      namespace: first.namespace,
      entity: first.entity,
      type,
      count: group.length,
      createdAt: first.createdAt,
      reverted: group.some(change => change.revertChangeId != null),
      redoInvalidated: group.some(change => change.redoInvalidatedAt != null)
    };
  });
  return normalizeDashboardActivities(records, limit);
}

export function dashboardActivityMessageKey(type: DashboardActivityType): DashboardActivityMessageKey {
  return `dashboard.activity.${type.toLowerCase()}` as DashboardActivityMessageKey;
}

export function dashboardActivityEntityKey(activity: Pick<DashboardActivity, 'namespace' | 'entity'>): string {
  return `entity.${activity.namespace}.${activity.entity}.displayName`;
}
