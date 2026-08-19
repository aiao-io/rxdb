/** @vitest-environment happy-dom */
import { WUJIE_THEME_EVENT } from '@aiao/utils';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useTheme } from './useTheme';

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

describe('useTheme host sync', () => {
  afterEach(() => {
    delete window.$wujie;
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('follows the wujie host theme and still accepts the legacy postMessage fallback', () => {
    const bus = createBus();
    window.$wujie = { bus, props: { theme: 'dark' } };

    const { result, unmount } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);

    act(() => bus.$emit(WUJIE_THEME_EVENT, { theme: 'light' }));
    expect(result.current.theme).toBe('light');

    unmount();
    delete window.$wujie;

    const standalone = renderHook(() => useTheme());
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'setTheme', theme: 'dark' } }));
    });
    expect(standalone.result.current.theme).toBe('dark');
  });
});
