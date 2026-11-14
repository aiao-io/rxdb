/** @vitest-environment happy-dom */
import { ORBIT_THEME_EVENT, ORBIT_THEME_REQUEST_EVENT } from '@modules/orbit';
import { createFakeOrbitBus } from '@modules/orbit/testing';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from './useTheme';

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
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('用户切换主题时把请求推给宿主，宿主下发的不回推', () => {
    const bus = createFakeOrbitBus();
    const onRequest = vi.fn();
    window.$orbit = { bus, props: { theme: 'light' } };
    bus.$on(ORBIT_THEME_REQUEST_EVENT, onRequest);

    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(onRequest).toHaveBeenCalledWith({ theme: 'dark' });

    onRequest.mockClear();
    act(() => bus.$emit(ORBIT_THEME_EVENT, { theme: 'light' }));
    expect(onRequest).not.toHaveBeenCalled();
  });

  it('follows the orbit host theme and still accepts the legacy postMessage fallback', () => {
    const bus = createFakeOrbitBus();
    window.$orbit = { bus, props: { theme: 'dark' } };

    const { result, unmount } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);

    act(() => bus.$emit(ORBIT_THEME_EVENT, { theme: 'light' }));
    expect(result.current.theme).toBe('light');

    unmount();
    delete window.$orbit;

    const standalone = renderHook(() => useTheme());
    act(() => {
      // 带上同源 origin：兼容通道只认与自身 origin 相同的消息
      window.dispatchEvent(
        new MessageEvent('message', { origin: window.location.origin, data: { type: 'setTheme', theme: 'dark' } })
      );
    });
    expect(standalone.result.current.theme).toBe('dark');
  });
});
