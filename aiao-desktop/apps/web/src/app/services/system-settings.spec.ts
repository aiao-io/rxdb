import { TestBed } from '@angular/core/testing';
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
  const preferences = {
    ready,
    get: vi.fn((_key: string, guard: (value: unknown) => boolean) => (guard(saved) ? saved : undefined)),
    set: vi.fn<(key: string, value: unknown) => Promise<void>>(write)
  };
  const wallpaper = { set: vi.fn() };
  configureServices([
    SystemSettingsStore,
    SystemState,
    ThemeService,
    { provide: WallpaperService, useValue: wallpaper },
    { provide: Preferences, useValue: preferences }
  ]);
  const store = TestBed.inject(SystemSettingsStore);
  return { store, system: TestBed.inject(SystemState), theme: TestBed.inject(ThemeService), preferences, wallpaper };
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

  it('写回失败只被吞掉，不影响后续的改动', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('磁盘满了')).mockResolvedValue(undefined);
    const { system, preferences } = setup({ write });
    await settle();
    system.wifi.set(false);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(400);
    system.bluetooth.set(false);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(preferences.set).toHaveBeenCalledTimes(2);
  });
});
