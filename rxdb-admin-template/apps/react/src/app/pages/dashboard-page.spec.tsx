import type { EntityType } from '@aiao/rxdb';
import type { I18n } from '@aiao/rxdb-i18n';
import { I18nProvider } from '@aiao/rxdb-i18n-react';
import { act, cleanup, render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkbenchI18n } from '../i18n/workbench-i18n';
import type { DashboardActivityState } from './dashboard-activity-source';
import type { DashboardActivity } from './dashboard-model';
import DashboardPage from './dashboard-page';

/** `useCount` 返回值的最小替身：只含页面读取的字段。 */
interface FakeCount {
  value: number;
  error: Error | undefined;
  isLoading: boolean;
}

const mocks = vi.hoisted(() => ({
  database: {
    adapterConnected$: vi.fn<(adapter: string) => unknown>(),
    connect: vi.fn<(adapter: string) => Promise<void>>()
  },
  counts: {} as Record<string, FakeCount>,
  activity: undefined as unknown as BehaviorSubject<DashboardActivityState>
}));

vi.mock('@aiao/rxdb-react', async () => {
  // 实体类经装饰器包装后 class.name 为空，统计结果按实体元数据里的名称取
  const { getEntityMetadata } = await import('@aiao/rxdb');
  return {
    useRxDB: () => mocks.database,
    useCount: (entity: EntityType) => mocks.counts[getEntityMetadata(entity).name]
  };
});
vi.mock('./dashboard-activity-source', () => ({ observeDashboardActivities: () => mocks.activity }));

const runtimes: I18n[] = [];

/** 数据库适配器连接状态流：用例通过它推进「连接中 → 已连接 / 失败」。 */
let connected$: Subject<boolean>;

/** 构造三张统计卡的查询结果；`state` 可把其中一张置为加载中或失败。 */
function setCounts(
  values: { categories: number; assets: number; events: number },
  state: Partial<Record<'categories' | 'assets' | 'events', Partial<FakeCount>>> = {}
): void {
  const resource = (value: number, override: Partial<FakeCount> | undefined): FakeCount => ({
    value,
    error: undefined,
    isLoading: false,
    ...override
  });
  mocks.counts['AssetCategory'] = resource(values.categories, state.categories);
  mocks.counts['Asset'] = resource(values.assets, state.assets);
  mocks.counts['AssetEvent'] = resource(values.events, state.events);
}

/** 构造一条最近活动；时间固定，保证排序与展示可重复。 */
function activity(overrides: Partial<DashboardActivity> = {}): DashboardActivity {
  return {
    changeId: 1,
    fingerprint: 'INSERT:1',
    namespace: 'assets',
    entity: 'Asset',
    type: 'INSERT',
    count: 1,
    createdAt: new Date('2026-11-17T08:30:00Z'),
    reverted: false,
    redoInvalidated: false,
    ...overrides
  };
}

/** 渲染仪表盘页，并推进到「数据库已连接」。 */
function renderPage(options: { connect?: boolean } = {}) {
  const runtime = createWorkbenchI18n();
  runtimes.push(runtime);
  const view = render(
    <I18nProvider value={runtime}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </I18nProvider>
  );
  if (options.connect !== false) act(() => connected$.next(true));
  return { runtime, ...view };
}

describe('Dashboard 页面', () => {
  beforeEach(() => {
    connected$ = new Subject<boolean>();
    mocks.database.adapterConnected$.mockReset().mockImplementation(() => connected$);
    mocks.database.connect.mockReset().mockResolvedValue(undefined);
    mocks.activity = new BehaviorSubject<DashboardActivityState>({ activities: [], loading: false, error: null });
    setCounts({ categories: 2, assets: 3, events: 1 });
  });

  afterEach(() => {
    cleanup();
    for (const runtime of runtimes.splice(0)) runtime.destroy();
  });

  describe('数据库连接', () => {
    it('连接建立前只显示连接中占位，不渲染统计，状态随语言更新', async () => {
      const view = renderPage({ connect: false });
      expect(mocks.database.connect).toHaveBeenCalledWith('sqlite-wasm');
      expect(view.getByTestId('dashboard-connecting').textContent).toBe('正在连接数据库…');
      expect(view.getByTestId('dashboard-connection-status').textContent).toBe('正在连接数据库…');
      expect(view.getByTestId('dashboard-page').getAttribute('aria-busy')).toBe('true');
      expect(view.queryByTestId('dashboard-metrics')).toBeNull();

      await act(async () => view.runtime.setLocale('en'));
      expect(view.getByTestId('dashboard-connecting').textContent).toBe('Connecting to database…');
      expect(view.getByRole('heading', { level: 1 }).textContent).toBe('Asset workbench overview');
    });

    it('连接成功后显示已连接状态并渲染统计与活动区域', async () => {
      const view = renderPage();
      expect(view.getByTestId('dashboard-connection-status').textContent).toBe('数据库已连接');
      expect(view.getByTestId('dashboard-page').getAttribute('aria-busy')).toBe('false');
      expect(view.queryByTestId('dashboard-connecting')).toBeNull();
      expect(view.getByTestId('dashboard-metrics')).toBeTruthy();

      await act(async () => view.runtime.setLocale('en'));
      expect(view.getByTestId('dashboard-connection-status').textContent).toBe('Database connected');
    });

    it('适配器连接流报错时显示失败状态与原始原因，随语言更新', async () => {
      const view = renderPage({ connect: false });
      act(() => connected$.error(new Error('adapter lost')));
      expect(view.getByTestId('dashboard-connection-status').textContent).toBe('数据库连接失败');
      expect(view.getByTestId('dashboard-connection-error').textContent).toBe('数据库连接失败：adapter lost');
      expect(view.queryByTestId('dashboard-metrics')).toBeNull();

      await act(async () => view.runtime.setLocale('en'));
      expect(view.getByTestId('dashboard-connection-error').textContent).toBe(
        'Database connection failed: adapter lost'
      );
    });

    it('连接调用被拒绝时同样进入失败态，非错误对象的原因按文本展示', async () => {
      mocks.database.connect.mockRejectedValue('disk full');
      const view = renderPage({ connect: false });
      await act(async () => undefined);
      expect(view.getByTestId('dashboard-connection-error').textContent).toBe('数据库连接失败：disk full');
    });

    it('连接失败后适配器又报告未连接，页面保持失败态而不是回到连接中', async () => {
      mocks.database.connect.mockRejectedValue(new Error('boom'));
      const view = renderPage({ connect: false });
      await act(async () => undefined);
      act(() => connected$.next(false));
      expect(view.getByTestId('dashboard-connection-status').textContent).toBe('数据库连接失败');
      expect(view.queryByTestId('dashboard-connecting')).toBeNull();
    });

    it('卸载后释放适配器连接订阅与最近活动订阅', () => {
      const view = renderPage();
      expect(connected$.observed).toBe(true);
      expect(mocks.activity.observed).toBe(true);

      view.unmount();
      expect(connected$.observed).toBe(false);
      expect(mocks.activity.observed).toBe(false);
    });
  });

  describe('统计卡与总数', () => {
    it('三张统计卡按预置实体顺序显示数量并链接到各自的实体列表', async () => {
      const view = renderPage();
      const cards = view.getAllByTestId('dashboard-metric-card');
      expect(cards.map(card => card.getAttribute('data-metric'))).toEqual(['categories', 'assets', 'events']);
      expect(cards.map(card => card.getAttribute('href'))).toEqual([
        '/entities/assets/AssetCategory',
        '/entities/assets/Asset',
        '/entities/assets/AssetEvent'
      ]);
      expect(cards.map(card => within(card).getByRole('heading').textContent)).toEqual([
        '资产分类',
        '资产',
        '维护记录'
      ]);
      expect(cards.map(card => card.querySelector('strong')?.textContent)).toEqual(['2', '3', '1']);
      expect(view.getByTestId('dashboard-total').textContent).toBe('记录总数：6');

      await act(async () => view.runtime.setLocale('en'));
      expect(cards.map(card => within(card).getByRole('heading').textContent)).toEqual([
        'Asset categories',
        'Assets',
        'Maintenance records'
      ]);
      expect(cards.map(card => card.querySelector('strong')?.textContent)).toEqual(['2', '3', '1']);
      expect(view.getByTestId('dashboard-total').textContent).toBe('Total records: 6');
    });

    it('任一统计仍在读取时显示读取提示，且不误报空工作台', async () => {
      setCounts({ categories: 0, assets: 0, events: 0 }, { assets: { isLoading: true } });
      const view = renderPage();
      expect(view.getByTestId('dashboard-loading').textContent).toBe('正在读取统计数据…');
      expect(view.queryByTestId('dashboard-empty')).toBeNull();

      await act(async () => view.runtime.setLocale('en'));
      expect(view.getByTestId('dashboard-loading').textContent).toBe('Reading statistics…');
    });

    it('统计读取失败时显示原始错误，随语言更新，且不误报空工作台', async () => {
      setCounts({ categories: 0, assets: 0, events: 0 }, { events: { error: new Error('count failed') } });
      const view = renderPage();
      expect(view.getByTestId('dashboard-load-failed').textContent).toBe('统计数据读取失败：count failed');
      expect(view.queryByTestId('dashboard-empty')).toBeNull();

      await act(async () => view.runtime.setLocale('en'));
      expect(view.getByTestId('dashboard-load-failed').textContent).toBe('Could not read statistics: count failed');
    });

    it('统计以空消息的错误失败时仍显示失败态，不误报空工作台', () => {
      setCounts({ categories: 0, assets: 0, events: 0 }, { events: { error: new Error('') } });
      const view = renderPage();
      expect(view.getByTestId('dashboard-load-failed').textContent).toBe('统计数据读取失败：');
      expect(view.queryByTestId('dashboard-empty')).toBeNull();
    });

    it('三类记录都为零时显示空工作台引导，有数据时不显示', async () => {
      setCounts({ categories: 0, assets: 0, events: 0 });
      const empty = renderPage();
      expect(empty.getByTestId('dashboard-empty').textContent).toContain('工作台还是空的');

      await act(async () => empty.runtime.setLocale('en'));
      expect(empty.getByTestId('dashboard-empty').textContent).toContain('Your workbench is empty');
      empty.unmount();

      setCounts({ categories: 0, assets: 1, events: 0 });
      const filled = renderPage();
      expect(filled.queryByTestId('dashboard-empty')).toBeNull();
    });
  });

  describe('最近活动', () => {
    it('活动读取中显示读取提示，不展示空态或列表', async () => {
      mocks.activity.next({ activities: [], loading: true, error: null });
      const view = renderPage();
      const section = within(view.getByTestId('dashboard-recent-activity'));
      expect(section.getByTestId('dashboard-recent-activity-loading').textContent).toBe('正在读取最近活动…');
      expect(section.queryByTestId('dashboard-recent-activity-empty')).toBeNull();
      expect(section.queryByRole('list')).toBeNull();

      await act(async () => view.runtime.setLocale('en'));
      expect(section.getByTestId('dashboard-recent-activity-loading').textContent).toBe('Reading recent activity…');
    });

    it('活动读取失败时显示原始原因，随语言更新', async () => {
      mocks.activity.next({ activities: [], loading: false, error: 'raw query unavailable' });
      const view = renderPage();
      expect(view.getByTestId('dashboard-recent-activity-failed').textContent).toBe(
        '最近活动读取失败：raw query unavailable'
      );

      await act(async () => view.runtime.setLocale('en'));
      expect(view.getByTestId('dashboard-recent-activity-failed').textContent).toBe(
        'Could not read recent activity: raw query unavailable'
      );
    });

    it('活动以空消息失败时仍显示失败态，不误报暂无操作记录', () => {
      mocks.activity.next({ activities: [], loading: false, error: '' });
      const view = renderPage();
      expect(view.getByTestId('dashboard-recent-activity-failed').textContent).toBe('最近活动读取失败：');
      expect(view.queryByTestId('dashboard-recent-activity-empty')).toBeNull();
    });

    it('没有任何活动时显示空态', async () => {
      const view = renderPage();
      expect(view.getByTestId('dashboard-recent-activity-empty').textContent).toBe('暂无操作记录');

      await act(async () => view.runtime.setLocale('en'));
      expect(view.getByTestId('dashboard-recent-activity-empty').textContent).toBe('No activity yet');
    });

    it('活动列表按类型输出文案与徽标，实体名和类型随语言切换，时间戳保持同一时刻', async () => {
      const created = activity({ fingerprint: 'INSERT:3', type: 'INSERT', entity: 'Asset' });
      const batch = activity({
        changeId: 2,
        fingerprint: 'TRANSACTION:2:1',
        type: 'TRANSACTION',
        entity: 'AssetCategory',
        count: 4,
        createdAt: new Date('2026-11-16T08:30:00Z')
      });
      mocks.activity.next({ activities: [created, batch], loading: false, error: null });
      const view = renderPage();
      const items = view.getAllByTestId('dashboard-activity-item');
      expect(items.map(item => item.getAttribute('data-activity-type'))).toEqual(['INSERT', 'TRANSACTION']);
      expect(items.map(item => item.querySelector('p')?.textContent)).toEqual(['创建资产', '批量变更 4 条记录']);
      expect([...items[0]!.querySelectorAll('.badge')].map(badge => badge.textContent)).toEqual(['创建', '资产']);
      const zhTime = items[0]!.querySelector('time')?.textContent;
      expect(items[0]!.querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-17T08:30:00.000Z');

      await act(async () => view.runtime.setLocale('en'));
      expect(items.map(item => item.querySelector('p')?.textContent)).toEqual(['Created Assets', 'Changed 4 records']);
      expect([...items[0]!.querySelectorAll('.badge')].map(badge => badge.textContent)).toEqual(['Created', 'Assets']);
      expect(items[0]!.querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-17T08:30:00.000Z');
      expect(items[0]!.querySelector('time')?.textContent).not.toBe(zhTime);
    });

    it('已撤销与重做失效的活动带标记，失效的文案加删除线，标记随语言更新', async () => {
      mocks.activity.next({
        activities: [
          activity({ fingerprint: 'UPDATE:5', changeId: 5, type: 'UPDATE', reverted: true }),
          activity({ fingerprint: 'DELETE:4', changeId: 4, type: 'DELETE', redoInvalidated: true }),
          activity({ fingerprint: 'INSERT:3', changeId: 3 })
        ],
        loading: false,
        error: null
      });
      const view = renderPage();
      const [reverted, invalidated, plain] = view.getAllByTestId('dashboard-activity-item');
      const flags = (item: HTMLElement | undefined) =>
        [...(item?.querySelectorAll('.badge-warning, .badge-error') ?? [])].map(badge => badge.textContent);
      expect(flags(reverted)).toEqual(['已撤销']);
      expect(flags(invalidated)).toEqual(['已失效']);
      expect(flags(plain)).toEqual([]);
      expect(invalidated?.querySelector('p')?.className).toContain('line-through');
      expect(reverted?.querySelector('p')?.className).not.toContain('line-through');

      await act(async () => view.runtime.setLocale('en'));
      expect(flags(reverted)).toEqual(['Reverted']);
      expect(flags(invalidated)).toEqual(['Redo invalidated']);
    });

    it('活动流推送新状态后列表随之更新', () => {
      const view = renderPage();
      expect(view.queryAllByTestId('dashboard-activity-item')).toHaveLength(0);

      act(() => mocks.activity.next({ activities: [activity()], loading: false, error: null }));
      expect(view.getAllByTestId('dashboard-activity-item')).toHaveLength(1);
      expect(view.queryByTestId('dashboard-recent-activity-empty')).toBeNull();
    });
  });

  describe('快捷操作', () => {
    it('快捷入口的链接保持不变，文案随语言切换', async () => {
      const view = renderPage();
      const links = within(view.getByTestId('dashboard-quick-actions')).getAllByRole('link');
      expect(links.map(link => link.getAttribute('href'))).toEqual(['/entities/assets/Asset', '/search', '/backup']);
      expect(links.map(link => link.textContent)).toEqual(['管理资产', '搜索记录', '备份 / 恢复']);

      await act(async () => view.runtime.setLocale('en'));
      expect(links.map(link => link.getAttribute('href'))).toEqual(['/entities/assets/Asset', '/search', '/backup']);
      expect(links.map(link => link.textContent)).toEqual(['Manage assets', 'Search records', 'Backup / Restore']);
    });
  });
});
