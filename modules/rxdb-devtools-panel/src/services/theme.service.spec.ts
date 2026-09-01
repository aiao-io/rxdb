import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeService } from './theme.service';

interface MediaQueryHarness {
  readonly mediaQuery: MediaQueryList;
  setMatches(matches: boolean): void;
  emitChange(): void;
  readonly addEventListener: ReturnType<typeof vi.fn>;
  readonly removeEventListener: ReturnType<typeof vi.fn>;
}

function createMediaQueryHarness(initialMatches: boolean): MediaQueryHarness {
  let matches = initialMatches;
  let changeListener: (() => void) | null = null;
  const addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    if (type === 'change' && typeof listener === 'function') changeListener = listener as () => void;
  });
  const removeEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    if (type === 'change' && listener === changeListener) changeListener = null;
  });
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  } as MediaQueryList;

  return {
    mediaQuery,
    setMatches(value: boolean) {
      matches = value;
    },
    emitChange() {
      changeListener?.();
    },
    addEventListener,
    removeEventListener
  };
}

describe('ThemeService', () => {
  let media: MediaQueryHarness;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
    media = createMediaQueryHarness(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(media.mediaQuery);
    TestBed.configureTestingModule({ providers: [ThemeService] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('restores a valid stored theme and applies it', () => {
    localStorage.setItem('rxdb-devtools-theme', 'dark');
    const service = TestBed.inject(ThemeService);

    service.initTheme();

    expect(service.theme()).toBe('dark');
    expect(service.resolvedTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('ignores an invalid stored theme', () => {
    localStorage.setItem('rxdb-devtools-theme', 'sepia');
    const service = TestBed.inject(ThemeService);

    service.initTheme();

    expect(service.theme()).toBe('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('persists and applies explicit themes', () => {
    const service = TestBed.inject(ThemeService);

    service.setTheme('dark');
    service.setTheme('light');

    expect(localStorage.getItem('rxdb-devtools-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('survives unavailable local storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const service = TestBed.inject(ThemeService);

    expect(() => service.initTheme()).not.toThrow();
    expect(() => service.setTheme('dark')).not.toThrow();
    expect(service.theme()).toBe('dark');
  });

  it('updates the applied system theme when the media query changes', () => {
    const service = TestBed.inject(ThemeService);
    service.initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    media.setMatches(true);
    media.emitChange();

    expect(service.resolvedTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does not override an explicit theme on system changes and removes its listener on destroy', () => {
    const service = TestBed.inject(ThemeService);
    service.initTheme();
    service.setTheme('light');

    media.setMatches(true);
    media.emitChange();
    service.ngOnDestroy();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(media.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
