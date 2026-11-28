import { provideI18n } from '@aiao/rxdb-i18n-angular';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkbenchI18n } from '../i18n/workbench-i18n';
import DashboardPage from './dashboard-page';

/** 与真实上限（5）不同的取值：计数分母若写死在页面里，这个值就读不到。 */
const { MOCK_ACTIVITY_LIMIT } = vi.hoisted(() => ({ MOCK_ACTIVITY_LIMIT: 7 }));

vi.mock('@aiao/rxdb-angular', async () => {
  const { of } = await import('rxjs');
  const { signal } = await import('@angular/core');
  const database = { adapterConnected$: () => of(true), connect: () => Promise.resolve() };
  return {
    useRxDB: () => database,
    useCount: () => ({ value: signal(0), isLoading: signal(false), error: signal(undefined) })
  };
});

vi.mock('./dashboard-activity-source', async () => {
  const { of } = await import('rxjs');
  const activities = [
    {
      changeId: 2,
      fingerprint: 'UPDATE:2',
      namespace: 'assets',
      entity: 'Asset',
      type: 'UPDATE',
      count: 1,
      createdAt: new Date('2026-11-17T08:00:00Z'),
      reverted: false,
      redoInvalidated: false
    },
    {
      changeId: 1,
      fingerprint: 'INSERT:1',
      namespace: 'assets',
      entity: 'Asset',
      type: 'INSERT',
      count: 1,
      createdAt: new Date('2026-11-17T07:00:00Z'),
      reverted: false,
      redoInvalidated: false
    }
  ];
  return { observeDashboardActivities: () => of({ activities, loading: false, error: null }) };
});

vi.mock('./dashboard-model', async importOriginal => ({
  ...(await importOriginal<typeof import('./dashboard-model')>()),
  DASHBOARD_ACTIVITY_LIMIT: MOCK_ACTIVITY_LIMIT
}));

describe('Dashboard 最近活动计数', () => {
  const runtimes: ReturnType<typeof createWorkbenchI18n>[] = [];
  afterEach(() => {
    for (const runtime of runtimes.splice(0)) runtime.destroy();
  });

  it('分母取自 DASHBOARD_ACTIVITY_LIMIT，与查询上限同一来源', async () => {
    const runtime = createWorkbenchI18n();
    runtimes.push(runtime);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideI18n(runtime)]
    });
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    const section = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="dashboard-recent-activity"]');
    expect(section?.textContent).toContain(`2/${MOCK_ACTIVITY_LIMIT}`);
  });
});
