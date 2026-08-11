import { BreakpointObserver } from '@angular/cdk/layout';
import { Platform } from '@angular/cdk/platform';
import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, of, shareReplay, switchMap } from 'rxjs';

const THEME_KEY = 'theme';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  #breakpointObserver = inject(BreakpointObserver);
  #platform = inject(Platform);
  #document = inject(DOCUMENT);

  systemIsDark$ = of(this.#platform.isBrowser).pipe(
    filter(Boolean),
    switchMap(() => this.#breakpointObserver.observe('(prefers-color-scheme: dark)')),
    map(state => state.matches),
    shareReplay(1)
  );
  $systemIsDark = toSignal(this.systemIsDark$);
  $currentTheme = signal<string | undefined>(undefined);

  $currentThemeIsDark = computed(() => {
    const theme = this.$currentTheme();
    return theme === 'auto' ? this.$systemIsDark() : theme === 'dark';
  });

  $currentThemeLightDark = computed(() => {
    return this.$currentThemeIsDark() ? 'dark' : 'light';
  });

  constructor() {
    if (this.#platform.isBrowser) {
      const theme = localStorage.getItem(THEME_KEY) || 'auto';
      this.$currentTheme.set(theme);
      this.systemIsDark$.subscribe(() => {
        this.setTheme(this.$currentTheme()!);
      });
    }
  }

  setTheme(themeValue: string) {
    this.$currentTheme.set(themeValue);
    let nextTheme = themeValue;
    if (themeValue === 'auto') {
      const systemIsDark = this.$systemIsDark();
      nextTheme = systemIsDark ? 'dark' : 'light';
      localStorage.setItem(THEME_KEY, 'auto');
    } else {
      localStorage.setItem(THEME_KEY, themeValue);
    }
    this.#setThemeAttribute(nextTheme);
  }

  #setThemeAttribute(theme: string) {
    const root = this.#document.documentElement;
    root.setAttribute('data-theme', theme);
  }
}
