import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../../storage.js';
import { Store } from '../../store.js';
import { TABS_STORAGE_KEY, TabsStore, type TabsConfig } from '../../tabs/tabs-store.js';

const setup = (config: Partial<TabsConfig> = {}, seed?: { session?: string; local?: string }) => {
  const session = createMemoryStorage(seed?.session ? { [TABS_STORAGE_KEY]: seed.session } : {});
  const local = createMemoryStorage(seed?.local ? { [TABS_STORAGE_KEY]: seed.local } : {});
  const configStore = new Store<TabsConfig>({ persist: 'session', maxCount: 0, visitHistory: true, ...config });
  const tabs = new TabsStore({ config: configStore, storages: { session, local } });
  return { tabs, session, local, configStore };
};

const saved = (storage: ReturnType<typeof createMemoryStorage>) => {
  const raw = storage.getItem(TABS_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as { tabs: { key: string }[]; activeKey: string | null });
};

describe('TabsStore', () => {
  it('open 以规整后的路径为键，保留完整地址', () => {
    const { tabs } = setup();
    tabs.open('/entities/assets/Asset?page=2', '资产');
    expect(tabs.value.tabs).toEqual([
      { key: '/entities/assets/Asset', url: '/entities/assets/Asset?page=2', title: '资产', pinned: false }
    ]);
    expect(tabs.value.activeKey).toBe('/entities/assets/Asset');
  });

  it('重复打开同一页不产生新状态，也不重复通知', () => {
    const { tabs } = setup();
    tabs.open('/a', 'A');
    const listener = vi.fn();
    tabs.subscribe(listener);
    tabs.open('/a', 'A');
    expect(listener).not.toHaveBeenCalled();
  });

  it('遵循配置里的页签上限与访问历史开关', () => {
    const { tabs } = setup({ maxCount: 2, visitHistory: false });
    tabs.open('/a', 'A');
    tabs.open('/b', 'B');
    tabs.open('/c', 'C');
    expect(tabs.value.tabs.map(tab => tab.key)).toEqual(['/b', '/c']);
    expect(tabs.value.history).toEqual([]);
  });

  it('关闭类操作返回应跳转的地址并更新状态', () => {
    const { tabs } = setup();
    tabs.open('/a', 'A');
    tabs.open('/b', 'B');
    tabs.open('/c', 'C');
    expect(tabs.close('/a')).toBeUndefined();
    expect(tabs.close('/c')).toBe('/b');
    expect(tabs.value.tabs.map(tab => tab.key)).toEqual(['/b']);
    expect(tabs.value.activeKey).toBeNull();
    tabs.open('/b', 'B');
    expect(tabs.close('/b')).toBeNull();
  });

  it('closeOthers / closeLeft / closeRight / closeAll', () => {
    const { tabs } = setup();
    for (const key of ['/a', '/b', '/c', '/d']) tabs.open(key, key);
    tabs.closeLeft('/b');
    expect(tabs.value.tabs.map(tab => tab.key)).toEqual(['/b', '/c', '/d']);
    expect(tabs.closeRight('/c')).toBe('/c');
    tabs.open('/c', '/c');
    expect(tabs.value.tabs.map(tab => tab.key)).toEqual(['/b', '/c']);
    expect(tabs.closeOthers('/b')).toBe('/b');
    tabs.open('/b', '/b');
    expect(tabs.value.tabs.map(tab => tab.key)).toEqual(['/b']);
    expect(tabs.closeAll()).toBeNull();
    expect(tabs.value.tabs).toEqual([]);
  });

  it('togglePin / reorder / retitle', () => {
    const { tabs } = setup();
    for (const key of ['/a', '/b', '/c']) tabs.open(key, key);
    tabs.togglePin('/c');
    expect(tabs.value.tabs.map(tab => tab.key)).toEqual(['/c', '/a', '/b']);
    tabs.reorder('/b', 1);
    expect(tabs.value.tabs.map(tab => tab.key)).toEqual(['/c', '/b', '/a']);
    tabs.retitle(url => (url === '/b' ? '乙' : undefined));
    expect(tabs.value.tabs[1].title).toBe('乙');
  });

  describe('持久化', () => {
    it('session 模式写入 sessionStorage，不碰 localStorage', () => {
      const { tabs, session, local } = setup({ persist: 'session' });
      tabs.open('/a', 'A');
      expect(saved(session)?.tabs.map(tab => tab.key)).toEqual(['/a']);
      expect(saved(session)?.activeKey).toBe('/a');
      expect(local.getItem(TABS_STORAGE_KEY)).toBeNull();
    });

    it('local 模式写入 localStorage', () => {
      const { tabs, session, local } = setup({ persist: 'local' });
      tabs.open('/a', 'A');
      expect(saved(local)?.tabs).toHaveLength(1);
      expect(session.getItem(TABS_STORAGE_KEY)).toBeNull();
    });

    it('off 模式不写任何存储', () => {
      const { tabs, session, local } = setup({ persist: 'off' });
      tabs.open('/a', 'A');
      expect(session.getItem(TABS_STORAGE_KEY)).toBeNull();
      expect(local.getItem(TABS_STORAGE_KEY)).toBeNull();
    });

    it('启动时从所选介质恢复，历史不恢复', () => {
      const seed = JSON.stringify({
        version: 1,
        tabs: [{ key: '/a', url: '/a', title: 'A', pinned: true }],
        activeKey: '/a'
      });
      const { tabs } = setup({ persist: 'session' }, { session: seed });
      expect(tabs.value.tabs).toEqual([{ key: '/a', url: '/a', title: 'A', pinned: true }]);
      expect(tabs.value.activeKey).toBe('/a');
      expect(tabs.value.history).toEqual([]);
    });

    it('恢复时丢弃非法页签、重复键与不存在的活动键；损坏数据当作空', () => {
      const seed = JSON.stringify({
        version: 1,
        tabs: [
          { key: '/a', url: '/a', title: 'A', pinned: false },
          { key: 1 },
          { key: '/a', url: '/a', title: 'dup', pinned: false }
        ],
        activeKey: '/gone'
      });
      const restored = setup({}, { session: seed }).tabs.value;
      expect(restored.tabs).toHaveLength(1);
      expect(restored.activeKey).toBeNull();
      expect(setup({}, { session: '{oops' }).tabs.value.tabs).toEqual([]);
      expect(setup({}, { session: JSON.stringify({ version: 9, tabs: [] }) }).tabs.value.tabs).toEqual([]);
      expect(setup({}, { session: JSON.stringify({ version: 1, tabs: 'x' }) }).tabs.value.tabs).toEqual([]);
    });

    it('持久化位置变化时迁移：旧介质清除，新介质写入', () => {
      const { tabs, session, local, configStore } = setup({ persist: 'session' });
      tabs.open('/a', 'A');
      configStore.update(config => ({ ...config, persist: 'local' }));
      expect(session.getItem(TABS_STORAGE_KEY)).toBeNull();
      expect(saved(local)?.tabs).toHaveLength(1);
      configStore.update(config => ({ ...config, persist: 'off' }));
      expect(local.getItem(TABS_STORAGE_KEY)).toBeNull();
    });

    it('destroy 后不再跟随配置变化', () => {
      const { tabs, local, configStore } = setup({ persist: 'session' });
      tabs.open('/a', 'A');
      tabs.destroy();
      configStore.update(config => ({ ...config, persist: 'local' }));
      expect(local.getItem(TABS_STORAGE_KEY)).toBeNull();
    });
  });
});
