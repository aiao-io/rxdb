import { BreakpointObserver } from '@angular/cdk/layout';
import { Platform } from '@angular/cdk/platform';
import { DOCUMENT, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from '@modules/angular';
import { WUJIE_THEME_EVENT, WUJIE_THEME_REQUEST_EVENT } from '@modules/wujie';
import { createFakeWujieBus } from '@modules/wujie/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('ThemeService', () => {
  const originalWujie = window.$wujie;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorage(),
      writable: true,
      configurable: true
    });
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    delete window.$wujie;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ThemeService,
        { provide: Platform, useValue: { isBrowser: true } },
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: false, breakpoints: {} }) } },
        { provide: DOCUMENT, useValue: document }
      ]
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    if (originalWujie) window.$wujie = originalWujie;
    else delete window.$wujie;
  });

  it('applies the initial host theme without writing localStorage', () => {
    const bus = createFakeWujieBus();
    window.$wujie = { bus, props: { theme: 'dark' } };

    const service = TestBed.inject(ThemeService);

    expect(service.$currentTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('updates from later host bus events without persisting', () => {
    const bus = createFakeWujieBus();
    window.$wujie = { bus, props: { theme: 'light' } };

    const service = TestBed.inject(ThemeService);
    bus.$emit(WUJIE_THEME_EVENT, { theme: 'dark' });

    expect(service.$currentTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('still persists a user-driven theme change', () => {
    const service = TestBed.inject(ThemeService);
    service.setTheme('dark');

    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('用户切换主题时把请求推给宿主', () => {
    const bus = createFakeWujieBus();
    const onRequest = vi.fn();
    window.$wujie = { bus, props: { theme: 'light' } };
    bus.$on(WUJIE_THEME_REQUEST_EVENT, onRequest);

    const service = TestBed.inject(ThemeService);
    service.setTheme('dark');

    expect(onRequest).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('切到 auto 时推的是解析后的主题', () => {
    const bus = createFakeWujieBus();
    const onRequest = vi.fn();
    window.$wujie = { bus, props: { theme: 'dark' } };
    bus.$on(WUJIE_THEME_REQUEST_EVENT, onRequest);

    const service = TestBed.inject(ThemeService);
    service.setTheme('auto');

    expect(onRequest).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('宿主下发的主题不回推，避免两端互相触发', () => {
    const bus = createFakeWujieBus();
    const onRequest = vi.fn();
    window.$wujie = { bus, props: { theme: 'light' } };
    bus.$on(WUJIE_THEME_REQUEST_EVENT, onRequest);

    TestBed.inject(ThemeService);
    bus.$emit(WUJIE_THEME_EVENT, { theme: 'dark' });

    expect(onRequest).not.toHaveBeenCalled();
  });
});
