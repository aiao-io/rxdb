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
});
