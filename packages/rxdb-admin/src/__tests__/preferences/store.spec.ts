import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from '../../preferences/defaults.js';
import type { PreferenceExtension } from '../../preferences/schema/index.js';
import { BUILTIN_PREFERENCE_ITEMS, deriveConstraints } from '../../preferences/schema/index.js';
import { PREFERENCES_STORAGE_KEY, PreferencesStore, type PreferencesStoreOptions } from '../../preferences/store.js';
import { PREFERENCES_VERSION } from '../../preferences/types.js';
import { createMemoryStorage } from '../../storage.js';

const constraints = deriveConstraints(BUILTIN_PREFERENCE_ITEMS, ['light', 'dark']);

const tablePageSize: PreferenceExtension = {
  key: 'tablePageSize',
  type: 'number',
  defaultValue: 20,
  min: 10,
  max: 200,
  step: 10
};

class FakeHost {
  readonly listeners = new Map<string, Set<(event: never) => void>>();
  addEventListener(type: string, listener: (event: never) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type: string, event: object = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never);
  }
  count(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

const create = (overrides: Partial<PreferencesStoreOptions> = {}) => {
  const storage = overrides.storage ?? createMemoryStorage();
  const host = new FakeHost();
  const store = new PreferencesStore({ storage, constraints, host, ...overrides });
  return { store, storage, host };
};

const stored = (storage: ReturnType<typeof createMemoryStorage>) => {
  const raw = storage.getItem(PREFERENCES_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as { version: number; values: unknown });
};

describe('PreferencesStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe('加载', () => {
    it('存储为空时使用默认树', () => {
      expect(create().store.value).toEqual(defaultPreferences);
    });

    it('读取存储的差异并与默认树合并', () => {
      const storage = createMemoryStorage({
        [PREFERENCES_STORAGE_KEY]: JSON.stringify({ version: PREFERENCES_VERSION, values: { theme: { name: 'dark' } } })
      });
      const { store } = create({ storage });
      expect(store.value.theme.name).toBe('dark');
      expect(store.value.sidebar).toEqual(defaultPreferences.sidebar);
    });

    it('损坏的 JSON、非对象与未知版本都回到默认树', () => {
      const load = (raw: string) =>
        create({ storage: createMemoryStorage({ [PREFERENCES_STORAGE_KEY]: raw }) }).store.value;
      expect(load('{oops')).toEqual(defaultPreferences);
      expect(load('[1]')).toEqual(defaultPreferences);
      expect(load(JSON.stringify({ version: 999, values: { theme: { name: 'dark' } } }))).toEqual(defaultPreferences);
      expect(load(JSON.stringify({ version: PREFERENCES_VERSION, values: 'x' }))).toEqual(defaultPreferences);
    });

    it('存储里的越界值被清洗', () => {
      const storage = createMemoryStorage({
        [PREFERENCES_STORAGE_KEY]: JSON.stringify({
          version: PREFERENCES_VERSION,
          values: { sidebar: { width: 9999 }, theme: { name: 'bogus' } }
        })
      });
      const { store } = create({ storage });
      expect(store.value.sidebar.width).toBe(320);
      expect(store.value.theme.name).toBe('system');
    });

    it('自定义存储键与应用默认值', () => {
      const { store } = create({
        storageKey: 'my.prefs',
        defaults: { ...structuredClone(defaultPreferences), app: { ...defaultPreferences.app, layout: 'header-nav' } }
      });
      store.update({ theme: { name: 'dark' } });
      store.flush();
      expect(store.value.app.layout).toBe('header-nav');
    });
  });

  describe('旧键迁移', () => {
    it('存储为空时调用迁移并并入偏好', () => {
      const storage = createMemoryStorage({ 'workbench-sidebar-pinned': '0' });
      const migrateLegacy = vi.fn(() => ({ sidebar: { collapsed: true } }));
      const { store } = create({ storage, migrateLegacy });
      expect(migrateLegacy).toHaveBeenCalledOnce();
      expect(store.value.sidebar.collapsed).toBe(true);
    });

    it('已有存量时不再迁移', () => {
      const storage = createMemoryStorage({
        [PREFERENCES_STORAGE_KEY]: JSON.stringify({ version: PREFERENCES_VERSION, values: {} })
      });
      const migrateLegacy = vi.fn(() => ({ sidebar: { collapsed: true } }));
      const { store } = create({ storage, migrateLegacy });
      expect(migrateLegacy).not.toHaveBeenCalled();
      expect(store.value.sidebar.collapsed).toBe(false);
    });

    it('迁移返回 null 时使用默认树', () => {
      const { store } = create({ migrateLegacy: () => null });
      expect(store.value).toEqual(defaultPreferences);
    });
  });

  describe('更新与持久化', () => {
    it('update 深合并并通知订阅者', () => {
      const { store } = create();
      const listener = vi.fn();
      store.subscribe(listener);
      store.update({ content: { padding: { top: 8 } } });
      expect(store.value.content.padding).toEqual({ top: 8, right: 0, bottom: 0, left: 0 });
      expect(listener).toHaveBeenCalledOnce();
    });

    it('update 经约束夹取', () => {
      const { store } = create();
      store.update({ header: { height: 5 } });
      expect(store.value.header.height).toBe(40);
    });

    it('setPath 按路径写入', () => {
      const { store } = create();
      store.setPath('content.padding.left', 12);
      expect(store.value.content.padding.left).toBe(12);
    });

    it('没有实际变化时不通知、不写存储', () => {
      const { store, storage } = create();
      const listener = vi.fn();
      store.subscribe(listener);
      store.update({ theme: { name: 'system' } });
      vi.advanceTimersByTime(1000);
      expect(listener).not.toHaveBeenCalled();
      expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
    });

    it('防抖后只持久化相对默认值的差异', () => {
      const { store, storage } = create({ debounceMs: 150 });
      store.update({ theme: { name: 'dark' } });
      store.update({ sidebar: { collapsed: true } });
      expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
      vi.advanceTimersByTime(150);
      expect(stored(storage)).toEqual({
        version: PREFERENCES_VERSION,
        values: { theme: { name: 'dark' }, sidebar: { collapsed: true } }
      });
    });

    it('改回默认后清除存储键', () => {
      const { store, storage } = create();
      store.update({ theme: { name: 'dark' } });
      store.flush();
      expect(storage.getItem(PREFERENCES_STORAGE_KEY)).not.toBeNull();
      store.update({ theme: { name: 'system' } });
      store.flush();
      expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
    });

    it('reset 回到默认树并清除存储', () => {
      const { store, storage } = create();
      store.update({ theme: { name: 'dark' } });
      store.flush();
      store.reset();
      vi.advanceTimersByTime(200);
      expect(store.value).toEqual(defaultPreferences);
      expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
    });

    it('flush 立即写入并取消待定的防抖', () => {
      const { store, storage } = create();
      store.update({ app: { compact: true } });
      store.flush();
      expect(stored(storage)?.values).toEqual({ app: { compact: true } });
    });
  });

  describe('差异与导入导出', () => {
    it('diff / hasDiff 反映相对默认值的变化', () => {
      const { store } = create();
      expect(store.diff()).toBeNull();
      expect(store.hasDiff.value).toBe(false);
      store.update({ app: { compact: true } });
      expect(store.diff()).toEqual({ app: { compact: true } });
      expect(store.hasDiff.value).toBe(true);
    });

    it('exportJson 导出差异，无差异导出空对象', () => {
      const { store } = create();
      expect(JSON.parse(store.exportJson())).toEqual({});
      store.update({ app: { compact: true } });
      expect(JSON.parse(store.exportJson())).toEqual({ app: { compact: true } });
    });

    it('importJson 以导出内容整体替换当前偏好（相对默认值）', () => {
      const { store } = create();
      store.update({ sidebar: { collapsed: true } });
      expect(store.importJson(JSON.stringify({ app: { compact: true }, header: { height: 999 } }))).toEqual({
        ok: true
      });
      expect(store.value.app.compact).toBe(true);
      expect(store.value.sidebar.collapsed).toBe(false);
      expect(store.value.header.height).toBe(72);
    });

    it('importJson 拒绝非法 JSON 与非对象，且保持当前偏好', () => {
      const { store } = create();
      store.update({ app: { compact: true } });
      expect(store.importJson('{bad')).toEqual({ ok: false, reason: 'invalid-json' });
      expect(store.importJson('[1]')).toEqual({ ok: false, reason: 'not-object' });
      expect(store.importJson('null')).toEqual({ ok: false, reason: 'not-object' });
      expect(store.value.app.compact).toBe(true);
    });
  });

  describe('扩展偏好', () => {
    it('默认值进入默认树，diff 不含未改动的扩展', () => {
      const { store } = create({ extensions: [tablePageSize] });
      expect(store.value.extension).toEqual({ tablePageSize: 20 });
      expect(store.diff()).toBeNull();
    });

    it('写入非法值被回退为默认值', () => {
      const { store } = create({ extensions: [tablePageSize] });
      store.setPath('extension.tablePageSize', 55);
      expect(store.value.extension['tablePageSize']).toBe(20);
      store.setPath('extension.tablePageSize', 50);
      expect(store.value.extension['tablePageSize']).toBe(50);
    });

    it('扩展键重复或声明非法时构造即抛错', () => {
      expect(() => create({ extensions: [tablePageSize, tablePageSize] })).toThrow(/Duplicate preference extension/);
      expect(() => create({ extensions: [{ ...tablePageSize, key: 'a.b' }] })).toThrow(
        /Invalid preference extension key/
      );
    });
  });

  describe('跨标签与生命周期', () => {
    it('其他标签改写同一键时重新加载并通知', () => {
      const { store, storage, host } = create();
      const listener = vi.fn();
      store.subscribe(listener);
      storage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({ version: PREFERENCES_VERSION, values: { app: { compact: true } } })
      );
      host.dispatch('storage', { key: PREFERENCES_STORAGE_KEY });
      expect(store.value.app.compact).toBe(true);
      expect(listener).toHaveBeenCalledOnce();
    });

    it('重新加载不会把结果回写存储', () => {
      const { storage, host } = create();
      const setItem = vi.spyOn(storage, 'setItem');
      host.dispatch('storage', { key: PREFERENCES_STORAGE_KEY });
      vi.advanceTimersByTime(1000);
      expect(setItem).not.toHaveBeenCalled();
    });

    it('存储被整体清空（key 为 null）同样重新加载；其他键的事件被忽略', () => {
      const { store, storage, host } = create();
      store.update({ app: { compact: true } });
      store.flush();
      storage.removeItem(PREFERENCES_STORAGE_KEY);
      host.dispatch('storage', { key: 'other' });
      expect(store.value.app.compact).toBe(true);
      host.dispatch('storage', { key: null });
      expect(store.value.app.compact).toBe(false);
    });

    it('pagehide 时立即落盘', () => {
      const { store, storage, host } = create();
      store.update({ app: { compact: true } });
      host.dispatch('pagehide');
      expect(stored(storage)?.values).toEqual({ app: { compact: true } });
    });

    it('destroy 落盘待定写入并移除监听', () => {
      const { store, storage, host } = create();
      store.update({ app: { compact: true } });
      store.destroy();
      expect(stored(storage)?.values).toEqual({ app: { compact: true } });
      expect(host.count('storage')).toBe(0);
      expect(host.count('pagehide')).toBe(0);
    });

    it('本实例没有未保存的改动时 pagehide / flush 不写存储，不会覆盖其他标签刚写入的值', () => {
      const { storage, host, store } = create();
      storage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({ version: PREFERENCES_VERSION, values: { app: { compact: true } } })
      );
      host.dispatch('pagehide');
      store.flush();
      expect(stored(storage)?.values).toEqual({ app: { compact: true } });
    });

    it('没有宿主（SSR / 测试）时不注册监听也能工作', () => {
      const store = new PreferencesStore({ storage: createMemoryStorage(), constraints });
      store.update({ app: { compact: true } });
      expect(() => store.destroy()).not.toThrow();
    });
  });
});
