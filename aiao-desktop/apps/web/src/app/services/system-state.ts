import { Service, signal } from '@angular/core';

import { clamp } from '../shared/format';

export type ThemeMode = 'light' | 'dark';
/** 用户选择的外观；只有 `auto` 会跟随宿主系统。 */
export type Appearance = ThemeMode | 'auto';
export type AccentKey = 'multi' | 'blue' | 'purple' | 'pink' | 'red' | 'orange' | 'yellow' | 'green' | 'graphite';
export type HighlightKey = Exclude<AccentKey, 'multi'> | 'accent';
export type SidebarIconSize = 'small' | 'medium' | 'large';
export type ScrollbarPolicy = 'auto' | 'scrolling' | 'always';
export type WallpaperKey = 'tahoe' | 'ridges' | 'summit' | 'valley' | 'forest' | 'night';

/** 桌面的系统级状态（原 `SYS` 与 `Screen.brightness`）。 */
@Service({ autoProvided: false })
export class SystemState {
  readonly user = 'Prasenjit';
  readonly host = 'macbook';
  readonly boot = Date.now();

  /** 屏幕上实际呈现的主题；`appearance` 为 `auto` 时两者才可能不同。 */
  readonly theme = signal<ThemeMode>('light');
  readonly appearance = signal<Appearance>('light');
  readonly accent = signal<AccentKey>('multi');
  readonly highlight = signal<HighlightKey>('accent');
  readonly sidebarIcons = signal<SidebarIconSize>('medium');
  readonly scrollbars = signal<ScrollbarPolicy>('auto');

  readonly volume = signal(0.65);
  readonly muted = signal(false);
  readonly battery = signal(84);
  readonly charging = signal(false);
  readonly wifi = signal(true);
  readonly wifiName = signal('Prasen 5G');
  readonly bluetooth = signal(true);
  readonly brightness = signal(0.92);

  readonly dockSize = signal(58);
  readonly dockMag = signal(1.44);
  readonly dockMagOn = signal(true);

  readonly wallpaper = signal<WallpaperKey>('tahoe');
  readonly safariFavs = signal(false);

  /** 所有音量滑块共用：拖到 0 即静音。 */
  setVolume(value: number): void {
    this.volume.set(value);
    this.muted.set(value === 0);
  }

  setBrightness(value: number): void {
    this.brightness.set(clamp(value, 0.25, 1));
  }
}
