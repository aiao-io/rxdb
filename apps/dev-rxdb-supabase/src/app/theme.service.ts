import { BreakpointObserver } from '@angular/cdk/layout';
import { Platform } from '@angular/cdk/platform';
import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, of, shareReplay, switchMap } from 'rxjs';

const THEME_KEY = 'theme';

/** 用户可选的主题：`auto` 表示跟随系统。 */
export type Theme = 'auto' | 'light' | 'dark';
/** 解析后的实际主题，`auto` 已被折算掉。 */
export type ResolvedTheme = Exclude<Theme, 'auto'>;

/**
 * 把存储里的任意字符串收敛成合法主题值。
 *
 * @param value - 存储值，可能是 `null` 或历史遗留的非法值
 * @returns 合法主题；无法识别时返回 `auto`
 */
export function parseTheme(value: string | null): Theme {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

/**
 * 把主题选择折算成实际生效的明/暗。
 *
 * @param theme - 用户选择
 * @param systemIsDark - 系统当前是否暗色
 */
export function resolveTheme(theme: Theme, systemIsDark: boolean): ResolvedTheme {
  if (theme === 'auto') return systemIsDark ? 'dark' : 'light';
  return theme;
}

/**
 * 主题状态：读取用户选择、跟随系统偏好、写回 `<html data-theme>`。
 */
@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  readonly #breakpointObserver = inject(BreakpointObserver);
  readonly #platform = inject(Platform);
  readonly #document = inject(DOCUMENT);

  readonly systemIsDark$ = of(this.#platform.isBrowser).pipe(
    filter(Boolean),
    switchMap(() => this.#breakpointObserver.observe('(prefers-color-scheme: dark)')),
    map(state => state.matches),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  readonly $systemIsDark = toSignal(this.systemIsDark$, { initialValue: false });
  readonly $currentTheme = signal<Theme>('auto');
  readonly $currentThemeLightDark = computed(() => resolveTheme(this.$currentTheme(), this.$systemIsDark()));
  readonly $currentThemeIsDark = computed(() => this.$currentThemeLightDark() === 'dark');

  constructor() {
    if (!this.#platform.isBrowser) return;
    this.$currentTheme.set(parseTheme(this.#document.defaultView?.localStorage.getItem(THEME_KEY) ?? null));
    effect(() => this.#document.documentElement.setAttribute('data-theme', this.$currentThemeLightDark()));
  }

  setTheme(theme: Theme): void {
    this.$currentTheme.set(theme);
    this.#document.defaultView?.localStorage.setItem(THEME_KEY, theme);
  }
}
