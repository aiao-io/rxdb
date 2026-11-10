import { WUJIE_THEME_EVENT, WUJIE_THEME_REQUEST_EVENT } from '@modules/wujie';
import { createFakeWujieBus } from '@modules/wujie/testing';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseThemeValue, useTheme } from './useTheme';

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}

describe('parseThemeValue', () => {
  it.each(['light', 'dark', 'auto'] as const)('accepts %s', theme => {
    expect(parseThemeValue(theme)).toBe(theme);
  });

  it.each([null, '', 'system', 'LIGHT', ' dark '])('falls back to auto for %s', theme => {
    expect(parseThemeValue(theme)).toBe('auto');
  });
});

describe('useTheme host sync', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorage(),
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    delete window.$wujie;
    localStorage.removeItem('theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('applies the host theme from $wujie without persisting it', () => {
    const bus = createFakeWujieBus();
    window.$wujie = { bus, props: { theme: 'dark' } };

    const { result } = renderHook(() => useTheme());

    expect(result.current.currentTheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBeNull();

    act(() => bus.$emit(WUJIE_THEME_EVENT, { theme: 'light' }));

    expect(result.current.currentTheme).toBe('light');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('用户切换主题时把请求推给宿主', () => {
    const bus = createFakeWujieBus();
    const onRequest = vi.fn();
    window.$wujie = { bus, props: { theme: 'light' } };
    bus.$on(WUJIE_THEME_REQUEST_EVENT, onRequest);

    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('dark'));

    expect(onRequest).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('切到 auto 时推的是解析后的主题，宿主只认 light / dark', () => {
    const bus = createFakeWujieBus();
    const onRequest = vi.fn();
    window.$wujie = { bus, props: { theme: 'light' } };
    bus.$on(WUJIE_THEME_REQUEST_EVENT, onRequest);

    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('auto'));

    expect(onRequest).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('宿主下发的主题不回推，避免两端互相触发', () => {
    const bus = createFakeWujieBus();
    const onRequest = vi.fn();
    window.$wujie = { bus, props: { theme: 'light' } };
    bus.$on(WUJIE_THEME_REQUEST_EVENT, onRequest);

    renderHook(() => useTheme());
    act(() => bus.$emit(WUJIE_THEME_EVENT, { theme: 'dark' }));

    expect(onRequest).not.toHaveBeenCalled();
  });
});

/** 可控的 `prefers-color-scheme` 媒体查询：记下监听，测试里手动派发系统主题变化。 */
function stubSystemScheme(initiallyDark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches: initiallyDark,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)
  };
  vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
  return {
    listeners,
    change(dark: boolean) {
      media.matches = dark;
      for (const listener of listeners) listener({ matches: dark } as MediaQueryListEvent);
    }
  };
}

// 与 Vue 的模块级状态、Angular 的单例 ThemeService 同口径：同页所有消费者读同一份主题
describe('useTheme 多个消费者', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorage(),
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-theme');
  });

  it('一个消费者切换主题，已挂载的其他消费者同步更新', () => {
    stubSystemScheme(false);
    const button = renderHook(() => useTheme());
    const editor = renderHook(() => useTheme());

    act(() => button.result.current.setTheme('dark'));

    expect(editor.result.current.currentTheme).toBe('dark');
    expect(editor.result.current.currentThemeLightDark).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('用户选定主题后系统配色变化不会把页面主题改回系统值', () => {
    const scheme = stubSystemScheme(false);
    const button = renderHook(() => useTheme());
    renderHook(() => useTheme());
    act(() => button.result.current.setTheme('dark'));

    act(() => scheme.change(true));
    act(() => scheme.change(false));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('跟随系统时所有消费者一起跟着系统配色变化；全部卸载后不再留系统配色监听', () => {
    const scheme = stubSystemScheme(false);
    const first = renderHook(() => useTheme());
    const second = renderHook(() => useTheme());

    act(() => scheme.change(true));

    expect(first.result.current.currentThemeLightDark).toBe('dark');
    expect(second.result.current.currentThemeLightDark).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    first.unmount();
    second.unmount();
    expect(scheme.listeners.size).toBe(0);
  });
});
