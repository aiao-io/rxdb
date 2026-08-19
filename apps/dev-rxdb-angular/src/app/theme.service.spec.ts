import { WUJIE_THEME_EVENT } from '@aiao/utils';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Platform } from '@angular/cdk/platform';
import { DOCUMENT, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from '@modules/angular';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
    const bus = createBus();
    window.$wujie = { bus, props: { theme: 'dark' } };

    const service = TestBed.inject(ThemeService);

    expect(service.$currentTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('updates from later host bus events without persisting', () => {
    const bus = createBus();
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
});
