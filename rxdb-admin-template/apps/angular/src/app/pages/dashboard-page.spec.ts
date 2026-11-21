import { getEntityMetadata, type EntityType } from '@aiao/rxdb';
import type { I18n } from '@aiao/rxdb-i18n';
import { provideI18n } from '@aiao/rxdb-i18n-angular';
import { provideZonelessChangeDetection, signal, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkbenchI18n } from '../i18n/workbench-i18n';
import type { DashboardActivityState } from './dashboard-activity-source';
import type { DashboardActivity } from './dashboard-model';
import DashboardPage from './dashboard-page';

/** 一张统计卡的查询状态。 */
interface CountState {
  value: number;
  error: Error | undefined;
  isLoading: boolean;
}

/** `useCount` 返回值的最小替身：只含页面读取的 signal。 */
interface FakeCount {
  value: Signal<number>;
  error: Signal<Error | undefined>;
  isLoading: Signal<boolean>;
}

const mocks = vi.hoisted(() => ({
  database: {
    adapterConnected$: vi.fn<(adapter: string) => unknown>(),
    connect: vi.fn<(adapter: string) => Promise<void>>()
  },
  counts: {} as Record<string, FakeCount>,
  activity: undefined as unknown as BehaviorSubject<DashboardActivityState>
}));

vi.mock('@aiao/rxdb-angular', async () => {
  // 实体类经装饰器包装后 class.name 为空，统计结果按实体元数据里的名称取
  return {
    useRxDB: () => mocks.database,
    useCount: (entity: EntityType) => mocks.counts[getEntityMetadata(entity).name]
  };
});
vi.mock('./dashboard-activity-source', () => ({ observeDashboardActivities: () => mocks.activity }));

let runtime: I18n;

/** 数据库适配器连接状态流：用例通过它推进「连接中 → 已连接 / 失败」。 */
let connected$: Subject<boolean>;

/** 构造三张统计卡的查询结果；`state` 可把其中一张置为加载中或失败。 */
function setCounts(
  values: { categories: number; assets: number; events: number },
  state: Partial<Record<'categories' | 'assets' | 'events', Partial<CountState>>> = {}
): void {
  const resource = (value: number, override: Partial<CountState> | undefined): FakeCount => {
    const merged: CountState = { value, error: undefined, isLoading: false, ...override };
    return { value: signal(merged.value), error: signal(merged.error), isLoading: signal(merged.isLoading) };
  };
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

/** 等待挂起的 Promise 回调与随后的视图刷新全部完成。 */
async function settle(harness: RouterTestingHarness): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  harness.detectChanges();
  await harness.fixture.whenStable();
}

/** 切换工作台语言，并等视图随之刷新。 */
async function switchLocale(harness: RouterTestingHarness, locale: string): Promise<void> {
  await runtime.setLocale(locale);
  await harness.fixture.whenStable();
}

/** 折叠空白并去掉首尾空格，模板里的换行缩进不影响文案比较。 */
function normalize(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** 按 data-testid 取元素；找不到返回 `null`。 */
function byTestId(root: ParentNode, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

/** 按 data-testid 取全部元素。 */
function allByTestId(root: ParentNode, id: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
}

/** 按 data-testid 取元素文本；元素不存在时抛错，避免断言在 undefined 上悄悄通过。 */
function textOfTestId(root: ParentNode, id: string): string {
  const element = byTestId(root, id);
  if (!element) throw new Error(`页面里没有渲染 ${id}`);
  return normalize(element.textContent);
}

/** 活动条目里所有徽标的文本。 */
function badgesOf(item: Element): string[] {
  return [...item.querySelectorAll('.badge')].map(badge => normalize(badge.textContent));
}

/** 活动条目里「已撤销 / 已失效」标记的文本。 */
function flagsOf(item: Element | undefined): string[] {
  return [...(item?.querySelectorAll('.badge-warning, .badge-error') ?? [])].map(badge => normalize(badge.textContent));
}

/** 渲染仪表盘页，并推进到「数据库已连接」。 */
async function renderPage(options: { connect?: boolean } = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideI18n(runtime),
      provideRouter([{ path: '', component: DashboardPage }])
    ]
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/', DashboardPage);
  await settle(harness);
  if (options.connect !== false) {
    connected$.next(true);
    await settle(harness);
  }
  return { harness, root: harness.fixture.nativeElement as HTMLElement };
}

describe('Dashboard 页面', () => {
  beforeEach(() => {
    runtime = createWorkbenchI18n();
    connected$ = new Subject<boolean>();
    mocks.database.adapterConnected$.mockReset().mockImplementation(() => connected$);
    mocks.database.connect.mockReset().mockResolvedValue(undefined);
    mocks.activity = new BehaviorSubject<DashboardActivityState>({ activities: [], loading: false, error: null });
    setCounts({ categories: 2, assets: 3, events: 1 });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    runtime.destroy();
  });

  describe('数据库连接', () => {
    it('连接建立前只显示连接中占位，不渲染统计，状态随语言更新', async () => {
      const view = await renderPage({ connect: false });
      expect(mocks.database.connect).toHaveBeenCalledWith('sqlite-wasm');
      expect(textOfTestId(view.root, 'dashboard-connecting')).toBe('正在连接数据库…');
      expect(textOfTestId(view.root, 'dashboard-connection-status')).toBe('正在连接数据库…');
      expect(byTestId(view.root, 'dashboard-page')?.getAttribute('aria-busy')).toBe('true');
      expect(byTestId(view.root, 'dashboard-metrics')).toBeNull();

      await switchLocale(view.harness, 'en');
      expect(textOfTestId(view.root, 'dashboard-connecting')).toBe('Connecting to database…');
      expect(normalize(view.root.querySelector('h1')?.textContent)).toBe('Asset workbench overview');
    });

    it('连接成功后显示已连接状态并渲染统计与活动区域', async () => {
      const view = await renderPage();
      expect(textOfTestId(view.root, 'dashboard-connection-status')).toBe('数据库已连接');
      expect(byTestId(view.root, 'dashboard-page')?.getAttribute('aria-busy')).toBe('false');
      expect(byTestId(view.root, 'dashboard-connecting')).toBeNull();
      expect(byTestId(view.root, 'dashboard-metrics')).not.toBeNull();
      expect(byTestId(view.root, 'dashboard-recent-activity')).not.toBeNull();

      await switchLocale(view.harness, 'en');
      expect(textOfTestId(view.root, 'dashboard-connection-status')).toBe('Database connected');
    });

    it('适配器连接流报错时显示失败状态与原始原因，随语言更新', async () => {
      const view = await renderPage({ connect: false });
      connected$.error(new Error('adapter lost'));
      await settle(view.harness);
      expect(textOfTestId(view.root, 'dashboard-connection-status')).toBe('数据库连接失败');
      expect(textOfTestId(view.root, 'dashboard-connection-error')).toBe('数据库连接失败：adapter lost');
      expect(byTestId(view.root, 'dashboard-metrics')).toBeNull();

      await switchLocale(view.harness, 'en');
      expect(textOfTestId(view.root, 'dashboard-connection-error')).toBe('Database connection failed: adapter lost');
    });

    it('连接调用被拒绝时同样进入失败态，非错误对象的原因按文本展示', async () => {
      mocks.database.connect.mockRejectedValue('disk full');
      const view = await renderPage({ connect: false });
      expect(textOfTestId(view.root, 'dashboard-connection-error')).toBe('数据库连接失败：disk full');
    });

    it('连接失败后适配器又报告未连接，页面保持失败态而不是回到连接中', async () => {
      mocks.database.connect.mockRejectedValue(new Error('boom'));
      const view = await renderPage({ connect: false });
      connected$.next(false);
      await settle(view.harness);
      expect(textOfTestId(view.root, 'dashboard-connection-status')).toBe('数据库连接失败');
      expect(byTestId(view.root, 'dashboard-connecting')).toBeNull();
    });

    it('销毁后释放适配器连接订阅与最近活动订阅', async () => {
      const view = await renderPage();
      expect(connected$.observed).toBe(true);
      expect(mocks.activity.observed).toBe(true);

      view.harness.fixture.destroy();
      expect(connected$.observed).toBe(false);
      expect(mocks.activity.observed).toBe(false);
    });
  });

  describe('统计卡与总数', () => {
    it('三张统计卡按预置实体顺序显示数量并链接到各自的实体列表', async () => {
      const view = await renderPage();
      const cards = allByTestId(view.root, 'dashboard-metric-card');
      const titles = () => cards.map(card => normalize(card.querySelector('h2')?.textContent));
      expect(cards.map(card => card.getAttribute('data-metric'))).toEqual(['categories', 'assets', 'events']);
      expect(cards.map(card => card.getAttribute('href'))).toEqual([
        '/entities/assets/AssetCategory',
        '/entities/assets/Asset',
        '/entities/assets/AssetEvent'
      ]);
      expect(titles()).toEqual(['资产分类', '资产', '维护记录']);
      expect(cards.map(card => normalize(card.querySelector('strong')?.textContent))).toEqual(['2', '3', '1']);
      expect(textOfTestId(view.root, 'dashboard-total')).toBe('记录总数：6');

      await switchLocale(view.harness, 'en');
      expect(titles()).toEqual(['Asset categories', 'Assets', 'Maintenance records']);
      expect(cards.map(card => normalize(card.querySelector('strong')?.textContent))).toEqual(['2', '3', '1']);
      expect(textOfTestId(view.root, 'dashboard-total')).toBe('Total records: 6');
    });

    it('任一统计仍在读取时显示读取提示，且不误报空工作台', async () => {
      setCounts({ categories: 0, assets: 0, events: 0 }, { assets: { isLoading: true } });
      const view = await renderPage();
      expect(textOfTestId(view.root, 'dashboard-loading')).toBe('正在读取统计数据…');
      expect(byTestId(view.root, 'dashboard-empty')).toBeNull();

      await switchLocale(view.harness, 'en');
      expect(textOfTestId(view.root, 'dashboard-loading')).toBe('Reading statistics…');
    });

    it('统计读取失败时显示原始错误，随语言更新，且不误报空工作台', async () => {
      setCounts({ categories: 0, assets: 0, events: 0 }, { events: { error: new Error('count failed') } });
      const view = await renderPage();
      expect(textOfTestId(view.root, 'dashboard-load-failed')).toBe('统计数据读取失败：count failed');
      expect(byTestId(view.root, 'dashboard-empty')).toBeNull();

      await switchLocale(view.harness, 'en');
      expect(textOfTestId(view.root, 'dashboard-load-failed')).toBe('Could not read statistics: count failed');
    });

    it('统计以空消息的错误失败时仍显示失败态，不误报空工作台', async () => {
      setCounts({ categories: 0, assets: 0, events: 0 }, { events: { error: new Error('') } });
      const view = await renderPage();
      expect(textOfTestId(view.root, 'dashboard-load-failed')).toBe('统计数据读取失败：');
      expect(byTestId(view.root, 'dashboard-empty')).toBeNull();
    });

    it('三类记录都为零时显示空工作台引导，有数据时不显示', async () => {
      setCounts({ categories: 0, assets: 0, events: 0 });
      const empty = await renderPage();
      expect(textOfTestId(empty.root, 'dashboard-empty')).toContain('工作台还是空的');

      await switchLocale(empty.harness, 'en');
      expect(textOfTestId(empty.root, 'dashboard-empty')).toContain('Your workbench is empty');
      TestBed.resetTestingModule();

      setCounts({ categories: 0, assets: 1, events: 0 });
      const filled = await renderPage();
      expect(byTestId(filled.root, 'dashboard-empty')).toBeNull();
    });
  });

  describe('最近活动', () => {
    it('活动读取中显示读取提示，不展示空态或列表', async () => {
      mocks.activity.next({ activities: [], loading: true, error: null });
      const view = await renderPage();
      const section = byTestId(view.root, 'dashboard-recent-activity');
      if (!section) throw new Error('最近活动区域未渲染');
      expect(textOfTestId(section, 'dashboard-recent-activity-loading')).toBe('正在读取最近活动…');
      expect(byTestId(section, 'dashboard-recent-activity-empty')).toBeNull();
      expect(section.querySelector('ol')).toBeNull();

      await switchLocale(view.harness, 'en');
      expect(textOfTestId(section, 'dashboard-recent-activity-loading')).toBe('Reading recent activity…');
    });

    it('活动读取失败时显示原始原因，随语言更新', async () => {
      mocks.activity.next({ activities: [], loading: false, error: 'raw query unavailable' });
      const view = await renderPage();
      expect(textOfTestId(view.root, 'dashboard-recent-activity-failed')).toBe(
        '最近活动读取失败：raw query unavailable'
      );

      await switchLocale(view.harness, 'en');
      expect(textOfTestId(view.root, 'dashboard-recent-activity-failed')).toBe(
        'Could not read recent activity: raw query unavailable'
      );
    });

    it('活动以空消息失败时仍显示失败态，不误报暂无操作记录', async () => {
      mocks.activity.next({ activities: [], loading: false, error: '' });
      const view = await renderPage();
      expect(textOfTestId(view.root, 'dashboard-recent-activity-failed')).toBe('最近活动读取失败：');
      expect(byTestId(view.root, 'dashboard-recent-activity-empty')).toBeNull();
    });

    it('没有任何活动时显示空态', async () => {
      const view = await renderPage();
      expect(textOfTestId(view.root, 'dashboard-recent-activity-empty')).toBe('暂无操作记录');

      await switchLocale(view.harness, 'en');
      expect(textOfTestId(view.root, 'dashboard-recent-activity-empty')).toBe('No activity yet');
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
      const view = await renderPage();
      const items = allByTestId(view.root, 'dashboard-activity-item');
      const messages = () => items.map(item => normalize(item.querySelector('p')?.textContent));
      expect(items.map(item => item.getAttribute('data-activity-type'))).toEqual(['INSERT', 'TRANSACTION']);
      expect(messages()).toEqual(['创建资产', '批量变更 4 条记录']);
      expect(badgesOf(items[0]!)).toEqual(['创建', '资产']);
      const zhTime = normalize(items[0]!.querySelector('time')?.textContent);
      expect(items[0]!.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-17T08:30:00.000Z');

      await switchLocale(view.harness, 'en');
      expect(messages()).toEqual(['Created Assets', 'Changed 4 records']);
      expect(badgesOf(items[0]!)).toEqual(['Created', 'Assets']);
      expect(items[0]!.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-17T08:30:00.000Z');
      expect(normalize(items[0]!.querySelector('time')?.textContent)).not.toBe(zhTime);
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
      const view = await renderPage();
      const [reverted, invalidated, plain] = allByTestId(view.root, 'dashboard-activity-item');
      expect(flagsOf(reverted)).toEqual(['已撤销']);
      expect(flagsOf(invalidated)).toEqual(['已失效']);
      expect(flagsOf(plain)).toEqual([]);
      expect(invalidated?.querySelector('p')?.className).toContain('line-through');
      expect(reverted?.querySelector('p')?.className).not.toContain('line-through');

      await switchLocale(view.harness, 'en');
      expect(flagsOf(reverted)).toEqual(['Reverted']);
      expect(flagsOf(invalidated)).toEqual(['Redo invalidated']);
    });

    it('活动流推送新状态后列表随之更新', async () => {
      const view = await renderPage();
      expect(allByTestId(view.root, 'dashboard-activity-item')).toHaveLength(0);

      mocks.activity.next({ activities: [activity()], loading: false, error: null });
      await settle(view.harness);
      expect(allByTestId(view.root, 'dashboard-activity-item')).toHaveLength(1);
      expect(byTestId(view.root, 'dashboard-recent-activity-empty')).toBeNull();
    });
  });

  describe('快捷操作', () => {
    it('快捷入口的链接保持不变，文案随语言切换', async () => {
      const view = await renderPage();
      const quick = byTestId(view.root, 'dashboard-quick-actions');
      if (!quick) throw new Error('快捷操作区域未渲染');
      const links = [...quick.querySelectorAll('a')];
      expect(links.map(link => link.getAttribute('href'))).toEqual(['/entities/assets/Asset', '/search', '/backup']);
      expect(links.map(link => normalize(link.textContent))).toEqual(['管理资产', '搜索记录', '备份 / 恢复']);

      await switchLocale(view.harness, 'en');
      expect(links.map(link => link.getAttribute('href'))).toEqual(['/entities/assets/Asset', '/search', '/backup']);
      expect(links.map(link => normalize(link.textContent))).toEqual([
        'Manage assets',
        'Search records',
        'Backup / Restore'
      ]);
    });
  });
});
