import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, effect, inject } from '@angular/core';

import { clamp } from '../shared/format';
import { AccentKey, Appearance, HighlightKey, SystemState, ThemeMode } from './system-state';

export interface AccentColor {
  readonly name: string;
  readonly hex: string | null;
  readonly dark?: string;
}

/** 强调色表，顺序即系统设置里的排列顺序。 */
export const ACCENTS: Readonly<Record<AccentKey, AccentColor>> = {
  multi: { name: 'Multicolour', hex: null },
  blue: { name: 'Blue', hex: '#0a7cff', dark: '#0a84ff' },
  purple: { name: 'Purple', hex: '#8944ab', dark: '#bf5af2' },
  pink: { name: 'Pink', hex: '#f74f9e', dark: '#ff2d55' },
  red: { name: 'Red', hex: '#e0383e', dark: '#ff453a' },
  orange: { name: 'Orange', hex: '#f7821b', dark: '#ff9f0a' },
  yellow: { name: 'Yellow', hex: '#f7ce46', dark: '#ffd60a' },
  green: { name: 'Green', hex: '#62ba46', dark: '#30d158' },
  graphite: { name: 'Graphite', hex: '#8c8c91', dark: '#98989d' }
};

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];

/** 当前主题下某个强调色的实际色值。 */
export const accentHex = (accent: AccentColor, theme: ThemeMode): string | null =>
  accent.hex && (theme === 'dark' ? (accent.dark ?? accent.hex) : accent.hex);

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const luma = (hex: string): number => {
  const [r, g, b] = hexRgb(hex);
  return (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
};

const shade = (hex: string, amount: number): string =>
  '#' +
  hexRgb(hex)
    .map(v =>
      Math.round(clamp(v + amount * 255, 0, 255))
        .toString(16)
        .padStart(2, '0')
    )
    .join('');

/** 外观、强调色与全局外观偏好：全部写在根元素上，组件只读 CSS 变量。 */
@Service({ autoProvided: false })
export class ThemeService {
  private readonly system = inject(SystemState);
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly media = matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    const follow = (): void => {
      if (this.system.appearance() === 'auto') this.system.theme.set(this.hostTheme());
    };
    this.media.addEventListener('change', follow);
    inject(DestroyRef).onDestroy(() => this.media.removeEventListener('change', follow));

    effect(() => {
      this.root.dataset['theme'] = this.system.theme();
    });
    effect(() => this.paintAccent(ACCENTS[this.system.accent()], this.system.theme()));
    effect(() => this.paintHighlight(this.system.highlight(), this.system.theme()));
    effect(() => {
      this.root.dataset['sbIcons'] = this.system.sidebarIcons();
      this.root.dataset['bars'] = this.system.scrollbars();
    });
  }

  /** 浅色、深色或自动。自动会一直跟随宿主系统，直到用户选定一边。 */
  setAppearance(mode: Appearance): void {
    this.system.appearance.set(mode);
    this.system.theme.set(mode === 'auto' ? this.hostTheme() : mode);
  }

  toggle(): void {
    this.setAppearance(this.system.theme() === 'light' ? 'dark' : 'light');
  }

  setAccent(key: AccentKey): void {
    this.system.accent.set(key);
  }

  setHighlight(key: HighlightKey): void {
    this.system.highlight.set(key);
  }

  private hostTheme(): ThemeMode {
    return this.media.matches ? 'dark' : 'light';
  }

  /* 强调色驱动 --blue，几十条规则都读它，所以换色只需写两个变量。 */
  private paintAccent(accent: AccentColor, theme: ThemeMode): void {
    const style = this.root.style;
    const hex = accentHex(accent, theme);
    if (!hex) {
      style.removeProperty('--blue');
      style.removeProperty('--blue-press');
      style.removeProperty('--on-accent');
      return;
    }
    style.setProperty('--blue', hex);
    style.setProperty('--blue-press', shade(hex, -0.16));
    style.setProperty('--on-accent', luma(hex) > 0.72 ? '#1d1d1f' : '#fff');
  }

  /* 'accent' 表示「跟随强调色」，所以覆盖值要撤掉。 */
  private paintHighlight(key: HighlightKey, theme: ThemeMode): void {
    const hex = key === 'accent' ? null : accentHex(ACCENTS[key], theme);
    if (hex) this.root.style.setProperty('--sel', hex);
    else this.root.style.removeProperty('--sel');
  }
}
