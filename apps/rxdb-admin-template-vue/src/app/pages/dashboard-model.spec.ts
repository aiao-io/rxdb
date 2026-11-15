import type { HistoryItem } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_METRICS,
  dashboardActivityEntityKey,
  dashboardActivityMessageKey,
  dashboardTotal,
  isDashboardEmpty,
  normalizeDashboardActivities,
  normalizeDashboardChanges,
  type DashboardChange
} from './dashboard-model';

const createHistory = (overrides: Partial<HistoryItem> = {}): HistoryItem => ({
  changeId: 1,
  fingerprint: 'history-1',
  namespace: 'assets',
  entity: 'AssetCategory',
  type: 'INSERT',
  description: '创建 AssetCategory',
  transactionId: null,
  changes: [],
  count: 1,
  createdAt: new Date('2026-11-16T10:00:00.000Z'),
  reverted: false,
  redoInvalidated: false,
  ...overrides
});

const createChange = (overrides: Partial<DashboardChange> = {}): DashboardChange => ({
  id: 1,
  namespace: 'assets',
  entity: 'AssetCategory',
  type: 'INSERT',
  transactionId: null,
  createdAt: new Date('2026-11-16T10:00:00.000Z'),
  revertChangeId: null,
  redoInvalidatedAt: null,
  ...overrides
});

describe('Dashboard 数据契约', () => {
  it('三张指标卡使用稳定的实体与导航语义', () => {
    expect(DASHBOARD_METRICS).toEqual([
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
    ]);
  });

  it('总数和空库状态只由三类实体数量决定', () => {
    expect(dashboardTotal({ categories: 0, assets: 0, events: 0 })).toBe(0);
    expect(isDashboardEmpty({ categories: 0, assets: 0, events: 0 })).toBe(true);
    expect(dashboardTotal({ categories: 1, assets: 2, events: 3 })).toBe(6);
    expect(isDashboardEmpty({ categories: 1, assets: 0, events: 0 })).toBe(false);
  });

  it('空历史不生成活动，归一化不修改上游数组', () => {
    const histories = [createHistory({ changeId: 1 }), createHistory({ changeId: 2 })];
    expect(normalizeDashboardActivities([])).toEqual([]);
    expect(normalizeDashboardChanges([])).toEqual([]);
    expect(normalizeDashboardActivities(histories, 0)).toEqual([]);
    normalizeDashboardActivities(histories);
    expect(histories.map(item => item.changeId)).toEqual([1, 2]);
  });

  it('最近活动按时间倒序并限制为五条', () => {
    const histories = Array.from({ length: 6 }, (_, index) =>
      createHistory({
        changeId: index + 1,
        fingerprint: `history-${index + 1}`,
        createdAt: new Date(`2026-11-16T10:0${index}:00.000Z`)
      })
    );

    expect(normalizeDashboardActivities(histories).map(item => item.changeId)).toEqual([6, 5, 4, 3, 2]);
  });

  it('保留四种操作类型、实体和历史状态', () => {
    const histories = [
      createHistory({ changeId: 1, type: 'INSERT' }),
      createHistory({ changeId: 2, type: 'UPDATE', reverted: true }),
      createHistory({ changeId: 3, type: 'DELETE', redoInvalidated: true }),
      createHistory({ changeId: 4, type: 'TRANSACTION', count: 3, entity: 'Asset' })
    ];

    expect(normalizeDashboardActivities(histories)).toMatchObject([
      { changeId: 4, type: 'TRANSACTION', entity: 'Asset', count: 3 },
      { changeId: 3, type: 'DELETE', reverted: false, redoInvalidated: true },
      { changeId: 2, type: 'UPDATE', reverted: true, redoInvalidated: false },
      { changeId: 1, type: 'INSERT' }
    ]);
  });

  it('从持久化变更日志聚合事务并保留撤销状态', () => {
    const activities = normalizeDashboardChanges([
      createChange({ id: 1, transactionId: 'transaction-1' }),
      createChange({ id: 2, transactionId: 'transaction-1', type: 'UPDATE' }),
      createChange({ id: 3, type: 'DELETE', revertChangeId: 4 })
    ]);

    expect(activities).toMatchObject([
      { changeId: 3, type: 'DELETE', count: 1, reverted: true },
      { changeId: 2, type: 'TRANSACTION', count: 2, reverted: false }
    ]);
  });

  it('为操作和实体生成稳定的本地化 key，不使用插件生成的中文描述', () => {
    const activity = normalizeDashboardActivities([createHistory({ namespace: 'assets', entity: 'Asset' })])[0];

    expect(activity).toBeDefined();
    expect(activity).not.toHaveProperty('description');
    expect(dashboardActivityMessageKey('INSERT')).toBe('dashboard.activity.insert');
    expect(dashboardActivityMessageKey('UPDATE')).toBe('dashboard.activity.update');
    expect(dashboardActivityMessageKey('DELETE')).toBe('dashboard.activity.delete');
    expect(dashboardActivityMessageKey('TRANSACTION')).toBe('dashboard.activity.transaction');
    expect(dashboardActivityEntityKey(activity!)).toBe('entity.assets.Asset.displayName');
  });
});
