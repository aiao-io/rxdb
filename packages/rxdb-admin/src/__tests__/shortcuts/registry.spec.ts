import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_PREFERENCE_ITEMS, deriveConstraints } from '../../preferences/schema/index.js';
import { PreferencesStore } from '../../preferences/store.js';
import { ShortcutRegistry, type ShortcutKeyboardEvent, type ShortcutTarget } from '../../shortcuts/registry.js';
import { createMemoryStorage } from '../../storage.js';

const key = (overrides: Partial<ShortcutKeyboardEvent> = {}): ShortcutKeyboardEvent & { prevented: boolean } => {
  const event = {
    key: 'k',
    code: 'KeyK',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
    ...overrides
  };
  return event;
};

describe('ShortcutRegistry', () => {
  let preferences: PreferencesStore;
  let registry: ShortcutRegistry;

  beforeEach(() => {
    preferences = new PreferencesStore({
      storage: createMemoryStorage(),
      constraints: deriveConstraints(BUILTIN_PREFERENCE_ITEMS, ['light', 'dark'])
    });
    registry = new ShortcutRegistry({ preferences, platform: 'other' });
  });

  it('命中组合键时阻止默认行为并执行处理器', () => {
    const handler = vi.fn();
    registry.register({ id: 'palette', combo: 'Mod+K', handler });
    const event = key();
    expect(registry.handle(event)).toBe(true);
    expect(event.prevented).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('未命中返回 false 且不阻止默认行为', () => {
    registry.register({ id: 'palette', combo: 'Mod+K', handler: vi.fn() });
    const event = key({ key: 'j', code: 'KeyJ' });
    expect(registry.handle(event)).toBe(false);
    expect(event.prevented).toBe(false);
  });

  it('总开关关闭后全部失效', () => {
    const handler = vi.fn();
    registry.register({ id: 'palette', combo: 'Mod+K', handler });
    preferences.setPath('shortcuts.enable', false);
    expect(registry.handle(key())).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(registry.isEnabled('palette')).toBe(false);
  });

  it('单独关闭某条后只影响它，可重新开启', () => {
    const a = vi.fn();
    const b = vi.fn();
    registry.register({ id: 'a', combo: 'Mod+K', handler: a });
    registry.register({ id: 'b', combo: 'Mod+J', handler: b });
    registry.setEnabled('a', false);
    expect(registry.isEnabled('a')).toBe(false);
    expect(registry.handle(key())).toBe(false);
    expect(registry.handle(key({ key: 'j', code: 'KeyJ' }))).toBe(true);
    registry.setEnabled('a', true);
    expect(registry.handle(key())).toBe(true);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('when 返回 false 时本次不响应', () => {
    let locked = true;
    const handler = vi.fn();
    registry.register({ id: 'a', combo: 'Mod+K', handler, when: () => !locked });
    expect(registry.handle(key())).toBe(false);
    locked = false;
    expect(registry.handle(key())).toBe(true);
  });

  it('输入法组合中不响应', () => {
    registry.register({ id: 'a', combo: 'Mod+K', handler: vi.fn() });
    expect(registry.handle(key({ isComposing: true }))).toBe(false);
  });

  it('长按重复：阻止默认行为但不重复执行', () => {
    const handler = vi.fn();
    registry.register({ id: 'a', combo: 'Mod+K', handler });
    const event = key({ repeat: true });
    expect(registry.handle(event)).toBe(true);
    expect(event.prevented).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  describe('输入框保护', () => {
    it('含 Ctrl / Meta / Alt 的组合在输入框里照常响应', () => {
      const handler = vi.fn();
      registry.register({ id: 'a', combo: 'Mod+K', handler });
      expect(registry.handle(key({ target: { tagName: 'INPUT' } }))).toBe(true);
    });

    it('纯字符键在输入框、文本域、下拉与可编辑区域里不响应', () => {
      const handler = vi.fn();
      registry.register({ id: 'slash', combo: '/', handler });
      const slash = (target: unknown) => registry.handle(key({ key: '/', code: 'Slash', ctrlKey: false, target }));
      expect(slash({ tagName: 'INPUT' })).toBe(false);
      expect(slash({ tagName: 'TEXTAREA' })).toBe(false);
      expect(slash({ tagName: 'SELECT' })).toBe(false);
      expect(slash({ tagName: 'DIV', isContentEditable: true })).toBe(false);
      expect(slash({ tagName: 'DIV' })).toBe(true);
      expect(slash(null)).toBe(true);
    });

    it('allowInInput 显式覆盖默认', () => {
      const handler = vi.fn();
      registry.register({ id: 'esc', combo: 'Escape', handler, allowInInput: true });
      registry.register({ id: 'k', combo: 'Mod+K', handler, allowInInput: false });
      expect(
        registry.handle(key({ key: 'Escape', code: 'Escape', ctrlKey: false, target: { tagName: 'INPUT' } }))
      ).toBe(true);
      expect(registry.handle(key({ target: { tagName: 'INPUT' } }))).toBe(false);
    });
  });

  describe('注册', () => {
    it('返回的注销函数移除该条', () => {
      const handler = vi.fn();
      const unregister = registry.register({ id: 'a', combo: 'Mod+K', handler });
      unregister();
      expect(registry.handle(key())).toBe(false);
      expect(registry.list.value).toEqual([]);
    });

    it('id 重复、组合键冲突、组合键非法立即报错', () => {
      registry.register({ id: 'a', combo: 'Mod+K', handler: vi.fn() });
      expect(() => registry.register({ id: 'a', combo: 'Mod+J', handler: vi.fn() })).toThrow(/already registered/);
      expect(() => registry.register({ id: 'b', combo: 'ctrl+k', handler: vi.fn() })).toThrow(/conflicts with "a"/);
      expect(() => registry.register({ id: 'c', combo: 'Mod+', handler: vi.fn() })).toThrow(/Invalid shortcut combo/);
    });

    it('mac：冲突按 Command 计算——Mod+K 与 Meta+K 冲突，与 Ctrl+K 不冲突且两者各自可达', () => {
      const mac = new ShortcutRegistry({ preferences, platform: 'mac' });
      const palette = vi.fn();
      const control = vi.fn();
      mac.register({ id: 'palette', combo: 'Mod+K', handler: palette });
      expect(() => mac.register({ id: 'meta', combo: 'Meta+K', handler: vi.fn() })).toThrow(
        /conflicts with "palette"/
      );
      expect(() => mac.register({ id: 'control', combo: 'Ctrl+K', handler: control })).not.toThrow();
      expect(mac.handle(key({ ctrlKey: true, metaKey: false }))).toBe(true);
      expect(mac.handle(key({ ctrlKey: false, metaKey: true }))).toBe(true);
      expect(control).toHaveBeenCalledOnce();
      expect(palette).toHaveBeenCalledOnce();
    });

    it('其他平台：冲突按 Ctrl 计算——Mod+K 与 Ctrl+K 冲突，与 Meta+K 不冲突', () => {
      registry.register({ id: 'palette', combo: 'Mod+K', handler: vi.fn() });
      expect(() => registry.register({ id: 'control', combo: 'Ctrl+K', handler: vi.fn() })).toThrow(
        /conflicts with "palette"/
      );
      expect(() => registry.register({ id: 'meta', combo: 'Meta+K', handler: vi.fn() })).not.toThrow();
    });

    it('冗余写法按实际修饰键判冲突：mac 上 Mod+Meta+K 与 Meta+K 冲突，其他平台 Mod+Ctrl+K 与 Ctrl+K 冲突', () => {
      const mac = new ShortcutRegistry({ preferences, platform: 'mac' });
      mac.register({ id: 'meta', combo: 'Meta+K', handler: vi.fn() });
      expect(() => mac.register({ id: 'both', combo: 'Mod+Meta+K', handler: vi.fn() })).toThrow(
        /conflicts with "meta"/
      );
      registry.register({ id: 'control', combo: 'Ctrl+K', handler: vi.fn() });
      expect(() => registry.register({ id: 'both', combo: 'Mod+Ctrl+K', handler: vi.fn() })).toThrow(
        /conflicts with "control"/
      );
    });

    it('注销后同一 id / 组合键可重新注册', () => {
      const unregister = registry.register({ id: 'a', combo: 'Mod+K', handler: vi.fn() });
      unregister();
      expect(() => registry.register({ id: 'a', combo: 'Mod+K', handler: vi.fn() })).not.toThrow();
    });
  });

  describe('list', () => {
    it('带键帽与启用状态，并随偏好变化', () => {
      registry.register({ id: 'palette', combo: 'Mod+K', labelKey: 'shortcut.palette', handler: vi.fn() });
      registry.register({ id: 'custom', combo: 'Alt+L', label: '锁屏', handler: vi.fn() });
      expect(registry.list.value).toEqual([
        {
          id: 'palette',
          combo: 'Mod+K',
          labelKey: 'shortcut.palette',
          keys: ['Ctrl', 'K'],
          text: 'Ctrl+K',
          enabled: true
        },
        { id: 'custom', combo: 'Alt+L', label: '锁屏', keys: ['Alt', 'L'], text: 'Alt+L', enabled: true }
      ]);
      registry.setEnabled('custom', false);
      expect(registry.list.value.map(info => info.enabled)).toEqual([true, false]);
      preferences.setPath('shortcuts.enable', false);
      expect(registry.list.value.map(info => info.enabled)).toEqual([false, false]);
    });

    it('mac 平台使用符号键帽', () => {
      const mac = new ShortcutRegistry({ preferences, platform: 'mac' });
      mac.register({ id: 'palette', combo: 'Mod+K', handler: vi.fn() });
      expect(mac.list.value[0]).toMatchObject({ keys: ['⌘', 'K'], text: '⌘ K' });
      expect(mac.handle(key({ ctrlKey: false, metaKey: true }))).toBe(true);
    });
  });

  describe('attach', () => {
    it('以捕获阶段监听 keydown，取消后不再响应', () => {
      const handler = vi.fn();
      registry.register({ id: 'a', combo: 'Mod+K', handler });
      const listeners: Array<{ type: string; listener: (event: never) => void; capture: boolean }> = [];
      const target: ShortcutTarget = {
        addEventListener: (type, listener, capture) => void listeners.push({ type, listener, capture }),
        removeEventListener: (type, listener) => {
          const index = listeners.findIndex(item => item.type === type && item.listener === listener);
          if (index >= 0) listeners.splice(index, 1);
        }
      };
      const detach = registry.attach(target);
      expect(listeners).toHaveLength(1);
      expect(listeners[0]).toMatchObject({ type: 'keydown', capture: true });
      listeners[0].listener(key() as never);
      expect(handler).toHaveBeenCalledOnce();
      detach();
      expect(listeners).toHaveLength(0);
    });
  });
});
