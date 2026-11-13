import { DestroyRef, ErrorHandler, Service, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

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

/** `baseline` 与这一刻的快照一样：快照里每个字段的值都相同（多出来的未知字段不管）。 */
const sameSettings = (baseline: Settings, snapshot: Settings): boolean =>
  Object.entries(snapshot).every(([key, value]) => Object.is(baseline[key], value));

/**
 * 系统设置的持久化：外观、强调色、侧栏图标、滚动条、音量、亮度、Wi-Fi、蓝牙、Dock、壁纸与 Safari 收藏栏。
 * 启动时从本地库恢复（逐个字段校验类型，旧库少字段也能读），之后有改动就防抖写回。
 *
 * 库读完之前用户已经改过的字段（不等于构造时的默认值）保留用户的值，库里的旧值不能盖掉它，恢复完成后一并写回——
 * 否则用户在启动后立刻改的设置（例如马上切深色）会因为「恢复什么也没改」而永远不写库，刷新就丢了。
 *
 * 设置跨标签页共享（ADESK-US-105）：别的标签页写了设置，这里在同步时限内采用它（后提交的写入生效）；
 * 采用之后快照与库里一样，不会再写回去。本标签页自己还有没写出的改动时不采用——它写出之后才是最后一次提交。
 */
@Service({ autoProvided: false })
export class SystemSettingsStore {
  private readonly system = inject(SystemState);
  private readonly theme = inject(ThemeService);
  private readonly wallpaper = inject(WallpaperService);
  private readonly preferences = inject(Preferences);
  private readonly errors = inject(ErrorHandler);
  /** 启动恢复做完了；是 signal，所以恢复完成本身也会让写回的 effect 再看一遍（补写恢复之前的改动）。 */
  private readonly restored = signal(false);
  /** 有改动正在等防抖、尚未写出。 */
  private pending = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly fields: readonly SettingField[] = this.describeFields();
  /** 构造时各字段的值，即默认值：用来分辨库读完之前被用户改过的字段。 */
  private readonly defaults: Settings = this.snapshot();

  constructor() {
    effect(() => {
      const snapshot = this.snapshot();
      if (this.restored()) untracked(() => this.schedule(snapshot));
    });
    /* 库不可用时恢复与写回都不做：原因由 DesktopData.problem 与阻断界面说明，这里再报一次只会让每个服务各抛一次同样的错。 */
    this.preferences.ready.then(
      () => this.restore(),
      () => undefined
    );
    this.preferences.external$
      .pipe(
        filter(keys => keys.includes(SETTINGS_KEY)),
        takeUntilDestroyed()
      )
      .subscribe(() => this.adoptRemote());
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** 别的标签页写了设置：恢复到库里的现状。启动恢复还没做、或本标签页有没写出的改动时不动。 */
  private adoptRemote(): void {
    if (this.restored() && !this.pending) this.restore();
  }

  private restore(): void {
    const starting = !this.restored();
    const saved = this.preferences.get(SETTINGS_KEY, isSettings);
    for (const field of this.fields) {
      /* 启动恢复：库读完之前用户已经改过的字段保留用户的值，库里的旧值不能盖掉它；它们在恢复之后写回。 */
      if (starting && !Object.is(field.read(), this.defaults[field.key])) continue;
      const value = saved?.[field.key];
      if (field.valid(value) && value !== field.read()) field.apply(value);
    }
    this.restored.set(true);
  }

  private snapshot(): Settings {
    return Object.fromEntries(this.fields.map(field => [field.key, field.read()]));
  }

  private schedule(snapshot: Settings): void {
    clearTimeout(this.timer);
    /* 与库里一样就不必写：刚从库里恢复、刚采用了别的标签页的设置、改了又改回去、或库里还没有设置而用户什么也没改（基线是默认值）。 */
    const baseline = this.preferences.get(SETTINGS_KEY, isSettings) ?? this.defaults;
    this.pending = !sameSettings(baseline, snapshot);
    if (!this.pending) return;
    this.timer = setTimeout(() => {
      this.pending = false;
      this.preferences.set(SETTINGS_KEY, snapshot).catch((error: unknown) => this.errors.handleError(error));
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
