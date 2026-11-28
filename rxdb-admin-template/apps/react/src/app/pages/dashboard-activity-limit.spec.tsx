import { I18nProvider } from '@aiao/rxdb-i18n-react';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkbenchI18n } from '../i18n/workbench-i18n';
import DashboardPage from './dashboard-page';

/** 与真实上限（5）不同的取值：计数分母若写死在页面里，这个值就读不到。 */
const { MOCK_ACTIVITY_LIMIT } = vi.hoisted(() => ({ MOCK_ACTIVITY_LIMIT: 7 }));

vi.mock('@aiao/rxdb-react', async () => {
  const { of } = await import('rxjs');
  const database = { adapterConnected$: () => of(true), connect: () => Promise.resolve() };
  return {
    useRxDB: () => database,
    useCount: () => ({ value: 0, isLoading: false, error: undefined })
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
  afterEach(cleanup);

  it('分母取自 DASHBOARD_ACTIVITY_LIMIT，与查询上限同一来源', () => {
    const runtime = createWorkbenchI18n();
    const view = render(
      <I18nProvider value={runtime}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </I18nProvider>
    );

    expect(view.getByTestId('dashboard-recent-activity').textContent).toContain(`2/${MOCK_ACTIVITY_LIMIT}`);
    runtime.destroy();
  });
});
