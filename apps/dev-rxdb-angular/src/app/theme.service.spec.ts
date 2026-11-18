import { BreakpointObserver } from '@angular/cdk/layout';
import { Platform } from '@angular/cdk/platform';
import { DOCUMENT, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from '@modules/angular';
import { ORBIT_THEME_EVENT, ORBIT_THEME_REQUEST_EVENT } from '@modules/orbit';
import { createFakeOrbitBus } from '@modules/orbit/testing';
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
  const originalOrbit = window.$orbit;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorage(),
      writable: true,
      configurable: true
    });
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    delete window.$orbit;
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
    if (originalOrbit) window.$orbit = originalOrbit;
    else delete window.$orbit;
  });

  it('applies the initial host theme without writing localStorage', () => {
    const bus = createFakeOrbitBus();
    window.$orbit = { bus, props: { theme: 'dark' } };

    const service = TestBed.inject(ThemeService);

    expect(service.$currentTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('updates from later host bus events without persisting', () => {
    const bus = createFakeOrbitBus();
    window.$orbit = { bus, props: { theme: 'light' } };

    const service = TestBed.inject(ThemeService);
    bus.$emit(ORBIT_THEME_EVENT, { theme: 'dark' });

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
    const bus = createFakeOrbitBus();
    const onRequest = vi.fn();
    window.$orbit = { bus, props: { theme: 'light' } };
    bus.$on(ORBIT_THEME_REQUEST_EVENT, onRequest);

    const service = TestBed.inject(ThemeService);
    service.setTheme('dark');

    expect(onRequest).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('切到 auto 时推的是解析后的主题', () => {
    const bus = createFakeOrbitBus();
    const onRequest = vi.fn();
    window.$orbit = { bus, props: { theme: 'dark' } };
    bus.$on(ORBIT_THEME_REQUEST_EVENT, onRequest);

    const service = TestBed.inject(ThemeService);
    service.setTheme('auto');

    expect(onRequest).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('宿主下发的主题不回推，避免两端互相触发', () => {
    const bus = createFakeOrbitBus();
    const onRequest = vi.fn();
    window.$orbit = { bus, props: { theme: 'light' } };
    bus.$on(ORBIT_THEME_REQUEST_EVENT, onRequest);

    TestBed.inject(ThemeService);
    bus.$emit(ORBIT_THEME_EVENT, { theme: 'dark' });

    expect(onRequest).not.toHaveBeenCalled();
  });
});
