// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTheme,
  getCSSVariables,
  getCSSVariableValue,
  getDefaultColors,
  isDocumentDarkMode,
  observeDocumentTheme
} from '../../../entity-table/vtable/table-theme.js';

describe('getDefaultColors', () => {
  it('returns all expected keys', () => {
    const c = getDefaultColors();
    expect(c).toHaveProperty('rootBg');
    expect(c).toHaveProperty('base100');
    expect(c).toHaveProperty('base200');
    expect(c).toHaveProperty('base300');
    expect(c).toHaveProperty('baseContent');
    expect(c).toHaveProperty('primary');
    expect(c).toHaveProperty('primaryContent');
    expect(c).toHaveProperty('radiusBox');
  });

  it('returns non-empty strings', () => {
    const c = getDefaultColors();
    for (const v of Object.values(c)) {
      expect(v).toBeTruthy();
      expect(typeof v).toBe('string');
    }
  });
});

describe('getCSSVariables', () => {
  it('falls back to defaults when CSS vars are empty', () => {
    // happy-dom provides document but CSS vars are not set
    const c = getCSSVariables();
    const d = getDefaultColors();
    expect(c).toEqual(d);
  });

  it('reads CSS variables from documentElement', () => {
    document.documentElement.style.setProperty('--root-bg', '#111');
    document.documentElement.style.setProperty('--color-base-100', '#222');
    document.documentElement.style.setProperty('--color-base-200', '#333');
    document.documentElement.style.setProperty('--color-base-300', '#444');
    document.documentElement.style.setProperty('--color-base-content', '#555');
    document.documentElement.style.setProperty('--color-primary', '#666');
    document.documentElement.style.setProperty('--color-primary-content', '#777');
    document.documentElement.style.setProperty('--radius-box', '8px');

    const c = getCSSVariables();
    expect(c.rootBg).toBe('#111');
    expect(c.base100).toBe('#222');
    expect(c.base200).toBe('#333');
    expect(c.base300).toBe('#444');
    expect(c.baseContent).toBe('#555');
    expect(c.primary).toBe('#666');
    expect(c.primaryContent).toBe('#777');
    expect(c.radiusBox).toBe('8px');

    // cleanup
    for (const prop of [
      '--root-bg',
      '--color-base-100',
      '--color-base-200',
      '--color-base-300',
      '--color-base-content',
      '--color-primary',
      '--color-primary-content',
      '--radius-box'
    ]) {
      document.documentElement.style.removeProperty(prop);
    }
  });

  it('reads computed style once for a full CSS variable snapshot', () => {
    document.documentElement.style.setProperty('--color-primary', '#666');

    const spy = vi.spyOn(window, 'getComputedStyle');

    getCSSVariables();

    expect(spy).toHaveBeenCalledOnce();

    spy.mockRestore();
    document.documentElement.style.removeProperty('--color-primary');
  });
});

describe('getCSSVariableValue', () => {
  it('returns fallback when CSS variable is missing', () => {
    expect(getCSSVariableValue('--missing-color', '#abc')).toBe('#abc');
  });

  it('reads a single CSS variable from documentElement', () => {
    document.documentElement.style.setProperty('--entity-table-delete', 'rgb(10, 20, 30)');

    expect(getCSSVariableValue('--entity-table-delete', '#abc')).toBe('rgb(10, 20, 30)');

    document.documentElement.style.removeProperty('--entity-table-delete');
  });
});

describe('isDocumentDarkMode', () => {
  it('returns true when data-theme is dark', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(isDocumentDarkMode()).toBe(true);
    document.documentElement.removeAttribute('data-theme');
  });

  it('returns false when data-theme is light', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(isDocumentDarkMode()).toBe(false);
    document.documentElement.removeAttribute('data-theme');
  });

  it('falls back to prefers-color-scheme when no explicit theme is set', () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      })
    });

    expect(isDocumentDarkMode()).toBe(true);

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia
    });
  });
});

describe('isDocumentDarkMode：按 color-scheme 识别任意主题', () => {
  const withScheme = (colorScheme: string, run: () => void): void => {
    const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({ colorScheme } as CSSStyleDeclaration);
    try {
      run();
    } finally {
      spy.mockRestore();
      document.documentElement.removeAttribute('data-theme');
    }
  };

  it('名字不是 dark 的深色主题（dracula）也判为暗色', () => {
    document.documentElement.setAttribute('data-theme', 'dracula');
    withScheme('dark', () => expect(isDocumentDarkMode()).toBe(true));
  });

  it('名字不是 light 的浅色主题（cupcake）判为亮色，即使系统是暗色', () => {
    document.documentElement.setAttribute('data-theme', 'cupcake');
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    });
    withScheme('light', () => expect(isDocumentDarkMode()).toBe(false));
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: originalMatchMedia });
  });

  it('only dark / only light 同样识别；light dark（两者皆可）继续看 data-theme', () => {
    withScheme('only dark', () => expect(isDocumentDarkMode()).toBe(true));
    withScheme('only light', () => expect(isDocumentDarkMode()).toBe(false));
    document.documentElement.setAttribute('data-theme', 'dark');
    withScheme('light dark', () => expect(isDocumentDarkMode()).toBe(true));
  });
});

describe('observeDocumentTheme', () => {
  const root = document.documentElement;

  afterEach(() => {
    root.removeAttribute('data-theme');
    root.style.removeProperty('--color-primary');
  });

  it('data-theme 在任意两个主题之间切换都会通知（不要求明暗翻转）', async () => {
    const onChange = vi.fn();
    const stop = observeDocumentTheme(onChange);
    root.setAttribute('data-theme', 'light');
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    root.setAttribute('data-theme', 'cupcake');
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    stop();
  });

  it('内联样式变化（运行时覆盖主色）会通知', async () => {
    const onChange = vi.fn();
    const stop = observeDocumentTheme(onChange);
    root.style.setProperty('--color-primary', '#ff0000');
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    stop();
  });

  it('停止后不再通知', async () => {
    const onChange = vi.fn();
    observeDocumentTheme(onChange)();
    root.setAttribute('data-theme', 'dark');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('系统明暗变化：没有显式 data-theme 时通知，有则忽略；停止时移除监听', () => {
    let listener: (() => void) | undefined;
    const removeEventListener = vi.fn();
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: (_: string, next: () => void) => (listener = next),
        removeEventListener
      })
    });
    const onChange = vi.fn();
    const stop = observeDocumentTheme(onChange);
    listener?.();
    expect(onChange).toHaveBeenCalledTimes(1);
    root.setAttribute('data-theme', 'dark');
    listener?.();
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    expect(removeEventListener).toHaveBeenCalledWith('change', listener);
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: originalMatchMedia });
  });
});

describe('createTheme', () => {
  it('returns a theme object for light mode', () => {
    const theme = createTheme(false, getDefaultColors());
    expect(theme).toBeDefined();
  });

  it('returns a theme object for dark mode', () => {
    const theme = createTheme(true, getDefaultColors());
    expect(theme).toBeDefined();
  });
});
