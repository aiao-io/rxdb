import { WUJIE_THEME_EVENT, WUJIE_THEME_REQUEST_EVENT } from '@aiao/utils';
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

function createBus() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    $on(event: string, fn: (...args: unknown[]) => void) {
      const bucket = listeners.get(event) ?? new Set();
      bucket.add(fn);
      listeners.set(event, bucket);
    },
    $off(event: string, fn: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(fn);
    },
    $emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach(listener => listener(...args));
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
    const bus = createBus();
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
    const bus = createBus();
    const onRequest = vi.fn();
    window.$wujie = { bus, props: { theme: 'light' } };
    bus.$on(WUJIE_THEME_REQUEST_EVENT, onRequest);

    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('dark'));

    expect(onRequest).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('切到 auto 时推的是解析后的主题，宿主只认 light / dark', () => {
    const bus = createBus();
    const onRequest = vi.fn();
    window.$wujie = { bus, props: { theme: 'light' } };
    bus.$on(WUJIE_THEME_REQUEST_EVENT, onRequest);

    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('auto'));

    expect(onRequest).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('宿主下发的主题不回推，避免两端互相触发', () => {
    const bus = createBus();
    const onRequest = vi.fn();
    window.$wujie = { bus, props: { theme: 'light' } };
    bus.$on(WUJIE_THEME_REQUEST_EVENT, onRequest);

    renderHook(() => useTheme());
    act(() => bus.$emit(WUJIE_THEME_EVENT, { theme: 'dark' }));

    expect(onRequest).not.toHaveBeenCalled();
  });
});
