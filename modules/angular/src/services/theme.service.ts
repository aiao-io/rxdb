import { requestHostTheme, subscribeHostTheme } from '@aiao/utils';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Platform } from '@angular/cdk/platform';
import { DOCUMENT, Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, of, shareReplay, switchMap } from 'rxjs';

const THEME_KEY = 'theme';

@Injectable({
  providedIn: 'root'
})
export class ThemeService implements OnDestroy {
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
  #stopHostTheme?: () => void;

  $currentThemeIsDark = computed(() => {
    const theme = this.$currentTheme();
    return theme === 'auto' ? this.$systemIsDark() : theme === 'dark';
  });

  $currentThemeLightDark = computed(() => {
    return this.$currentThemeIsDark() ? 'dark' : 'light';
  });

  constructor() {
    if (this.#platform.isBrowser) {
      let receivedHostTheme = false;
      this.#stopHostTheme = subscribeHostTheme(theme => {
        receivedHostTheme = true;
        this.#applyTheme(theme, false);
      });
      if (!receivedHostTheme) {
        this.setTheme(localStorage.getItem(THEME_KEY) || 'auto');
      }
      this.systemIsDark$.subscribe(() => {
        if (this.$currentTheme() === 'auto') this.#applyTheme('auto', true);
      });
    }
  }

  ngOnDestroy() {
    this.#stopHostTheme?.();
  }

  setTheme(themeValue: string) {
    this.#applyTheme(themeValue, true);
  }

  #applyTheme(themeValue: string, persist: boolean) {
    this.$currentTheme.set(themeValue);
    let nextTheme = themeValue;
    if (themeValue === 'auto') {
      nextTheme = this.$systemIsDark() ? 'dark' : 'light';
      if (persist) localStorage.setItem(THEME_KEY, 'auto');
    } else if (persist) {
      localStorage.setItem(THEME_KEY, themeValue);
    }
    this.#setThemeAttribute(nextTheme);
    // persist 恰好等价于「用户主动切换」——宿主下发走 persist=false，不回推就不会两端互相触发
    if (persist) requestHostTheme(nextTheme === 'dark' ? 'dark' : 'light');
  }

  #setThemeAttribute(theme: string) {
    const root = this.#document.documentElement;
    root.setAttribute('data-theme', theme);
  }
}
