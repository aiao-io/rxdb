import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Preferences } from '../data/preferences';
import { configureServices } from '../testing/angular';
import { FakeMediaQuery, stubMatchMedia } from '../testing/browser';
import { SystemSettingsStore } from './system-settings';
import { SystemState } from './system-state';
import { ThemeService } from './theme';
import { WallpaperService } from './wallpaper';

const SETTINGS_KEY = 'system:settings';

interface Options {
  readonly saved?: unknown;
  readonly ready?: Promise<void>;
  readonly write?: () => Promise<void>;
}

function setup({ saved, ready = Promise.resolve(), write = async () => undefined }: Options = {}) {
  stubMatchMedia(new FakeMediaQuery());
  /** 库里现存的设置；别的标签页改了它之后，用 `remote()` 通知。 */
  let stored = saved;
  const external = new Subject<readonly string[]>();
  const preferences = {
    ready,
    external$: external.asObservable(),
    get: vi.fn((_key: string, guard: (value: unknown) => boolean) => (guard(stored) ? stored : undefined)),
    set: vi.fn(async (_key: string, value: unknown): Promise<void> => {
      await write();
      stored = value;
    })
  };
  const remote = (next: unknown, keys: readonly string[] = [SETTINGS_KEY]): void => {
    stored = next;
    external.next(keys);
  };
  const wallpaper = { set: vi.fn() };
  const errors = { handleError: vi.fn() };
  configureServices([
    SystemSettingsStore,
    SystemState,
    ThemeService,
    { provide: WallpaperService, useValue: wallpaper },
    { provide: Preferences, useValue: preferences },
    { provide: ErrorHandler, useValue: errors }
  ]);
  const store = TestBed.inject(SystemSettingsStore);
  return {
    store,
    system: TestBed.inject(SystemState),
    theme: TestBed.inject(ThemeService),
    preferences,
    wallpaper,
    remote,
    errors
  };
}

/** 让 `preferences.ready` 上登记的恢复逻辑跑完，再让 effect 看到恢复后的状态。 */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  TestBed.tick();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SystemSettingsStore 恢复', () => {
  it('启动时把偏好表里存的设置逐项恢复到系统状态', async () => {
    const { system, wallpaper } = setup({
      saved: {
        appearance: 'dark',
        accent: 'blue',
        highlight: 'red',
        sidebarIcons: 'large',
        scrollbars: 'always',
        volume: 0.2,
        muted: true,
        brightness: 0.5,
        wifi: false,
        bluetooth: false,
        dockSize: 70,
        dockMag: 1.8,
        dockMagOn: false,
        wallpaper: 'forest',
        safariFavs: true
      }
    });
    await settle();
    expect(system.appearance()).toBe('dark');
    expect(system.theme()).toBe('dark');
    expect(system.accent()).toBe('blue');
    expect(system.highlight()).toBe('red');
    expect(system.sidebarIcons()).toBe('large');
    expect(system.scrollbars()).toBe('always');
    expect(system.volume()).toBe(0.2);
    expect(system.brightness()).toBe(0.5);
    expect(system.wifi()).toBe(false);
    expect(system.bluetooth()).toBe(false);
    expect(system.dockSize()).toBe(70);
    expect(system.dockMag()).toBe(1.8);
    expect(system.dockMagOn()).toBe(false);
    expect(system.safariFavs()).toBe(true);
    expect(wallpaper.set).toHaveBeenCalledExactlyOnceWith('forest');
  });

  it('逐个字段校验类型：旧库缺字段或值不合法时保持默认，不影响其他字段', async () => {
    const { system, wallpaper } = setup({
      saved: { accent: 'neon', volume: 'loud', wifi: 'yes', brightness: Number.NaN, wallpaper: 'moon', dockSize: 64 }
    });
    await settle();
    expect(system.accent()).toBe('multi');
    expect(system.volume()).toBe(0.65);
    expect(system.wifi()).toBe(true);
    expect(system.brightness()).toBe(0.92);
    expect(wallpaper.set).not.toHaveBeenCalled();
    expect(system.dockSize()).toBe(64);
  });

  it('偏好表里还没有设置时保持默认；值与当前相同时不重复应用', async () => {
    const first = setup();
    await settle();
    expect(first.system.appearance()).toBe('light');

    const same = setup({ saved: { appearance: 'light', wallpaper: 'tahoe' } });
    const setAppearance = vi.spyOn(same.theme, 'setAppearance');
    await settle();
    expect(setAppearance).not.toHaveBeenCalled();
    expect(same.wallpaper.set).not.toHaveBeenCalled();
  });

  it('偏好库不可用时既不恢复也不写回，也不抛未处理的拒绝', async () => {
    const { system, preferences } = setup({ ready: Promise.reject(new Error('库不可用')) });
    await settle();
    system.accent.set('red');
    TestBed.tick();
    vi.advanceTimersByTime(1000);
    expect(preferences.set).not.toHaveBeenCalled();
  });
});

describe('SystemSettingsStore 库读完之前用户做的改动', () => {
  /** 一个由用例决定何时读完的偏好库。 */
  function lateSetup(saved?: unknown) {
    let release!: () => void;
    const ready = new Promise<void>(resolve => (release = resolve));
    return { ...setup({ saved, ready }), release };
  }

  it('全新的库：用户在库读完之前切了深色，读完之后写进库（不会因为恢复什么也没改而永远不写）', async () => {
    const { system, theme, preferences, release } = lateSetup();
    theme.setAppearance('dark');
    TestBed.tick();
    release();
    await settle();
    expect(system.appearance()).toBe('dark');

    await vi.advanceTimersByTimeAsync(400);
    expect(preferences.set).toHaveBeenCalledTimes(1);
    expect(preferences.set.mock.calls[0][1]).toMatchObject({ appearance: 'dark' });
  });

  it('库里已有旧设置：用户改过的字段保留用户的值，没改过的字段照常恢复，合并后写回', async () => {
    const { system, theme, preferences, release } = lateSetup({ appearance: 'light', accent: 'blue', volume: 0.2 });
    theme.setAppearance('dark');
    TestBed.tick();
    release();
    await settle();
    expect(system.appearance()).toBe('dark');
    expect(system.accent()).toBe('blue');
    expect(system.volume()).toBe(0.2);

    await vi.advanceTimersByTimeAsync(400);
    expect(preferences.set).toHaveBeenCalledTimes(1);
    expect(preferences.set.mock.calls[0][1]).toMatchObject({ appearance: 'dark', accent: 'blue', volume: 0.2 });
  });

  it('库读完之前什么也没改：恢复之后不写库（全新的库没有要写的东西）', async () => {
    const { release, preferences, system } = lateSetup();
    release();
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(system.appearance()).toBe('light');
    expect(preferences.set).not.toHaveBeenCalled();
  });
});

describe('SystemSettingsStore 写回', () => {
  it('恢复之后有改动就防抖 400ms 写回整份设置', async () => {
    const { system, preferences } = setup();
    await settle();
    system.accent.set('green');
    TestBed.tick();
    vi.advanceTimersByTime(399);
    expect(preferences.set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(preferences.set).toHaveBeenCalledTimes(1);
    const [key, snapshot] = preferences.set.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(key).toBe(SETTINGS_KEY);
    expect(snapshot).toMatchObject({ accent: 'green', appearance: 'light', volume: 0.65, wallpaper: 'tahoe' });
    expect(Object.keys(snapshot)).toHaveLength(15);
  });

  it('拖滑块时只在停手后写一次，写的是最后的值', async () => {
    const { system, preferences } = setup();
    await settle();
    for (const value of [0.1, 0.3, 0.7]) {
      system.setVolume(value);
      TestBed.tick();
      vi.advanceTimersByTime(200);
    }
    expect(preferences.set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(preferences.set).toHaveBeenCalledTimes(1);
    expect(preferences.set.mock.calls[0][1]).toMatchObject({ volume: 0.7 });
  });

  it('宿主销毁时取消尚未写出的定时器', async () => {
    const { system, preferences } = setup();
    await settle();
    system.dockSize.set(80);
    TestBed.tick();
    TestBed.resetTestingModule();
    vi.advanceTimersByTime(1000);
    expect(preferences.set).not.toHaveBeenCalled();
  });

  it('写回失败交给 ErrorHandler 报告（不吞掉），也不影响后续的改动', async () => {
    const failure = new Error('磁盘满了');
    const write = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const { system, preferences, errors } = setup({ write });
    await settle();
    system.wifi.set(false);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(errors.handleError).toHaveBeenCalledExactlyOnceWith(failure);
    system.bluetooth.set(false);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(preferences.set).toHaveBeenCalledTimes(2);
    expect(errors.handleError).toHaveBeenCalledTimes(1);
  });
});

describe('SystemSettingsStore 多标签页（ADESK-US-105）', () => {
  it('别的标签页切了深色外观和音量：这边采用库里的现状，而且不再把同样的内容写回去', async () => {
    const { system, preferences, remote } = setup();
    await settle();
    /* 先做一次本地改动并写出：得到一份完整的设置，写出之后才能采用别的标签页的。 */
    system.accent.set('green');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(400);
    const defaults = preferences.set.mock.calls[0][1] as Record<string, unknown>;
    preferences.set.mockClear();

    remote({ ...defaults, appearance: 'dark', volume: 0.3 });
    TestBed.tick();
    expect(system.appearance()).toBe('dark');
    expect(system.theme()).toBe('dark');
    expect(system.volume()).toBe(0.3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(preferences.set).not.toHaveBeenCalled();
  });

  it('别的键变了不动设置；启动恢复还没做时收到变更也不动', async () => {
    const { system, remote } = setup({ ready: new Promise(() => undefined) });
    remote({ appearance: 'dark' });
    expect(system.appearance()).toBe('light');

    const ready = setup();
    await settle();
    ready.remote({ appearance: 'dark' }, ['dock:layout']);
    expect(ready.system.appearance()).toBe('light');
  });

  it('本标签页还有没写出的改动时不采用别的标签页的：自己写出之后才是最后一次提交', async () => {
    const { system, preferences, remote } = setup();
    await settle();
    system.accent.set('green');
    TestBed.tick();

    remote({ appearance: 'dark', accent: 'red' });
    expect(system.appearance()).toBe('light');
    expect(system.accent()).toBe('green');
    await vi.advanceTimersByTimeAsync(400);
    expect(preferences.set).toHaveBeenCalledTimes(1);
    expect(preferences.set.mock.calls[0][1]).toMatchObject({ accent: 'green', appearance: 'light' });
  });

  it('自己的改动写出之后再收到别的标签页的变更，照常采用', async () => {
    const { system, preferences, remote } = setup();
    await settle();
    system.accent.set('green');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(preferences.set).toHaveBeenCalledTimes(1);

    remote({ appearance: 'dark', accent: 'green' });
    TestBed.tick();
    expect(system.appearance()).toBe('dark');
  });

  it('改了又改回去：与库里一样，不再写库', async () => {
    const { system, preferences } = setup();
    await settle();
    system.accent.set('green');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(preferences.set).toHaveBeenCalledTimes(1);

    system.accent.set('red');
    TestBed.tick();
    system.accent.set('green');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(1000);
    expect(preferences.set).toHaveBeenCalledTimes(1);
  });

  it('启动恢复之后快照与库里一致（库里的设置是完整的）就不写回', async () => {
    const full = {
      appearance: 'dark',
      accent: 'blue',
      highlight: 'red',
      sidebarIcons: 'large',
      scrollbars: 'always',
      volume: 0.2,
      muted: true,
      brightness: 0.5,
      wifi: false,
      bluetooth: false,
      dockSize: 70,
      dockMag: 1.8,
      dockMagOn: false,
      wallpaper: 'tahoe',
      safariFavs: true
    };
    const { preferences } = setup({ saved: full });
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(preferences.set).not.toHaveBeenCalled();
  });
});
