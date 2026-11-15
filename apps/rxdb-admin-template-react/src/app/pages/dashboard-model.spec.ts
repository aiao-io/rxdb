import { describe, expect, it } from 'vitest';
import { DASHBOARD_METRICS, dashboardTotal, isDashboardEmpty } from './dashboard-model';

describe('Dashboard 数据契约', () => {
  it('三张指标卡使用稳定的实体与导航语义', () => {
    expect(DASHBOARD_METRICS).toEqual([
      { key: 'categories', entityName: 'AssetCategory', titleKey: 'dashboard.metric.categories', route: '/entities/assets/AssetCategory' },
      { key: 'assets', entityName: 'Asset', titleKey: 'dashboard.metric.assets', route: '/entities/assets/Asset' },
      { key: 'events', entityName: 'AssetEvent', titleKey: 'dashboard.metric.events', route: '/entities/assets/AssetEvent' }
    ]);
  });

  it('总数和空库状态只由三类实体数量决定', () => {
    expect(dashboardTotal({ categories: 0, assets: 0, events: 0 })).toBe(0);
    expect(isDashboardEmpty({ categories: 0, assets: 0, events: 0 })).toBe(true);
    expect(dashboardTotal({ categories: 1, assets: 2, events: 3 })).toBe(6);
    expect(isDashboardEmpty({ categories: 1, assets: 0, events: 0 })).toBe(false);
  });
});
