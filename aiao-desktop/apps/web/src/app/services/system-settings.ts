import { DestroyRef, Service, effect, inject, untracked } from '@angular/core';

import { Preferences } from '../data/preferences';
import { SystemState } from './system-state';
import { ThemeService } from './theme';
import { WallpaperService } from './wallpaper';

/** 系统设置存成偏好表里的一行 JSON。 */
const SETTINGS_KEY = 'system:settings';
/** 拖滑块时只在停手后写一次。 */
const SAVE_DELAY = 400;

type Settings = Readonly<Record<string, unknown>>;

interface SettingField {
  readonly key: string;
  read(): unknown;
  valid(value: unknown): boolean;
  apply(value: unknown): void;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const oneOf =
  (...options: readonly string[]) =>
  (value: unknown): boolean =>
    typeof value === 'string' && options.includes(value);

const isSettings = (value: unknown): value is Settings => typeof value === 'object' && value !== null;

/**
 * 系统设置的持久化：外观、强调色、侧栏图标、滚动条、音量、亮度、Wi-Fi、蓝牙、Dock、壁纸与 Safari 收藏栏。
 * 启动时从本地库恢复（逐个字段校验类型，旧库少字段也能读），之后有改动就防抖写回。
 */
@Service({ autoProvided: false })
export class SystemSettingsStore {
  private readonly system = inject(SystemState);
  private readonly theme = inject(ThemeService);
  private readonly wallpaper = inject(WallpaperService);
  private readonly preferences = inject(Preferences);
  private restored = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly fields: readonly SettingField[] = this.describeFields();

  constructor() {
    effect(() => {
      const snapshot = Object.fromEntries(this.fields.map(field => [field.key, field.read()]));
      if (this.restored) untracked(() => this.schedule(snapshot));
    });
    this.preferences.ready.then(
      () => this.restore(),
      () => undefined
    );
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  private restore(): void {
    const saved = this.preferences.get(SETTINGS_KEY, isSettings);
    for (const field of this.fields) {
      const value = saved?.[field.key];
      if (field.valid(value) && value !== field.read()) field.apply(value);
    }
    this.restored = true;
  }

  private schedule(snapshot: Settings): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.preferences.set(SETTINGS_KEY, snapshot).catch(() => undefined);
    }, SAVE_DELAY);
  }

  private describeFields(): readonly SettingField[] {
    const system = this.system;
    const plain = <T>(key: string, signal: { (): T; set(value: T): void }, valid: (value: unknown) => boolean) => ({
      key,
      read: () => signal(),
      valid,
      apply: (value: unknown) => signal.set(value as T)
    });
    return [
      {
        key: 'appearance',
        read: () => system.appearance(),
        valid: oneOf('light', 'dark', 'auto'),
        apply: value => this.theme.setAppearance(value as 'light' | 'dark' | 'auto')
      },
      plain(
        'accent',
        system.accent,
        oneOf('multi', 'blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'graphite')
      ),
      plain(
        'highlight',
        system.highlight,
        oneOf('accent', 'blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'graphite')
      ),
      plain('sidebarIcons', system.sidebarIcons, oneOf('small', 'medium', 'large')),
      plain('scrollbars', system.scrollbars, oneOf('auto', 'scrolling', 'always')),
      {
        key: 'volume',
        read: () => system.volume(),
        valid: isNumber,
        apply: value => system.setVolume(value as number)
      },
      plain('muted', system.muted, isBoolean),
      {
        key: 'brightness',
        read: () => system.brightness(),
        valid: isNumber,
        apply: value => system.setBrightness(value as number)
      },
      plain('wifi', system.wifi, isBoolean),
      plain('bluetooth', system.bluetooth, isBoolean),
      plain('dockSize', system.dockSize, isNumber),
      plain('dockMag', system.dockMag, isNumber),
      plain('dockMagOn', system.dockMagOn, isBoolean),
      {
        key: 'wallpaper',
        read: () => system.wallpaper(),
        valid: oneOf('tahoe', 'ridges', 'summit', 'valley', 'forest', 'night'),
        apply: value => this.wallpaper.set(value as 'tahoe')
      },
      plain('safariFavs', system.safariFavs, isBoolean)
    ];
  }
}
