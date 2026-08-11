import { computed, Injectable, OnDestroy, signal } from '@angular/core';
import type { Theme } from '../types/devtools.types';

const THEME_STORAGE_KEY = 'rxdb-devtools-theme';

/**
 * 主题管理服务
 */
@Injectable({ providedIn: 'root' })
export class ThemeService implements OnDestroy {
  private readonly systemTheme = signal<'light' | 'dark'>(this.getSystemTheme());

  /** 当前主题设置 */
  readonly theme = signal<Theme>('system');

  /** 解析后的主题（light/dark）*/
  readonly resolvedTheme = computed<'light' | 'dark'>(() => {
    const theme = this.theme();
    if (theme === 'system') {
      return this.systemTheme();
    }
    return theme;
  });

  private mediaQuery: MediaQueryList | null = null;
  private mediaQueryHandler: (() => void) | null = null;

  ngOnDestroy(): void {
    if (this.mediaQuery && this.mediaQueryHandler) {
      this.mediaQuery.removeEventListener('change', this.mediaQueryHandler);
    }
    this.mediaQuery = null;
    this.mediaQueryHandler = null;
  }

  /**
   * 初始化主题
   * 从存储加载并应用主题
   */
  initTheme(): void {
    this.loadTheme();
    this.setupSystemThemeListener();
    this.applyTheme();
  }

  /**
   * 设置主题
   */
  setTheme(theme: Theme): void {
    this.theme.set(theme);
    this.saveTheme(theme);
    this.applyTheme();
  }

  private loadTheme(): void {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored && this.isValidTheme(stored)) {
        this.theme.set(stored as Theme);
      }
    } catch {
      // 存储不可用，使用默认值
    }
  }

  private saveTheme(theme: Theme): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // 存储不可用
    }
  }

  private applyTheme(): void {
    const resolved = this.resolvedTheme();
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }

  private getSystemTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private setupSystemThemeListener(): void {
    if (typeof window === 'undefined') return;

    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemTheme.set(this.mediaQuery.matches ? 'dark' : 'light');
    this.mediaQueryHandler = () => {
      this.systemTheme.set(this.mediaQuery?.matches ? 'dark' : 'light');
      if (this.theme() === 'system') this.applyTheme();
    };
    this.mediaQuery.addEventListener('change', this.mediaQueryHandler);
  }

  private isValidTheme(value: string): value is Theme {
    return ['light', 'dark', 'system'].includes(value);
  }
}
