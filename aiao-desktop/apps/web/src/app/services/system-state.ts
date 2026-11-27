import { Service, signal } from '@angular/core';

import { clamp } from '../shared/format';
import { USER_PROFILE } from '../shared/user-profile';

export type ThemeMode = 'light' | 'dark';
/** 用户选择的外观；只有 `auto` 会跟随宿主系统。 */
export type Appearance = ThemeMode | 'auto';
export type AccentKey = 'multi' | 'blue' | 'purple' | 'pink' | 'red' | 'orange' | 'yellow' | 'green' | 'graphite';
export type HighlightKey = Exclude<AccentKey, 'multi'> | 'accent';
export type SidebarIconSize = 'small' | 'medium' | 'large';
export type ScrollbarPolicy = 'auto' | 'scrolling' | 'always';
export type WallpaperKey = 'tahoe' | 'ridges' | 'summit' | 'valley' | 'forest' | 'night';
/** Dock 贴着屏幕的哪条边。 */
export type DockPosition = 'bottom' | 'left' | 'right';
/** 最小化窗口的收拢动画：神灯（Genie）或简单缩放。 */
export type MinimizeEffect = 'genie' | 'scale';

/** 桌面的系统级状态（原 `SYS` 与 `Screen.brightness`）。 */
@Service({ autoProvided: false })
export class SystemState {
  readonly user = USER_PROFILE.name;
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

  /** Dock 贴着屏幕的哪条边（设置面板与 Dock 玻璃菜单共用；持久化键名同信号名，见 system-settings）。 */
  readonly dockPosition = signal<DockPosition>('bottom');
  /** 自动隐藏 Dock：平时收起，指针贴近所在边时滑出，离开约 0.6 秒后滑回。 */
  readonly dockAutoHide = signal(false);
  /** 最小化的收拢动画（window-frame.minimize 消费）。 */
  readonly minimizeEffect = signal<MinimizeEffect>('genie');
  /** 打开应用时 Dock 图标的弹跳动画。 */
  readonly dockAnimateOpen = signal(true);
  /** 正在运行的应用在图标下的指示点。 */
  readonly dockShowIndicators = signal(true);

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
