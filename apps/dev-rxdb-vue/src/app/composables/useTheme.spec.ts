import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

interface MutableMediaQueryList {
  readonly media: string;
  readonly matches: boolean;
  addEventListener(type: 'change', listener: (event: MediaQueryListEvent) => void): void;
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
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const bus = {
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
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => createMediaQueryList(false))
    );
    vi.stubGlobal('localStorage', createStorage());
    window.$wujie = { bus, props: { theme: 'dark' } };

    const { useTheme } = await import('./useTheme');
    const { WUJIE_THEME_EVENT } = await import('@aiao/utils');
    const { currentTheme } = useTheme();

    expect(currentTheme.value).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBeNull();

    bus.$emit(WUJIE_THEME_EVENT, { theme: 'light' });
    await nextTick();

    expect(currentTheme.value).toBe('light');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('用户切换主题时把请求推给宿主，宿主下发的不回推', async () => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const bus = {
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
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => createMediaQueryList(false))
    );
    vi.stubGlobal('localStorage', createStorage());
    window.$wujie = { bus, props: { theme: 'light' } };

    const { useTheme } = await import('./useTheme');
    const { WUJIE_THEME_EVENT, WUJIE_THEME_REQUEST_EVENT } = await import('@aiao/utils');
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
