import { WUJIE_THEME_EVENT, WUJIE_THEME_REQUEST_EVENT } from '@modules/wujie';
import { createFakeWujieBus } from '@modules/wujie/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

interface MutableMediaQueryList {
  readonly media: string;
  readonly matches: boolean;
  addEventListener(type: 'change', listener: (event: MediaQueryListEvent) => void): void;
  removeEventListener(type: 'change', listener: (event: MediaQueryListEvent) => void): void;
  setMatches(matches: boolean): void;
}

function createMediaQueryList(initialMatches: boolean): MutableMediaQueryList {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  return {
    addEventListener: (_type, listener) => listeners.add(listener),
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    removeEventListener: (_type, listener) => listeners.delete(listener),
    setMatches(nextMatches) {
      matches = nextMatches;
      const event = { matches, media: this.media } as MediaQueryListEvent;
      listeners.forEach(listener => listener(event));
    }
  };
}

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  };
}

describe('useTheme', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete window.$wujie;
    document.documentElement.removeAttribute('data-theme');
  });

  it('reactively resolves auto theme to a light or dark editor theme', async () => {
    const mediaQuery = createMediaQueryList(false);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaQuery)
    );
    vi.stubGlobal('localStorage', createStorage());
    localStorage.setItem('theme', 'auto');

    const { useTheme } = await import('./useTheme');
    const { currentThemeIsDark, currentThemeLightDark } = useTheme();

    expect(currentThemeIsDark.value).toBe(false);
    expect(currentThemeLightDark.value).toBe('light');

    mediaQuery.setMatches(true);
    await nextTick();

    expect(currentThemeIsDark.value).toBe(true);
    expect(currentThemeLightDark.value).toBe('dark');
  });

  it('applies the host theme from $wujie without persisting it', async () => {
    const bus = createFakeWujieBus();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => createMediaQueryList(false))
    );
    vi.stubGlobal('localStorage', createStorage());
    window.$wujie = { bus, props: { theme: 'dark' } };

    const { useTheme } = await import('./useTheme');
    const { currentTheme } = useTheme();

    expect(currentTheme.value).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBeNull();

    bus.$emit(WUJIE_THEME_EVENT, { theme: 'light' });
    await nextTick();

    expect(currentTheme.value).toBe('light');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('stopTheme 停掉全部副作用：宿主下发、系统变化、data-theme 写入都不再发生', async () => {
    const bus = createFakeWujieBus();
    const mediaQuery = createMediaQueryList(false);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaQuery)
    );
    vi.stubGlobal('localStorage', createStorage());
    localStorage.setItem('theme', 'auto');
    // 只给 bus 不给 props：初始主题走 localStorage，宿主下发才由 bus 推
    window.$wujie = { bus };

    const { stopTheme, useTheme } = await import('./useTheme');
    const { currentTheme, currentThemeIsDark } = useTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    stopTheme();

    bus.$emit(WUJIE_THEME_EVENT, { theme: 'dark' });
    mediaQuery.setMatches(true);
    await nextTick();

    expect(currentTheme.value).toBe('auto');
    expect(currentThemeIsDark.value).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('stopTheme 之后再次调用 useTheme 会重新接线', async () => {
    const bus = createFakeWujieBus();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => createMediaQueryList(false))
    );
    vi.stubGlobal('localStorage', createStorage());
    window.$wujie = { bus };

    const { stopTheme, useTheme } = await import('./useTheme');
    useTheme();
    stopTheme();

    const { currentTheme } = useTheme();
    bus.$emit(WUJIE_THEME_EVENT, { theme: 'dark' });
    await nextTick();

    expect(currentTheme.value).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('用户切换主题时把请求推给宿主，宿主下发的不回推', async () => {
    const bus = createFakeWujieBus();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => createMediaQueryList(false))
    );
    vi.stubGlobal('localStorage', createStorage());
    window.$wujie = { bus, props: { theme: 'light' } };

    const { useTheme } = await import('./useTheme');
    const onRequest = vi.fn();
    bus.$on(WUJIE_THEME_REQUEST_EVENT, onRequest);

    const { setTheme } = useTheme();
    setTheme('dark');
    expect(onRequest).toHaveBeenCalledWith({ theme: 'dark' });

    // auto 要先落到 light / dark，宿主不认第三种状态
    onRequest.mockClear();
    setTheme('auto');
    expect(onRequest).toHaveBeenCalledWith({ theme: 'light' });

    onRequest.mockClear();
    bus.$emit(WUJIE_THEME_EVENT, { theme: 'dark' });
    await nextTick();
    expect(onRequest).not.toHaveBeenCalled();
  });
});
