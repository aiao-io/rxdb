import { ORBIT_THEME_EVENT, ORBIT_THEME_REQUEST_EVENT } from '@modules/orbit';
import { createFakeOrbitBus } from '@modules/orbit/testing';
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
    delete window.$orbit;
    localStorage.removeItem('theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('applies the host theme from $orbit without persisting it', () => {
    const bus = createFakeOrbitBus();
    window.$orbit = { bus, props: { theme: 'dark' } };

    const { result } = renderHook(() => useTheme());

    expect(result.current.currentTheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBeNull();

    act(() => bus.$emit(ORBIT_THEME_EVENT, { theme: 'light' }));

    expect(result.current.currentTheme).toBe('light');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('用户切换主题时把请求推给宿主', () => {
    const bus = createFakeOrbitBus();
    const onRequest = vi.fn();
    window.$orbit = { bus, props: { theme: 'light' } };
    bus.$on(ORBIT_THEME_REQUEST_EVENT, onRequest);

    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('dark'));

    expect(onRequest).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('切到 auto 时推的是解析后的主题，宿主只认 light / dark', () => {
    const bus = createFakeOrbitBus();
    const onRequest = vi.fn();
    window.$orbit = { bus, props: { theme: 'light' } };
    bus.$on(ORBIT_THEME_REQUEST_EVENT, onRequest);

    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('auto'));

    expect(onRequest).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('宿主下发的主题不回推，避免两端互相触发', () => {
    const bus = createFakeOrbitBus();
    const onRequest = vi.fn();
    window.$orbit = { bus, props: { theme: 'light' } };
    bus.$on(ORBIT_THEME_REQUEST_EVENT, onRequest);

    renderHook(() => useTheme());
    act(() => bus.$emit(ORBIT_THEME_EVENT, { theme: 'dark' }));

    expect(onRequest).not.toHaveBeenCalled();
  });
});
