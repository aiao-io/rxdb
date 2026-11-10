import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PALETTE_RECENTS_KEY,
  PaletteController,
  type PaletteItem,
  type PaletteSource
} from '../../palette/controller.js';
import { defaultPreferences } from '../../preferences/defaults.js';
import { createMemoryStorage } from '../../storage.js';
import { Store } from '../../store.js';

const item = (id: string, label: string, run: () => void = vi.fn(), sublabel?: string): PaletteItem => ({
  id,
  label,
  run,
  ...(sublabel ? { sublabel } : {})
});

const menuSource = (items: PaletteItem[]): PaletteSource => ({
  id: 'menu',
  groupLabelKey: 'palette.group.menu',
  items: () => items
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}
const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const setup = (palette: Partial<typeof defaultPreferences.palette> = {}) => {
  const storage = createMemoryStorage();
  const preferences = new Store({ ...defaultPreferences, palette: { ...defaultPreferences.palette, ...palette } });
  const controller = new PaletteController({ preferences, storage, debounceMs: 100 });
  return { controller, storage, preferences };
};

describe('PaletteController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe('打开与空查询', () => {
    it('初始关闭；打开后显示各同步源的前几项建议', () => {
      const { controller } = setup({ maxResults: 2 });
      controller.registerSource(menuSource([item('a', '资产'), item('b', '分类'), item('c', '搜索')]));
      expect(controller.value.open).toBe(false);
      controller.open();
      expect(controller.value.open).toBe(true);
      expect(controller.value.mode).toBe('recent');
      expect(controller.value.groups).toHaveLength(1);
      expect(controller.value.groups[0].entries.map(entry => entry.item.id)).toEqual(['a', 'b']);
      expect(controller.value.total).toBe(2);
    });

    it('toggle 打开 / 关闭', () => {
      const { controller } = setup();
      controller.toggle();
      expect(controller.value.open).toBe(true);
      controller.toggle();
      expect(controller.value.open).toBe(false);
    });

    it('没有来源时为空', () => {
      const { controller } = setup();
      controller.open();
      expect(controller.value.groups).toEqual([]);
      expect(controller.value.total).toBe(0);
    });

    it('关闭状态下 setQuery 被忽略', () => {
      const { controller } = setup();
      controller.setQuery('x');
      expect(controller.value.query).toBe('');
    });
  });

  describe('同步源过滤', () => {
    it('按查询模糊过滤并高亮，下标连续', () => {
      const { controller } = setup();
      controller.registerSource(menuSource([item('a', '资产分类'), item('b', '资产'), item('c', '搜索')]));
      controller.registerSource({ id: 'cmd', groupLabel: '命令', items: () => [item('d', '切换资产视图')] });
      controller.open();
      controller.setQuery('资产');
      expect(controller.value.mode).toBe('results');
      const groups = controller.value.groups;
      expect(groups.map(group => group.id)).toEqual(['menu', 'cmd']);
      expect(groups[0].entries.map(entry => entry.item.id)).toEqual(['b', 'a']);
      expect(groups[1].entries[0].index).toBe(2);
      expect(groups[1].label).toBe('命令');
      expect(groups[0].entries[0].segments).toEqual([{ text: '资产', match: true }]);
    });

    it('每组结果数受偏好 maxResults 限制', () => {
      const { controller } = setup({ maxResults: 3 });
      const many = Array.from({ length: 10 }, (_, i) => item(`i${i}`, `项目${i}`));
      controller.registerSource(menuSource(many));
      controller.open();
      controller.setQuery('项目');
      expect(controller.value.total).toBe(3);
    });

    it('查询变化把选中项重置到第一项', () => {
      const { controller } = setup();
      controller.registerSource(menuSource([item('a', '资产'), item('b', '资产分类')]));
      controller.open();
      controller.setQuery('资产');
      controller.moveSelection(1);
      expect(controller.value.selectedIndex).toBe(1);
      controller.setQuery('资产分');
      expect(controller.value.selectedIndex).toBe(0);
    });

    it('没有命中时无分组', () => {
      const { controller } = setup();
      controller.registerSource(menuSource([item('a', '资产')]));
      controller.open();
      controller.setQuery('zzz');
      expect(controller.value.groups).toEqual([]);
    });
  });

  describe('选择', () => {
    it('moveSelection 首尾循环，hover 直接指定', () => {
      const { controller } = setup();
      controller.registerSource(menuSource([item('a', 'aa'), item('b', 'ab'), item('c', 'ac')]));
      controller.open();
      controller.moveSelection(-1);
      expect(controller.value.selectedIndex).toBe(2);
      controller.moveSelection(1);
      expect(controller.value.selectedIndex).toBe(0);
      controller.hover(1);
      expect(controller.value.selectedIndex).toBe(1);
      controller.hover(99);
      expect(controller.value.selectedIndex).toBe(1);
    });

    it('没有结果时 moveSelection 无效', () => {
      const { controller } = setup();
      controller.open();
      controller.moveSelection(1);
      expect(controller.value.selectedIndex).toBe(0);
    });

    it('select 先关闭面板再执行，并记入最近使用', async () => {
      const { controller, storage } = setup();
      const run = vi.fn(() => {
        expect(controller.value.open).toBe(false);
      });
      controller.registerSource(menuSource([item('a', '资产', run)]));
      controller.open();
      await controller.select();
      expect(run).toHaveBeenCalledOnce();
      expect(JSON.parse(storage.getItem(PALETTE_RECENTS_KEY) ?? '[]')).toEqual(['a']);
    });

    it('select 指定下标；下标不存在时什么都不做', async () => {
      const { controller } = setup();
      const second = vi.fn();
      controller.registerSource(menuSource([item('a', 'aa'), item('b', 'ab', second)]));
      controller.open();
      await controller.select(99);
      expect(controller.value.open).toBe(true);
      await controller.select(1);
      expect(second).toHaveBeenCalledOnce();
    });
  });

  describe('最近使用', () => {
    it('空查询时优先显示最近使用，按最近在前，受 recents 条数限制', async () => {
      const { controller } = setup({ recents: 2 });
      controller.registerSource(menuSource([item('a', 'A'), item('b', 'B'), item('c', 'C')]));
      for (const label of ['A', 'B', 'C']) {
        controller.open();
        controller.setQuery(label);
        await controller.select(0);
      }
      controller.open();
      expect(controller.value.groups).toHaveLength(1);
      expect(controller.value.groups[0].labelKey).toBe('palette.group.recent');
      expect(controller.value.groups[0].entries.map(entry => entry.item.id)).toEqual(['c', 'b']);
    });

    it('同一项重复选择只保留一条；已不存在的项被忽略；损坏的记录当作空', async () => {
      const { controller, storage } = setup();
      controller.registerSource(menuSource([item('a', 'A')]));
      controller.open();
      await controller.select();
      controller.open();
      await controller.select();
      expect(JSON.parse(storage.getItem(PALETTE_RECENTS_KEY) ?? '[]')).toEqual(['a']);
      storage.setItem(PALETTE_RECENTS_KEY, JSON.stringify(['gone', 'a', 7]));
      controller.open();
      expect(controller.value.groups[0].entries.map(entry => entry.item.id)).toEqual(['a']);
      storage.setItem(PALETTE_RECENTS_KEY, '{oops');
      controller.open();
      expect(controller.value.groups[0].labelKey).toBe('palette.group.menu');
    });

    it('recents 为 0 时不显示最近使用', async () => {
      const { controller } = setup({ recents: 0 });
      controller.registerSource(menuSource([item('a', 'A')]));
      controller.open();
      await controller.select();
      controller.open();
      expect(controller.value.groups[0].labelKey).toBe('palette.group.menu');
    });

    it('异步源的结果默认不记入最近使用', async () => {
      const { controller, storage } = setup();
      controller.registerSource({
        id: 'records',
        search: async () => [item('r1', '记录')]
      });
      controller.open();
      controller.setQuery('记');
      await vi.advanceTimersByTimeAsync(100);
      await controller.select();
      expect(storage.getItem(PALETTE_RECENTS_KEY)).toBeNull();
    });

    it('remember 显式开启时记录异步源，显式关闭时不记录同步源', async () => {
      const { controller, storage } = setup();
      controller.registerSource({ id: 'records', remember: true, search: async () => [item('r1', '记录')] });
      controller.registerSource({ id: 'menu', remember: false, items: () => [item('m1', '菜单')] });
      controller.open();
      controller.setQuery('菜');
      await controller.select();
      expect(storage.getItem(PALETTE_RECENTS_KEY)).toBeNull();
    });
  });

  describe('异步源', () => {
    it('防抖后搜索，期间 loading；完成后合并为独立分组', async () => {
      const { controller } = setup();
      const pending = deferred<PaletteItem[]>();
      const search = vi.fn(() => pending.promise);
      controller.registerSource(menuSource([item('a', '资产')]));
      controller.registerSource({ id: 'records', groupLabelKey: 'palette.group.records', search });
      controller.open();
      controller.setQuery('资产');
      expect(controller.value.loading).toBe(true);
      expect(search).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      expect(search).toHaveBeenCalledOnce();
      expect(search).toHaveBeenCalledWith('资产', expect.any(AbortSignal));
      pending.resolve([item('r1', '资产 A-001'), item('r2', '资产 A-002')]);
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.value.loading).toBe(false);
      expect(controller.value.groups.map(group => group.id)).toEqual(['menu', 'records']);
      expect(controller.value.groups[1].entries.map(entry => entry.index)).toEqual([1, 2]);
      expect(controller.value.groups[1].entries[0].segments[0]).toEqual({ text: '资产', match: true });
    });

    it('连续输入只搜索最后一次，旧请求被中止', async () => {
      const { controller } = setup();
      const search = vi.fn<(query: string, signal: AbortSignal) => Promise<PaletteItem[]>>(async () => []);
      controller.registerSource({ id: 'records', search });
      controller.open();
      controller.setQuery('a');
      await vi.advanceTimersByTimeAsync(50);
      controller.setQuery('ab');
      await vi.advanceTimersByTimeAsync(100);
      expect(search).toHaveBeenCalledOnce();
      expect(search.mock.calls[0][0]).toBe('ab');
    });

    it('迟到的旧结果不会覆盖新查询', async () => {
      const { controller } = setup();
      const first = deferred<PaletteItem[]>();
      const second = deferred<PaletteItem[]>();
      const signals: AbortSignal[] = [];
      const search = vi.fn((query: string, signal: AbortSignal) => {
        signals.push(signal);
        return query === 'a' ? first.promise : second.promise;
      });
      controller.registerSource({ id: 'records', search });
      controller.open();
      controller.setQuery('a');
      await vi.advanceTimersByTimeAsync(100);
      controller.setQuery('ab');
      expect(signals[0].aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(100);
      second.resolve([item('new', 'ab 结果')]);
      await vi.advanceTimersByTimeAsync(0);
      first.resolve([item('old', 'a 旧结果')]);
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.value.groups.flatMap(group => group.entries.map(entry => entry.item.id))).toEqual(['new']);
    });

    it('关闭面板后到达的结果被丢弃', async () => {
      const { controller } = setup();
      const pending = deferred<PaletteItem[]>();
      controller.registerSource({ id: 'records', search: () => pending.promise });
      controller.open();
      controller.setQuery('a');
      await vi.advanceTimersByTimeAsync(100);
      controller.close();
      pending.resolve([item('late', '迟到')]);
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.value.open).toBe(false);
      expect(controller.value.groups).toEqual([]);
    });

    it('搜索失败记入 failed，不影响其他来源', async () => {
      const { controller } = setup();
      controller.registerSource(menuSource([item('a', '资产')]));
      controller.registerSource({
        id: 'records',
        search: async () => {
          throw new Error('fts down');
        }
      });
      controller.open();
      controller.setQuery('资产');
      await vi.advanceTimersByTimeAsync(100);
      expect(controller.value.failed).toEqual(['records']);
      expect(controller.value.loading).toBe(false);
      expect(controller.value.groups.map(group => group.id)).toEqual(['menu']);
    });

    it('低于 minQueryLength 不触发搜索', async () => {
      const { controller } = setup();
      const search = vi.fn(async () => [] as PaletteItem[]);
      controller.registerSource({ id: 'records', search, minQueryLength: 2 });
      controller.open();
      controller.setQuery('a');
      expect(controller.value.loading).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(search).not.toHaveBeenCalled();
      controller.setQuery('ab');
      await vi.advanceTimersByTimeAsync(100);
      expect(search).toHaveBeenCalledOnce();
    });

    it('异步源返回空结果时不出现分组', async () => {
      const { controller } = setup();
      controller.registerSource({ id: 'records', search: async () => [] });
      controller.open();
      controller.setQuery('a');
      await vi.advanceTimersByTimeAsync(100);
      expect(controller.value.groups).toEqual([]);
    });
  });

  describe('查询取消与异步结果上限', () => {
    it.each([0, 100])('在防抖开始后 %i 毫秒清空查询会取消加载并丢弃迟到结果', async delay => {
      const { controller } = setup();
      const pending = deferred<PaletteItem[]>();
      const search = vi.fn(() => pending.promise);
      controller.registerSource({ id: 'records', search });
      controller.open();
      controller.setQuery('资产');
      await vi.advanceTimersByTimeAsync(delay);
      controller.setQuery('');
      expect(controller.value.loading).toBe(false);
      expect(controller.value.failed).toEqual([]);
      pending.resolve([item('old', '资产')]);
      await vi.advanceTimersByTimeAsync(200);
      expect(controller.value.groups).toEqual([]);
      expect(controller.value.loading).toBe(false);
      expect(search).toHaveBeenCalledTimes(delay === 0 ? 0 : 1);
    });

    it('查询低于最短长度后停止加载', async () => {
      const { controller } = setup();
      const pending = deferred<PaletteItem[]>();
      controller.registerSource({ id: 'records', minQueryLength: 2, search: () => pending.promise });
      controller.open();
      controller.setQuery('ab');
      await vi.advanceTimersByTimeAsync(100);
      controller.setQuery('a');
      expect(controller.value.loading).toBe(false);
      pending.resolve([]);
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.value.loading).toBe(false);
    });

    it('清空查询会移除上一次搜索的失败提示', async () => {
      const { controller } = setup();
      controller.registerSource({ id: 'records', search: async () => Promise.reject(new Error('fts down')) });
      controller.open();
      controller.setQuery('a');
      await vi.advanceTimersByTimeAsync(100);
      expect(controller.value.failed).toEqual(['records']);
      controller.setQuery('');
      expect(controller.value.failed).toEqual([]);
    });

    it('每个异步分组遵循结果上限并保持连续下标，重新查询使用最新偏好', async () => {
      const { controller, preferences } = setup({ maxResults: 3 });
      const results = Array.from({ length: 8 }, (_, i) => item(`r${i}`, `资产${i}`));
      controller.registerSource({ id: 'records', search: async () => results });
      controller.registerSource({ id: 'other', search: async () => results });
      controller.open();
      controller.setQuery('资产');
      await vi.advanceTimersByTimeAsync(100);
      expect(controller.value.groups.map(group => group.entries.length)).toEqual([3, 3]);
      expect(controller.value.groups.flatMap(group => group.entries.map(entry => entry.index))).toEqual([
        0, 1, 2, 3, 4, 5
      ]);
      preferences.update(current => ({ ...current, palette: { ...current.palette, maxResults: 1 } }));
      controller.setQuery('资产');
      await vi.advanceTimersByTimeAsync(100);
      expect(controller.value.groups.map(group => group.entries.length)).toEqual([1, 1]);
      expect(controller.value.total).toBe(2);
    });
  });

  describe('来源注册', () => {
    it('重复标识、既无 items 也无 search 都立即报错', () => {
      const { controller } = setup();
      controller.registerSource(menuSource([]));
      expect(() => controller.registerSource(menuSource([]))).toThrow(/already registered/);
      expect(() => controller.registerSource({ id: 'bad' })).toThrow(/needs items or search/);
    });

    it('注销后结果消失，面板打开时即时刷新', () => {
      const { controller } = setup();
      const unregister = controller.registerSource(menuSource([item('a', '资产')]));
      controller.open();
      expect(controller.value.total).toBe(1);
      unregister();
      expect(controller.value.total).toBe(0);
    });

    it('面板打开时新注册的来源立即出现', () => {
      const { controller } = setup();
      controller.open();
      controller.registerSource(menuSource([item('a', '资产')]));
      expect(controller.value.total).toBe(1);
    });

    it('注销正在搜索的异步源：它的请求被中止，迟到结果不会进入随后注册的同名来源', async () => {
      const { controller } = setup();
      const old = deferred<PaletteItem[]>();
      const signals: AbortSignal[] = [];
      const unregister = controller.registerSource({
        id: 'records',
        search: (_query, signal) => {
          signals.push(signal);
          return old.promise;
        }
      });
      controller.open();
      controller.setQuery('a');
      await vi.advanceTimersByTimeAsync(100);
      unregister();
      expect(signals[0].aborted).toBe(true);
      controller.registerSource({ id: 'records', search: async () => [] });
      old.resolve([item('old', 'a 旧来源')]);
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.value.groups.flatMap(group => group.entries.map(entry => entry.item.id))).toEqual([]);
      expect(controller.value.loading).toBe(false);
    });

    it('被替换的旧来源迟到失败，或注销前已失败，都不记到同名新来源上', async () => {
      const { controller } = setup();
      const old = deferred<PaletteItem[]>();
      const unregister = controller.registerSource({ id: 'records', search: () => old.promise });
      controller.open();
      controller.setQuery('a');
      await vi.advanceTimersByTimeAsync(100);
      unregister();
      controller.registerSource({ id: 'records', search: async () => [] });
      old.reject(new Error('旧来源已下线'));
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.value.failed).toEqual([]);

      const broken = controller.registerSource({
        id: 'other',
        search: async () => {
          throw new Error('fts down');
        }
      });
      controller.setQuery('ab');
      await vi.advanceTimersByTimeAsync(100);
      expect(controller.value.failed).toEqual(['other']);
      broken();
      expect(controller.value.failed).toEqual([]);
    });

    it('旧的注销函数不会删掉随后注册的同名来源，重复调用没有副作用', () => {
      const { controller } = setup();
      const unregisterOld = controller.registerSource(menuSource([item('a', '旧菜单')]));
      unregisterOld();
      controller.registerSource(menuSource([item('b', '新菜单')]));
      unregisterOld();
      controller.open();
      expect(controller.value.groups.flatMap(group => group.entries.map(entry => entry.item.id))).toEqual(['b']);
    });
  });

  it('subscribe / changes$ 暴露状态变化', () => {
    const { controller } = setup();
    const listener = vi.fn();
    controller.subscribe(listener);
    const seen: boolean[] = [];
    const subscription = controller.changes$.subscribe(state => seen.push(state.open));
    controller.open();
    subscription.unsubscribe();
    expect(listener).toHaveBeenCalled();
    expect(seen).toEqual([false, true]);
  });
});
